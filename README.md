# core-api

Auth · orgs · jobs · candidates · resume parsing · interview session state.

Full plan: see the `platform` repo's README (sibling folder).

**Build order:** #1 — start here.

**Lift from:**
- `Interview-Platform-Backend` — auth, invitations, candidates/companies/jobs modules
- `Interview-Platform-Backend/src/shared/utils/resume-extractor.ts` — resume parser, use as-is
- `Codeinterview`'s Prisma schema — starting data model (`User`, `Room`, `Question`, `Schedule`)

**Owns:** the single Postgres database's `core` tables (org, users, jobs, candidates, sessions, scorecards).
