# core-api: API and database reference

Every endpoint this service exposes, and the tables behind them.

## Auth mechanism

JWT in an httpOnly `Authorization` cookie, set by the server on login. Also returned in the
response body as `token`, for clients that can't rely on the cookie (the `Bearer <token>`
header works too). Payload: `{ id, companyId, role }`.

Roles: `super_admin` (one; created via `npm run seed:admin`, or `POST /auth/bootstrap-admin`,
see below) and `hiring_manager` (created only by a super admin, with a real password from the
start, no invite-token or accept step). A hiring manager cannot create other hiring managers.
No public signup endpoint exists for either role.

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

### `GET /users`
Auth required, role: `super_admin` or `hiring_manager`. A hiring manager sees only their own
company's users; super_admin sees every company's.
```json
// response 200
{ "data": PublicUser[], "message": "users" }
```

### `POST /users`
Auth required, role: `super_admin` only. Founds a brand-new company and its first hiring
manager together, atomically, with the password given directly in the request, no invite
link involved.
```json
// request
{ "company_name": "string", "full_name": "string", "email": "string", "password": "string (8+ chars, letter+number)" }
// response 201
{ "data": PublicUser, "message": "user created" }
```

## Shapes

**PublicUser** (never includes `password_hash`):
```json
{ "id": "uuid", "company_id": "uuid", "full_name": "string", "email": "string", "role": "super_admin | hiring_manager", "status": "pending_verification | active | inactive", "created_at": "date" }
```

**Error response**, every non-2xx:
```json
{ "success": false, "error": { "code": 400, "message": "string", "timestamp": "date", "path": "string", "details": "optional" } }
```

## Database

One Postgres database (Supabase), this repo owns two tables. See `prisma/schema.prisma` for
the exact source of truth, this is the relationship summary.

```
Company (1) ----< (many) User
User    (1) ----< (many) User   (invited_by, self-referencing)
```

- **Company**: `id, name (unique), created_at`. A tenant.
- **User**: `id, company_id (FK), full_name, email (unique), password_hash, role, status, invited_by (FK to another user, nullable), created_at`. A login account, always belongs to exactly one company. `status` is `active` unless there's a reason for it not to be, `pending_verification` is reserved for a future verification step and unused today.

Jobs, candidates, and interview sessions are not implemented in this service. Only the tables
and endpoints listed above exist.
