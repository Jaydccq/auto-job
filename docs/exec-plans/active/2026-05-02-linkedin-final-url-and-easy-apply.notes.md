# Notes — LinkedIn final-URL + Easy Apply

## Phase 1 — diagnosis findings

### Final URL

Files inspected:
- `scripts/linkedin-scan-bb-browser.ts`
- `apps/server/src/adapters/newgrad-links.ts`
- `apps/server/src/adapters/linkedin-scan-normalizer.*` (referenced)

Key flow today:

```
enrichLinkedInDetails → probeExternalApplyUrl(detailTabId)  (line ~1672)
  ├─ listBbTabs()                 (snapshot beforeIds)
  ├─ evaluateBrowserJson(clickLinkedInExternalApplyButton)
  │     ├─ finds visible Apply button
  │     ├─ if href is offsite (not linkedin.com/jobs/view/) → click + wait 800ms
  │     │   → returns href + afterUrl + observedUrls (resource entries)
  │     └─ else → click + wait 2500ms → returns afterUrl
  ├─ for 8×750ms: listBbTabs()    (poll for new tabs opened by click)
  │     for each new tab:         tab.url filtered through addCandidateApplyUrls
  │                               → isUsefulExternalApplyUrl rejects linkedin.com
  ├─ closeBbTab(opened tabs)      (CLOSES IMMEDIATELY!)
  └─ returns first non-linkedin URL or null
```

Bugs / weaknesses:

1. **No wait for the redirect to settle.** When the new tab opens, `listBbTabs()` may report `tab.url` as either:
   - `https://www.linkedin.com/jobs/view/<id>/apply/external?...&trk=...` (LinkedIn intermediate) — which `isUsefulExternalApplyUrl` rejects, so `flowUrls` stays empty, and we return null.
   - The final ATS URL — which we accept.
   
   The 8×750ms poll catches whichever URL the tab reports during that window. There is no logic to "wait for redirect to finish" or to read the final URL from inside the tab. (Lines 1672–1709.)

2. **Tabs are closed before we read the final URL inside them.** Even if a tab eventually redirects to the ATS, the script closes it the moment it sees any URL (line 1698–1700), which means if we caught only the intermediate URL we get nothing.

3. **In-tab navigation (no popup) is silently lost.** `clickLinkedInExternalApplyButton` returns `afterUrl = window.location.href` 800–2500ms after the click in the *job-view* tab. If LinkedIn reuses the current tab, the test "is offsite href" decides the flow:
   - When `candidate.href` exists and is offsite, the function returns `external_href` with `afterUrl` from the same tab. `addCandidateApplyUrls(flowUrls, click.afterUrl)` runs but the tab still typically shows the LinkedIn URL because the click handler intercepted navigation.
   - When the click navigates the same tab to LinkedIn's `/jobs/view/.../apply/external`, that URL is filtered out — we lose it.

4. **`pickPipelineEntryUrl` cascade** (apps/server/src/adapters/newgrad-links.ts:175) prefers any non-LinkedIn `applyNowUrl` / `applyFlowUrls`. So if `probeExternalApplyUrl` returns null, `applyNowUrl` falls back to `rawDetail.applyNowUrl` or `scored.row.applyUrl` (which is the LinkedIn detailUrl) and the pipeline URL is the LinkedIn job-view URL. This matches the user's complaint.

### Easy Apply

Files inspected:
- `apps/extension/src/panel/inject.ts` (autofill UI lines 1062–1234)
- `apps/extension/src/shared/autofill-matcher.ts` (`scanAutofillMatches`)
- `apps/extension/src/shared/autofill-dom.ts`

State:
- `scanAutofillMatches(profile, document)` always scans the whole document. There is no scope/root option.
- `inject.ts` provides "Refresh" and "Fill matches" panel buttons that act on whatever the page currently exposes.
- No detection of Easy Apply modal. No multi-step navigation (Continue / Next / Review) — the user must click each step manually.
- Safety guard `isUnsafeAutofillActionText` exists in `autofill-option-scoring.ts`, but the panel never *clicks* any progress button — so a user-driven approach is fine, but we still need to enforce that we never click "Submit application" when we add a loop.

