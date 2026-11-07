
> @ikigai-training/api@0.1.0 test
> tsx --test test/*.test.ts

﹣ administracion deshabilita y vuelve a habilitar el acceso de miembros y profesores (0.866736ms) # SKIP
﹣ una misma regla de elegibilidad vale para reservar, turnos fijos y lista de espera (0.169289ms) # SKIP
﹣ la administracion crea cuentas con usuario y clave temporal que se debe cambiar (1.012056ms) # SKIP
✔ admin can link a matching coach profile to an existing admin account without creating a duplicate login (12.542326ms)
﹣ administrator can revoke another user's sessions and the operation is idempotent (0.809074ms) # SKIP
﹣ avisos: administracion publica, cada rol ve lo suyo, se marcan como leidos y se archivan (3.932945ms) # SKIP
﹣ el profesor lista solo los miembros con quienes tiene clases (0.183093ms) # SKIP
✔ health endpoints expose status only and include security headers (211.39325ms)
✔ unknown endpoints return a stable non-sensitive error (32.706973ms)
✔ CORS allows configured origins and blocks unconfigured origins (14.127446ms)
﹣ PostgreSQL attendance is historical, correctable, and scoped to the member (0.808546ms) # SKIP
✔ login creates an opaque HttpOnly session and returns role plus CSRF token (1117.375919ms)
✔ login rejects requests without an allowed browser origin (486.100035ms)
✔ wrong credentials do not create a session (900.073116ms)
✔ session introspection and CSRF-protected logout revoke the session (825.552221ms)
✔ members can access only their own linked profile (1.063257ms)
✔ coach access requires a linked coach profile and server-verified scope (0.190525ms)
✔ administrators can access any member regardless of profile linkage (0.147656ms)
✔ mixed-role actors keep self-scope but require explicit coach scope for others (0.273613ms)
﹣ PostgreSQL booking transactions serialize capacity and promote the waitlist (0.951663ms) # SKIP
✔ only administrators can list all coach profiles (856.209811ms)
✔ a coach can access only their own obligations and not another coach obligations (98.3447ms)
✔ development defaults are local and explicit (21.965513ms)
✔ production requires explicit CORS origins (0.639463ms)
✔ production accepts exact origins and rejects wildcard/path origins (0.549169ms)
✔ production requires a strong session secret (0.20783ms)
✔ production cannot use the development session-secret fallback (0.322159ms)
✔ invalid ports and environments fail during startup (0.247461ms)
✔ production requires a secure configured password reset delivery provider (0.740293ms)
✔ trusted proxy hops must be explicit, bounded integers (0.532794ms)
✔ password reset public URL rejects credentials, query strings, and fragments (1.561908ms)
✔ el usuario sale del rol y del nombre, sin tildes ni espacios (1.328101ms)
✔ ante un homonimo se prueba con el apellido y luego con un numero (0.977864ms)
✔ todo candidato cumple el formato de la base (1.228817ms)
✔ iniciales: primer y ultimo nombre (0.246423ms)
✔ la clave temporal tiene el formato acordado, es larga y no se repite (6.161978ms)
﹣ PostgreSQL data protection: export is scoped and audited; anonymization erases identity but keeps accounting (3.343181ms) # SKIP
✔ T1: booking edge cases (2.28764ms)
✔ T2: schedule edge cases (0.782364ms)
✔ T3: credentials edge cases (0.819677ms)
✔ cancellation cutoff is enforced against server timestamps (2.552979ms)
✔ capacity accepts only integer values from 1 to 30 (0.239025ms)
✔ a valid request is confirmed when there is room (0.906143ms)
✔ a full session puts a valid request on the waitlist (0.178617ms)
✔ the server-side booking cutoff rejects a request exactly 40 minutes before start (0.46901ms)
✔ a past session is rejected (0.173432ms)
✔ duplicate active bookings are rejected (0.369985ms)
✔ invalid timestamps, capacity and booking counts fail closed (0.252064ms)
✔ waitlist promotion requires an open seat and a person waiting before cutoff (0.809316ms)
﹣ PostgreSQL ledger is scoped, idempotent, and calculates balances without duplicate movements (0.85044ms) # SKIP
﹣ PostgreSQL coach obligations use fixed monthly amounts and idempotent partial payments (0.157296ms) # SKIP
✔ las direcciones IPv6 se agrupan por /64 y las IPv4 quedan tal cual (1.293705ms)
✔ claves obvias se rechazan y las razonables no (0.450808ms)
﹣ topes por cuenta, rutas codificadas, token inexistente y origen ajeno (0.115059ms) # SKIP
✔ institution settings are server-backed, admin-only, no-store, and audited (11.7262ms)
✔ institution settings portal contract uses API methods and does not use localStorage (4.001493ms)
﹣ PostgreSQL invitations activate a scoped account once without storing the raw token (0.808249ms) # SKIP
﹣ PostgreSQL login upgrades a weaker password hash and never on a wrong password (0.854349ms) # SKIP
﹣ editar un perfil con datos opcionales vacios los guarda como ausentes y permite quitarlos (0.816857ms) # SKIP
▶ member API access control
  ✔ only admins can list all members (443.029586ms)
  ✔ a member can read their own profile but cannot read another member (49.227882ms)
  ✔ an unauthenticated caller cannot read a member profile (24.235985ms)
✔ member API access control (519.69385ms)
✔ only administrators can list member profiles (393.427336ms)
✔ a member can read only their own profile and cannot see internal notes or DNI (40.329727ms)
✔ a coach can read only assigned members and receives a minimized profile (93.234221ms)
✔ unauthenticated callers cannot read member data (50.388262ms)
﹣ PostgreSQL membership lifecycle preserves agreed prices and audits termination (0.810373ms) # SKIP
✔ administrator can create a membership once and repeated matching requests are replayed (513.753699ms)
✔ members cannot create or change membership contracts (165.144426ms)
✔ money validation rejects malformed and excessive precision values (117.789349ms)
﹣ PostgreSQL notices and lateness: informative only, owner-scoped, closed once the class starts (0.96246ms) # SKIP
﹣ password reset is generic, single-use, expires, invalidates previous tokens, and revokes sessions (1.003147ms) # SKIP
﹣ database-backed sensitive endpoint limits are shared across API replicas (0.156156ms) # SKIP
✔ password hash verifies the correct password and rejects another (1325.266914ms)
✔ two hashes of the same password differ (random salt) (139.026554ms)
✔ password creation enforces length and verification fails closed for malformed hashes (0.937591ms)
✔ hashes created with the previous, cheaper parameters still verify and are flagged for an upgrade (571.091864ms)
✔ a hash with unknown or hostile parameters is rejected without deriving a key (1.009052ms)
✔ the current cost stays within a sane time budget (393.003442ms)
✔ connected portal loads its API client and responsive stylesheet (10.903407ms)
✔ connected portal does not fall back to demo browser storage (3.420391ms)
✔ API client sends cookies, CSRF tokens, and disables response caching (2.210565ms)
✔ agenda and attendance actions are connected to real API methods (7.116857ms)
✔ agenda UI reflects the server booking cutoff before offering reservations (2.238891ms)
✔ agenda API supplies authoritative time for booking cutoff decisions (2.570632ms)
✔ los elementos solo-desarrollo se eliminan fuera de localhost: el JS nunca los usa sin comprobar (2.683813ms)
﹣ shared PostgreSQL rate limit is enforced across two API instances (0.817466ms) # SKIP
✔ toda ruta registrada esta documentada en la matriz de autorizacion, y viceversa (507.374227ms)
✔ ninguna ruta privada responde a un anonimo (217.341117ms)
✔ las rutas solo-administracion rechazan a un member con sesion y CSRF validos (162.195832ms)
✔ las rutas solo-administracion rechazan a un coach con sesion y CSRF validos (141.56015ms)
﹣ PostgreSQL routines preserve versions, assignment history, and member boundaries (0.932221ms) # SKIP
✔ calendar dates, local times and weekdays are validated strictly (1.553345ms)
✔ generation range is inclusive and capped at 90 days (1.068099ms)
✔ weekday 0 is Sunday and dates are listed in order (0.593238ms)
✔ a fixed slot covers its start and end dates and open-ended slots never expire (0.171802ms)
✔ the gym time zone defaults to Buenos Aires and rejects invalid zones (19.208505ms)
﹣ PostgreSQL schedule: templates, idempotent generation in the gym time zone, fixed slots and cancellation (1.729955ms) # SKIP
✔ initial migration defines the core operational entities (1.192828ms)
✔ schema protects active booking uniqueness and capacity bounds (0.210996ms)
✔ financial and audit evidence is append-only (0.195778ms)
✔ sessions store only a digest of opaque tokens and support revocation/expiry (0.153881ms)
✔ account invitations are one-time, expiring, and stored only as token digests (0.174112ms)
✔ money uses exact numeric types and monthly obligations are period-scoped (0.357382ms)
✔ shared rate limits and password reset tokens are persisted safely (0.165764ms)
▶ services API enforces role authorization after valid session and CSRF checks
  ✔ administrator can create a service (565.753774ms)
  ✔ member with valid CSRF is denied service creation by role (212.262909ms)
  ✔ coach with valid CSRF is denied service creation by role (108.475471ms)
  ✔ invalid CSRF is rejected before service creation (102.132282ms)
✔ services API enforces role authorization after valid session and CSRF checks (990.620452ms)
✔ un campo de mas en el cuerpo se rechaza con 400 y no se descarta en silencio (468.809697ms)
✔ todo objeto de un esquema de cuerpo declara additionalProperties: false (130.187483ms)
ℹ tests 113
ℹ suites 0
ℹ pass 91
ℹ fail 0
ℹ cancelled 0
ℹ skipped 22
ℹ todo 0
ℹ duration_ms 11375.839493
