import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../api-client.js", import.meta.url), "utf8");

function loadClient(fetchImpl, href = "http://localhost:8000/portal.html") {
  const parsed = new URL(href);
  const window = {
    location: {
      href: parsed.href,
      origin: parsed.origin,
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port,
      search: parsed.search
    }
  };
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

test("invalid API base is surfaced as a configuration error", async () => {
  const api = loadClient(async () => {
    throw new Error("fetch must not run");
  }, "https://portal.example.test/portal.html?apiBase=https%3A%2F%2Fevil.example%2Fapi%2Fv1");

  assert.match(api.configurationError, /compartir origen|mismo host local/i);
  await assert.rejects(() => api.listMembers(), error => error && error.code === "api_configuration");
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

test("schedule administration uses authenticated, CSRF-protected and validated contracts", async () => {
  const calls = [];
  const api = loadClient(async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith("/auth/login")) {
      return new Response(JSON.stringify({ csrfToken: "csrf-schedule-token", user: { id: "admin-user", roles: ["admin"] } }), {
        status: 200, headers: { "content-type": "application/json" }
      });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  });
  await api.login("admin@example.test", "correct horse battery staple");
  const template = { service_id: "s", coach_id: "c", weekday: 1, local_start_time: "19:30", duration_minutes: 60, capacity: 10 };
  await api.listClassTemplates({ active: true });
  await api.createClassTemplate(template);
  await api.updateClassTemplate("tpl/with space", { capacity: 12 });
  await api.generateClassSessions("2031-01-01", "2031-01-28");
  await api.cancelClassSession("ses-1", "Profesor enfermo");
  await api.listTemplateAssignments("tpl-1");
  await api.createTemplateAssignment("tpl-1", { member_id: "m", starts_on: "2031-01-06" });
  await api.endRecurringAssignment("asg-1");

  const byPath = suffix => calls.find(call => call.url.endsWith(suffix));
  assert.equal(new URL(byPath("/class-templates?active=true").url).search, "?active=true");
  assert.equal(byPath("/class-templates?active=true").options.method, "GET");
  const create = calls.find(call => call.url.endsWith("/class-templates") && call.options.method === "POST");
  assert.deepEqual(JSON.parse(create.options.body), template);
  assert.equal(create.options.headers["X-CSRF-Token"], "csrf-schedule-token");
  const patch = calls.find(call => call.options.method === "PATCH");
  assert.match(patch.url, /\/class-templates\/tpl%2Fwith%20space$/);
  assert.equal(patch.options.headers["X-CSRF-Token"], "csrf-schedule-token");
  const generate = byPath("/class-sessions/generate");
  assert.deepEqual(JSON.parse(generate.options.body), { from_date: "2031-01-01", to_date: "2031-01-28" });
  assert.equal(generate.options.headers["X-CSRF-Token"], "csrf-schedule-token");
  assert.deepEqual(JSON.parse(byPath("/class-sessions/ses-1/cancel").options.body), { reason: "Profesor enfermo" });
  assert.equal(byPath("/class-templates/tpl-1/assignments").options.method, "GET");
  assert.equal(byPath("/recurring-assignments/asg-1/end").options.headers["X-CSRF-Token"], "csrf-schedule-token");
  for (const call of calls) assert.equal(call.options.cache, "no-store");

  for (const dates of [["2031-1-1", "2031-01-28"], ["2031-01-28", "2031-01-01"], ["", ""], [null, undefined]]) {
    assert.throws(() => api.generateClassSessions(...dates), error => error && error.code === "invalid_date_range");
  }
  assert.throws(() => api.listClassTemplates({ active: "yes" }), error => error && error.code === "invalid_filter");
});

test("invitation acceptance validates locally and posts without CSRF to the public endpoint", async () => {
  const calls = [];
  const api = loadClient(async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  });
  const token = "A".repeat(43);
  await api.acceptInvitation(token, "una-clave-larga-segura");
  assert.match(calls[0].url, /\/auth\/accept-invitation$/);
  assert.equal(calls[0].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].options.body), { token, password: "una-clave-larga-segura" });
  assert.equal(calls[0].options.headers["X-CSRF-Token"], undefined);
  assert.equal(calls[0].options.cache, "no-store");

  for (const [badToken, badPassword, code] of [
    ["short", "una-clave-larga-segura", "invalid_invitation"],
    ["A".repeat(43) + "!", "una-clave-larga-segura", "invalid_invitation"],
    [token, "corta", "invalid_password"],
    [token, "x".repeat(129), "invalid_password"]
  ]) {
    assert.throws(() => api.acceptInvitation(badToken, badPassword), error => error && error.code === code);
  }
  assert.equal(calls.length, 1, "nada se envia si la validacion local falla");
});

