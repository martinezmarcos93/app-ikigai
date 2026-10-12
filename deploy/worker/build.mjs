// Arma deploy/worker/public con LA MISMA lista blanca de archivos que la imagen web (deploy/web.Dockerfile):
// una sola fuente de verdad, para que el Worker nunca publique algo que Docker no publicaria (demo.html, app.js, server/, docs/...).
// Uso: node deploy/worker/build.mjs
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const out = join(here, "public");

export function lines(dockerfile) {
  return dockerfile.split("\n").filter((l) => /^COPY\s/.test(l)).map((l) => l.trim().split(/\s+/).slice(1));
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const copied = [];
for (const parts of lines(readFileSync(join(root, "deploy/web.Dockerfile"), "utf8"))) {
  const dest = parts[parts.length - 1];
  if (!dest.startsWith("/srv")) continue; // el Caddyfile no es un archivo publico
  for (const src of parts.slice(0, -1)) {
    const from = join(root, src);
    if (!existsSync(from)) throw new Error(`Falta ${src} (lo pide deploy/web.Dockerfile)`);
    const rel = dest.replace(/^\/srv\/?/, "");
    const isDir = statSync(from).isDirectory();
    // "COPY a b /srv/" copia cada archivo dentro de /srv; "COPY assets /srv/assets" y "COPY x /srv/.well-known/y" fijan el destino.
    const target = dest.endsWith("/") ? join(out, rel, src.split("/").pop()) : join(out, rel);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(from, target, { recursive: isDir });
    copied.push(target.slice(out.length + 1));
  }
}
cpSync(join(here, "_headers"), join(out, "_headers"));
cpSync(join(here, "_redirects"), join(out, "_redirects"));
console.log(`public/: ${copied.length} entradas desde deploy/web.Dockerfile + _headers`);
console.log(copied.join(" "));
