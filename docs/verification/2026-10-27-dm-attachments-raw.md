# DM attachments wet-run — 2026-10-27 (messenger polish session)

**Raw log:** `2026-10-27-dm-attachments-raw.log` (+ `…-cleanup.log`) · **Harness:** `tmp-verify-dm-attachments.mjs` (gitignored `tmp-*` rule) · **Target:** local dev API on :3000 (source = this worktree, database = shared Supabase).

## What was proven (23/23 assertions PASS, raw output in the log)

Through REAL HTTP and REAL accounts:

1. **Happy path — image attachment with text note** (`POST /dms/conversations/:id/messages`): 201; stored body is `[[hamame]]{kind:"image",url:"data:image/png;base64,…",name:"IRM-abdo.png",note:"Série IRM abdominopelvienne"}`; the data URL is preserved **byte-for-byte** (log prints length + trimmed form); payload parsed from the stored row.
2. **Happy path — PDF file attachment**: 201; `kind:"file"` payload carries declared `mime`, derived `size`, name; conversation-list preview exposes the raw `[[hamame]]` JSON (expected — the frontend `shareLabel` turns it into the file name).
3. **Rejections via the live endpoint** — exact codes from the shared error envelope:
   - CSV offered as `kind:"image"` → `400 ATTACHMENT_TYPE_UNSUPPORTED`
   - DOCX (unverifiable ZIP format) → `400 ATTACHMENT_TYPE_UNSUPPORTED`
   - 2,640,000-byte image (over the 2.5 MiB cap, under the char ceiling) → `413 ATTACHMENT_TOO_LARGE`
   - Empty base64 → `400 ATTACHMENT_INVALID`
   - Empty payload → `400 VALIDATION_ERROR (root): A message needs text or something to share.`
4. **Name sanitation**: `cour\r\nmecanismes.pdf` stored as `cour  mecanismes.pdf`.
5. **Friendship gate**: conversation with a non-friend → `403 NOT_FRIENDS`; a non-friend asking the existing thread gets `404` (participant-visibility vocabulary `getConversationForMe`).
6. **DB ground truth**: exactly the 3 attempted attachments exist as `[[hamame]]` + valid JSON in `direct_message` for the harness conversation; nothing else.
7. **Cleanup proven** — 3 throwaway accounts (`vf-dmatt-*@verify.hamame.test`) soft-deleted through the real `DELETE /api/users/me` (before: 3 active → after: 0); the harness conversation + messages + friendship rows deleted DB-side with before/after counts (`…-cleanup.log`).

## Bugs found by this run, fixed in the same session

- **`app.ts` global JSON body limit** was Express's 100 KB default — any real attachment (4 MiB file ≈ 5.6 MB of JSON) could never reach the validator. Raised `defaultJson` to `6mb` (receipt upload keeps its dedicated 14 MB lane). Proof: the 413 assertion now exercises the *validator*, not the body parser — the same payload that yields `413 ATTACHMENT_TOO_LARGE` here was `413 PAYLOAD_TOO_LARGE` from the parser before the fix (first-run log, replaced by the passing run).
- **First harness run**: conversation step sent the **sender's own id** as `userId` → 400; exposed an unscoped `directMessage.findMany` that printed *other users'* conversations in the log (local file only; the committed log is the corrected run, and 10 is now guarded with `if (!convId) throw` + conversationId filter).

## Disclosed limitations

- Validator size = `floor(base64.length / 4) * 3` — over-estimates by ≤2 bytes on unpadded payloads (PDF example: 78 derived vs 77 actual). Documented cap behaviour, not a leak.
- The verification log shows some `<truncated>`-style data URLs by design (log hygiene), with full length noted; byte-preservation is asserted in the harness rather than reproduced in the log.
- Authenticated browser E2E (Playwright) for the composer is **not** possible in this environment (no test credentials; register rate-limited) — see the root handoff note. The e2e suite covers unauth redirect + source-contract checks; backend units + this wet-run cover the pipeline.

## Runbook

```powershell
# API on :3000 already up; harness uses the transaction pooler (6543) to avoid
# starving the SESSION pool pool_size=15 shared with the live servers.
node --env-file=.env tmp-verify-dm-attachments.mjs
node --env-file=.env tmp-cleanup-dmatt.mjs
```
