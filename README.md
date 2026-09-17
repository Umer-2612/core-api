# core-api

Backend service for the Interview Platform. Handles authentication and organizations.

## What this service does

- Authentication: login, direct account creation (no invite tokens), session lookup, logout.
- Organizations ("companies"): every user belongs to exactly one company.
- Account creation: a super admin creates a hiring manager and their company together in one
  call. There is no public signup form and no invite-link/accept-password step.

Two roles exist: `super_admin` (the platform owner, one account, created by a seed script or
`POST /auth/bootstrap-admin` in development) and `hiring_manager` (created only by a super
admin, with a real password from the start). A hiring manager cannot create other hiring
managers.

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

## Database

One Postgres database, hosted on Supabase, shared across every repo in this project. This
service owns two tables: `companies`, `users`. Full schema and relationships: see `API.md`.

## Tests

```bash
npm run test
```
Runs without a database connection; the test suite uses in-memory fakes for data access.

## Code structure

```
src/
  modules/     one folder per domain area: auth, users, companies
  shared/      config, middleware, shared types, utilities
  db/          Postgres connection setup (Prisma)
  app.ts       Express app (middleware, routes, error handling)
  server.ts    entry point
```

Layering convention: `routes -> controller -> service -> repository -> database`. Each layer
only calls the one directly below it. Dependency injection via `tsyringe`, wired in
`src/shared/config/container.ts`, register any new service/repository there.
