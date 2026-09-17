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

### `GET /jobs`
Auth required, role: `super_admin` or `hiring_manager`. A hiring manager sees only their own
company's jobs; super_admin sees every company's, read-only, super admins cannot create jobs.
```json
// response 200
{ "data": Job[], "message": "jobs" }
```

### `POST /jobs`
Auth required, role: `hiring_manager` only. Always scoped to the caller's own company.
```json
// request
{ "title": "string", "description": "string" }
// response 201
{ "data": Job, "message": "job created" }
```

### `GET /jobs/:id`
Auth required, role: `super_admin` or `hiring_manager`. 404 if the job doesn't exist, 403 if
a hiring manager tries to view another company's job.
```json
// response 200
{ "data": Job, "message": "job" }
```

### `GET /jobs/:id/candidates`
Auth required, role: `super_admin` or `hiring_manager`, same visibility rule as `GET /jobs/:id`.
Never includes the resume file itself, only metadata.
```json
// response 200
{ "data": PublicCandidate[], "message": "candidates" }
```

### `POST /jobs/:id/candidates`
Auth required, role: `hiring_manager` only, and the job must belong to their own company.
Multipart form, field name `resumes`, one or more PDF files (5MB each, 20 files per request).
No name or email field, there's no form for it, each candidate's `full_name` is derived from
its file name (`jane-doe_resume.pdf` becomes `Jane Doe Resume`). The files themselves are
stored in S3, this table only ever holds metadata.
```json
// response 201
{ "data": PublicCandidate[], "message": "resumes uploaded" }
```

### `GET /jobs/:id/candidates/:candidateId/resume`
Auth required, role: `super_admin` or `hiring_manager`, same visibility rule as `GET /jobs/:id`.
Streams the PDF back (`Content-Type: application/pdf`, `Content-Disposition: attachment`),
fetched from S3 on the fly, not cached in the response body of any other endpoint.

## Shapes

**PublicUser** (never includes `password_hash`):
```json
{ "id": "uuid", "company_id": "uuid", "full_name": "string", "email": "string", "role": "super_admin | hiring_manager", "status": "pending_verification | active | inactive", "created_at": "date" }
```

**Error response**, every non-2xx:
```json
{ "success": false, "error": { "code": 400, "message": "string", "timestamp": "date", "path": "string", "details": "optional" } }
```

**PublicCandidate** (never includes the resume file, only where it points):
```json
{ "id": "uuid", "job_id": "uuid", "full_name": "string", "resume_file_name": "string", "created_at": "date" }
```

## Database

One Postgres database (Supabase), this repo owns four tables. See `prisma/schema.prisma` for
the exact source of truth, this is the relationship summary.

```
Company (1) ----< (many) User
User    (1) ----< (many) User        (invited_by, self-referencing)
Company (1) ----< (many) Job
User    (1) ----< (many) Job         (created_by)
Job     (1) ----< (many) Candidate
User    (1) ----< (many) Candidate   (created_by)
```

- **Company**: `id, name (unique), created_at`. A tenant.
- **User**: `id, company_id (FK), full_name, email (unique), password_hash, role, status, invited_by (FK to another user, nullable), created_at`. A login account, always belongs to exactly one company. `status` is `active` unless there's a reason for it not to be, `pending_verification` is reserved for a future verification step and unused today.
- **Job**: `id, company_id (FK), title, description, created_by (FK), created_at`. Only a hiring manager creates these.
- **Candidate**: `id, job_id (FK), full_name, resume_file_name, resume_key, created_by (FK), created_at`. One row per uploaded resume. `resume_key` is the S3 object key, the file itself never touches Postgres.

Interview sessions are not implemented in this service. Only the tables and endpoints listed
above exist.
