# core-api

Backend service for the Interview Platform. Handles authentication and organizations.

## What this service does

- Authentication: login, invite-based account creation, session lookup, logout.
- Organizations ("companies"): every user belongs to exactly one company.
- Invitations: the only way a new account gets created. There is no public signup form.

Two roles exist: `super_admin` (the platform owner, one account, created by a seed script, not
through any API) and `hiring_manager` (created only by accepting an invitation, either into an
existing company or founding a new one).

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
npm run prisma:migrate
npm run dev
```

## Creating the first account

There is no signup form. The first account (the super admin) is created by running:

```bash
npm run seed:admin
```

Every other account is created by an existing admin sending an invitation; the invited person
accepts it through `web-frontend`'s `/invite/[token]` page, which calls this service's
`POST /auth/set-password`.

## Database

One Postgres database, hosted on Supabase, shared across every repo in this project. This
service owns three tables: `companies`, `users`, `invitations`. Full schema and relationships:
see `API.md`.

## Tests

```bash
npm run test
```
Runs without a database connection; the test suite uses in-memory fakes for data access.

## Code structure

```
src/
  modules/     one folder per domain area: auth, invitations, users, companies, email
  shared/      config, middleware, shared types, utilities
  db/          Postgres connection setup (Prisma)
  app.ts       Express app (middleware, routes, error handling)
  server.ts    entry point
```

Layering convention: `routes -> controller -> service -> repository -> database`. Each layer
only calls the one directly below it. Dependency injection via `tsyringe`, wired in
`src/shared/config/container.ts`, register any new service/repository there.
