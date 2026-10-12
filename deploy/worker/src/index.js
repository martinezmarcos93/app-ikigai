// Proxy hacia la API de Render + aviso periodico para que no se duerma. Sin dependencias.

const METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);
// Cabeceras que el cliente no debe poder fijar hacia la API (la IP real la pone el Worker) o que no tienen sentido reenviar.
// accept-encoding: la API responde sin comprimir y Cloudflare comprime hacia el navegador; asi no se mezclan dos compresiones.
const REQUEST_DROP = ["accept-encoding", "host", "connection", "forwarded", "x-real-ip", "x-forwarded-host", "x-forwarded-proto", "cf-connecting-ip", "cf-ipcountry", "cf-ray", "cf-visitor", "true-client-ip"];
const RESPONSE_DROP = ["server", "rndr-id", "x-render-origin-server", "x-powered-by"];
const DEFAULT_TIMEOUT_MS = 85_000; // Render tarda ~50 s en despertar; Cloudflare corta a los ~100 s.

export function isApiPath(pathname) {
  return pathname === "/healthz" || pathname.startsWith("/api/");
}

function unavailable(status, error, message) {
  return new Response(JSON.stringify({ error, message }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "retry-after": "15" }
  });
}

export async function proxyToApi(request, env, fetchImpl = fetch) {
  if (!METHODS.has(request.method)) return unavailable(405, "method_not_allowed", "Método no permitido.");
  const url = new URL(request.url);
  // El origen sale de la configuracion; del pedido solo se toma la ruta (siempre empieza con /api/ o es /healthz).
  const target = new URL(url.pathname + url.search, env.API_ORIGIN);
  const headers = new Headers(request.headers);
  for (const name of REQUEST_DROP) headers.delete(name);
  // La IP del cliente la declara el Worker (no el navegador): el servidor cuenta los saltos de proxy de confianza.
  headers.set("x-forwarded-for", request.headers.get("cf-connecting-ip") || "");
  headers.set("x-forwarded-proto", "https");
  const init = {
    method: request.method,
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(Number(env.TIMEOUT_MS) || DEFAULT_TIMEOUT_MS)
  };
  if (request.method !== "GET" && request.method !== "HEAD") init.body = request.body;
  let upstream;
  try {
    upstream = await fetchImpl(target, init);
  } catch (error) {
    const timedOut = error && (error.name === "TimeoutError" || error.name === "AbortError");
    return timedOut
      ? unavailable(503, "server_waking_up", "El servidor se está despertando. Probá de nuevo en unos segundos.")
      : unavailable(502, "upstream_unreachable", "No se pudo conectar con el servidor. Probá de nuevo en un momento.");
  }
  const out = new Headers(upstream.headers);
  for (const name of RESPONSE_DROP) out.delete(name);
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out });
}

export async function wakeApi(env, fetchImpl = fetch, log = console) {
  try {
    const response = await fetchImpl(new URL("/healthz", env.API_ORIGIN), { signal: AbortSignal.timeout(Number(env.TIMEOUT_MS) || DEFAULT_TIMEOUT_MS) });
    log.log(`keepalive /healthz -> ${response.status}`);
    return response.status;
  } catch (error) {
    log.error("keepalive fallo:", error && error.name);
    return 0;
  }
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    // run_worker_first manda aca solo la API; si una ruta de assets llegara igual, se sirve como asset.
    return isApiPath(pathname) ? proxyToApi(request, env) : env.ASSETS.fetch(request);
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(wakeApi(env));
  }
};
