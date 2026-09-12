# Verification evidence (session sort + related)

Raw transcripts and screenshots for handoff — not paraphrases.

| Artifact | What it proves |
|---|---|
| `sort-by-year-raw-1787854047420.log` | Full HTTP request/response bodies + SQL `presented_order` rows for **3 accounts × 3 sorts** (`by_year` / `by_course` / `random`), plus `examMode` override cases. Temporary Year 2 fixture was seeded (order_index=1, 2 approved questions), then cleaned up. |
| `opencode-shots/` | Copied from `%TEMP%\opencode\shots` on 2026-08-27 so DOM screenshots are not lost with temp cleanup. |

Re-run:

```bash
npx tsx src/scripts/verify-sort-by-year-raw.ts
```

Requires API on `:3000` and a DB that already has Medicine + Year 1 approved questions (seed).