Conclusion: extending the autofill matcher to accept an optional `root?: ParentNode` and adding an Easy Apply detector + bounded auto-advance loop in `inject.ts` is the minimal-surface change that delivers what the user asked for.

## Phase 2 — design notes

### Final URL settle algorithm

```
async function settleFinalUrl(tabId, opts = { maxMs: 12000, stableMs: 1500 })
  let lastUrl = null
  let lastChange = now()
  while (now() - start < maxMs)
    sleep(400)
    href = await evaluateBrowserJson(tabId, () => ({
      href: window.location.href,
      canonical: document.querySelector('link[rel=canonical]')?.href,
      ogUrl: document.querySelector('meta[property="og:url"]')?.content,
      readyState: document.readyState,
    }))
    if (href.href !== lastUrl)
      lastUrl = href.href
      lastChange = now()
      continue
    if (now() - lastChange >= stableMs && readyState === 'complete')
      return href.canonical || href.ogUrl || href.href
  return lastUrl
```

Then `probeExternalApplyUrl`:
- Snapshot tabs, click apply.
- For each new tab: settleFinalUrl(newTab); collect; close.
- Also settle the click's host tab if its URL diverged from beforeUrl (in-tab redirect case).
- Combine + filter via existing `isUsefulExternalApplyUrl` (still strip LinkedIn).
- If all candidates are still LinkedIn, return null (current behavior preserved).

This fixes both popup and in-tab navigation cases.

### Easy Apply loop

1. `findEasyApplyModal()`: try selectors in priority order:
   ```
   div[role="dialog"][aria-labelledby*="easy-apply" i],
   .jobs-easy-apply-modal,
   div[role="dialog"]:has(form[aria-label*="apply" i]),
   div[role="dialog"]:has(button[aria-label^="Submit application" i]),
   div[role="dialog"]:has(button[aria-label^="Continue" i])
   ```
2. `findProgressButton(modal)`: pick *one* of (in priority order):
   - `button[aria-label*="Continue" i]:not([disabled])`
   - `button[aria-label*="Next" i]:not([disabled])`
   - `button[aria-label*="Review" i]:not([disabled])`
   - reject any that match `/submit/i` or `/withdraw/i`.
3. `findSubmitButton(modal)`: any button whose label matches `/submit application/i` or `/submit/i`.
4. Loop (max 8 iterations):
   - Re-detect modal (DOM rebuilds between steps).
   - If `findSubmitButton(modal)` exists → STOP, surface "Ready to submit — review and click yourself".
   - Run scoped `scanAutofillMatches(profile, document, { root: modal })`.
   - Fill via existing `setControlValue`.
   - If filled count === 0 AND no progress button → STOP, surface "Nothing to fill on this step".
   - If progress button → click it, wait for transition (`MutationObserver` settle for ~600ms), continue.

Safety:
- All clicks pass through a guard `assertSafeClick(button)` that throws if the accessible label includes "submit" or "withdraw".

## Failure modes & mitigations

| Risk | Mitigation |
|------|------------|
| Easy Apply re-renders mid-fill, stale element references | re-scan after each step transition |
| Some "Continue" buttons are inside nested dialogs (resume preview overlay) | priority selectors target the outermost form modal first |
| File upload focus modal appears (resume picker) | already handled by existing `setControlValue` for `resumeFile` |
| LinkedIn changes class names | use ARIA / role selectors with class fallbacks |
| Redirect chain takes >12s | log + return null; pipeline falls back to LinkedIn URL (current behavior) |
| Multiple new tabs open from one click | settle each, take the first useful non-LinkedIn URL |
| New tab actually IS LinkedIn (e.g. "Save" overlay) | filtered by `isUsefulExternalApplyUrl` as today |
