# Ikigai Training API (foundation)

This directory contains the first executable backend slice. It serves health checks, authentication/session routes, member-profile reads and scoped profile updates. Full membership lifecycle management and fiscal invoicing are not exposed yet. Exercise cataloguing, immutable routine versions and role-scoped member assignments are implemented. Attendance recording/correction and member attendance history are available with server-side scope checks and audit events. Member account history, idempotent ledger movements and coach monthly obligations/payments/adjustments are available through the API. The coach financial model is a fixed monthly obligation for use of the space; it is not derived from bookings, attendance or percentage shares. Booking creation and cancellation are implemented with database transactions, session-row locking, server-time cutoff enforcement, and waitlist promotion.

## Requirements

- Node.js 22+
- PostgreSQL 14+ for applying the schema migration (not needed to run API health checks or unit tests)

## Local setup

```bash
cd server
npm install
cp .env.example .env
npm run check
npm test
npm run build
npm run dev
```

The API listens on `http://127.0.0.1:3001` by default. Without `DATABASE_URL`, development mode intentionally exposes only health routes. To enable authentication and member endpoints, point `DATABASE_URL` at a dedicated development database and run `npm run db:migrate` first. Available routes when the database is configured:

- `GET /healthz`: minimal process health.
- `GET /api/v1/health`: versioned API health.
- `POST /api/v1/auth/login`: local email/password login with server-side session creation and rate limiting.
- `GET /api/v1/auth/me`: current user, current roles, and CSRF token.
- `POST /api/v1/auth/logout`: CSRF- and origin-checked session revocation.
- `POST /api/v1/admin/invitations`: administrator-only invitation for an unlinked member or coach profile. The disabled account is activated only after acceptance.
- `POST /api/v1/admin/invitations/:id/resend`: issues a replacement token for an unaccepted invitation, revoking previous outstanding tokens.
- `POST /api/v1/admin/invitations/:id/revoke`: invalidates an unaccepted invitation without issuing a replacement.
- `POST /api/v1/admin/users/:id/sessions/revoke`: administrator-only, audited revocation of all active sessions for a user; repeated requests are safe.
- `POST /api/v1/auth/accept-invitation`: accepts a one-time token and sets the account password; the token is stored only as a digest and expires after 24 hours. The raw token is returned once to the administrator and must be delivered securely out of band; no email is sent.
- `GET /api/v1/members?limit=&offset=`: administrator-only paginated member list.
- `GET /api/v1/members/:id`: administrator, self-member, or assigned-coach access with role-specific field minimization.
- `GET /api/v1/services`: authenticated service catalogue; inactive services are visible only to administration.
- `POST /api/v1/services` and `PATCH /api/v1/services/:id`: administrator-only service creation and audited changes. Current price changes do not rewrite agreed membership prices.
- `GET /api/v1/members/:id/memberships`: administrator or the member themselves can read membership history.
- `POST /api/v1/members/:id/memberships`: administrator-only membership creation, validates service/date/price, records audit, and replays matching duplicate requests safely.
- `POST /api/v1/memberships/:id/end`: administrator-only, audited membership termination; does not automatically create charges, refunds or penalties.
- `PATCH /api/v1/members/:id`: audited transactional profile update; members may edit only their own contact details, while administrators may edit the full operational profile.
- `GET /api/v1/members/:id/ledger-entries`: account history and exact debit/credit balance for administrators or the member themselves.
- `POST /api/v1/members/:id/ledger-entries`: administrator-only charge, payment, adjustment or refund with idempotency key, audit record and exact decimal amounts. Payment responses identify receipts as internal, not fiscal invoices.
- `GET/POST /api/v1/coaches`: administrator coach directory and audited coach creation.
- `GET /api/v1/coaches/:id/obligations?period=YYYY-MM`: administrator or that coach can view the fixed monthly obligation, adjustments, partial payments and balance. An unconfigured obligation returns `balance: null`.
- `POST /api/v1/coaches/:id/obligations`: configure one fixed obligation per coach and month; same terms replay safely, conflicting terms return 409.
- `POST /api/v1/coach-obligations/:id/payments`: record partial or excess payments with idempotency keys and an internal-receipt label.
- `POST /api/v1/coach-obligations/:id/adjustments`: append a signed correction with reason and idempotency key.
- `GET /api/v1/class-sessions/:id/attendance`: administrator or assigned coach reads confirmed attendees and saved attendance.
- `PUT /api/v1/class-sessions/:id/attendance`: administrator or assigned coach records/corrects attendance transactionally; duplicate bookings are rejected and every change is audited.
- `GET /api/v1/members/:id/attendance`: administrator or the member reads the member's own attendance history.
- `GET /api/v1/exercises` and `POST /api/v1/exercises`: coaches/admin browse active exercises; only administration creates them.
- `GET /api/v1/routines`: administration/coaches browse active routines at their latest immutable version.
- `POST /api/v1/routines` and `POST /api/v1/routines/:id/versions`: administrator-only routine creation/versioning, with all exercise references validated inside the transaction.
- `GET/POST /api/v1/members/:id/routine-assignments`: member-owned routine history and assignment by administration or a coach with member scope. Assignment records reference immutable routine versions.
- `POST /api/v1/class-sessions/:id/bookings`: active members reserve their own place; capacity and duplicate checks run inside a PostgreSQL transaction.
- `POST /api/v1/bookings/:id/cancel`: member-owner or administrator cancellation before the 40-minute cutoff, with transactional waitlist promotion.

