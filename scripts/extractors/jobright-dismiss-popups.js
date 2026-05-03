// Dismisses known Jobright popups: "Save My Spot Now" upgrade modal close,
// "EXIT/TRY IT NOW" resume tool overlay. Idempotent — safe to call repeatedly.
// Used by mode: newgrad-recommend-scan. Run via: bb-browser eval <this-file>.
(() => {
  const labels = ['Close', 'EXIT'];
  const dismissed = [];
  for (const t of labels) {
    const b = [...document.querySelectorAll('button')]
      .find(e => e.textContent.trim() === t && e.offsetParent !== null);
    if (b) { b.click(); dismissed.push(t); }
  }
  return JSON.stringify({ dismissed });
})();
