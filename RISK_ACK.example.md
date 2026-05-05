# Phase 4 Auto-Signup Risk Acknowledgment

This file is the runtime gate for Phase 4 auto-signup. The `signupGate`
in `@auto-job/auto-signup` reads this file at the START of every signup
attempt. Without a valid signed `RISK_ACK.md`, no signup will run.

## What you are acknowledging

Phase 4 creates **new accounts on third-party ATS sites** on your behalf.
This is the highest-risk capability in this repo because:

1. Most ATS Terms of Service prohibit automated account creation.
2. New accounts permanently bind your device fingerprint to that account.
3. If detected, you risk: account ban, IP blacklist, fingerprint blacklist
   that may cascade to other sites that share detection providers
   (Akamai, Cloudflare, DataDome, PerimeterX, etc.).
4. Account creation creates an audit trail at the ATS that may persist
   even after manual deletion.

This is YOUR system, applying to YOUR jobs, on YOUR behalf. You alone
bear the consequences if any of those risks materialize.

## How to sign

Copy this file:

    cp RISK_ACK.example.md RISK_ACK.md

Then edit `RISK_ACK.md`: replace `<NAME>` and `<TODAY-YYYY-MM-DD>` with
your real name and today's date. Save.

Commit `RISK_ACK.md` to the **private** branch alongside any auto-signup
changes you intend to merge. The live file is gitignored from the public
remote.

## The required sentence

The acknowledgment is valid only when `RISK_ACK.md` (live, not example)
contains exactly this sentence with your name and today's date filled in:

> I, <NAME>, acknowledge the risks documented in `docs/superpowers/specs/2026-05-04-auto-job-architecture-design.md` (sections A2, A7, Threat Model §3) on <TODAY-YYYY-MM-DD>.

That literal sentence (after substitution) MUST appear in `RISK_ACK.md`
or the signup gate refuses.

## What the gate does NOT do

- It does NOT verify that the date is "recent" — your signature is
  durable until you remove or rewrite the file.
- It does NOT verify any signature cryptographically — this is a
  reminder gate, not security.
- It does NOT check that the name matches anything else in the repo.

The gate is a deliberate friction step. Treat it that way: read this
file, edit it, sign it, commit it.
