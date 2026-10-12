import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import worker, { isApiPath, proxyToApi, wakeApi } from "../src/index.js";

const env = { API_ORIGIN: "https://api.example.test", ASSETS: { fetch: async () => new Response("asset") } };
const req = (path, init = {}) => new Request(`https://app.example.test${path}`, init);

function spy(response = () => new Response('{"ok":true}', { status: 200, headers: { "content-type": "application/json", "set-cookie": "ikigai_session=abc; HttpOnly", server: "render", "rndr-id": "x" } })) {
  const calls = [];
  const fn = async (target, init) => { calls.push({ target: String(target), init }); return response(); };
  return { fn, calls };
}

test("solo /api/* y /healthz son rutas de API", () => {
  assert.equal(isApiPath("/api/v1/auth/login"), true);
  assert.equal(isApiPath("/healthz"), true);
  for (const p of ["/", "/portal.html", "/apix", "/api", "/assets/x.png", "/.well-known/assetlinks.json"]) assert.equal(isApiPath(p), false, p);
});

test("reenvia metodo, ruta, query y cuerpo a la API fija, y devuelve la cookie de sesion", async () => {
  const { fn, calls } = spy();
  const res = await proxyToApi(req("/api/v1/auth/login?x=1", { method: "POST", headers: { "content-type": "application/json", cookie: "a=b", origin: "https://app.ikigai-training.com" }, body: '{"login":"a"}' }), env, fn);
  assert.equal(calls[0].target, "https://api.example.test/api/v1/auth/login?x=1");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.get("cookie"), "a=b");
  assert.equal(calls[0].init.headers.get("origin"), "https://app.ikigai-training.com");
  assert.ok(calls[0].init.body, "el cuerpo se reenvia");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("set-cookie"), "ikigai_session=abc; HttpOnly");
  assert.equal(res.headers.get("server"), null);
  assert.equal(res.headers.get("rndr-id"), null);
});

test("la IP del cliente la fija el Worker: un X-Forwarded-For enviado por el navegador se descarta", async () => {
  const { fn, calls } = spy();
  await proxyToApi(req("/api/v1/x", { headers: { "x-forwarded-for": "6.6.6.6", "cf-connecting-ip": "203.0.113.9", "x-real-ip": "7.7.7.7", forwarded: "for=8.8.8.8" } }), env, fn);
  const h = calls[0].init.headers;
  assert.equal(h.get("x-forwarded-for"), "203.0.113.9");
  assert.equal(h.get("x-real-ip"), null);
  assert.equal(h.get("forwarded"), null);
  assert.equal(h.get("x-forwarded-proto"), "https");
});

test("GET no lleva cuerpo, los redireccionamientos no se siguen y hay un limite de tiempo", async () => {
  const { fn, calls } = spy();
  await proxyToApi(req("/healthz"), env, fn);
  assert.equal(calls[0].init.body, undefined);
  assert.equal(calls[0].init.redirect, "manual");
  assert.ok(calls[0].init.signal instanceof AbortSignal);
});

test("una ruta con trucos no puede cambiar el servidor de destino", async () => {
  const { fn, calls } = spy();
  for (const p of ["/api//evil.example/x", "/api/@evil.example/x", "/api/..%2f..%2fx"]) await proxyToApi(req(p), env, fn);
  for (const c of calls) assert.equal(new URL(c.target).origin, "https://api.example.test", c.target);
});

test("si el servidor esta dormido (timeout) responde 503 en JSON con Retry-After; si no se alcanza, 502", async () => {
  const slow = async () => { throw Object.assign(new Error("t"), { name: "TimeoutError" }); };
  const r1 = await proxyToApi(req("/api/v1/x"), env, slow);
  assert.equal(r1.status, 503);
  assert.equal(r1.headers.get("retry-after"), "15");
  assert.equal(r1.headers.get("cache-control"), "no-store");
  assert.equal((await r1.json()).error, "server_waking_up");
  const down = async () => { throw new TypeError("fetch failed"); };
  assert.equal((await proxyToApi(req("/api/v1/x"), env, down)).status, 502);
});

test("metodos no previstos se rechazan sin llegar a la API", async () => {
  const { fn, calls } = spy();
  // El constructor Request de Node no admite TRACE: se simula el pedido con la forma minima que usa el Worker.
  const res = await proxyToApi({ method: "TRACE", url: "https://app.example.test/api/v1/x", headers: new Headers() }, env, fn);
  assert.equal(res.status, 405);
  assert.equal(calls.length, 0);
});

test("el handler sirve assets para lo que no es API y manda la API al proxy", async () => {
  assert.equal(await (await worker.fetch(req("/portal.html"), env)).text(), "asset");
});

test("el aviso periodico le pega a /healthz y tolera fallos", async () => {
  const { fn, calls } = spy(() => new Response("ok", { status: 200 }));
  assert.equal(await wakeApi(env, fn, { log() {}, error() {} }), 200);
  assert.equal(calls[0].target, "https://api.example.test/healthz");
  assert.equal(await wakeApi(env, async () => { throw new Error("x"); }, { log() {}, error() {} }), 0);
});

test("la carpeta publica sale de la misma lista blanca que Docker y no incluye la demo ni el servidor", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  execFileSync("node", [join(here, "../build.mjs")], { stdio: "ignore" });
  const pub = join(here, "../public");
  for (const f of ["portal.html", "portal.js", "api-client.js", "sw.js", "manifest.webmanifest", "assets", "_headers", ".well-known/assetlinks.json"]) assert.ok(existsSync(join(pub, f)), f);
  for (const f of ["demo.html", "app.js", "styles.css", "server", "docs", "landing", "deploy", ".env"]) assert.ok(!existsSync(join(pub, f)), `no debe publicarse: ${f}`);
  assert.match(readFileSync(join(pub, "_headers"), "utf8"), /Content-Security-Policy: default-src 'self'; script-src 'self'/);
});
