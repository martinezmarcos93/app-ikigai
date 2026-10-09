import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../api-client.js", import.meta.url), "utf8");

function loadClient(fetchImpl, href = "http://localhost:8000/portal.html") {
  const window = { location: { href, search: new URL(href).search } };
  vm.runInNewContext(source, {
    window,
    fetch: fetchImpl,
    URL,
    URLSearchParams,
    encodeURIComponent,
    console
  });
  return window.IkigaiApi;
}

test("member pagination rejects invalid ranges before making a request", async () => {
  let calls = 0;
  const api = loadClient(async () => {
    calls += 1;
    return new Response(JSON.stringify({ items: [], total: 0 }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  });

  for (const [limit, offset] of [[0, 0], [101, 0], [1.5, 0], [10, -1], [10, 100001], ["x", 0]]) {
    assert.throws(
      () => api.listMembers(limit, offset),
      error => error && error.code === "invalid_pagination"
    );
  }
  assert.equal(calls, 0);
});

test("member pagination encodes bounded query parameters and disables caching", async () => {
  let observed;
  const api = loadClient(async (url, options) => {
    observed = { url: String(url), options };
    return new Response(JSON.stringify({ items: [], total: 0, limit: 25, offset: 50 }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  });

  const result = await api.listMembers(25, 50);
  assert.equal(result.limit, 25);
  assert.equal(new URL(observed.url).searchParams.get("limit"), "25");
  assert.equal(new URL(observed.url).searchParams.get("offset"), "50");
  assert.equal(observed.options.credentials, "include");
  assert.equal(observed.options.cache, "no-store");
});

test("login keeps CSRF in memory and sends it on authenticated writes", async () => {
  const calls = [];
  const api = loadClient(async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith("/auth/login")) {
      return new Response(JSON.stringify({
        csrfToken: "csrf-test-token",
        user: { id: "user-test", roles: ["admin"] }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ member: { id: "member-test" } }), {
      status: 201,
      headers: { "content-type": "application/json" }
    });
  });

  await api.login(" ADMIN@example.com ", "not-a-real-password");
  await api.createMember({ full_name: "Persona ficticia" });

  assert.equal(calls[0].options.headers["Content-Type"], "application/json");
  assert.equal(calls[0].options.headers["X-CSRF-Token"], undefined);
  assert.equal(calls[1].options.headers["X-CSRF-Token"], "csrf-test-token");
  assert.equal(calls[1].options.credentials, "include");
  assert.equal(api.user.id, "user-test");
});

test("invalid API base is surfaced as a configuration error", () => {
  const api = loadClient(async () => {
    throw new Error("fetch must not run");
  }, "https://portal.example.test/portal.html?apiBase=https%3A%2F%2Fevil.example%2Fapi%2Fv1");

  assert.match(api.configurationError, /compartir origen|mismo host local/i);
  assert.throws(() => api.listMembers(), error => error && error.code === "api_configuration");
});

test("financial idempotency key is stable for an unchanged retry and rotates when the payload changes", () => {
  const api = loadClient(async () => new Response("{}", {
    status: 200,
    headers: { "content-type": "application/json" }
  }));
  const form = {};
  const otherForm = {};
  const payload = { amount: "1250.00", description: "Pago ficticio" };

  const first = api.idempotencyKeyFor(form, "ledger", payload);
  const retry = api.idempotencyKeyFor(form, "ledger", { amount: "1250.00", description: "Pago ficticio" });
  const changed = api.idempotencyKeyFor(form, "ledger", { amount: "1500.00", description: "Pago ficticio" });
  const separate = api.idempotencyKeyFor(otherForm, "ledger", payload);

  assert.equal(first, retry);
  assert.notEqual(first, changed);
  assert.notEqual(first, separate);
});

console.log("Portal API client contract checks loaded.");
