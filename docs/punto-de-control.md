<!-- PUNTO-DE-CONTROL -->
**Tarea actual:** ranking de fuerza con apodos + Iron Pixel V2 integrado. Todo en la rama `feat/iron-pixel-v2-integracion` (incluye `feat/strength-rankings`). PR a `main` abierto como borrador, sin mergear.

**Estado verificado (2026-11-07):** `npm run check` sin errores; `npm test` con PostgreSQL limpio 137/137 dos veces; contratos del cliente 30/30; first-run OK. Prueba de punta a punta en Chrome (portal + API reales): circuito V2 completo, puntaje del servidor = puntaje del juego (2612), tope diario aplicado, ranking con apodo, miembro sin ver nombres reales.

**Próximo paso:** Marcos revisa el PR y decide el merge a `main`. Después: deploy (ver `docs/DEPLOYMENT.md`; confirmar cuenta de Cloudflare con `npx wrangler whoami`) y carga de los 16 apodos confirmados en producción.

**Bloqueos:**
- La carga de marcas reales necesita el Excel original `registro_gimnasio.xlsx` (no está en la PC) y acceso a la base de producción.
- 8 apodos del Excel siguen sin confirmar por el gimnasio.

**Archivos en curso:** ninguno sin commitear.

**Preguntas abiertas:**
- Empates en el ranking de fuerza: ¿comparten puesto?
- Commit local sin subir en `main` (`17f3f4e` ignora `updates/` y `a411a45` plugin de Cloudflare): pushearlos antes o después del merge.
- Tests de reservas/avisos fallan si la base de pruebas acumula corridas (no es de esta rama): conviene que el CI use base limpia, como hacen los oráculos.
<!-- /PUNTO-DE-CONTROL -->
