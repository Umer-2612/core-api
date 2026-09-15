# core-api

Auth, orgs, jobs, candidates, resume parsing, interview session state.

Full plan: see the `platform` repo's README (sibling folder).

**Build order:** #1, built.

## Status

Working and smoke-tested end to end against real Postgres: login, invite-a-hiring-manager
(creates a company + user in one transaction on accept), jobs, candidate creation with resume
parsing, interview session creation, and the public session-invite-token lookup that
`video-service`/`web-frontend` will use later.

Not built yet: scorecards, and file storage for the original resume PDF (parsing works on the
in-memory upload; the raw file itself isn't persisted anywhere yet).

## Quick start

This repo doesn't hold its own `.env`, by design, see the `platform` repo for how secrets get
injected. For standalone local development against this repo alone:

```bash
npm install
npx prisma generate

# needs DATABASE_URL, SECRET_KEY, FRONTEND_URL, and the SUPER_ADMIN_* vars (see .env.example)
# at minimum, whichever way you inject them (platform's bootstrap, or your own shell env)
npx prisma migrate dev
npm run seed:admin
npm run dev              # http://localhost:4000, API prefix /api/v1
```

## Structure

Same layering as `Interview-Platform-Backend`, the reference repo this was ported from:
`routes -> controller -> service -> repository -> Postgres (Prisma)`, wired with `tsyringe` DI
(see `src/shared/config/container.ts`). Ported modules: `auth`, `invitations`, `users`,
`companies`, `jobs`, `candidates`, `interview-sessions`. Swapped throughout: Mongoose/MongoDB
for Prisma/Postgres.

## Data model

One Postgres database (`prisma/schema.prisma`): `Company`, `User`, `Invitation`, `Job`,
`Candidate`, `InterviewSession`. Session state machine: `scheduled -> in_progress -> completed`
(see the platform repo README, section 8).

## Next

- Scorecards (hiring manager's post-interview evaluation)
- File storage for resumes (R2/S3), currently only the parsed JSON is kept
- Wire `video-service` to call `PATCH /sessions/:id` when a call actually starts/ends
