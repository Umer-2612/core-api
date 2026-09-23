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

### `GET /companies`
Auth required, role: `super_admin` only. Platform-owner oversight, not something a hiring
manager needs.
```json
// response 200
{ "data": Company[], "message": "companies" }
```

### `GET /companies/:id`
Auth required, role: `super_admin` only.
```json
// response 200
{ "data": Company, "message": "company" }
```

### `GET /companies/:id/users`
Auth required, role: `super_admin` only.
```json
// response 200
{ "data": PublicUser[], "message": "company users" }
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
No name or email field, there's no form for it: each PDF is parsed (regex/heuristics, no AI)
for a name, email, phone, summary, skills, and work experience. `full_name` and `email` on
the candidate come from that parse when it finds them; `full_name` falls back to the file
name (`jane-doe_resume.pdf` becomes `Jane Doe Resume`) when the parser can't find a name, and
`email` stays `null` when it can't find one. The rest of what the parser found (phone,
summary, skills, experience) lands in a `CandidateProfile` row, see `GET .../profile` below.
The PDF file itself is stored in S3, never in Postgres.
```json
// response 201
{ "data": PublicCandidate[], "message": "resumes uploaded" }
```

### `GET /jobs/:id/candidates/:candidateId`
Auth required, role: `super_admin` or `hiring_manager`, same visibility rule as `GET /jobs/:id`.
Single candidate, same shape as an entry in `GET /jobs/:id/candidates`. 404 if the candidate
doesn't exist or belongs to a different job.
```json
// response 200
{ "data": PublicCandidate, "message": "candidate" }
```

### `GET /jobs/:id/candidates/:candidateId/resume`
Auth required, role: `super_admin` or `hiring_manager`, same visibility rule as `GET /jobs/:id`.
Streams the PDF back (`Content-Type: application/pdf`, `Content-Disposition: attachment`),
fetched from S3 on the fly, not cached in the response body of any other endpoint.

### `GET /jobs/:id/candidates/:candidateId/profile`
Auth required, role: `super_admin` or `hiring_manager`, same visibility rule as `GET /jobs/:id`.
What the resume parser found beyond the name and email already on the candidate. 404 if the
candidate has no profile row (shouldn't happen: one is always created at upload time, even
an empty one, if the PDF couldn't be parsed at all).
```json
// response 200
{ "data": CandidateProfile, "message": "candidate profile" }
```

### `GET /jobs/:id/candidates/:candidateId/interviews`
Auth required, role: `super_admin` or `hiring_manager`, same visibility rule as `GET /jobs/:id`.
Every interview ever scheduled for this candidate, newest first.
```json
// response 200
{ "data": InterviewSessionWithRounds[], "message": "interview sessions" }
```

### `POST /jobs/:id/candidates/:candidateId/interviews`
Auth required, role: `hiring_manager` only, and the job must belong to their own company.
Creates the session and its three rounds (`dsa`, `vscode`, `technical_ai`, in that order)
together, atomically, each with a fresh unguessable `access_token` on the session. Only the
`dsa` round is implemented so far (the VSCode sandbox and AI technical interview aren't yet),
each round is created with `status: pending` and nothing else. A candidate can only be
scheduled once, `candidate_id` is unique on `interview_sessions`, a second attempt 409s.
```json
// request
{ "scheduled_at": "string (ISO 8601 datetime)" }
// response 201
{ "data": InterviewSessionWithRounds, "message": "interview scheduled" }
// response 409 (candidate already has an interview scheduled)
{ "success": false, "error": { "code": 409, "message": "This candidate already has an interview scheduled" } }
```

### The candidate portal (no auth)
Everything under `/portal/:token` is deliberately unauthenticated: a candidate never gets a
login, the `access_token` on their `InterviewSession` (returned to the hiring manager in the
two endpoints above, in the `access_token` field) is the only gate. Share it as
`https://<web-frontend>/interview/:token`. Anyone holding the token can view and submit that
one candidate's rounds, nothing else, there's no cross-session or cross-candidate access.

