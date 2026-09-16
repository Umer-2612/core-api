# core-api: API and database reference

Every endpoint this service exposes, and the tables behind them.

## Auth mechanism

JWT in an httpOnly `Authorization` cookie, set by the server on login/set-password. Also
returned in the response body as `token`, for clients that can't rely on the cookie (the
`Bearer <token>` header works too). Payload: `{ id, companyId, role }`.

Roles: `super_admin` (one; created via `npm run seed:admin`, or `POST /auth/bootstrap-admin`,
see below) and `hiring_manager` (created only by accepting an invitation). No public signup
endpoint exists for either role.

## Endpoints

All prefixed `/api/v1`.

### `POST /auth/login`
Public.
```json
// request
{ "email": "string", "password": "string" }
// response 200
{ "data": { "user": PublicUser, "token": "string" }, "message": "login" }
```

### `POST /auth/set-password`
Public (token-gated). Accepts an invitation: creates the user, and if the invite has no
`company_id` yet (a super_admin invited a brand-new hiring manager), creates the company too,
atomically, via `CompaniesRepository.createWithUser`.
```json
// request
{ "token": "string", "full_name": "string", "password": "string (8+ chars, letter+number)" }
// response 201
{ "data": { "user": PublicUser, "token": "string" }, "message": "password set" }
```

### `POST /auth/bootstrap-admin`
Public. Development only, 403 in production. Only works once, refuses to run if a
`super_admin` already exists (409). Creates the platform's one super admin from the
`SUPER_ADMIN_*` environment variables, no request body. A convenience alternative to
`npm run seed:admin` for local setup, not something to leave reachable anywhere outside
development, it's an unauthenticated account-creation endpoint by necessity, there's no
existing admin yet to gate it against.
```json
// response 201
{ "data": { "user": PublicUser, "token": "string" }, "message": "super admin created" }
```

### `GET /auth/me`
Auth required.
```json
// response 200
{ "data": PublicUser, "message": "me" }
```

### `POST /auth/logout`
Auth required. Clears the cookie. Stateless JWT, no server-side revocation.
```json
// response 200
{ "message": "logout" }
```

### `GET /invitations`
Auth required, role: `super_admin` or `hiring_manager`. A hiring manager sees only their
company's invitations; super_admin sees all.
```json
// response 200
{ "data": Invitation[], "message": "invitations" }
```

### `POST /invitations`
Auth required, role: `super_admin` or `hiring_manager`.
- super_admin: `pending_company_name` is required, creates a pending invite for a brand-new
  company (no `company_id` yet, filled in when the invite is accepted).
- hiring_manager: invites into their own company, `pending_company_name` is ignored.
```json
// request
{ "email": "string", "pending_company_name": "string (required only for super_admin)" }
// response 201
{ "data": { "email": "string", "role": "hiring_manager", "expires_at": "date" }, "message": "invitation sent" }
```

### `POST /invitations/:id/resend`
Auth required, role: `super_admin` only. New token, new expiry, re-sends the email.
```json
// response 200
{ "data": null, "message": "invitation resent" }
```

### `DELETE /invitations/:id`
Auth required, role: `super_admin` only.
```json
// response 200
{ "data": null, "message": "invitation cancelled" }
```

### `GET /invitations/:token`
Public. Candidate-facing resolution of an invite link before accepting it.
```json
// response 200
{ "data": { "email": "string", "role": "string", "company_name": "string" }, "message": "invitation" }
```

## Shapes

**PublicUser** (never includes `password_hash`):
```json
{ "id": "uuid", "company_id": "uuid", "full_name": "string", "email": "string", "role": "super_admin | hiring_manager", "is_active": "boolean", "created_at": "date" }
```

**Error response**, every non-2xx:
```json
{ "success": false, "error": { "code": 400, "message": "string", "timestamp": "date", "path": "string", "details": "optional" } }
```

## Database

One Postgres database (Supabase), this repo owns three tables. See `prisma/schema.prisma` for
the exact source of truth, this is the relationship summary.

```
Company (1) ----< (many) User
Company (1) ----< (many) Invitation
```

- **Company**: `id, name, slug (unique), created_at`. A tenant.
- **User**: `id, company_id (FK), full_name, email (unique), password_hash, role, invited_by, is_active, created_at`. A login account, always belongs to exactly one company.
- **Invitation**: `id, company_id (FK, nullable), email, role, token (unique), invited_by, expires_at, accepted_at, created_at, pending_company_name, pending_company_slug`. `company_id` is null until accepted for a brand-new-company invite (super_admin inviting someone to found a new company); otherwise it's set from the start.

Jobs, candidates, and interview sessions are not implemented in this service. Only the tables
and endpoints listed above exist.