test("the API base is same-origin everywhere except the documented development static server", async () => {
  const seen = {};
  for (const href of [
    "http://localhost:8000/portal.html",          // servidor estatico de desarrollo -> API en :3001
    "https://localhost:8443/portal.html",         // despliegue local con HTTPS -> mismo origen
    "http://localhost:8080/portal.html",          // otro puerto -> mismo origen
    "http://localhost:3001/portal.html",          // servido por la propia API -> mismo origen
    "https://ikigai.example.com/portal.html"      // produccion -> mismo origen
  ]) {
    const api = loadClient(async url => { seen[href] = String(url); return new Response("{}", { status: 200, headers: { "content-type": "application/json" } }); }, href);
    await api.listServices();
  }
  assert.equal(seen["http://localhost:8000/portal.html"], "http://localhost:3001/api/v1/services");
  assert.equal(seen["https://localhost:8443/portal.html"], "https://localhost:8443/api/v1/services");
  assert.equal(seen["http://localhost:8080/portal.html"], "http://localhost:8080/api/v1/services");
  assert.equal(seen["http://localhost:3001/portal.html"], "http://localhost:3001/api/v1/services");
  assert.equal(seen["https://ikigai.example.com/portal.html"], "https://ikigai.example.com/api/v1/services");
});

test("booking notices use CSRF-protected PUT/DELETE contracts and validate locally", async () => {
  const calls = [];
  const api = loadClient(async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith("/auth/login")) {
      return new Response(JSON.stringify({ csrfToken: "csrf-notice-token", user: { id: "u", roles: ["member"] } }), {
        status: 200, headers: { "content-type": "application/json" }
      });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  });
  await api.login("socia@example.test", "correct horse battery staple");
  await api.setBookingNotice("booking/with space", "late", "Llego 10:15");
  await api.setBookingNotice("b2", "absence");
  await api.removeBookingNotice("b2");
  const [, put, putNoNote, del] = calls;
  assert.match(put.url, /\/bookings\/booking%2Fwith%20space\/notice$/);
  assert.equal(put.options.method, "PUT");
  assert.deepEqual(JSON.parse(put.options.body), { kind: "late", note: "Llego 10:15" });
  assert.equal(put.options.headers["X-CSRF-Token"], "csrf-notice-token");
  assert.deepEqual(JSON.parse(putNoNote.options.body), { kind: "absence" });
  assert.equal(del.options.method, "DELETE");
  assert.equal(del.options.headers["X-CSRF-Token"], "csrf-notice-token");
  for (const call of calls) assert.equal(call.options.cache, "no-store");
  for (const [kind, note] of [["vacaciones", undefined], ["", undefined], [undefined, undefined], ["late", "x".repeat(201)], ["late", 5]]) {
    assert.throws(() => api.setBookingNotice("b", kind, note), error => error && error.code === "invalid_notice");
  }
  assert.equal(calls.length, 4, "nada se envia si la validacion local falla");
});

test("member data export and anonymization use their contracts and validate locally", async () => {
  const calls = [];
  const api = loadClient(async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith("/auth/login")) {
      return new Response(JSON.stringify({ csrfToken: "csrf-data-token", user: { id: "u", roles: ["admin"] } }), {
        status: 200, headers: { "content-type": "application/json" }
      });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  });
  await api.login("admin@example.test", "correct horse battery staple");
  await api.exportMemberData("m/1");
  await api.anonymizeMember("m-2", "  Pedido de la persona al darse de baja  ");
  const [, exportCall, anonymizeCall] = calls;
  assert.match(exportCall.url, /\/members\/m%2F1\/export$/);
  assert.equal(exportCall.options.method, "GET");
  assert.equal(exportCall.options.cache, "no-store");
  assert.match(anonymizeCall.url, /\/members\/m-2\/anonymize$/);
  assert.equal(anonymizeCall.options.method, "POST");
  assert.equal(anonymizeCall.options.headers["X-CSRF-Token"], "csrf-data-token");
  assert.deepEqual(JSON.parse(anonymizeCall.options.body), { reason: "Pedido de la persona al darse de baja", confirm: "ANONIMIZAR" });
  for (const reason of ["", "ok", "    ", undefined, "x".repeat(201)]) {
    assert.throws(() => api.anonymizeMember("m", reason), error => error && error.code === "invalid_reason");
  }
  assert.equal(calls.length, 3, "nada se envia si la validacion local falla");
});