### `GET /portal/:token`
No auth. The portal landing page's data: who this is for and every round's status. 404s if
the token doesn't match any session.
```json
// response 200
{ "data": { "candidate_name": "string", "job_title": "string", "status": "scheduled | completed | cancelled", "rounds": [{ "id": "uuid", "round_type": "dsa | vscode | technical_ai", "sequence": "number", "status": "pending | completed" }] }, "message": "interview portal" }
```

### `GET /portal/:token/dsa`
No auth. The DSA round's question and current state. The question is picked at random from
the global `Question` pool the first time this is called for a given round, then fixed for
the rest of that round (calling this again never reassigns it). 404s for an unknown token,
503s if the question pool is empty (shouldn't happen once seeded, see `seed:questions`).
```json
// response 200
{ "data": { "round": { "id": "uuid", "status": "pending | completed", "submission": { "code": "string", "language": "string", "submitted_at": "date" } } }, "question": { "id": "uuid", "title": "string", "prompt": "string", "difficulty": "easy | medium | hard", "tags": "string[] (topic tags, e.g. \"arrays\", not company tags)", "starter_code": { "javascript": "string", "python": "string", "...": "one key per supported language" } } }
```

### `POST /portal/:token/dsa/submit`
No auth. Locks in the candidate's final code and marks the round `completed`. One-shot: a
round that's already `completed` 409s instead of overwriting the earlier submission. No
auto-grading, a hiring manager reads the submitted code directly (see the candidate detail
page on web-frontend, once that's wired up to show it).
```json
// request
{ "code": "string", "language": "string" }
// response 200
{ "data": InterviewRound, "message": "dsa round submitted" }
// response 409 (already submitted)
{ "success": false, "error": { "code": 409, "message": "This round has already been submitted" } }
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

**PublicCandidate** (never includes the resume file, only where it points):
```json
{ "id": "uuid", "job_id": "uuid", "full_name": "string", "email": "string | null", "resume_file_name": "string", "created_at": "date" }
```

**CandidateProfile**: `skills` preserves each category from the resume (e.g. "Languages",
"Databases") as its own group instead of flattening everything into one list; a resume with
no category labels gets one group with `category: ""`. `experience` and `education` share the
same shape (a resume's degree/institution/date line is structured the same way as a job's
role/company/date line), `education` is only populated from a recognized education heading,
so a resume with an unusual one still falls back to `sections` for it. `sections` is every
OTHER section the resume had (certificates, achievements, projects, languages, ...) that
isn't specifically parsed above, captured under whatever heading the resume itself used so
nothing is dropped, even a section this parser has never seen before (see
`resume-extractor.ts`'s section outline scan for how an unrecognized heading still gets
picked up). Each section's `entries` groups a top-level bullet (e.g. a project name) with the
sub-bullets under it (e.g. that project's own description lines) as one `{ title, bullets }`
pair, so the frontend can number entries independently of how many sub-bullets each one has,
instead of one flat, continuously-numbered list. `links` is every hyperlink found anywhere in
the PDF (LinkedIn/GitHub/portfolio in the header, a project's repo link, a certificate's badge
link, ...), deduplicated by URL. `label` is the exact resume text the link is attached to
(found by matching the link annotation's position on the page to the text sitting at that
position), falling back to a domain-based guess (LinkedIn, GitHub, GitLab, mailto, Credly, or
the hostname) only when no text lines up with the link's position at all. These are PDF link
annotations, not text on the page, "LinkedIn" as visible text has no URL in it, so this can
only come from reading the PDF directly, not from `extractFromText`.
```json
{
  "id": "uuid",
  "candidate_id": "uuid",
  "phone": "string | null",
  "summary": "string | null",
  "skills": [{ "category": "string (may be \"\")", "items": "string[]" }],
  "experience": [{ "role": "string", "company": "string", "years": "string", "bullets": "string[]" }],
  "education": [{ "role": "string", "company": "string", "years": "string", "bullets": "string[]" }],
  "sections": [{ "heading": "string", "entries": [{ "title": "string", "bullets": "string[]" }] }],
  "links": [{ "label": "string", "url": "string" }],
  "created_at": "date"
}
```

**InterviewSessionWithRounds**: `access_token` is the candidate portal link's token (see
"The candidate portal" above), only ever meaningful to the hiring manager who needs to send
it, never rotated. A round's `submission` is only set once a candidate submits that round.
```json
{ "id": "uuid", "job_id": "uuid", "candidate_id": "uuid", "access_token": "uuid", "scheduled_at": "date", "status": "scheduled | completed | cancelled", "created_at": "date", "rounds": [{ "id": "uuid", "round_type": "dsa | vscode | technical_ai", "sequence": "number", "status": "pending | completed", "submission": "{ code, language, submitted_at } | null", "created_at": "date" }] }
```

## Database

One Postgres database (Supabase), this repo owns eight tables. See `prisma/schema.prisma` for
the exact source of truth, this is the relationship summary.

```
Company   (1) ----< (many) User
User      (1) ----< (many) User                    (invited_by, self-referencing)
Company   (1) ----< (many) Job
User      (1) ----< (many) Job                      (created_by)
Job       (1) ----< (many) Candidate
User      (1) ----< (many) Candidate                (created_by)
Candidate (1) ----( 0 or 1 ) CandidateProfile
Job       (1) ----< (many) InterviewSession
Candidate (1) ----( 0 or 1 ) InterviewSession        (a candidate can only be scheduled once)
User      (1) ----< (many) InterviewSession          (created_by)
InterviewSession (1) ----< (exactly 3) InterviewRound
Question  (1) ----< (many) InterviewRound            (only dsa rounds have one assigned)
```

- **Company**: `id, name (unique), created_at`. A tenant.
- **User**: `id, company_id (FK), full_name, email (unique), password_hash, role, status, invited_by (FK to another user, nullable), created_at`. A login account, always belongs to exactly one company. `status` is `active` unless there's a reason for it not to be, `pending_verification` is reserved for a future verification step and unused today.
- **Job**: `id, company_id (FK), title, description, created_by (FK), created_at`. Only a hiring manager creates these.
- **Candidate**: `id, job_id (FK), full_name, email (nullable), resume_file_name, resume_key, created_by (FK), created_at`. One row per uploaded resume. `resume_key` is the S3 object key, the file itself never touches Postgres. `full_name`/`email` come from the resume parser when it finds them, otherwise `full_name` falls back to the file name and `email` stays null.
- **CandidateProfile**: `id, candidate_id (FK, unique), phone (nullable), summary (nullable), skills (JSON array of `{ category, items }`), experience (JSON array of `{ role, company, years, bullets }`), education (same shape as experience), sections (JSON array of `{ heading, entries: { title, bullets }[] }`, everything else the resume had), links (JSON array of `{ label, url }`, every PDF hyperlink found), created_at`. What the resume parser found beyond name and email, one row per candidate, created (possibly empty) at upload time regardless of whether the parse fully succeeded.
- **InterviewSession**: `id, job_id (FK), candidate_id (FK, unique), access_token (unique), scheduled_at, status, created_by (FK), created_at`. At most one row per candidate, scheduling a second one 409s. `access_token` is generated once at creation and never rotated, it's the whole candidate portal's login-free access key.
- **InterviewRound**: `id, session_id (FK), round_type (dsa | vscode | technical_ai), sequence, status, question_id (FK to Question, nullable), submission (JSON `{ code, language, submitted_at }`, nullable), created_at`. Always exactly three per session, created alongside it. Only `dsa` is implemented so far: `question_id` is set the first time the candidate opens that round (random pick from `Question`, then fixed), `submission` is set once they submit it, which also flips `status` to `completed`.
- **Question**: `id, title, prompt, difficulty (easy | medium | hard), tags (string array, topic tags like "arrays"/"dynamic-programming", not company tags, this platform doesn't do company-specific sets), starter_code (JSON, one key per supported language), created_at`. A global pool of original questions (not scraped from LeetCode or any other source), seeded via `npm run seed:questions`, not yet authored per-job or picked by JD relevance.