Set `CORS_ORIGINS` to exact comma-separated origins. Production startup fails closed if it is missing, if `SESSION_SECRET` is absent or shorter than 32 characters, or if `DATABASE_URL` is missing. Use a high-entropy secret from the hosting secret manager. Never use `*` for origins when credentials are enabled. Keep the server bound to localhost for local development unless a deliberate network deployment requires otherwise. The frontend and API should be deployed under the same site so the strict same-site session cookie is sent as expected.

## Database migration

Set `DATABASE_URL` to a dedicated development database, then run:

```bash
npm run db:migrate
```

The migration runner applies numbered SQL files once, uses a PostgreSQL advisory lock to avoid concurrent migration runners, and wraps each migration in a transaction. Test the migration against a disposable database before using any persistent environment. Do not point it at a production database.

The initial schema includes profiles, roles, services/memberships, append-only account movements with debit/credit direction and idempotency, class templates and dated sessions, recurring assignments, bookings, attendance, monthly coach obligations/adjustments/payments, routines, sessions and audit events. Member ledger entries, coach obligations, coach obligation adjustments, coach payments and audit rows are protected against update/delete. Correcting a monthly obligation requires an append-only adjustment with a reason; corrections to financial history must be represented by new records.

### Create the first administrator

Apply migrations first. Then set `ADMIN_EMAIL` and `ADMIN_PASSWORD` (12–128 characters) in the local environment and run `npm run admin:create`. The command refuses to overwrite an existing email, hashes the password with Node's scrypt implementation, creates the administrator role transactionally, and never prints the password. Run it only against the intended development/production database with secure operator access; do not commit credentials to `.env` or source control.

## Security boundary — important

Authentication is still incomplete and not yet ready for production. Login, server-side opaque sessions, session introspection, logout revocation, per-route in-memory rate limiting, strict cookie settings, origin checks and CSRF token checks now exist. Resource-level authorization is implemented for member reads/updates and the current booking, ledger, coach, attendance and routine endpoints. Password recovery, broader negative authorization tests and a shared rate-limit store for multiple replicas are still pending. Do not create real users or load real member/financial data yet. The health endpoints deliberately expose no database details or secrets.

The booking domain module is connected to PostgreSQL-backed booking/cancellation endpoints. Integration tests exercise concurrent requests against a disposable PostgreSQL database; these tests must remain green before expanding the booking API. Member-profile reads enforce roles and coach/member scope on the server; member and coach responses omit fields they do not need. Login stores only a SHA-256 digest of the opaque session token. The session cookie is HttpOnly, SameSite=Strict and Secure in production; the CSRF token is derived with HMAC and checked on logout. The current booking endpoints enforce the rules inside database transactions and serialize capacity checks; the integration suite exercises concurrent booking requests against disposable PostgreSQL. Keep these tests green and extend coverage for rollback, retry, cutoff, and permission edge cases.
