# core-api

Auth flow: login, invite-accept, orgs. Jobs, candidates, and interview sessions were removed for
now, they're coming back once their schema is actually settled, not carried over wholesale from
the reference repo again.

Full plan: see the `platform` repo's README (sibling folder).

## Status

Built and type-checked: login, invite-a-hiring-manager (creates a company + user in one
transaction on accept), `/me`, logout.

Deliberately out of scope right now: jobs, candidates, resume parsing, interview sessions,
scorecards. These existed in an earlier pass and were removed, not because the ideas were wrong,
but because building them again before the auth flow itself was verified and the schema settled
was the wrong order.

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
(see `src/shared/config/container.ts`). Modules: `auth`, `invitations`, `users`, `companies`.
Swapped throughout: Mongoose/MongoDB for Prisma/Postgres.

## Data model

One Postgres database (`prisma/schema.prisma`): `Company`, `User`, `Invitation`. That's it for
now.

## Next

Once the auth flow is verified end to end (including in `web-frontend`), bring jobs/candidates/
interview-sessions back one at a time, each with its schema decided deliberately rather than
lifted wholesale.
