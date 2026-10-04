# 10 — Owner actions (2026-10-04; one line each, exact next action)

- Privileged test accounts: rotate or confirm the passwords out-of-band and record only the date, never the values.
- Repo visibility: confirm whether the repo stays public or goes private in the forge settings.
- Railway DATABASE_URL: append `connection_limit=5` to the pooled connection string in the Railway env.
- Beta faculties: decide whether the 15 beta faculties stay beta or move to planned, then update `rolloutStatus` accordingly.
- OAuth: create the Google console client ID/secret and set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL` on the API host.
- SMS: fund the Twilio account, confirm the sender number, and set `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM` plus `SMS_PROVIDER`.
- AI keys: set `ANTHROPIC_API_KEY` only when judging AI explanation/hint quality, otherwise leave unset (features degrade cleanly).
- Test accounts: delete the 41 test accounts before real students arrive (prefer `DELETE /api/users/me` per account, then recount).
- Faculty/year/module list: confirm the canonical faculty, year, track, module, and unit names to author against.
- Real content: approve the first real batch source (owner-written or licensed) and run the importer dry-run before any `--apply`.
