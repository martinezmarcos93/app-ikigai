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


test("expired sessions clear the cached user and CSRF token before later writes", async () => {
  const calls = [];
  let expired = false;
  const api = loadClient(async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith("/auth/login")) {
      return new Response(JSON.stringify({
        csrfToken: "csrf-before-expiry",
        user: { id: "user-test", roles: ["admin"] }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (expired) {
      return new Response(JSON.stringify({
        error: "unauthenticated",
        message: "A valid session is required."
      }), { status: 401, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { "content-type": "application/json" }
    });
  });

  await api.login("admin@example.com", "fictional-password");
  assert.equal(api.user.id, "user-test");
  expired = true;
  await assert.rejects(api.listMembers(25, 0), error => error.status === 401);
  assert.equal(api.user, null);
  expired = false;
  await api.createMember({ full_name: "Persona ficticia" });
  assert.equal(calls.at(-1).options.headers["X-CSRF-Token"], undefined);
});

test("logout clears local identity and CSRF state even when the API request fails", async () => {
  const calls = [];
  const api = loadClient(async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith("/auth/login")) {
      return new Response(JSON.stringify({
        csrfToken: "csrf-logout-test",
        user: { id: "user-test", roles: ["admin"] }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({
      error: "network_unavailable",
      message: "Logout could not reach the server."
    }), { status: 503, headers: { "content-type": "application/json" } });
  });

  await api.login("admin@example.com", "fictional-password");
  await assert.rejects(api.logout(), error => error.status === 503);
  assert.equal(api.user, null);
  assert.equal(calls.at(-1).options.headers["X-CSRF-Token"], "csrf-logout-test");
});

test("non-JSON API errors are normalized without leaking raw response text", async () => {
  const api = loadClient(async () => new Response("internal stack trace and secrets", {
    status: 500,
    headers: { "content-type": "text/plain" }
  }));

  await assert.rejects(api.listMembers(25, 0), error => {
    assert.equal(error.status, 500);
    assert.equal(error.code, "api_error");
    assert.equal(error.message, "La API devolvió una respuesta no válida.");
    assert.equal(JSON.stringify(error).includes("internal stack trace"), false);
    return true;
  });
});


test("service API contracts use expected methods, encoded identifiers, CSRF, and no-store", async () => {
  const calls = [];
  const api = loadClient(async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith("/auth/login")) {
      return new Response(JSON.stringify({
        csrfToken: "csrf-services-test",
        user: { id: "admin-test", roles: ["admin"] }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ service: { id: "service/with space" }, services: [] }), {
      status: String(options.method || "GET") === "POST" ? 201 : 200,
      headers: { "content-type": "application/json" }
    });
  });

  await api.login("admin@example.com", "fictional-password");
  await api.listServices();
  await api.createService({ name: "Yoga ficticio", currentPrice: "1250.00" });
  await api.updateService("service/with space", { active: false });

  assert.equal(new URL(calls[1].url).pathname, "/api/v1/services");
  assert.equal(calls[1].options.method, "GET");
  assert.equal(calls[1].options.cache, "no-store");
  assert.equal(calls[2].options.method, "POST");
  assert.equal(calls[2].options.headers["X-CSRF-Token"], "csrf-services-test");
  assert.equal(calls[3].options.method, "PATCH");
  assert.match(calls[3].url, /service%2Fwith%20space$/);
  assert.equal(calls[3].options.headers["X-CSRF-Token"], "csrf-services-test");
});

test("institution settings contract sends an authenticated PATCH without caching", async () => {
  const calls = [];
  const api = loadClient(async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith("/auth/login")) {
      return new Response(JSON.stringify({
        csrfToken: "csrf-settings-test",
        user: { id: "admin-test", roles: ["admin"] }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ institution_name: null }), {
      status: 200, headers: { "content-type": "application/json" }
    });
  });

  await api.login("admin@example.com", "fictional-password");
  await api.getInstitutionSettings();
  await api.updateInstitutionSettings({ institution_name: "Gimnasio ficticio" });

  assert.equal(calls[1].options.method, "GET");
  assert.equal(calls[1].options.cache, "no-store");
  assert.equal(calls[2].options.method, "PATCH");
  assert.equal(calls[2].options.headers["X-CSRF-Token"], "csrf-settings-test");
  assert.equal(JSON.parse(calls[2].options.body).institution_name, "Gimnasio ficticio");
});



test("booking creation and cancellation use the server contract with CSRF and no-store", async () => {
  const calls = [];
  const api = loadClient(async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith("/auth/login")) {
      return new Response(JSON.stringify({
        csrfToken: "csrf-booking-token",
        user: { id: "member-user", roles: ["member"] }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ booking: { id: "booking-test", status: "confirmed" } }), {
      status: 201, headers: { "content-type": "application/json" }
    });
  });

  await api.login("member@example.test", "not-a-real-password");
  await api.createBooking("session/with space");
  await api.cancelBooking("booking/with space");

  assert.match(calls[1].url, /\/class-sessions\/session%2Fwith%20space\/bookings$/);
  assert.equal(calls[1].options.method, "POST");
  assert.equal(calls[1].options.headers["X-CSRF-Token"], "csrf-booking-token");
  assert.equal(calls[1].options.cache, "no-store");
  assert.match(calls[2].url, /\/bookings\/booking%2Fwith%20space\/cancel$/);
  assert.equal(calls[2].options.method, "POST");
  assert.equal(calls[2].options.headers["X-CSRF-Token"], "csrf-booking-token");
  assert.equal(calls[2].options.cache, "no-store");
});

console.log("Portal API client contract checks loaded.");


test("class session listing validates pagination and sends bounded date filters without caching", async () => {
  let observed;
  const api = loadClient(async (url, options) => {
    observed = { url: String(url), options };
    return new Response(JSON.stringify({ items: [], total: 0, limit: 25, offset: 10 }), {
      status: 200, headers: { "content-type": "application/json" }
    });
  });
  const from = "2026-10-10T00:00:00.000Z";
  const to = "2026-10-20T00:00:00.000Z";
  const result = await api.listClassSessions({ from, to, limit: 25, offset: 10 });
  const url = new URL(observed.url);
  assert.equal(url.pathname, "/api/v1/class-sessions");
  assert.equal(url.searchParams.get("from"), from);
  assert.equal(url.searchParams.get("to"), to);
  assert.equal(url.searchParams.get("limit"), "25");
  assert.equal(url.searchParams.get("offset"), "10");
  assert.equal(observed.options.method, "GET");
  assert.equal(observed.options.cache, "no-store");
  assert.equal(result.total, 0);

  for (const filters of [
    { limit: 0 }, { limit: 101 }, { offset: -1 }, { offset: 10001 },
    { from: "not-a-date" }, { from, to: "2026-10-09T00:00:00.000Z" }
  ]) {
    assert.throws(
      () => api.listClassSessions(filters),
      error => error && ["invalid_pagination", "invalid_date_range"].includes(error.code)
    );
  }
});


test("session attendance roster uses authenticated no-store GET contract", async () => {
  const calls = [];
  const api = loadClient(async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith("/auth/login")) {
      return new Response(JSON.stringify({
        csrfToken: "csrf-attendance-token",
        user: { id: "coach-user", roles: ["coach"] }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ sessionId: "session-test", records: [] }), {
      status: 200, headers: { "content-type": "application/json" }
    });
  });
  await api.login("coach@example.test", "not-a-real-password");
  await api.getSessionAttendance("session-test");
  assert.match(calls[1].url, /\/class-sessions\/session-test\/attendance$/);
  assert.equal(calls[1].options.method, "GET");
  assert.equal(calls[1].options.cache, "no-store");
});
