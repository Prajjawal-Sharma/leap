1. Base branch is `dev`. No stale stacked base.
2. Every schema/guard/security predicate pasted verbatim — read it, don't trust the summary.
3. Every query audit lists the actual query, not a description.
4. For Gemini JSON sites: caps justified by observed output from that prompt; refine accepts sparse-real data.
5. Ordering guarantees stated for anything that bills or persists (gate before insert before model call).
6. Migration is numbered, idempotent, and the PR says whether it goes before or after deploy.
7. Adversarial table: every CONFIRMED item is fixed or explicitly deferred with a reason.
8. "Human must do" list is complete — manual tests, dashboard steps, env vars.
9. Deviations from spec are declared and justified.
10. Nothing new in `package.json` without a stated reason.
