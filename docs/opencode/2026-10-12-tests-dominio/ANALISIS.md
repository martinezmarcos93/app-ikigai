# Análisis de Cobertura y Casos Borde — Encargo 002

## Casos Borde No Cubiertos en `booking.ts`
1. `isBeforeBookingCutoff`:
   - `cutoffMinutes` exacto de 0 minutos o 1440 (24h) y valores fuera de rango (-1, 1441, decimales, NaN).
   - `cutoffMinutes` custom (ej: 15 min, 60 min) comprobando el borde exacto (1s antes vs justo en el segundo exacto).
   - Zona horaria / offsets ISO con cambios de hora o formatos ISO con 'Z'.
2. `isValidCapacity`:
   - Cupo 1 (mínimo permitido) y 30 (máximo permitido).
   - Valores límite inmediatos: 0, 31, decimales (1.0 vs 1.1), `-0`, `Infinity`.
3. `evaluateBookingRequest`:
   - `confirmedBookings` negativo (-1) o flotante (2.5) o `NaN`.
   - `confirmedBookings` exacto a 0 (sesión vacía) y exacto a `capacity` (sin cupo, pasa a lista de espera).
   - `cutoffMinutes` personalizado en `evaluateBookingRequest` (ej. 30 min, 60 min, o un cutoffMinutes inválido como -1 o 1500).
   - `now` exactamente igual a `startsAt - cutoffMinutes` (debe ser `cutoff_passed` porque la condición es `nowMs < startsAtMs - cutoffMs`).
   - `now` 1 milisegundo antes de `startsAt - cutoffMinutes` (debe ser `allowed: true`).
4. `canPromoteWaitlist`:
   - `waitingCount` no entero, 0, negativo, o flotante (0.5).
   - `confirmedBookings` negativo, o `confirmedBookings >= capacity`.
   - `cutoffMinutes` custom (ej. 15 min).
   - `now` justo en la frontera de cutoff.

## Casos Borde No Cubiertos en `schedule.ts`
1. `isValidCalendarDate`:
   - Fechas con mes 00, 13, día 00.
   - Bisiestos en año no bisiesto (`2100-02-29` no es bisiesto, `2000-02-29` sí es bisiesto).
   - Formatos maliciosos / extraños (ej: `2026-01-1`, `2026-1-01`, `2026-01-01T00:00:00Z`).
2. `isValidLocalTime`:
   - Horas fuera de rango: `24:00`, `25:00`, `-01:00`, `12:60`, `12:6`.
   - Cadenas vacías o con espacios/caracteres extra (` 12:00 `, `12:00\n`).
3. `isValidWeekday`:
   - `0` (Domingo) y `6` (Sábado).
   - Límite inferior (-1) y superior (7), números flotantes (3.14), `NaN`, `Infinity`.
4. `validateGenerationRange`:
   - Borde exacto de 90 días entre año bisiesto y no bisiesto o cambio de año (ej. `2026-12-01` a `2027-02-28`).
   - Rango de 0 días o fecha `from` posterior a `to`.
   - Fechas inválidas pasadas como parámetro.
5. `datesForWeekday`:
   - Comprobaciones en cambio de año/mes (ej. del 2026-12-28 al 2027-01-10 para domingo/lunes).
   - Día de la semana no válido passed (-1 o 7) retorna array vacío.
6. `assignmentCoversDate`:
   - `startsOn` exacto igual a `date`, `endsOn` exacto igual a `date`.
   - Comparación lexicográfica con fechas formateadas `YYYY-MM-DD`.

## Casos Borde No Cubiertos en `credentials.ts`
1. `usernameCandidates`:
   - Nombres con un solo nombre ("Marcos").
   - Nombres con tildes, caracteres especiales, múltiples espacios ("María José De La Cruz").
   - Nombres muy largos que superen los 60 caracteres truncados correctamente.
2. `initials`:
   - Un solo nombre ("Marcos") -> "MA".
   - Un solo caracter ("M") -> "MX".
   - Múltiples nombres ("Marcos Antonio Martinez") -> "MM" (primer y último nombre).
   - Nombres con tildes ("Ángel Ónix") -> "AO".
3. `generateTemporaryPassword`:
   - Verifica estructura general: formato `XX-Ikigai-XXXX-XXXX`.
   - Manejo de iniciales de 1 solo nombre ("Juan" -> `JU-Ikigai-...`).
