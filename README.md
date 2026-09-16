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

Secrets live in Infisical, not in a `.env` file. `.env.example` documents what variables exist,
it's not something to copy.

```bash
# one-time per machine
brew install infisical/get-cli/infisical
infisical login

# one-time per clone of this repo (already done, .infisical.json is committed)
infisical init

npm install
npm run prisma:migrate    # runs `prisma migrate dev` with secrets injected
npm run seed:admin        # same, for the seed script
npm run dev               # http://localhost:4000, API prefix /api/v1
```

Every script in `package.json` that needs secrets is already wrapped as
`infisical run --env dev -- <command>`, so `npm run dev` etc. just work once you're logged in.
Postgres itself still needs to actually be running, `docker compose up -d postgres` (from this
repo's own `docker-compose.yml`) before `prisma:migrate`/`dev`/`seed:admin`.

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