test("admin backup download sends the passphrase with CSRF, returns the binary file and maps errors", async () => {
  const calls = [];
  let mode = "ok";
  const api = loadClient(async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith("/auth/login")) {
      return new Response(JSON.stringify({ csrfToken: "csrf-backup-token", user: { id: "admin" } }), {
        status: 200, headers: { "content-type": "application/json" }
      });
    }
    if (mode === "limit") {
      return new Response(JSON.stringify({ error: "too_many_requests", message: "Rate limit exceeded" }), {
        status: 429, headers: { "content-type": "application/json" }
      });
    }
    return new Response(new Uint8Array([73, 75, 66, 75, 1]), {
      status: 200,
      headers: { "content-type": "application/octet-stream", "content-disposition": 'attachment; filename="ikigai-respaldo-20261012-1830.ikbk"' }
    });
  });

  await api.login("admin@example.test", "password");
  const result = await api.downloadBackup("frase-larga-de-prueba");
  const [, call] = calls;
  assert.match(call.url, /\/admin\/backup$/);
  assert.equal(call.options.method, "POST");
  assert.equal(call.options.headers["X-CSRF-Token"], "csrf-backup-token");
  assert.equal(call.options.cache, "no-store");
  assert.deepEqual(JSON.parse(call.options.body), { passphrase: "frase-larga-de-prueba" });
  assert.equal(result.filename, "ikigai-respaldo-20261012-1830.ikbk");
  assert.equal(result.blob.size, 5);

  await assert.rejects(api.downloadBackup("corta"), error => error.code === "invalid_passphrase");
  assert.equal(calls.length, 2, "una frase corta no genera ningun pedido (solo el login y el primer respaldo)");

  mode = "limit";
  await assert.rejects(api.downloadBackup("frase-larga-de-prueba"), error => error.status === 429 && /demasiados pedidos/.test(error.message));
});

test("member management contracts use encoded identifiers, CSRF and no-store", async () => {
  const calls = [];
  const api = loadClient(async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith("/auth/login")) {
      return new Response(JSON.stringify({ csrfToken: "csrf-mem-token", user: { id: "admin" } }), {
        status: 200, headers: { "content-type": "application/json" }
      });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  });

  await api.login("admin@example.test", "password");
  await api.getMember("member/123");
  await api.createMember({ full_name: "Juan Perez" });
  await api.updateMember("member/123", { status: "active" });

  const [, getCall, createCall, updateCall] = calls;

  assert.match(getCall.url, /\/members\/member%2F123$/);
  assert.equal(getCall.options.method, "GET");

  assert.match(createCall.url, /\/members$/);
  assert.equal(createCall.options.method, "POST");
  assert.equal(createCall.options.headers["X-CSRF-Token"], "csrf-mem-token");

  assert.match(updateCall.url, /\/members\/member%2F123$/);
  assert.equal(updateCall.options.method, "PATCH");
  assert.equal(updateCall.options.headers["X-CSRF-Token"], "csrf-mem-token");
});

test("coach financial operations pass idempotency keys and encode identifiers", async () => {
  const calls = [];
  const api = loadClient(async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith("/auth/login")) {
      return new Response(JSON.stringify({ csrfToken: "csrf-coach-token", user: { id: "admin" } }), {
        status: 200, headers: { "content-type": "application/json" }
      });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  });

  await api.login("admin@example.test", "password");
  await api.recordCoachPayment("ob/1", { amount: 100 }, "idem-pay-1");
  await api.createCoachAdjustment("ob/1", { amount: -10 }, "idem-adj-1");

  const [, payCall, adjCall] = calls;

  assert.match(payCall.url, /\/coach-obligations\/ob%2F1\/payments$/);
  assert.equal(payCall.options.method, "POST");
  assert.equal(payCall.options.headers["Idempotency-Key"], "idem-pay-1");
  assert.equal(payCall.options.headers["X-CSRF-Token"], "csrf-coach-token");

  assert.match(adjCall.url, /\/coach-obligations\/ob%2F1\/adjustments$/);
  assert.equal(adjCall.options.method, "POST");
  assert.equal(adjCall.options.headers["Idempotency-Key"], "idem-adj-1");
  assert.equal(adjCall.options.headers["X-CSRF-Token"], "csrf-coach-token");
});

test("password change contract uses CSRF and sends valid payloads", async () => {
  const calls = [];
  const api = loadClient(async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith("/auth/login")) {
      return new Response(JSON.stringify({ csrfToken: "csrf-pwd-token", user: { id: "u" } }), {
        status: 200, headers: { "content-type": "application/json" }
      });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  });

  await api.login("user@example.test", "old-password");
  await api.changePassword("old-password", "new-password");

  const [, pwdCall] = calls;

  assert.match(pwdCall.url, /\/auth\/change-password$/);
  assert.equal(pwdCall.options.method, "POST");
  assert.equal(pwdCall.options.headers["X-CSRF-Token"], "csrf-pwd-token");
  assert.deepEqual(JSON.parse(pwdCall.options.body), { currentPassword: "old-password", newPassword: "new-password" });
});
