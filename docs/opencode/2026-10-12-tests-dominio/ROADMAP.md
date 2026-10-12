# Roadmap — Encargo 002 (Tests de bordes del dominio)

| ID | Tarea | Complejidad (1-5) | Archivos | Verificación (oráculo) | Estado |
|---|---|---|---|---|---|
| T1 | Tests bordes de `booking.ts` (`isBeforeBookingCutoff`, `isValidCapacity`, `evaluateBookingRequest`, `canPromoteWaitlist`) | 2 | `server/test/domain-edge.test.ts` | `npx tsx --test test/domain-edge.test.ts` | pendiente |
| T2 | Tests bordes de `schedule.ts` (`isValidCalendarDate`, `isValidLocalTime`, `isValidWeekday`, `validateGenerationRange`, `datesForWeekday`, `assignmentCoversDate`) | 2 | `server/test/domain-edge.test.ts` | `npx tsx --test test/domain-edge.test.ts` | pendiente |
| T3 | Tests bordes de `credentials.ts` (`usernameCandidates`, `initials`, `generateTemporaryPassword`) | 2 | `server/test/domain-edge.test.ts` | `npx tsx --test test/domain-edge.test.ts` | pendiente |
| T4 | Verificación suite completa y check | 2 | `server/test/domain-edge.test.ts` | `npm test && npm run check` | pendiente |
