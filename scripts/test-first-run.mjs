import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
const [index, demo, app, portal, portalHtml, sw, manifestText, setupGuide] = await Promise.all([
  read("index.html"),
  read("demo.html"),
  read("app.js"),
  read("portal.js"),
  read("portal.html"),
  read("sw.js"),
  read("manifest.webmanifest"),
  read("docs/INITIAL_SETUP.md")
]);
const manifest = JSON.parse(manifestText);
const bookingRoutes = await read("server/src/routes/bookings.ts");

assert.match(index, /url=\.\/portal\.html/);
assert.equal(manifest.start_url, "./portal.html");
assert.match(portalHtml, /rel="manifest"/);
assert.match(portalHtml, /navigator\.serviceWorker\.register/);
assert.match(demo, /PROTOTIPO LOCAL|PROTOTIPO/);
assert.doesNotMatch(demo, /navigator\.serviceWorker\.register|rel="manifest"/);
assert.match(app, /members:\[\]/);
assert.match(app, /coaches:\[\]/);
assert.match(app, /classes:\[\]/);
assert.match(app, /bookings:\[\]/);
assert.match(app, /routines:\[\]/);
assert.match(app, /ledger:\[\]/);
assert.match(app, /removeItem\(LEGACY_STORAGE_KEY\)/);
assert.doesNotMatch(app, /Lucía Fernández|Agustín Navarro|Nicolás Sosa|Florencia Díaz|[a-z.]+@mail\.com/);
assert.match(portal, /Preparar Ikigai para empezar/);
assert.match(portal, /Promise\.allSettled\(/);
assert.match(portal, /api\.getMember\(state\.user\.memberId\)/);
assert.match(portal, /Algunas secciones no están disponibles/);
assert.match(portal, /sessionError\.reason/);
assert.match(portal, /No disponible/);
assert.match(bookingRoutes, /mine\.id AS my_booking_id/);
assert.match(portal, /session\.my_booking_id/);
assert.match(portal, /data-action="cancel-booking" data-id="\$\{esc\(session\.my_booking_id\)\}"/);
assert.match(portal, /data-action="create-booking"/);
assert.match(portal, /data-action="session-attendance"/);

assert.match(portal, /no se muestra una lista de configuración incompleta/i);
assert.match(portal, /data-view="services"/);
assert.match(portal, /data-view="coaches"/);
assert.match(portal, /data-view="members"/);
assert.match(sw, /api\(\?:/);
assert.match(sw, /test\(url\.pathname\)/);
assert.match(sw, /Cache-Control/);
assert.match(sw, /no-store/);
const mobileStyles = await read("portal.css");
assert.match(mobileStyles, /env\(safe-area-inset-bottom\)/);
assert.match(mobileStyles, /prefers-reduced-motion/);
assert.match(mobileStyles, /\.button\.small \{ min-height: 44px; \}/);

assert.match(sw, /ikigai-shell-v8/);
assert.match(sw, /url\.pathname\.endsWith\('\/demo\.html'\)/);
assert.match(setupGuide, /npm run admin:create/);
assert.match(setupGuide, /no hay registro público de administradores/i);
assert.match(setupGuide, /datos reales/);

console.log("First-run setup, empty prototype, connected entry point, and API cache boundaries passed.");
