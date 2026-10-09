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

Set `CORS_ORIGINS` to exact comma-separated origins. Production startup fails closed if it is missing. Never use `*` for origins when credentials are enabled. Keep the server bound to localhost for local development unless a deliberate network deployment requires otherwise.

## Database migration

Set `DATABASE_URL` to a dedicated development database, then run:

```bash
npm run db:migrate
```

The migration runner applies numbered SQL files once, uses a PostgreSQL advisory lock to avoid concurrent migration runners, and wraps each migration in a transaction. Test the migration against a disposable database before using any persistent environment. Do not point it at a production database.

The initial schema includes profiles, roles, services/memberships, append-only account movements, class templates and dated sessions, recurring assignments, bookings, attendance, monthly coach obligations/payments, routines and audit events. Financial and audit rows are protected against update/delete; corrections must be represented by compensating records.

## Security boundary — important

This is not production-ready authentication. There are currently no login/session endpoints, authorization middleware, member/coach data endpoints, rate limiting, CSRF handling, or production deployment configuration. Do not create real users or load real member/financial data yet. The health endpoints deliberately expose no database details or secrets.

The booking domain module is pure logic with unit tests; it is not yet connected to a database or endpoint. A future booking endpoint must enforce the same rules inside a database transaction and must lock/serialize capacity checks to prevent two concurrent requests from overbooking a class. Tests in this stage are unit, application-injection and static-schema tests; they do not replace PostgreSQL integration tests.
