# Ikigai Training API (foundation)

This directory contains the first executable backend slice. It is intentionally small and does not yet serve member, booking, routine, or financial data.

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

The API listens on `http://127.0.0.1:3001` by default. Available routes:

- `GET /healthz`: minimal process health.
- `GET /api/v1/health`: versioned API health.
- `POST /api/v1/auth/login`: local email/password login with server-side session creation and rate limiting.
- `GET /api/v1/auth/me`: current user, current roles, and CSRF token.
- `POST /api/v1/auth/logout`: CSRF- and origin-checked session revocation.

Set `CORS_ORIGINS` to exact comma-separated origins. Production startup fails closed if it is missing, if `SESSION_SECRET` is shorter than 32 characters, or if `DATABASE_URL` is missing. Use a high-entropy secret from the hosting secret manager. Never use `*` for origins when credentials are enabled. Keep the server bound to localhost for local development unless a deliberate network deployment requires otherwise. The frontend and API should be deployed under the same site so the strict same-site session cookie is sent as expected.

## Database migration

Set `DATABASE_URL` to a dedicated development database, then run:

```bash
npm run db:migrate
```

The migration runner applies numbered SQL files once, uses a PostgreSQL advisory lock to avoid concurrent migration runners, and wraps each migration in a transaction. Test the migration against a disposable database before using any persistent environment. Do not point it at a production database.

The initial schema includes profiles, roles, services/memberships, append-only account movements, class templates and dated sessions, recurring assignments, bookings, attendance, monthly coach obligations/payments, routines, sessions and audit events. Member ledger entries, coach obligations, coach obligation adjustments, coach payments and audit rows are protected against update/delete. Correcting a monthly obligation requires an append-only adjustment with a reason; corrections to financial history must be represented by new records.

### Create the first administrator

Apply migrations first. Then set `ADMIN_EMAIL` and `ADMIN_PASSWORD` (12–128 characters) in the local environment and run `npm run admin:create`. The command refuses to overwrite an existing email, hashes the password with Node's scrypt implementation, creates the administrator role transactionally, and never prints the password. Run it only against the intended development/production database with secure operator access; do not commit credentials to `.env` or source control.

## Security boundary — important

Authentication is still incomplete and not yet ready for production. Login, server-side opaque sessions, session introspection, logout revocation, per-route in-memory rate limiting, strict cookie settings, origin checks and CSRF token checks now exist. There is still no authorization middleware for business resources, no member/coach data endpoints, no password recovery, and no shared rate-limit store for multiple replicas. Do not create real users or load real member/financial data yet. The health endpoints deliberately expose no database details or secrets.

The booking domain module is pure logic with unit tests; it is not yet connected to a database transaction or booking endpoint. Login stores only a SHA-256 digest of the opaque session token. The session cookie is HttpOnly, SameSite=Strict and Secure in production; the CSRF token is derived with HMAC and checked on logout. A future booking endpoint must enforce the same rules inside a database transaction and must lock/serialize capacity checks to prevent two concurrent requests from overbooking a class. Tests in this stage are unit, application-injection and static-schema tests; they do not replace PostgreSQL integration tests.
