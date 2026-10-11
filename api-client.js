(() => {
  "use strict";

  class ApiError extends Error {
    constructor(status, code, message, details) {
      super(message || "La solicitud no pudo completarse.");
      this.name = "ApiError";
      this.status = status;
      this.code = code || "api_error";
      this.details = details;
    }
  }

  function resolveBaseUrl() {
    const requested = new URLSearchParams(window.location.search).get("apiBase");
    const page = new URL(window.location.href);
    const isLocalHost = ["localhost", "127.0.0.1"].includes(page.hostname);
    const defaultBase = isLocalHost && page.port !== "3001"
      ? `http://${page.hostname}:3001/api/v1`
      : "/api/v1";
    const candidate = new URL(requested || defaultBase, page.href);
    const sameOrigin = candidate.origin === window.location.origin;
    const localDevOrigin = window.location.protocol === "http:"
      && candidate.protocol === "http:"
      && candidate.hostname === window.location.hostname
      && ["localhost", "127.0.0.1"].includes(candidate.hostname);
    if (!sameOrigin && !localDevOrigin) {
      throw new Error("Por seguridad, la API debe compartir origen o usar el mismo host local durante desarrollo.");
    }
    candidate.pathname = candidate.pathname.replace(/\/+$/, "");
    if (!candidate.pathname.endsWith("/api/v1")) candidate.pathname += "/api/v1";
    candidate.search = "";
    candidate.hash = "";
    return candidate.href.replace(/\/+$/, "");
  }

  let baseUrl = null;
  let configurationError = null;
  let csrfToken = null;
  let currentUser = null;
  try {
    baseUrl = resolveBaseUrl();
  } catch (error) {
    configurationError = error instanceof Error ? error.message : "Configuración de API inválida.";
  }

  async function request(path, options = {}) {
    if (!baseUrl) throw new ApiError(0, "api_configuration", configurationError || "No se pudo configurar la API.");
    const method = String(options.method || "GET").toUpperCase();
    const headers = { Accept: "application/json", ...(options.headers || {}) };
    const init = { method, credentials: "include", headers, cache: "no-store" };
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(options.body);
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(method) && csrfToken && options.skipCsrf !== true) {
      headers["X-CSRF-Token"] = csrfToken;
    }

    let response;
    try {
      response = await fetch(baseUrl + path, init);
    } catch {
      throw new ApiError(0, "network_error", "No se pudo conectar con la API. Verificá que el backend esté ejecutándose y que la URL de API sea correcta.");
    }

    let payload = null;
    if (response.status !== 204) {
      const text = await response.text();
      if (text) {
        try { payload = JSON.parse(text); }
        catch { payload = { message: "La API devolvió una respuesta no válida." }; }
      }
    }
    if (!response.ok) {
      if (response.status === 401) {
        currentUser = null;
        csrfToken = null;
      }
      throw new ApiError(
        response.status,
        payload && payload.error,
        payload && payload.message || "La solicitud no pudo completarse.",
        payload
      );
    }
    return payload;
  }

  async function login(email, password) {
    const result = await request("/auth/login", {
      method: "POST",
      body: { email: String(email).trim(), password },
      skipCsrf: true
    });
    csrfToken = result.csrfToken || null;
    currentUser = result.user || null;
    return result;
  }

  async function me() {
    const result = await request("/auth/me");
    csrfToken = result.csrfToken || null;
    currentUser = result.user || null;
    return result;
  }

  async function logout() {
    try {
      await request("/auth/logout", { method: "POST", body: {} });
    } finally {
      currentUser = null;
      csrfToken = null;
    }
  }

  const id = value => encodeURIComponent(String(value));
  const idempotencyState = new WeakMap();
  function idempotencyKeyFor(scope, prefix, payload) {
    if (!scope || (typeof scope !== "object" && typeof scope !== "function")) {
      throw new ApiError(0, "invalid_idempotency_scope", "No se pudo asociar una clave segura al formulario.");
    }
    const operation = String(prefix || "operation");
    const fingerprint = operation + ":" + JSON.stringify(payload);
    const previous = idempotencyState.get(scope);
    if (previous && previous.fingerprint === fingerprint) return previous.key;
    const randomPart = window.crypto && typeof window.crypto.randomUUID === "function"
      ? window.crypto.randomUUID()
      : Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
    const key = "ikigai-" + operation + "-" + randomPart;
    idempotencyState.set(scope, { fingerprint, key });
    return key;
  }
  const api = {
    ApiError,
    get baseUrl() { return baseUrl; },
    get configurationError() { return configurationError; },
    get user() { return currentUser; },
    request,
    idempotencyKeyFor,
    login,
    me,
    logout,
    listMembers: (limit = 100, offset = 0) => {
      const parsedLimit = Number(limit);
      const parsedOffset = Number(offset);
      if (!Number.isSafeInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100
          || !Number.isSafeInteger(parsedOffset) || parsedOffset < 0 || parsedOffset > 100000) {
        throw new ApiError(0, "invalid_pagination", "La paginación debe usar un límite de 1 a 100 y un desplazamiento de 0 a 100000.");
      }
      const query = new URLSearchParams({ limit: String(parsedLimit), offset: String(parsedOffset) });
      return request(`/members?${query.toString()}`);
    },
    getMember: memberId => request(`/members/${id(memberId)}`),
    createMember: body => request("/members", { method: "POST", body }),
    updateMember: (memberId, body) => request(`/members/${id(memberId)}`, { method: "PATCH", body }),
    listServices: () => request("/services"),
    createService: body => request("/services", { method: "POST", body }),
    updateService: (serviceId, body) => request(`/services/${id(serviceId)}`, { method: "PATCH", body }),
    listMemberships: memberId => request(`/members/${id(memberId)}/memberships`),
    createMembership: (memberId, body) => request(`/members/${id(memberId)}/memberships`, { method: "POST", body }),
    endMembership: (membershipId, endedOn) => request(`/memberships/${id(membershipId)}/end`, { method: "POST", body: { endedOn } }),
    listLedger: memberId => request(`/members/${id(memberId)}/ledger-entries`),
    createLedgerEntry: (memberId, body, idempotencyKey) => request(`/members/${id(memberId)}/ledger-entries`, { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body }),
    listCoaches: () => request("/coaches"),
    createCoach: body => request("/coaches", { method: "POST", body }),
    getCoachObligations: (coachId, period) => request(`/coaches/${id(coachId)}/obligations?period=${encodeURIComponent(period)}`),
    createCoachObligation: (coachId, body) => request(`/coaches/${id(coachId)}/obligations`, { method: "POST", body }),
    recordCoachPayment: (obligationId, body, idempotencyKey) => request(`/coach-obligations/${id(obligationId)}/payments`, { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body }),
    createCoachAdjustment: (obligationId, body, idempotencyKey) => request(`/coach-obligations/${id(obligationId)}/adjustments`, { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body }),
    getInstitutionSettings: () => request("/admin/institution-settings"),
    updateInstitutionSettings: body => request("/admin/institution-settings", { method: "PATCH", body }),
    linkCoachToAdmin: body => request("/admin/users/link-coach", { method: "POST", body }),
    createInvitation: body => request("/admin/invitations", { method: "POST", body }),
    resendInvitation: invitationId => request(`/admin/invitations/${id(invitationId)}/resend`, { method: "POST", body: {} }),
    revokeInvitation: invitationId => request(`/admin/invitations/${id(invitationId)}/revoke`, { method: "POST", body: {} }),
    resetUserAccess: (userId, reason) => request(`/admin/users/${id(userId)}/reset-access`, { method: "POST", body: { reason } }),
    revokeUserSessions: userId => request(`/admin/users/${id(userId)}/sessions/revoke`, { method: "POST", body: {} }),
    listRoutines: () => request("/routines"),
    createExercise: body => request("/exercises", { method: "POST", body }),
    createRoutine: body => request("/routines", { method: "POST", body }),
    createRoutineVersion: (routineId, body) => request(`/routines/${id(routineId)}/versions`, { method: "POST", body }),
    listRoutineAssignments: memberId => request(`/members/${id(memberId)}/routine-assignments`),
    assignRoutine: (memberId, body) => request(`/members/${id(memberId)}/routine-assignments`, { method: "POST", body }),
    listClassSessions: (filters = {}) => {
      const limit = filters.limit === undefined ? 50 : Number(filters.limit);
      const offset = filters.offset === undefined ? 0 : Number(filters.offset);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100
          || !Number.isSafeInteger(offset) || offset < 0 || offset > 10000) {
        throw new ApiError(0, "invalid_pagination", "La agenda admite un límite de 1 a 100 y un desplazamiento de 0 a 10000.");
      }
      const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      for (const key of ["from", "to"]) {
        if (filters[key] !== undefined && filters[key] !== null && filters[key] !== "") {
          if (typeof filters[key] !== "string" || !Number.isFinite(Date.parse(filters[key]))) {
            throw new ApiError(0, "invalid_date_range", "La fecha de la agenda debe ser una fecha ISO válida.");
          }
          query.set(key, filters[key]);
        }
      }
      if (query.has("from") && query.has("to")
          && Date.parse(query.get("to")) <= Date.parse(query.get("from"))) {
        throw new ApiError(0, "invalid_date_range", "La fecha final debe ser posterior a la fecha inicial.");
      }
      return request(`/class-sessions?${query.toString()}`);
    },
    createBooking: sessionId => request(`/class-sessions/${id(sessionId)}/bookings`, { method: "POST", body: {} }),
    cancelBooking: bookingId => request(`/bookings/${id(bookingId)}/cancel`, { method: "POST", body: {} }),
    acceptInvitation: (token, password) => {
      if (typeof token !== "string" || !/^[A-Za-z0-9_-]{40,64}$/.test(token)) {
        throw new ApiError(0, "invalid_invitation", "La invitación no tiene un formato válido.");
      }
      if (typeof password !== "string" || password.length < 12 || password.length > 128) {
        throw new ApiError(0, "invalid_password", "La contraseña debe tener entre 12 y 128 caracteres.");
      }
      return request("/auth/accept-invitation", { method: "POST", body: { token, password }, skipCsrf: true });
    },
    listClassTemplates: (filters = {}) => {
      const query = new URLSearchParams();
      if (filters.active !== undefined) {
        if (typeof filters.active !== "boolean") throw new ApiError(0, "invalid_filter", "El filtro de plantillas debe ser verdadero o falso.");
        query.set("active", String(filters.active));
      }
      return request(`/class-templates${query.size ? `?${query.toString()}` : ""}`);
    },
    createClassTemplate: body => request("/class-templates", { method: "POST", body }),
    updateClassTemplate: (templateId, body) => request(`/class-templates/${id(templateId)}`, { method: "PATCH", body }),
    generateClassSessions: (fromDate, toDate) => {
      const day = /^\d{4}-\d{2}-\d{2}$/;
      if (!day.test(String(fromDate)) || !day.test(String(toDate)) || String(toDate) < String(fromDate)) {
        throw new ApiError(0, "invalid_date_range", "Indicá fechas válidas (AAAA-MM-DD) con el fin igual o posterior al inicio.");
      }
      return request("/class-sessions/generate", { method: "POST", body: { from_date: fromDate, to_date: toDate } });
    },
    cancelClassSession: (sessionId, reason) =>
      request(`/class-sessions/${id(sessionId)}/cancel`, { method: "POST", body: reason ? { reason } : {} }),
    listTemplateAssignments: templateId => request(`/class-templates/${id(templateId)}/assignments`),
    createTemplateAssignment: (templateId, body) =>
      request(`/class-templates/${id(templateId)}/assignments`, { method: "POST", body }),
    endRecurringAssignment: assignmentId =>
      request(`/recurring-assignments/${id(assignmentId)}/end`, { method: "POST", body: {} }),
    getSessionAttendance: sessionId => request(`/class-sessions/${id(sessionId)}/attendance`),
    listAttendance: memberId => request(`/members/${id(memberId)}/attendance`),
    updateAttendance: (sessionId, records) => request(`/class-sessions/${id(sessionId)}/attendance`, { method: "PUT", body: { records } })
  };

  window.IkigaiApi = Object.freeze(api);
})();
