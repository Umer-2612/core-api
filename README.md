# core-api

Backend service for the Interview Platform. Handles authentication and organizations.

## What this service does

- Authentication: login, direct account creation (no invite tokens), session lookup, logout.
- Organizations ("companies"): every user belongs to exactly one company.
- Account creation: a super admin creates a hiring manager and their company together in one
  call. There is no public signup form and no invite-link/accept-password step.
- Jobs: a hiring manager creates a job (title and description) in their own company.
- Candidates: a hiring manager bulk-uploads PDF resumes to a job, each PDF becomes one
  candidate. The resume itself is stored in S3, only its key lives in Postgres. Each PDF is
  also parsed (regex/heuristics, no AI, see `resume-extractor.ts`) for a name, email, phone,
  summary, skills (grouped by the resume's own category labels), work experience, education
  (parsed the same structured way as experience), every other resume section the parser
  doesn't specifically recognize (captured under whatever heading the resume used, so nothing
  is dropped), and every PDF hyperlink (LinkedIn/GitHub/portfolio, project repo links,
  certificate badges), labeled with the exact resume text each link is attached to. The parsed
  result lives in a separate `CandidateProfile` row.
- Interviews: a hiring manager schedules an interview for a candidate. Scheduling creates
  three rounds (`dsa`, `vscode`, `technical_ai`) alongside it, plus one `access_token` for the
  whole session, the candidate's one link into the portal below. Only `dsa` is implemented so
  far, the VSCode sandbox and AI technical rounds aren't yet.
- The candidate portal (`/portal/:token`, no auth): the one place a candidate reaches
  directly, gated only by their session's unguessable `access_token`, never a login. The `dsa`
  round assigns 2 questions at random from a global pool the first time it's opened (then keeps
  them fixed), starts a 60-minute timer once the candidate clicks "Start", grades a submission
  against each question's test cases (via judge-service, server-to-server) showing pass/fail
  counts without ever exposing the hidden test cases themselves, and locks a question once
  it's submitted (one-shot per question, not per round).

Two roles exist: `super_admin` (the platform owner, one account, created by a seed script or
`POST /auth/bootstrap-admin` in development) and `hiring_manager` (created only by a super
admin, with a real password from the start). A hiring manager cannot create other hiring
managers, and a super admin cannot create jobs or upload candidates, only view them.

Full endpoint list and database schema: see `API.md`.

## Prerequisites

- `git`
- `docker` and `docker compose`
- [`age`](https://github.com/FiloSottile/age) and [`direnv`](https://direnv.net):
  `brew install age direnv`

Node.js is not required on your machine. Secrets are never stored in this repo: this repo's
`.envrc` loads them automatically from a shared local cache populated by the `secrets-vault`
repo, see that repo's README for how the cache gets there.

## Running this service

This service is normally started as part of the whole project, see the `platform` repo's
README for the one-command setup that runs every service together.

To run just this service on its own (assumes you've already run `secrets-vault`'s `setup.sh`
at least once):

```bash
direnv allow            # once per clone, trusts this repo's .envrc
docker compose up --build
```

The API is available at `http://localhost:4000`, all routes under `/api/v1`.

To run it without Docker (requires Node.js 20+ installed locally):

```bash
npm install
npm run prisma:push
npm run dev
```

## Applying schema changes

`DATABASE_URL` points at Supabase's session pooler, not a true direct connection (see
`secrets-vault`'s `vault.env.template` for why), and `prisma migrate dev` needs a direct
connection to manage its shadow database. Use `npm run prisma:push` instead whenever
`prisma/schema.prisma` changes, it pushes the schema straight to the database with no shadow
database involved. Fine for a project at this stage; revisit if this ever needs real migration
history.

## Creating the first account

There is no signup form. The first account (the super admin) is created either by running:

```bash
npm run seed:admin
```

or, in development, by calling `POST /auth/bootstrap-admin` (see `API.md`).

Every hiring manager account is created directly by the super admin, through `POST /users`, no
invite link or separate accept-password step.

## Seeding DSA questions

Each `dsa` round assigns 2 random questions from the `questions` table. Seed the pool
(currently 39 original questions, written from scratch, not scraped from LeetCode or any
other source, across arrays/strings/hash-map/two-pointers/sliding-window/stack/binary-search/
sorting/dynamic-programming/backtracking/greedy/graphs/trees/matrix/bit-manipulation/math,
each tagged by topic, not company; skips if any already exist):

```bash
npm run seed:questions
```

Each question ships with 15-20 test cases (3 shown to the candidate as worked examples, the
rest hidden and used to grade a submission), in `src/scripts/dsa-test-cases.generated.json`.
Every case's `expected_output` was computed by actually running a reference solution through
a live Judge0 instance (via `src/scripts/generate-test-cases.py`), never hand-typed, so a
correct submission is verified to actually pass. Re-run that script (needs judge-service
running locally first) whenever a question's format changes or new questions are added.

## Database

One Postgres database, hosted on Supabase, shared across every repo in this project. This
service owns eight tables: `companies`, `users`, `jobs`, `candidates`, `candidate_profiles`,
`interview_sessions`, `interview_rounds`, `questions`. Full schema and relationships: see
`API.md`.

## Resume storage (S3)

Uploaded PDFs are stored in S3, not Postgres. Needs `AWS_REGION`, `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`, and `S3_BUCKET_NAME` in the vault (see `secrets-vault`'s
`vault.env.template`). The IAM user only needs `s3:PutObject` and `s3:GetObject` scoped to
that one bucket, nothing else, resumes are always read and written by exact key, never listed.

## Tests

```bash
npm run test
```
Runs without a database connection; the test suite uses in-memory fakes for data access.

## Code structure

```
src/
  modules/     one folder per domain area: auth, users, companies, jobs, candidates, interview-sessions
  shared/      config, middleware, shared types, utilities
  db/          Postgres connection setup (Prisma)
  app.ts       Express app (middleware, routes, error handling)
  server.ts    entry point
```

Layering convention: `routes -> controller -> service -> repository -> database`. Each layer
only calls the one directly below it. Dependency injection via `tsyringe`, wired in
`src/shared/config/container.ts`, register any new service/repository there.
