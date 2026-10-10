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
assert.match(portal, /sessionError\.reason/);
assert.match(portal, /No disponible/);
assert.match(portal, /no se muestra una lista de configuración incompleta/i);
assert.match(portal, /data-view="services"/);
assert.match(portal, /data-view="coaches"/);
assert.match(portal, /data-view="members"/);
assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)/);
assert.match(sw, /Cache-Control/);
assert.match(sw, /no-store/);
assert.match(sw, /url\.pathname\.endsWith\('\/demo\.html'\)/);
assert.match(setupGuide, /npm run admin:create/);
assert.match(setupGuide, /No hay registro público de administradores/);
assert.match(setupGuide, /datos reales/);

console.log("First-run setup, empty prototype, connected entry point, and API cache boundaries passed.");
