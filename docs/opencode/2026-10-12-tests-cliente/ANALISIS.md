# ANALISIS.md

### Estado actual
- `api-client.js`: Cliente API que expone una interfaz `IkigaiApi`.
- `scripts/test-api-client.mjs`: Test suite con 18 tests actuales.

### Métodos sin contrato (test) explícito
*   `getMember`
*   `createMember`
*   `updateMember`
*   `listServices`
*   `createService`
*   `updateService`
*   `listMemberships`
*   `createMembership`
*   `endMembership`
*   `listLedger`
*   `createLedgerEntry` (idempotencia)
*   `listCoaches`
*   `createCoach`
*   `getCoachObligations`
*   `createCoachObligation`
*   `recordCoachPayment` (idempotencia)
*   `createCoachAdjustment` (idempotencia)
*   `changePassword`
*   `listAccounts`
*   ... y muchos más.

### Propuestas/Notas
- Hay muchos métodos. Priorizaré un subconjunto representativo para la R2 (cobertura) tal como pide el encargo.
- El cliente usa `encodeURIComponent` para IDs y `idempotencyKeyFor` para operaciones de escritura.
- Se debe asegurar que las cabeceras `Content-Type` y `X-CSRF-Token` sean correctas.
