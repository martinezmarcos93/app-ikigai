(() => {
  "use strict";
  const api = window.IkigaiApi;
  const $ = (selector, root = document) => root.querySelector(selector);
  const state = { user: null, members: [], services: [], coaches: [], selectedMember: "", selectedCoach: "", currentView: "dashboard", lastCredentials: "", unreadAnnouncements: 0, exercises: [], routines: [], assignable: [], routineMember: "", mustChange: false, tourDone: true, memberOffset: 0, memberPageSize: 25, memberTotal: 0, products: [] };
  const labels = {
    trial: "Prueba", active: "Activo", suspended: "Suspendido", debtor: "Deudor", exited: "Baja",
    scheduled: "Programada", weekly: "Semanal", monthly: "Mensual", quarterly: "Trimestral", annual: "Anual", custom: "Personalizado",
    charge: "Cargo", payment: "Pago", adjustment: "Ajuste", refund: "Reintegro",
    debit: "Debe", credit: "Haber", cash: "Efectivo", transfer: "Transferencia", card: "Tarjeta", other: "Otro"
  };
  const today = () => new Date().toISOString().slice(0, 10);
  const month = () => today().slice(0, 7);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[ch]);
  const money = value => {
    const n = Number(value);
    return Number.isFinite(n) ? new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 }).format(n) : "—";
  };
  const date = value => {
    if (!value) return "—";
    const raw = String(value).slice(0, 10);
    const parts = raw.split("-");
    return parts.length === 3 ? parts.reverse().join("/") : raw;
  };
  const valueOf = (form, name) => String(new FormData(form).get(name) ?? "").trim();
  const isAdmin = () => state.user?.roles?.includes("admin");
  const isMember = () => state.user?.roles?.includes("member");
  const isCoach = () => state.user?.roles?.includes("coach");
  const memberId = () => isAdmin() ? state.selectedMember : state.user?.memberId;
  const coachId = () => isAdmin() ? state.selectedCoach : state.user?.coachId;
  const showNotice = (message, kind = "error") => {
    const node = $("#globalNotice");
    node.textContent = message;
    node.className = kind === "success" ? "notice success" : "notice";
    node.hidden = !message;
    if (message) node.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };
  const hideNotice = () => { $("#globalNotice").hidden = true; };
  const showError = error => {
    const status = error?.status ? ` (HTTP ${error.status})` : "";
    showNotice((error?.message || "Ocurrió un error inesperado.") + status);
    const imageName = error?.status === 0 ? "offline.svg" : error?.status >= 500 ? "error-state.svg" : null;
    if (imageName) {
      const image = document.createElement("img");
      image.className = "notice-illustration";
      image.src = `./assets/illustrations/${imageName}`;
      image.alt = "";
      image.setAttribute("aria-hidden", "true");
      $("#globalNotice").prepend(image);
    }
  };
  const setLoading = (message = "Consultando la API…") => {
    $("#pageContent").innerHTML = `<div class="loading">${esc(message)}</div>`;
  };
  const empty = (message, illustration = null) => `<div class="empty">${illustration ? `<img class="state-illustration empty-illustration" src="./assets/illustrations/${esc(illustration)}" alt="" aria-hidden="true">` : ""}<p>${esc(message)}</p></div>`;
  const field = (label, name, type = "text", opts = {}) => {
    const required = opts.required ? " required" : "";
    const min = opts.min !== undefined ? ` min="${esc(opts.min)}"` : "";
    const max = opts.max !== undefined ? ` max="${esc(opts.max)}"` : "";
    const maxLength = opts.maxLength !== undefined ? ` maxlength="${esc(opts.maxLength)}"` : "";
    const step = opts.step ? ` step="${esc(opts.step)}"` : "";
    const placeholder = opts.placeholder ? ` placeholder="${esc(opts.placeholder)}"` : "";
    const value = opts.value !== undefined ? ` value="${esc(opts.value)}"` : "";
    const wide = opts.wide ? " full-span" : "";
    return `<div class="field${wide}"><label for="f-${esc(name)}">${esc(label)}</label><input id="f-${esc(name)}" name="${esc(name)}" type="${esc(type)}"${required}${min}${max}${maxLength}${step}${placeholder}${value}></div>`;
  };
  const selectField = (label, name, items, selected = "", required = true, wide = false) => {
    const options = items.map(item => {
      const value = typeof item === "string" ? item : item.value;
      const text = typeof item === "string" ? (labels[item] || item) : item.label;
      return `<option value="${esc(value)}"${String(value) === String(selected) ? " selected" : ""}>${esc(text)}</option>`;
    }).join("");
    return `<div class="field${wide ? " full-span" : ""}"><label for="f-${esc(name)}">${esc(label)}</label><select id="f-${esc(name)}" name="${esc(name)}"${required ? " required" : ""}>${options}</select></div>`;
  };
  const form = (title, id, body, submitLabel = "Guardar", note = "") =>
    `<section class="panel"><h2 class="section-title">${esc(title)}</h2><form data-form="${esc(id)}"><div class="form-grid">${body}</div><div class="form-actions"><button class="button primary" type="submit">${esc(submitLabel)}</button></div>${note ? `<p class="footer-note">${esc(note)}</p>` : ""}</form></section>`;
  const table = (headers, rows) => rows.length
    ? `<div class="table-wrap"><table><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`
    : empty("Todavía no hay registros para mostrar.");
  const row = cells => `<tr>${cells.map(cell => `<td>${cell}</td>`).join("")}</tr>`;
  const statusBadge = status => `<span class="badge ${status === "active" ? "success" : status === "debtor" || status === "suspended" ? "warn" : ""}">${esc(labels[status] || status || "—")}</span>`;
  const memberOptions = (items = state.members) => items.map(m => ({ value: m.id, label: `${m.full_name} · ${labels[m.status] || m.status}` }));
  const serviceOptions = () => state.services.map(s => ({ value: s.id, label: `${s.name}${s.current_price != null ? " · " + money(s.current_price) : ""}` }));
  const coachOptions = () => state.coaches.map(c => ({ value: c.id, label: `${c.full_name} · ${c.discipline}` }));
  const selected = (options, current) => options.some(x => String(x.value) === String(current)) ? String(current) : String(options[0]?.value || "");
  const pageNames = { dashboard:"Resumen", members:"Miembros", services:"Servicios", memberships:"Membresías", accounts:"Cuenta corriente", coaches:"Profesores", invitations:"Accesos", "my-password":"Mi contraseña", routines:"Rutinas", announcements:"Avisos", "schedule-templates":"Horarios y clases", game:"Iron Pixel", rewards:"Premios", catalog:"Productos" };

  async function loadMembers() {
    if (isAdmin()) {
      const result = await api.listMembers(100, 0);
      state.members = result.items || [];
      if (!state.members.some(m => m.id === state.selectedMember)) state.selectedMember = state.members[0]?.id || "";
    } else if (state.user?.memberId) {
      const result = await api.getMember(state.user.memberId);
      state.members = [result.member];
      state.selectedMember = result.member.id;
    }
  }
  async function loadServices() {
    const result = await api.listServices();
    state.services = result.services || [];
  }
  async function loadCoaches() {
    if (isAdmin()) {
      const result = await api.listCoaches();
      state.coaches = result.coaches || [];
      if (!state.coaches.some(c => c.id === state.selectedCoach)) state.selectedCoach = state.coaches[0]?.id || "";
    }
  }
  async function refreshReferenceData() {
    await Promise.all([
      loadMembers(),
      loadServices().catch(error => { if (error.status !== 403) throw error; }),
      loadCoaches().catch(error => { if (error.status !== 403) throw error; })
    ]);
  }

  function applyRoleNavigation() {
    document.querySelectorAll("[data-role='admin']").forEach(node => { node.hidden = !isAdmin(); });
    document.querySelectorAll("[data-role='member']").forEach(node => { node.hidden = !isMember(); });
    document.querySelectorAll("[data-role='staff']").forEach(node => { node.hidden = !(isAdmin() || isCoach()); });
    const coachesNav = document.querySelector('[data-view="coaches"]');
    if (coachesNav) coachesNav.hidden = !(isAdmin() || isCoach());
    document.querySelectorAll('[data-view="memberships"], [data-view="accounts"]').forEach(node => { node.hidden = !(isAdmin() || isMember()); });
    const membersNav = document.querySelector('[data-view="members"]');
    if (membersNav) membersNav.hidden = !isAdmin();
    const servicesNav = document.querySelector('[data-view="services"]');
    if (servicesNav) servicesNav.hidden = !isAdmin();
    const invitesNav = document.querySelector('[data-view="invitations"]');
    if (invitesNav) invitesNav.hidden = !isAdmin();
  }
  function setAuthenticated(user) {
    state.user = user;
    $("#loginPanel").hidden = true;
    $("#portalPanel").hidden = false;
    $("#accountArea").hidden = false;
    $("#accountEmail").textContent = user.username || user.email;
    $("#accountRole").textContent = (user.roles || []).map(r => ({ admin:"Administración", coach:"Profesor", member:"Miembro" }[r] || r)).join(" · ");
    $("#connectionLabel").textContent = "Sesión activa";
    const apiLabel = $("#apiBaseLabel");   // solo existe en localhost (data-dev-only se elimina en el resto)
    if (apiLabel) apiLabel.textContent = api.baseUrl;
    applyRoleNavigation();
  }
  function setUnauthenticated() {
    state.user = null;
    state.mustChange = false;
    state.lastCredentials = "";
    // Al cerrar sesion no queda nada de la persona anterior: ni en memoria ni en el DOM (clave temporal recien creada,
    // tablas de miembros, cuenta corriente) para quien use el mismo aparato despues.
    Object.assign(state, { members: [], services: [], coaches: [], selectedMember: "", selectedCoach: "", unreadAnnouncements: 0, exercises: [], routines: [], assignable: [], routineMember: "", memberOffset: 0, memberTotal: 0, products: [] });
    $("#pageContent").replaceChildren();
    if (window.IkigaiTour) window.IkigaiTour.stop();
    $("#portalPanel").classList.remove("password-pending");
    $("#loginPanel").hidden = false;
    $("#portalPanel").hidden = true;
    $("#accountArea").hidden = true;
    $("#connectionLabel").textContent = "Sin sesión";
  }
  function setPage(title, eyebrow = "IKIGAI TRAINING") {
    $("#pageTitle").textContent = title;
    $("#pageEyebrow").textContent = eyebrow;
  }

  function renderFirstRunChecklist(memberCount, services, coaches) {
    const items = [
      { title: "Configurar servicios", detail: "Cargá las disciplinas y tarifas vigentes que el gimnasio haya acordado.", done: services.length > 0, view: "services", action: "Ir a servicios" },
      { title: "Registrar profesores", detail: "Creá los perfiles operativos y revisá los datos de contacto.", done: coaches.length > 0, view: "coaches", action: "Ir a profesores" },
      { title: "Cargar miembros", detail: "Empezá con los perfiles necesarios; el alta no crea cargos ni accesos.", done: memberCount > 0, view: "members", action: "Ir a miembros" }
    ];
    if (items.every(item => item.done)) return "";
    return `
      <section class="panel first-run-panel" aria-labelledby="firstRunTitle">
        <p class="eyebrow">PRIMER USO</p>
        <h2 class="section-title" id="firstRunTitle">Preparar Ikigai para empezar</h2>
        <p class="section-subtitle">La base está vacía a propósito. Completá la configuración con los datos reales acordados; no se crean importes, turnos ni cuentas automáticamente.</p>
        <div class="setup-grid">
          ${items.map(item => `
            <article class="setup-item">
              <span class="setup-state${item.done ? " is-done" : ""}">${item.done ? "Listo" : "Pendiente"}</span>
              <h3>${esc(item.title)}</h3>
              <p>${esc(item.detail)}</p>
              <button class="button${item.done ? " ghost" : " primary"} small" type="button" data-view="${item.view}">${esc(item.action)}</button>
            </article>
          `).join("")}
        </div>
        <p class="footer-note">Cuando existan los perfiles, usá <strong>Accesos</strong> para crear el usuario y la clave de cada profesor o miembro. El primer administrador se crea desde el servidor, nunca mediante registro público.</p>
        <button class="button ghost small" type="button" data-view="invitations">Preparar accesos</button>
      </section>`;
  }

  async function renderDashboard() {
    setPage("Resumen");
    setLoading("Cargando información de tu cuenta…");
    if (isAdmin()) {
      const results = await Promise.allSettled([
        api.listMembers(100, 0), api.listServices(), api.listCoaches()
      ]);
      const sessionError = results.find(result => result.status === "rejected" && result.reason?.status === 401);
      if (sessionError) throw sessionError.reason;

      const [membersResult, servicesResult, coachesResult] = results;
      const membersOk = membersResult.status === "fulfilled";
      const servicesOk = servicesResult.status === "fulfilled";
      const coachesOk = coachesResult.status === "fulfilled";
      if (membersOk) state.members = membersResult.value.items || [];
      if (servicesOk) state.services = servicesResult.value.services || [];
      if (coachesOk) state.coaches = coachesResult.value.coaches || [];

      const metric = (label, value, available) => `<div class="stat-card"><small>${esc(label)}</small><strong>${available ? esc(value) : "No disponible"}</strong>${available ? "" : '<small class="muted">No se pudo consultar la API</small>'}</div>`;
      const firstRunChecklist = membersOk && servicesOk && coachesOk
        ? renderFirstRunChecklist(membersResult.value.total ?? state.members.length, state.services, state.coaches)
        : '<section class="panel"><h2 class="section-title">Configuración inicial</h2><p class="footer-note">No se muestra una lista de configuración incompleta porque uno o más recursos no pudieron consultarse. Reintentá la carga para obtener un estado fiable.</p></section>';
      const memberRows = membersOk
        ? table(["Nombre","Estado","Alta"], state.members.slice(0,6).map(m => row([`<strong>${esc(m.full_name)}</strong><small class="muted">${esc(m.email || m.phone || "Sin contacto")}</small>`,statusBadge(m.status),date(m.joined_on)])))
        : empty("No se pudieron consultar los miembros. Volvé a intentar.");
      const serviceRows = servicesOk
        ? table(["Servicio","Precio actual"], state.services.slice(0,6).map(s => row([`<strong>${esc(s.name)}</strong><small class="muted">${esc(s.description || "")}</small>`,s.current_price == null ? "Sin configurar" : money(s.current_price)])))
        : empty("No se pudieron consultar los servicios. Volvé a intentar.");
      $("#pageContent").innerHTML = `
        <div class="stats-grid">
          ${metric("Miembros registrados", membersOk ? (membersResult.value.total ?? state.members.length) : "", membersOk)}
          ${metric("Servicios activos", servicesOk ? state.services.filter(s => s.active).length : "", servicesOk)}
          ${metric("Profesores activos", coachesOk ? state.coaches.filter(coach => coach.active).length : "", coachesOk)}
        </div>
        ${firstRunChecklist}
        <div class="content-grid">
          <section class="panel"><h2 class="section-title">Últimos miembros</h2>${memberRows}</section>
          <section class="panel"><h2 class="section-title">Servicios disponibles</h2>${serviceRows}</section>
        </div>
        ${results.some(result => result.status === "rejected") ? '<p class="footer-note" role="status">Algunas secciones no están disponibles. Los datos visibles corresponden sólo a las consultas que respondieron correctamente.</p>' : ""}
      `;
    } else if (isMember() && state.user.memberId) {
      const results = await Promise.allSettled([
        api.getMember(state.user.memberId),
        api.listMemberships(state.user.memberId),
        api.listLedger(state.user.memberId)
      ]);
      const sessionError = results.find(result => result.status === "rejected" && result.reason?.status === 401);
      if (sessionError) throw sessionError.reason;
      const [profileResult, membershipsResult, ledgerResult] = results;
      const profileOk = profileResult.status === "fulfilled";
      const membershipsOk = membershipsResult.status === "fulfilled";
      const ledgerOk = ledgerResult.status === "fulfilled";
      const profile = profileOk ? profileResult.value.member : null;
      const memberships = membershipsOk ? membershipsResult.value.memberships : [];
      const ledger = ledgerOk ? ledgerResult.value : null;
      $("#pageContent").innerHTML = `
        <div class="stats-grid">
          <div class="stat-card"><small>Estado de cuenta</small><strong>${ledgerOk ? money(ledger.balance) : "No disponible"}</strong>${ledgerOk ? "" : '<small class="muted">No se pudo consultar</small>'}</div>
          <div class="stat-card"><small>Membresías</small><strong>${membershipsOk ? memberships.length : "No disponible"}</strong>${membershipsOk ? "" : '<small class="muted">No se pudo consultar</small>'}</div>
          <div class="stat-card"><small>Estado del perfil</small><strong>${profileOk ? esc(labels[profile.status] || profile.status) : "No disponible"}</strong>${profileOk ? "" : '<small class="muted">No se pudo consultar</small>'}</div>
        </div>
        <section class="panel"><h2 class="section-title">Mi perfil</h2>
        ${profileOk ? table(["Dato","Información"],[
          row(["Nombre",esc(profile.full_name)]),
          row(["Correo",esc(profile.email || "—")]),
          row(["Teléfono",esc(profile.phone || "—")]),
          row(["Dirección",esc(profile.address || "—")])
        ]) : empty("No se pudo consultar el perfil. Volvé a intentar.")}</section>
        ${profileOk ? form("Actualizar mis datos de contacto","edit-own-contact",
          field("Teléfono","phone","tel",{value:profile.phone || "",maxLength:40})+
          field("Dirección","address","text",{value:profile.address || "",maxLength:240})+
          field("Contacto de emergencia (nombre)","emergency_contact_name","text",{value:profile.emergency_contact_name || "",maxLength:120})+
          field("Contacto de emergencia (teléfono)","emergency_contact_phone","tel",{value:profile.emergency_contact_phone || "",maxLength:40}),
          "Guardar mis datos","Podés corregir tus datos de contacto cuando quieras. Para cambiar tu nombre, tu DNI o tu estado, pedíselo a administración.") : ""}
        <section class="panel"><h2 class="section-title">Mis datos</h2>
          <p class="footer-note">Tenés derecho a conocer qué datos personales guardamos de vos. Podés descargarlos en un archivo (perfil, membresías, movimientos de cuenta, reservas, asistencia y avisos). Para corregirlos o pedir su supresión, hablá con administración.</p>
          <p><button class="button" type="button" data-action="export-my-data" data-id="${esc(state.user.memberId)}">Descargar mis datos</button></p></section>
        ${results.some(result => result.status === "rejected") ? '<p class="footer-note" role="status">Algunas secciones no están disponibles. Los datos visibles corresponden sólo a las consultas que respondieron correctamente.</p>' : ""}
        <p class="footer-note">Tu cuenta muestra exclusivamente información asociada a tu perfil.</p>`; 
    } else if (isCoach() && state.user.coachId) {
      const result = await api.getCoachObligations(state.user.coachId, month());
      $("#pageContent").innerHTML = `
        <div class="stats-grid">
          <div class="stat-card"><small>Período</small><strong>${month()}</strong></div>
          <div class="stat-card"><small>Obligación configurada</small><strong>${result.configured ? "Sí" : "No"}</strong></div>
          <div class="stat-card"><small>Saldo del período</small><strong>${result.configured ? money(result.balance) : "—"}</strong></div>
        </div><section class="panel"><h2 class="section-title">Mi obligación mensual</h2>
        ${result.configured ? table(["Concepto","Importe"],[
          row(["Obligación fija",money(result.obligation?.agreed_amount)]),
          row(["Pagos registrados",money(result.paid)]),
          row(["Ajustes",money(result.adjustmentTotal)]),
          row(["Saldo pendiente",`<strong>${money(result.balance)}</strong>`])
        ]) : empty("La obligación mensual todavía no está configurada.")}</section>`;
    } else {
      $("#pageContent").innerHTML = empty("La cuenta no tiene un perfil de miembro o profesor vinculado. Contactá a administración.");
    }
  }

  async function renderMembers() {
    if (!isAdmin()) throw new Error("Esta sección es exclusiva de administración.");
    setPage("Miembros");
    setLoading("Consultando miembros…");
    const result = await api.listMembers(state.memberPageSize, state.memberOffset);
    state.members = result.items || [];
    state.memberTotal = Number(result.total ?? state.members.length);
    state.selectedMember = selected(memberOptions(), state.selectedMember);
    const list = state.members.length
      ? table(["Miembro","Estado","Alta","Acciones"], state.members.map(m => row([
          `<strong>${esc(m.full_name)}</strong><small class="muted">${esc(m.email || m.phone || "Sin contacto")}</small>`,
          statusBadge(m.status),date(m.joined_on),
          `<button class="button small" type="button" data-action="edit-member" data-id="${esc(m.id)}">Ver / editar</button>`
            + ` <button class="button ghost small" type="button" data-action="export-member" data-id="${esc(m.id)}">Exportar datos</button>`
            + (m.status === "exited" && m.full_name !== "Persona anonimizada"
              ? ` <button class="button ghost small danger" type="button" data-action="anonymize-member" data-id="${esc(m.id)}">Anonimizar</button>` : "")
        ])))
      : empty("Todavía no hay miembros registrados.", "empty-members.svg");
    const first = state.memberTotal === 0 ? 0 : state.memberOffset + 1;
    const last = Math.min(state.memberOffset + state.memberPageSize, state.memberTotal);
    const pagination = `
      <div class="inline-form member-pagination" aria-label="Paginación de miembros">
        <p class="muted">Mostrando ${first}–${last} de ${state.memberTotal}</p>
        <div class="button-row">
          <button class="button ghost small" type="button" data-action="members-prev" ${state.memberOffset === 0 ? "disabled" : ""}>Anterior</button>
          <button class="button ghost small" type="button" data-action="members-next" ${state.memberOffset + state.memberPageSize >= state.memberTotal ? "disabled" : ""}>Siguiente</button>
        </div>
      </div>`;
    const create = form("Alta de miembro","create-member",
      field("Nombre completo","full_name","text",{required:true,wide:true})+
      field("Correo","email","email")+
      field("Teléfono","phone","tel")+
      field("Dirección","address")+
      field("DNI (opcional)","dni")+
      field("Contacto de emergencia","emergency_contact_name")+
      field("Teléfono de emergencia","emergency_contact_phone")+
      selectField("Estado","status",["trial","active","suspended","debtor","exited"],"trial")+
      field("Fecha de alta","joined_on","date",{value:today()})+
      field("Fecha de baja","exited_on","date")+
      field("Notas internas","notes","text",{wide:true}),
      "Crear miembro",
      "Crear el perfil no crea una cuenta de acceso ni genera cargos. Podés invitarlo desde Accesos.");
    $("#pageContent").innerHTML = `
      <div class="panel"><div class="section-title"><span>Registro de miembros</span><span class="badge">${state.memberTotal} registros</span></div>${list}${pagination}</div>
      <div style="height:16px"></div>${create}
      <div id="memberEditMount" style="margin-top:16px"></div>`;
  }
    async function renderMemberEdit(id) {
    const result = await api.getMember(id);
    const m = result.member;
    const mount = $("#memberEditMount");
    if (!mount) return;
    mount.innerHTML = form("Editar perfil","edit-member",
      field("ID","id","text",{value:m.id,wide:true})+
      field("Nombre completo","full_name","text",{required:true,value:m.full_name,wide:true})+
      field("Correo","email","email",{value:m.email || ""})+
      field("Teléfono","phone","tel",{value:m.phone || ""})+
      field("Dirección","address","text",{value:m.address || ""})+
      field("DNI","dni","text",{value:m.dni || ""})+
      field("Contacto de emergencia","emergency_contact_name","text",{value:m.emergency_contact_name || ""})+
      field("Teléfono de emergencia","emergency_contact_phone","tel",{value:m.emergency_contact_phone || ""})+
      selectField("Estado","status",["trial","active","suspended","debtor","exited"],m.status)+
      field("Fecha de alta","joined_on","date",{value:m.joined_on || ""})+
      field("Fecha de baja","exited_on","date",{value:m.exited_on || ""})+
      field("Notas internas","notes","text",{value:m.notes || "",wide:true}),
      "Guardar cambios");
    const idInput = $("#memberEditMount [name='id']");
    if (idInput) { idInput.readOnly = true; idInput.tabIndex = -1; idInput.setAttribute("aria-label","Identificador del miembro"); }
    mount.scrollIntoView({behavior:"smooth",block:"start"});
  }

  async function renderServices() {
    if (!isAdmin()) throw new Error("Esta sección es exclusiva de administración.");
    setPage("Servicios");
    const result = await api.listServices();
    state.services = result.services || [];
    const list = table(["Servicio","Precio actual","Estado","Acción"], state.services.map(s => row([
      `<strong>${esc(s.name)}</strong><small class="muted">${esc(s.description || "")}</small>`,
      s.current_price == null ? "No configurado" : money(s.current_price),
      statusBadge(s.active ? "active" : "suspended"),
      `<button class="button small" type="button" data-action="edit-service" data-id="${esc(s.id)}">Editar</button>`
    ])));
    $("#pageContent").innerHTML = `
      <div class="panel"><h2 class="section-title">Catálogo de servicios</h2>${list}</div><div style="height:16px"></div>
      ${form("Crear servicio","create-service",
        field("Nombre","name","text",{required:true})+
        field("Precio actual en ARS","currentPrice","number",{min:"0",step:"0.01",placeholder:"Dejar vacío si no está acordado"})+
        field("Descripción","description","text",{wide:true}),
        "Crear servicio",
        "El precio vigente del servicio no modifica precios históricos de membresías ya creadas.")}`;
  }

  async function renderMemberships() {
    setPage("Membresías");
    await loadServices();
    if (isAdmin() || isMember()) await loadMembers();   // el miembro carga solo su propio perfil
    const options = isAdmin() ? memberOptions() : memberOptions();
    state.selectedMember = selected(options, state.selectedMember || state.user.memberId);
    if (!state.selectedMember) {
      $("#pageContent").innerHTML = empty("No hay miembros disponibles.");
      return;
    }
    const result = await api.listMemberships(state.selectedMember);
    // Solo administracion finaliza membresias: el miembro ve su historial sin acciones.
    const list = table(["Servicio","Período","Desde","Hasta","Precio acordado","Estado",...(isAdmin() ? ["Acción"] : [])],(result.memberships || []).map(m => row([
      esc(m.service_name),esc(labels[m.billing_period] || m.billing_period),date(m.starts_on),date(m.ends_on),
      money(m.agreed_price),statusBadge(m.status),
      ...(isAdmin() ? [m.status !== "ended" && m.status !== "cancelled" ? `<button class="button small danger" data-action="end-membership" data-id="${esc(m.id)}" type="button">Finalizar</button>` : "—"] : [])
    ])));
    const memberPicker = isAdmin() ? `<form class="panel inline-form" data-form="select-member"><div class="field"><label for="memberPick">Miembro</label><select id="memberPick" name="memberId">${options.map(o=>`<option value="${esc(o.value)}"${o.value===state.selectedMember?" selected":""}>${esc(o.label)}</option>`).join("")}</select></div><button class="button" type="submit">Ver historial</button></form><div style="height:14px"></div>` : "";
    const serviceOpts = serviceOptions();
    const create = serviceOpts.length ? form("Asignar membresía","create-membership",
      selectField("Servicio","serviceId",serviceOpts,serviceOpts[0]?.value)+
      selectField("Periodicidad","billingPeriod",["weekly","monthly","quarterly","annual","custom"],"monthly")+
      field("Inicio","startsOn","date",{required:true,value:today()})+
      field("Fin (opcional)","endsOn","date")+
      field("Precio acordado (ARS)","agreedPrice","number",{required:true,min:"0",step:"0.01"}),
      "Crear membresía",
      "El precio acordado queda guardado como histórico. Crear una membresía no genera automáticamente un cargo.") : empty("Creá primero un servicio con precio o sin precio.");
    $("#pageContent").innerHTML = `${memberPicker}<div class="panel"><h2 class="section-title">Historial de membresías</h2>${list}</div><div style="height:16px"></div>${isAdmin() ? create : ""}`;
  }

  async function renderAccounts() {
    setPage("Cuenta corriente");
    if (isAdmin() || isMember()) await loadMembers();   // el miembro carga solo su propio perfil
    const options = memberOptions();
    state.selectedMember = selected(options, state.selectedMember || state.user.memberId);
    if (!state.selectedMember) { $("#pageContent").innerHTML = empty("No hay un miembro vinculado a esta cuenta."); return; }
    const result = await api.listLedger(state.selectedMember);
    const entries = result.entries || [];
    const movementTable = table(["Fecha","Concepto","Movimiento","Importe","Período","Medio"],entries.map(e => row([
      date(e.occurred_on),`<strong>${esc(e.description)}</strong><small class="muted">${esc(labels[e.entry_type] || e.entry_type)}</small>`,
      statusBadge(e.direction),money(e.amount),date(e.applied_period),esc(labels[e.payment_method] || e.payment_method || "—")
    ])));
    const picker = isAdmin() ? `<form class="panel inline-form" data-form="select-member"><div class="field"><label for="memberPick">Miembro</label><select id="memberPick" name="memberId">${options.map(o=>`<option value="${esc(o.value)}"${o.value===state.selectedMember?" selected":""}>${esc(o.label)}</option>`).join("")}</select></div><button class="button" type="submit">Consultar</button></form><div style="height:14px"></div>` : "";
    const create = isAdmin() ? form("Registrar movimiento","create-ledger",
      selectField("Tipo","type",["charge","payment","adjustment","refund"],"payment")+
      selectField("Dirección (solo para ajustes)","direction",[
        {value:"debit",label:"Débito — aumenta deuda"},
        {value:"credit",label:"Crédito — reconoce saldo a favor"}
      ],"debit",false)+
      field("Importe (ARS)","amount","number",{required:true,min:"0.01",step:"0.01"})+
      field("Fecha del movimiento","occurred_on","date",{required:true,value:today()})+
      field("Período aplicado","applied_period","date",{value:month()+"-01"})+
      field("Medio de pago","payment_method","text",{placeholder:"Efectivo, transferencia…"})+
      field("Referencia","reference")+
      field("Descripción","description","text",{required:true,wide:true}),
      "Registrar movimiento",
      "Cada envío usa una clave de idempotencia para evitar duplicados al reintentar. El comprobante emitido por el sistema es interno, no una factura fiscal.") : "";
    $("#pageContent").innerHTML = `${picker}<div class="stats-grid"><div class="stat-card"><small>Saldo neto</small><strong>${money(result.balance)}</strong></div><div class="stat-card"><small>Movimientos</small><strong>${result.total ?? entries.length}</strong></div><div class="stat-card"><small>Registro consultado</small><strong>${isAdmin()?"Miembro":"Mi cuenta"}</strong></div></div><div class="panel"><h2 class="section-title">Movimientos históricos</h2>${movementTable}</div>${create ? '<div style="height:16px"></div>'+create : ""}`;
  }

  async function renderCoaches() {
    setPage("Profesores");
    if (isCoach() && !isAdmin()) {
      const result = await api.getCoachObligations(state.user.coachId, month());
      $("#pageContent").innerHTML = `
        <div class="stats-grid"><div class="stat-card"><small>Período</small><strong>${month()}</strong></div><div class="stat-card"><small>Pagado</small><strong>${money(result.paid)}</strong></div><div class="stat-card"><small>Saldo pendiente</small><strong>${result.configured ? money(result.balance) : "—"}</strong></div></div>
        <section class="panel"><h2 class="section-title">Obligación fija mensual</h2>${result.configured ? table(["Concepto","Importe"],[
          row(["Importe acordado",money(result.obligation?.agreed_amount)]),
          row(["Pagos registrados",money(result.paid)]),
          row(["Ajustes",money(result.adjustmentTotal)]),
          row(["Saldo",money(result.balance)])
        ]) : empty("Administración todavía no configuró una obligación para este período.")}</section>
        <section class="panel" style="margin-top:16px"><h2 class="section-title">Historial de pagos</h2>${table(["Fecha","Importe","Medio"],(result.payments||[]).map(p=>row([date(p.paid_on),money(p.amount),esc(labels[p.payment_method]||p.payment_method||"—")])))}</section>`;
      return;
    }
    if (!isAdmin()) throw new Error("No tenés permisos para consultar esta sección.");
    const result = await api.listCoaches();
    state.coaches = result.coaches || [];
    state.selectedCoach = selected(coachOptions(),state.selectedCoach);
    const list = table(["Profesor","Disciplina","Contacto","Estado","Acción"],state.coaches.map(c=>row([
      `<strong>${esc(c.full_name)}</strong>`,esc(c.discipline),esc(c.email || c.phone || "—"),
      statusBadge(c.active ? "active" : "suspended"),
      `<button class="button small" type="button" data-action="coach-finance" data-id="${esc(c.id)}">Ver cuenta</button>`
    ])));
    $("#pageContent").innerHTML = `
      <div class="panel"><h2 class="section-title">Profesores registrados</h2>${list}</div><div style="height:16px"></div>
      ${form("Registrar profesor","create-coach",field("Nombre completo","full_name","text",{required:true})+field("Disciplina","discipline","text",{required:true})+field("Correo","email","email")+field("Teléfono","phone","tel"),"Crear profesor")}
      <div id="coachFinanceMount" style="margin-top:16px"></div>`;
  }
  async function renderCoachFinance(id) {
    state.selectedCoach = id;
    const coach = state.coaches.find(c => c.id === id);
    const result = await api.getCoachObligations(id,month());
    const mount = $("#coachFinanceMount");
    if (!mount) return;
    const body = result.configured ? `
      <div class="stats-grid"><div class="stat-card"><small>Obligación fija</small><strong>${money(result.obligation?.agreed_amount)}</strong></div><div class="stat-card"><small>Pagado</small><strong>${money(result.paid)}</strong></div><div class="stat-card"><small>Saldo</small><strong>${money(result.balance)}</strong></div></div>
      <div class="content-grid"><section class="panel"><h3 class="section-title">Pagos parciales</h3>${table(["Fecha","Importe","Medio"],(result.payments||[]).map(p=>row([date(p.paid_on),money(p.amount),esc(labels[p.payment_method]||p.payment_method||"—")])))}</section><section class="panel"><h3 class="section-title">Ajustes históricos</h3>${table(["Ajuste","Motivo"],(result.adjustments||[]).map(a=>row([money(a.amount_delta),esc(a.reason)])))}</section></div>` : empty("No existe una obligación configurada para este mes. Definila solo cuando el importe haya sido acordado.");
    mount.dataset.coachId = id;
    mount.dataset.obligationId = result.obligation?.id || "";
    mount.innerHTML = `<section class="panel"><h2 class="section-title">Cuenta de ${esc(coach?.full_name || "profesor")} · ${month()}</h2>${body}
      ${form("Configurar obligación mensual","create-obligation",field("Importe mensual acordado (ARS)","agreed_amount","number",{required:true,min:"0",step:"0.01"})+field("Vencimiento","due_on","date",{required:true,value:month()+"-10"}),"Configurar importe")}
      ${result.configured ? `<div class="two-col" style="margin-top:16px">${form("Registrar pago","coach-payment",field("Importe pagado","amount","number",{required:true,min:"0.01",step:"0.01"})+field("Fecha de pago","paid_on","date",{required:true,value:today()})+selectField("Medio","payment_method",["cash","transfer","card","other"],"transfer")+field("Referencia","reference"),"Registrar pago")}${form("Registrar ajuste","coach-adjustment",field("Variación (+/-)","amount_delta","number",{required:true,step:"0.01",placeholder:"Ej. -5000 o 2500"})+field("Motivo del ajuste","reason","text",{required:true,wide:true}),"Registrar ajuste")}</div>` : "" }
      <p class="footer-note">La obligación es fija, no depende de reservas ni de porcentajes de la recaudación. Los pagos parciales quedan en el historial.</p></section>`;
  }

  const ROLE_NAME = { member: "Miembro", coach: "Profesor" };
  async function renderAccess() {
    if (!isAdmin()) throw new Error("Esta sección es exclusiva de administración.");
    setPage("Accesos");
    setLoading("Consultando los accesos…");
    await loadCoaches();
    const { accounts } = await api.listAccounts();
    const accessState = item => !item.user_id ? '<span class="badge warn">Sin acceso</span>'
      : item.account_status === "suspended" ? '<span class="badge warn">Acceso deshabilitado</span>'
      : item.account_status !== "active" ? '<span class="badge warn">Sin activar</span>'
      : item.must_change_password ? '<span class="badge warn">Debe cambiar la clave</span>' : '<span class="badge success">Activo</span>';
    const accessAction = item => !item.user_id
      ? `<button class="button primary small" type="button" data-action="create-account" data-role-kind="${esc(item.role)}" data-profile="${esc(item.profile_id)}" data-name="${esc(item.full_name)}">Crear acceso</button>`
      : item.account_status === "suspended" ? `<button class="button primary small" type="button" data-action="enable-account" data-user="${esc(item.user_id)}" data-name="${esc(item.full_name)}">Habilitar acceso</button>`
      : item.username ? `<button class="button ghost small" type="button" data-action="reset-account" data-user="${esc(item.user_id)}" data-name="${esc(item.full_name)}">Restablecer clave</button> <button class="button danger small" type="button" data-action="disable-account" data-user="${esc(item.user_id)}" data-name="${esc(item.full_name)}">Deshabilitar acceso</button>` : "";
    const section = (role, title) => {
      const items = accounts.filter(item => item.role === role);
      return `<section class="panel" data-tour="access-${role}"><h2 class="section-title">${title}</h2>${table(["Nombre", "Usuario", "Estado", ""], items.map(item =>
        row([esc(item.full_name), item.username ? `<code>${esc(item.username)}</code>` : "—", accessState(item), accessAction(item)])))}</section>`;
    };
    const adminCoachLink = state.coaches.length
      ? form("Vincular profesor a una cuenta existente","link-admin-coach",
        field("Correo de la cuenta administradora","email","email",{required:true,value:state.user?.email || ""})+
        selectField("Perfil de profesor","coachId",coachOptions(),coachOptions()[0]?.value),
        "Vincular cuenta",
        "Para cuando quien administra también da clases: reutiliza su login actual. El correo del perfil de profesor debe coincidir con el de la cuenta administradora; no se crea otro usuario.")
      : "";
    $("#pageContent").innerHTML = `
      <section class="panel" data-tour="access-intro"><h2 class="section-title">Crear accesos</h2>
        <p>Solo administración crea usuarios. El usuario se arma con el nombre (<code>ikigai-miembro-ana</code>, <code>ikigai-profesor-lucia</code>) y la clave es temporal y aleatoria: <strong>quien entra tiene que cambiarla en su primer ingreso</strong>.</p>
        <p class="footer-note">La clave se muestra una sola vez, al crearla. Si se pierde, usá «Restablecer clave».</p></section>
      <div id="accountResult"></div>
      <div class="two-col" style="margin-top:16px">${section("coach", "Profesores")}${section("member", "Miembros")}</div>
      <div style="margin-top:16px">${adminCoachLink}</div>`;
  }
  function showCredentials(title, name, username, temporaryPassword) {
    const message = `Hola ${name}, este es tu acceso a Ikigai Training.\nUsuario: ${username}\nClave temporal: ${temporaryPassword}\nAl entrar por primera vez te va a pedir que la cambies por una propia.`;
    state.lastCredentials = message;
    $("#accountResult").innerHTML = `<section class="panel credentials-panel" role="status"><h2 class="section-title">${esc(title)}</h2>
      <p>Persona: <strong>${esc(name)}</strong></p>
      <div class="token-box"><strong>Usuario</strong><code data-testid="new-username">${esc(username)}</code><strong>Clave temporal</strong><code data-testid="new-password">${esc(temporaryPassword)}</code>
      <button class="button" type="button" data-action="copy-credentials">Copiar mensaje con el acceso</button></div>
      <p class="footer-note">Entregáselo por un canal seguro (en persona o mensaje directo). No se puede volver a ver: el servidor guarda solo un hash.</p></section>`;
    $("#accountResult").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  function renderPasswordChange() {
    setPage("Mi contraseña");
    const pending = state.mustChange;
    $("#portalPanel").classList.toggle("password-pending", pending);
    $("#pageContent").innerHTML = `<section class="panel narrow">
      ${pending ? '<p class="notice" role="alert">Tu clave es temporal: elegí una propia para empezar a usar Ikigai.</p>' : ""}
      <h2 class="section-title">${pending ? "Elegí tu contraseña" : "Cambiar mi contraseña"}</h2>
      <form data-form="change-password" autocomplete="off"><div class="form-grid">
        <div class="field full-span"><label for="cp-current">Contraseña actual${pending ? " (la temporal)" : ""}</label><input id="cp-current" name="currentPassword" type="password" autocomplete="current-password" required maxlength="128"></div>
        <div class="field full-span"><label for="cp-new">Contraseña nueva (mínimo 12 caracteres)</label><input id="cp-new" name="newPassword" type="password" autocomplete="new-password" required minlength="12" maxlength="128"></div>
        <div class="field full-span"><label for="cp-repeat">Repetí la contraseña nueva</label><input id="cp-repeat" name="repeatPassword" type="password" autocomplete="new-password" required minlength="12" maxlength="128"></div>
      </div><div class="form-actions"><button class="button primary" type="submit">Guardar contraseña</button></div>
      <p class="footer-note">Al cambiarla se cierran las demás sesiones abiertas con esta cuenta.</p></form></section>`;
  }
  // ---------------- Avisos ----------------
  const AUDIENCE = { all: "Todos", members: "Miembros", coaches: "Profesores" };
  const textareaField = (label, name, opts = {}) =>
    `<div class="field full-span"><label for="f-${esc(name)}">${esc(label)}</label><textarea id="f-${esc(name)}" name="${esc(name)}" rows="${opts.rows || 4}"${opts.required ? " required" : ""}${opts.maxLength ? ` maxlength="${esc(opts.maxLength)}"` : ""}></textarea></div>`;
  function setUnread(count) {
    state.unreadAnnouncements = count;
    const badge = $("#announcementBadge");
    badge.textContent = count > 99 ? "99+" : String(count);
    badge.hidden = count === 0;
    badge.setAttribute("aria-label", `${count} avisos sin leer`);
  }
  async function refreshUnread() {
    try { setUnread((await api.listAnnouncements()).unread || 0); }
    catch { /* el contador es una ayuda: si falla no se interrumpe nada */ }
  }
  async function showUnreadBanner() {
    await refreshUnread();
    if (!state.unreadAnnouncements || state.currentView !== "dashboard") return;
    const n = state.unreadAnnouncements;
    $("#pageContent").insertAdjacentHTML("afterbegin", `<section class="panel unread-banner" role="status"><p><strong>Tenés ${n} ${n === 1 ? "aviso sin leer" : "avisos sin leer"}.</strong></p><button class="button primary small" type="button" data-view="announcements">Ver avisos</button></section>`);
  }
  async function renderAnnouncements() {
    setPage("Avisos");
    setLoading("Consultando los avisos…");
    const { announcements, unread } = await api.listAnnouncements();
    setUnread(unread || 0);
    const cards = announcements.length ? announcements.map(item => `
      <article class="panel notice-card${item.read ? "" : " is-unread"}" data-announcement="${esc(item.id)}">
        <div class="section-title"><span>${esc(item.title)}</span>${item.read ? "" : '<span class="badge warn">Nuevo</span>'}</div>
        <p class="muted">${esc(new Date(item.created_at).toLocaleString("es-AR"))}${isAdmin() ? ` · Para: ${esc(AUDIENCE[item.audience] || item.audience)}` : ""}</p>
        <p class="notice-body">${esc(item.body)}</p>
        <div class="form-actions">
          ${item.read ? "" : `<button class="button small" type="button" data-action="read-announcement" data-id="${esc(item.id)}">Marcar como leído</button>`}
          ${isAdmin() ? `<button class="button ghost small" type="button" data-action="archive-announcement" data-id="${esc(item.id)}">Archivar</button>` : ""}
        </div>
      </article>`).join("") : empty("No hay avisos por ahora.");
    const publish = isAdmin() ? form("Publicar un aviso", "publish-announcement",
      field("Título", "title", "text", { required: true, maxLength: 120, wide: true }) +
      textareaField("Mensaje", "body", { required: true, maxLength: 2000 }) +
      selectField("Para", "audience", [{ value: "all", label: "Todos" }, { value: "members", label: "Solo miembros" }, { value: "coaches", label: "Solo profesores" }], "all"),
      "Publicar aviso",
      "Es un aviso general, no un mensaje privado: no escribas nombres, deudas ni datos de salud de nadie.") : "";
    $("#pageContent").innerHTML = `${publish}${unread ? `<div class="form-actions" style="margin:16px 0"><button class="button ghost small" type="button" data-action="read-all-announcements">Marcar todos como leídos</button></div>` : ""}<div class="notice-list" style="margin-top:16px">${cards}</div>`;
  }

  // ---------------- Rutinas ----------------
  function exerciseRow(row = {}) {
    const options = state.exercises.map(e => `<option value="${esc(e.id)}"${e.id === row.exerciseId ? " selected" : ""}>${esc(e.name)}</option>`).join("");
    return `<div class="routine-row">
      <select name="exerciseId" aria-label="Ejercicio" required>${options}</select>
      <input name="sets" aria-label="Series" placeholder="Series (ej. 3)" maxlength="80" required value="${esc(row.sets ?? "")}">
      <input name="reps" aria-label="Repeticiones" placeholder="Repeticiones" maxlength="80" value="${esc(row.reps ?? "")}">
      <input name="restSeconds" aria-label="Descanso en segundos" type="number" min="0" max="3600" placeholder="Descanso (s)" value="${esc(row.restSeconds ?? "")}">
      <input name="rowNotes" aria-label="Indicaciones" placeholder="Indicaciones" maxlength="500" value="${esc(row.notes ?? "")}">
      <button class="button ghost small" type="button" data-action="remove-routine-row" aria-label="Quitar ejercicio">Quitar</button>
    </div>`;
  }
  function routineBuilder(rows) {
    return `<div class="routine-rows" data-routine-rows>${(rows.length ? rows : [{}]).map(exerciseRow).join("")}</div>
      <div class="form-actions"><button class="button ghost small" type="button" data-action="add-routine-row">Agregar ejercicio</button></div>`;
  }
  function readRoutineRows(formNode) {
    return [...formNode.querySelectorAll(".routine-row")].map(rowNode => {
      const get = name => rowNode.querySelector(`[name="${name}"]`).value.trim();
      const item = { exerciseId: get("exerciseId"), sets: get("sets") };
      if (get("reps")) item.reps = get("reps");
      if (get("restSeconds") !== "") item.restSeconds = Number(get("restSeconds"));
      if (get("rowNotes")) item.notes = get("rowNotes");
      return item;
    });
  }
  const routineTable = exercises => table(["#", "Ejercicio", "Series", "Repeticiones", "Descanso", "Indicaciones"], exercises.map(e =>
    row([esc(e.position), esc(e.name), esc(e.sets || "—"), esc(e.reps || "—"), e.restSeconds != null ? `${esc(e.restSeconds)} s` : "—", esc(e.notes || "")])));
  async function renderRoutines() {
    if (!(isAdmin() || isCoach())) throw new Error("Esta sección es exclusiva de administración y profesores.");
    setPage("Rutinas");
    setLoading("Consultando rutinas y ejercicios…");
    const [exercises, routines] = await Promise.all([api.listExercises(), api.listRoutines()]);
    state.exercises = exercises.exercises || [];
    state.routines = routines.routines || [];
    if (isAdmin()) { await loadMembers(); state.assignable = state.members.filter(m => m.status !== "exited"); }
    else state.assignable = (await api.listCoachMembers()).members || [];
    if (!state.assignable.some(m => m.id === state.routineMember)) state.routineMember = state.assignable[0]?.id || "";
    const library = state.routines.length ? state.routines.map(routine => `
      <article class="panel" data-routine="${esc(routine.id)}">
        <div class="section-title"><span>${esc(routine.name)}</span><span class="badge">Versión ${esc(routine.version_number)}</span></div>
        <p class="muted">${esc(routine.discipline)} · ${esc(routine.level)}</p>
        ${routine.version_notes ? `<p>${esc(routine.version_notes)}</p>` : ""}
        ${routineTable(routine.exercises || [])}
        <div class="form-actions">
          <button class="button primary small" type="button" data-action="pick-routine" data-version="${esc(routine.version_id)}">Asignar a un miembro</button>
          <button class="button ghost small" type="button" data-action="edit-routine" data-id="${esc(routine.id)}">Nueva versión</button>
        </div></article>`).join("") : empty("Todavía no hay rutinas. Creá ejercicios y armá la primera.");
    const routineOpts = state.routines.map(r => ({ value: r.version_id, label: `${r.name} · versión ${r.version_number}` }));
    const memberOpts = state.assignable.map(m => ({ value: m.id, label: m.full_name }));
    const assign = routineOpts.length && memberOpts.length
      ? form("Asignar una rutina", "assign-routine",
          selectField("Rutina", "routineVersionId", routineOpts, routineOpts[0].value) +
          selectField("Miembro", "memberId", memberOpts, state.routineMember) +
          field("Desde", "startsOn", "date", { required: true, value: today() }) +
          field("Hasta (opcional)", "endsOn", "date") +
          field("Indicaciones para esta persona", "notes", "text", { maxLength: 1000, wide: true }),
          "Asignar rutina", "El miembro la ve en «Mi rutina» desde la fecha indicada.")
      : `<section class="panel" data-tour="routine-assign"><h2 class="section-title">Asignar una rutina</h2>${empty(!routineOpts.length ? "Primero tiene que existir al menos una rutina." : isAdmin() ? "Primero creá un miembro." : "Todavía no tenés miembros con clases a quienes asignar.")}</section>`;
    const viewer = memberOpts.length ? `<section class="panel"><h2 class="section-title">Rutinas de un miembro</h2>
        <form data-form="select-routine-member"><div class="form-grid">${selectField("Miembro", "memberId", memberOpts, state.routineMember)}</div><div class="form-actions"><button class="button" type="submit">Ver rutinas asignadas</button></div></form>
        <div id="routineAssignments" style="margin-top:12px"></div></section>` : "";
    // Administración y profesores cargan ejercicios y arman rutinas.
    const adminForms = `
      <div class="two-col" style="margin-top:16px">
        ${form("Nuevo ejercicio", "create-exercise",
          field("Nombre", "name", "text", { required: true, maxLength: 120, wide: true }) +
          field("Equipamiento", "equipment", "text", { maxLength: 240 }) +
          field("Precauciones", "precautions", "text", { maxLength: 1000 }) +
          textareaField("Descripción", "description", { rows: 3, maxLength: 2000 }), "Crear ejercicio")}
        <section class="panel"><h2 class="section-title">Ejercicios (${state.exercises.length})</h2>${table(["Ejercicio", "Equipamiento"], state.exercises.map(e => row([esc(e.name), esc(e.equipment || "—")])))}</section>
      </div>
      <section class="panel" style="margin-top:16px" data-tour="routine-new"><h2 class="section-title">Nueva rutina</h2>
        ${state.exercises.length ? `<form data-form="create-routine"><div class="form-grid">
          ${field("Nombre", "name", "text", { required: true, maxLength: 120 })}${field("Disciplina", "discipline", "text", { required: true, maxLength: 120 })}${field("Nivel", "level", "text", { required: true, maxLength: 80, placeholder: "Ej. Inicial" })}${field("Notas de la rutina", "notes", "text", { maxLength: 2000 })}
        </div>${routineBuilder([])}<div class="form-actions"><button class="button primary" type="submit">Crear rutina</button></div></form>` : empty("Primero creá al menos un ejercicio.")}
      </section>
      <div id="routineEditor"></div>`;
    $("#pageContent").innerHTML = `<div data-tour="routine-library">${library}</div><div class="two-col" style="margin-top:16px">${assign}${viewer}</div>${adminForms}`;
  }
  function renderAssignmentList(assignments) {
    if (!assignments.length) return empty("Este miembro todavía no tiene rutinas asignadas.");
    return assignments.map(a => `<article class="panel"><div class="section-title"><span>${esc(a.name)}</span><span class="badge">Versión ${esc(a.version_number)}</span></div>
      <p class="muted">${esc(a.discipline)} · ${esc(a.level)} · Desde ${esc(date(a.starts_on))}${a.ends_on ? " · Hasta " + esc(date(a.ends_on)) : ""}</p>
      ${a.assignment_notes ? `<p>${esc(a.assignment_notes)}</p>` : ""}${routineTable(a.exercises || [])}</article>`).join("");
  }

  async function renderInstitutionSettings() {
    if (!isAdmin()) throw new Error("Esta sección es exclusiva de administración.");
    setPage("Configuración institucional");
    setLoading("Consultando la configuración guardada en el servidor…");
    const result = await api.getInstitutionSettings();
    const settings = result.settings || {};
    $( "#pageContent" ).innerHTML = `
      ${form("Configuración institucional","institution-settings",
        field("Nombre del gimnasio","institution_name","text",{value:settings.institution_name || "",maxLength:120,wide:true})+
        field("Correo de contacto","contact_email","email",{value:settings.contact_email || "",maxLength:254})+
        field("Teléfono de contacto","contact_phone","tel",{value:settings.contact_phone || "",maxLength:40})+
        field("Dirección","address","text",{value:settings.address || "",maxLength:300,wide:true})+
        field("Horarios y observaciones","opening_hours","text",{value:settings.opening_hours || "",maxLength:1000,wide:true,placeholder:"Ingresá únicamente los horarios confirmados"}),
        "Guardar configuración",
        "Los campos vacíos quedan sin configurar. Al guardar, los cambios los ven todas las personas que usan la aplicación.") }
      <p class="footer-note">Última actualización: ${esc(settings.updated_at ? new Date(settings.updated_at).toLocaleString("es-AR") : "Sin cambios")}.</p>
      ${form("Respaldo de la base de datos","backup",
        field("Frase del respaldo (mínimo 12 caracteres)","passphrase","password",{maxLength:200,wide:true,placeholder:"La elegís vos; no se guarda en ningún lado"})+
        field("Repetí la frase","passphrase2","password",{maxLength:200,wide:true}),
        "Descargar respaldo cifrado",
        "Baja un archivo con todos los datos del gimnasio, cifrado con tu frase. Sin la frase no se puede abrir y nadie puede recuperarla: anotala en un lugar seguro y guardá el archivo en otro lugar distinto (por ejemplo un disco externo). Se registra quién lo pidió y cuándo.")}`;
  }

  async function renderMyRoutine() {
    if (!isMember() || !state.user.memberId) throw new Error("Esta sección es exclusiva del perfil de miembro.");
    setPage("Mi rutina");
    setLoading("Consultando las rutinas asignadas…");
    const result = await api.listRoutineAssignments(state.user.memberId);
    const assignments = result.assignments || [];
    if (!assignments.length) {
      $("#pageContent").innerHTML = empty("Todavía no tenés una rutina asignada. Consultá con tu profesor.");
      return;
    }
    $("#pageContent").innerHTML = assignments.map(assignment => {
      const exercises = Array.isArray(assignment.exercises) ? assignment.exercises : [];
      const exerciseRows = exercises.map((exercise,index) => row([
        String(index+1),
        `<strong>${esc(exercise.name)}</strong><small class="muted">${esc(exercise.equipment || "Sin equipamiento especificado")}</small>`,
        esc(exercise.sets || "—"),
        esc(exercise.reps || (exercise.durationSeconds ? exercise.durationSeconds + " s" : "—")),
        exercise.restSeconds == null ? "—" : esc(exercise.restSeconds + " s"),
        esc(exercise.notes || "—")
      ]));
      return `<section class="panel" style="margin-bottom:16px">
        <div class="section-title"><span>${esc(assignment.name)}</span><span class="badge">Versión ${esc(assignment.version_number)}</span></div>
        <p class="muted">${esc(assignment.discipline)} · ${esc(assignment.level)} · Desde ${date(assignment.starts_on)}${assignment.ends_on ? " · Hasta " + date(assignment.ends_on) : ""}</p>
        ${assignment.assignment_notes ? `<p>${esc(assignment.assignment_notes)}</p>` : ""}
        ${table(["#","Ejercicio","Series","Reps / tiempo","Descanso","Notas"],exerciseRows)}
        ${assignment.version_notes ? `<p class="footer-note">${esc(assignment.version_notes)}</p>` : ""}
      </section>`;
    }).join("");
    $("#pageContent").insertAdjacentHTML("beforeend",'<p class="footer-note">Las versiones históricas de una rutina se conservan; esta vista muestra la versión asignada a tu perfil.</p>');
  }

  async function renderSchedule() {
    setPage("Agenda de clases");
    setLoading("Consultando agenda del servidor…");
    const result = await api.listClassSessions();
    const sessions = result.items || [];
    const isMemberUser = isMember() && Boolean(state.user.memberId);
    const canTakeAttendance = isAdmin() || isCoach();
    const rows = sessions.map(session => {
      const startsAt = new Date(session.starts_at);
      const endsAt = new Date(session.ends_at);
      const serverNow = Number.isFinite(Date.parse(session.server_now)) ? Date.parse(session.server_now) : Date.now();
      const future = startsAt.getTime() > serverNow;
      const bookingOpen = startsAt.getTime() - serverNow > 40 * 60 * 1000;
      const dateLabel = startsAt.toLocaleDateString("es-AR", { dateStyle: "medium" });
      const timeLabel = `${startsAt.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}–${endsAt.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`;
      const booked = ["confirmed", "waitlist"].includes(session.my_booking_status);
      const noticeText = session.my_notice_kind === "late" ? " · avisaste que llegás tarde" : session.my_notice_kind === "absence" ? " · avisaste que no vas" : "";
      const status = session.status === "completed" ? "Finalizada"
        : session.my_booking_status === "confirmed" ? (future && !bookingOpen ? "Reservada · cancelación cerrada" : "Reservada")
        : session.my_booking_status === "waitlist" ? (future && !bookingOpen ? "En espera · cancelación cerrada" : "Lista de espera")
        : future && !bookingOpen ? "Reservas cerradas"
        : session.confirmed_count >= session.capacity ? "Cupo completo" : "Disponible";
      let action = "";
      if (isMemberUser && future && booked && bookingOpen && session.my_booking_id) {
        action = `<button class="button ghost small" type="button" data-action="cancel-booking" data-id="${esc(session.my_booking_id)}">Cancelar reserva</button>`;
      } else if (isMemberUser && future && bookingOpen && session.status === "scheduled") {
        action = `<button class="button primary small" type="button" data-action="create-booking" data-id="${esc(session.id)}">${session.confirmed_count >= session.capacity ? "Anotarme en espera" : "Reservar clase"}</button>`;
      }
      if (isMemberUser && future && booked && session.my_booking_id && session.status === "scheduled") {
        const id = esc(session.my_booking_id);
        action += ` <button class="button ghost small" type="button" data-action="notice" data-kind="late" data-id="${id}">Llego tarde</button>`
          + ` <button class="button ghost small" type="button" data-action="notice" data-kind="absence" data-id="${id}">No voy</button>`;
        if (session.my_notice_kind) action += ` <button class="button ghost small" type="button" data-action="remove-notice" data-id="${id}">Quitar aviso</button>`;
      }
      if (isAdmin() && future && session.status === "scheduled") {
        action += ` <button class="button ghost small" type="button" data-action="cancel-session" data-id="${esc(session.id)}">Cancelar clase</button>`;
      }
      if (canTakeAttendance && !future && session.status !== "cancelled") {
        action += ` <button class="button ghost small" type="button" data-action="session-attendance" data-id="${esc(session.id)}">Tomar asistencia</button>`;
      }
      return row([
        esc(`${dateLabel} · ${timeLabel}`),
        esc(session.service_name || "Clase"),
        esc(session.coach_name || "Sin profesor"),
        esc(`${session.confirmed_count}/${session.capacity}${session.waitlist_count > 0 ? ` · ${session.waitlist_count} en espera` : ""}`),
        esc(status + noticeText),
        action || '<span class="muted">—</span>'
      ]);
    });
    $("#pageContent").innerHTML = `
      <div class="page-heading"><div><p class="section-subtitle">Próximos 30 días y últimas clases</p></div>
        <button class="button ghost small" type="button" data-action="refresh-schedule">Actualizar</button></div>
      <section class="panel"><h2 class="section-title">Agenda</h2>
        ${sessions.length ? table(["Fecha y hora","Servicio","Profesor","Cupo","Estado","Acción"], rows)
          : empty("No hay clases dentro del período consultado.")}</section>
      <p class="footer-note">Datos consultados en la API. Las reservas y cancelaciones se validan en el servidor; la lista de espera depende del cupo real al momento de la operación.</p>`;
  }

  // Descarga un JSON como archivo sin pasar por el servidor: la CSP no admite scripts en linea, pero un enlace
  // `download` hacia un blob propio es una navegacion permitida.
  function downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  const weekdayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const weekdayOptions = weekdayNames.map((name, index) => ({ value: String(index), label: name }));
  const addDays = (iso, days) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

  async function renderScheduleTemplates() {
    if (!isAdmin()) throw new Error("Esta sección es exclusiva de administración.");
    setPage("Horarios y clases");
    setLoading("Consultando horarios del servidor…");
    await Promise.all([loadServices(), loadCoaches(), loadMembers()]);
    const result = await api.listClassTemplates();
    const templates = result.templates || [];
    const rows = templates.map(tpl => row([
      esc(weekdayNames[tpl.weekday] || "—"),
      esc(tpl.localStartTime),
      esc(tpl.service.name),
      esc(tpl.coach.name),
      esc(`${tpl.durationMinutes} min`),
      esc(String(tpl.capacity)),
      statusBadge(tpl.active ? "active" : "suspended"),
      `<button class="button small" type="button" data-action="template-assignments" data-id="${esc(tpl.id)}">Turnos fijos</button> `
        + `<button class="button ghost small" type="button" data-action="toggle-template" data-id="${esc(tpl.id)}" data-active="${tpl.active ? "false" : "true"}">${tpl.active ? "Desactivar" : "Activar"}</button>`
    ]));
    const from = today();
    $("#pageContent").innerHTML = `
      <section class="panel"><h2 class="section-title">Plantillas semanales</h2>
        ${templates.length ? table(["Día","Hora","Servicio","Profesor","Duración","Cupo","Estado","Acción"], rows)
          : empty("Todavía no hay horarios. Creá la primera plantilla para poder generar clases.")}</section>
      <div style="height:16px"></div>
      ${state.services.length && state.coaches.length ? form("Nueva plantilla semanal", "create-template",
        selectField("Servicio", "service_id", serviceOptions(), "", true)
        + selectField("Profesor", "coach_id", coachOptions(), "", true)
        + selectField("Día de la semana", "weekday", weekdayOptions, "1", true)
        + field("Hora de inicio", "local_start_time", "time", { required: true, value: "19:00" })
        + field("Duración (minutos)", "duration_minutes", "number", { required: true, min: 1, max: 480, value: 60 })
        + field("Cupo", "capacity", "number", { required: true, min: 1, max: 30, value: 10 }),
        "Crear plantilla", "La hora es la local del gimnasio. Cambiar una plantilla no modifica las clases ya generadas.")
        : `<section class="panel">${empty("Para crear horarios primero tiene que haber al menos un servicio activo y un profesor activo.")}</section>`}
      <div style="height:16px"></div>
      ${form("Generar clases", "generate-sessions",
        field("Desde", "from_date", "date", { required: true, value: from })
        + field("Hasta", "to_date", "date", { required: true, value: addDays(from, 27) }),
        "Generar clases", "Se crean las clases de las plantillas activas en ese período (hasta 90 días). Repetirlo no duplica nada y quienes tienen un turno fijo quedan reservados.")}
      <div id="assignmentsMount" style="margin-top:16px"></div>`;
  }

  async function renderTemplateAssignments(templateId) {
    const mount = $("#assignmentsMount");
    if (!mount) return;
    mount.innerHTML = `<div class="loading">Consultando turnos fijos…</div>`;
    const result = await api.listTemplateAssignments(templateId);
    const members = new Map(state.members.map(m => [m.id, m]));
    const rows = (result.assignments || []).map(a => row([
      esc(members.get(a.memberId)?.full_name || "Miembro"),
      esc(date(a.startsOn)),
      esc(a.endsOn ? date(a.endsOn) : "Sin fin"),
      `<button class="button ghost small" type="button" data-action="end-assignment" data-id="${esc(a.id)}" data-template="${esc(templateId)}">Terminar turno</button>`
    ]));
    mount.innerHTML = `
      <section class="panel"><h2 class="section-title">Turnos fijos de la clase</h2>
        ${rows.length ? table(["Miembro","Desde","Hasta","Acción"], rows) : empty("Nadie tiene un turno fijo en esta clase.")}</section>
      <div style="height:16px"></div>
      ${form("Asignar turno fijo", "create-assignment",
        `<input type="hidden" name="template_id" value="${esc(templateId)}">`
        + selectField("Miembro", "member_id", memberOptions(), "", true)
        + field("Desde", "starts_on", "date", { required: true, value: today() })
        + field("Hasta (opcional)", "ends_on", "date"),
        "Asignar turno fijo", "Al generar clases, el miembro se reserva solo en cada una; si el cupo está lleno queda en lista de espera.")}`;
  }

  async function renderSessionAttendance(sessionId) {
    if (!(isAdmin() || isCoach())) throw new Error("Sólo administración o el profesor asignado pueden registrar asistencia.");
    setPage("Tomar asistencia");
    setLoading("Consultando lista de clase…");
    const result = await api.getSessionAttendance(sessionId);
    const records = result.records || [];
    const fields = records.map(record => `
      <label class="attendance-entry">
        <span><strong>${esc(record.member_name || "Miembro")}</strong><small>${record.attended === true ? (record.arrived_late ? "Último registro: presente, llegó tarde" : "Último registro: presente") : record.attended === false ? "Último registro: ausente" : "Todavía sin registrar"}</small>${record.notice_kind ? `<small class="notice-hint">Aviso de la persona: ${record.notice_kind === "late" ? "llegará tarde" : "no asistirá"}${record.notice_note ? ` — «${esc(record.notice_note)}»` : ""}</small>` : ""}</span>
        <select data-booking-id="${esc(record.booking_id)}" aria-label="Asistencia de ${esc(record.member_name || "Miembro")}">
          <option value="" ${record.attended == null ? "selected" : ""}>Sin registrar</option>
          <option value="true" ${record.attended === true && !record.arrived_late ? "selected" : ""}>Presente</option>
          <option value="late" ${record.attended === true && record.arrived_late ? "selected" : ""}>Presente (llegó tarde)</option>
          <option value="false" ${record.attended === false ? "selected" : ""}>Ausente</option>
        </select>
      </label>`).join("");
    $("#pageContent").innerHTML = `
      <section class="panel"><p class="section-subtitle">Los cambios quedan auditados en el servidor.</p>
        <form data-form="record-attendance">
          <input type="hidden" name="sessionId" value="${esc(sessionId)}">
          <div class="attendance-list">${fields || '<p class="muted">No hay reservas confirmadas para esta clase.</p>'}</div>
          <div class="form-actions"><button class="button primary" type="submit" ${records.length ? "" : "disabled"}>Guardar asistencia</button>
          <button class="button ghost" type="button" data-action="refresh-schedule">Volver a agenda</button></div>
        </form>
      </section>`;
  }

  async function renderAttendance() {
    if (!isMember() || !state.user.memberId) throw new Error("Esta sección es exclusiva del perfil de miembro.");
    setPage("Asistencia");
    setLoading("Consultando el historial de asistencia…");
    const result = await api.listAttendance(state.user.memberId);
    const records = result.records || [];
    const attendedCount = records.filter(record => record.attended === true).length;
    const missedCount = records.filter(record => record.attended === false).length;
    const lateCount = records.filter(record => record.attended === true && record.arrived_late === true).length;
    $("#pageContent").innerHTML = `
      <div class="stats-grid">
        <div class="stat-card"><small>Clases registradas</small><strong>${records.length}</strong></div>
        <div class="stat-card"><small>Asistencias</small><strong>${attendedCount}</strong></div>
        <div class="stat-card"><small>Ausencias</small><strong>${missedCount}</strong></div>
        <div class="stat-card"><small>Llegadas tarde</small><strong>${lateCount}</strong></div>
      </div>
      <section class="panel"><h2 class="section-title">Historial por clase</h2>
      ${table(["Fecha y hora","Clase / servicio","Registro"],records.map(record=>row([
        esc(record.starts_at ? new Date(record.starts_at).toLocaleString("es-AR",{dateStyle:"medium",timeStyle:"short"}) : date(record.recorded_at)),
        esc(record.service_name || "Clase"),
        record.attended
          ? `<span class="badge success">Presente</span>${record.arrived_late ? ' <span class="badge warn">Llegó tarde</span>' : ""}`
          : '<span class="badge warn">Ausente</span>'
      ])))}</section>
      <p class="footer-note">La asistencia queda asociada a cada clase histórica. Una corrección del registro no crea una segunda asistencia. Ausencias y llegadas tarde se registran sólo como información: no generan sanciones ni cargos.</p>`;
  }

  function renderDenied(title, message) {
    setPage(title);
    $("#pageContent").innerHTML = empty(message);
  }


  // ---------------- Iron Pixel (juego) y premios ----------------
  // Mensajes en castellano para los errores propios del juego (el servidor responde códigos estables).
  const GAME_ERRORS = {
    daily_run_limit: "Llegaste al máximo de partidas de hoy. ¡Volvé mañana!",
    run_closed: "Esa partida ya estaba cerrada.",
    run_rejected: "No se pudo validar el resultado de la partida, así que no suma puntos.",
    insufficient_points: "No le alcanzan los puntos para el canje.",
    balance_changed: "El saldo cambió mientras mirabas la pantalla. Actualizá y volvé a intentar.",
    week_not_closed: "Esa semana todavía no terminó.",
    already_delivered: "El premio de esa semana ya se había entregado.",
    no_winner: "Nadie jugó esa semana."
  };
  const gameError = error => {
    const text = GAME_ERRORS[error?.code] || GAME_ERRORS[error?.details?.error];
    return text ? Object.assign(new Error(text), { status: error.status }) : error;
  };
  const points = n => new Intl.NumberFormat("es-AR").format(Number(n) || 0);
  const weekLabel = start => {
    if (!start) return "";
    const from = new Date(`${start}T12:00:00`);
    const to = new Date(from.getTime() + 6 * 86400000);
    const f = d => d.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
    return `${f(from)} al ${f(to)}`;
  };
  let activeGame = null;
  function stopGame() { if (activeGame) { activeGame.destroy(); activeGame = null; } }

  function rankingList(items, emptyText) {
    if (!items.length) return empty(emptyText);
    return `<ol class="ranking">${items.map(r => `<li class="${r.me ? "me" : ""}"><span class="pos">${esc(r.position)}</span><span class="who">${esc(r.name)}${r.me ? " (vos)" : ""}</span><span class="pts">${esc(points(r.score))}</span></li>`).join("")}</ol>`;
  }
  function gameSidePanel(summary) {
    const s = summary.settings;
    const me = summary.me;
    let pointsPanel;
    if (summary.competes) {
      const progress = Math.min(100, Math.round(((me.balance % s.pointsPerReward) / s.pointsPerReward) * 100));
      const available = Math.floor(me.balance / s.pointsPerReward);
      const leftToday = Math.max(0, s.dailyPointsCap - me.earnedToday);
      pointsPanel = `<section class="panel"><h2 class="section-title">Mis puntos</h2>
        <div class="stats-grid"><div class="stat-card"><small>Saldo</small><strong>${esc(points(me.balance))}</strong></div>
        <div class="stat-card"><small>Para canjear</small><strong>${esc(available)}</strong></div>
        <div class="stat-card"><small>Hoy podés sumar</small><strong>${esc(points(leftToday))}</strong></div></div>
        <p>Cada <b>${esc(points(s.pointsPerReward))}</b> puntos te llevás una <b>${esc(s.rewardName)}</b>. Pedila en recepción.</p>
        <div class="progress" aria-label="Avance hacia el próximo premio"><span style="width:${progress}%"></span></div>
        <p class="footer-note">Se pueden sumar hasta ${esc(points(s.dailyPointsCap))} puntos por día. Tu mejor partida de la semana compite en el ranking.</p></section>`;
    } else {
      pointsPanel = `<section class="panel"><h2 class="section-title">Modo libre</h2><p>Como parte del equipo podés jugar y ver el ranking, pero tus partidas no suman puntos canjeables ni compiten por el premio: eso es para los miembros.</p>
        <p class="muted">Tu récord: ${esc(points(me.personalBest))}</p></section>`;
    }
    const last = summary.lastWeek;
    const lastBlock = s.weeklyPrizeEnabled ? `<section class="panel" style="margin-top:16px"><h2 class="section-title">Semana pasada</h2>
      ${last.winner ? `<p>🏆 <b>${esc(last.winner.name)}</b>${last.winner.me ? " (¡vos!)" : ""} ganó con ${esc(points(last.winner.score))} puntos.${last.delivered ? " Premio entregado." : last.winner.me ? ` Pasá por recepción a buscar tu ${esc(s.rewardName.toLowerCase())}.` : ""}</p>` : `<p class="muted">Nadie jugó la semana pasada.</p>`}</section>` : "";
    return `${pointsPanel}
      <section class="panel" style="margin-top:16px"><h2 class="section-title">Ranking de la semana</h2>
        <p class="muted">${esc(weekLabel(summary.week.start))}${s.weeklyPrizeEnabled ? ` · El primero se lleva una ${esc(s.rewardName.toLowerCase())}.` : ""}</p>
        ${rankingList(summary.week.ranking, "Todavía nadie jugó esta semana. ¡Estrená el ranking!")}</section>${lastBlock}`;
  }
  async function renderGame() {
    setPage("Iron Pixel");
    setLoading("Preparando el juego…");
    const summary = await api.getGameSummary();
    $("#pageContent").innerHTML = `<div class="game-layout"><div id="ironPixel"></div><div id="gameSide">${gameSidePanel(summary)}</div></div>`;
    let runId = null;
    activeGame = window.IkigaiIronPixel.mount($("#ironPixel"), {
      best: summary.me.personalBest,
      onStart: async () => {
        try { runId = (await api.startGameRun()).run.id; }
        catch (error) { throw gameError(error); }
      },
      onFinish: async ({ reps, perfectReps }) => {
        let result;
        try { result = await api.finishGameRun(runId, reps, perfectReps); }
        catch (error) { throw gameError(error); }
        finally { runId = null; }
        // Refresca saldo y ranking sin reiniciar el juego.
        api.getGameSummary().then(next => { const side = $("#gameSide"); if (side && state.currentView === "game") side.innerHTML = gameSidePanel(next); }).catch(() => {});
        let message;
        if (!result.competes) message = `<b>${esc(points(result.score))} PUNTOS.</b> Modo libre: no suma puntos canjeables.`;
        else if (result.pointsAwarded > 0) message = `<b>+${esc(points(result.pointsAwarded))} PUNTOS.</b> Saldo: ${esc(points(result.balance))}.${result.pointsAwarded < result.score ? " Llegaste al tope de hoy: el resto no suma, pero el puntaje cuenta para el ranking." : ""}`;
        else message = `<b>${esc(points(result.score))} PUNTOS.</b> Ya llegaste al tope de puntos de hoy; la partida igual cuenta para el ranking.`;
        return { score: result.score, headline: result.competes && result.pointsAwarded > 0 ? `+${result.pointsAwarded} AL SALDO` : "PULSÁ INICIAR PARA OTRA", message };
      }
    });
  }

  async function renderRewards() {
    if (!isAdmin()) throw new Error("Esta sección es exclusiva de administración.");
    setPage("Premios");
    setLoading("Consultando puntos y premios…");
    const data = await api.getRewardsOverview();
    const s = data.settings;
    const balances = table(["Miembro", "Puntos", "Premios disponibles", "Acción"], data.balances.map(b => row([
      esc(b.name), esc(points(b.balance)), esc(b.rewardsAvailable),
      b.rewardsAvailable > 0 ? `<button class="button primary small" type="button" data-action="redeem-reward" data-id="${esc(b.memberId)}" data-balance="${esc(b.balance)}" data-name="${esc(b.name)}">Entregar ${esc(s.rewardName.toLowerCase())}</button>` : "—"
    ])));
    const prizes = table(["Semana", "Ganador", "Puntaje", "Estado"], data.weeklyPrizes.map(p => row([
      esc(weekLabel(p.weekStart)),
      p.delivered ? esc(p.delivered.name) : p.winner ? esc(p.winner.name) : "—",
      p.winner ? esc(points(p.winner.score)) : "—",
      p.delivered ? `<span class="badge success">Entregado</span>` : p.winner ? `<button class="button small" type="button" data-action="deliver-prize" data-week="${esc(p.weekStart)}" data-name="${esc(p.winner.name)}">Marcar entregado</button>` : "Sin partidas"
    ])));
    const redemptions = table(["Fecha", "Miembro", "Premio", "Puntos", "Registró"], (data.redemptions || []).map(r => row([
      esc(new Date(r.created_at).toLocaleString("es-AR")), esc(r.full_name), esc(r.note || "—"), esc(points(r.delta)), esc(r.by_username || r.by_email || "—")
    ])));
    $("#pageContent").innerHTML = `
      <section class="panel"><h2 class="section-title">Puntos de los miembros</h2>
        <p class="muted">Cuando alguien retira su premio en el mostrador, tocá «Entregar» para descontarle ${esc(points(s.pointsPerReward))} puntos.</p>${balances}</section>
      <div class="two-col" style="margin-top:16px">
        <section class="panel"><h2 class="section-title">Premio semanal</h2>
          <p class="muted">Gana la mejor partida de cada semana (lunes a domingo). El servidor calcula el ganador; marcalo cuando le entregues el premio.</p>${prizes}</section>
        ${form("Reglas del programa", "reward-settings",
          field("Premio", "rewardName", "text", { value: s.rewardName, required: true, maxLength: 80 }) +
          field("Puntos por premio", "pointsPerReward", "number", { value: s.pointsPerReward, required: true, min: 100, max: 1000000, step: 1 }) +
          field("Tope de puntos por día", "dailyPointsCap", "number", { value: s.dailyPointsCap, required: true, min: 0, max: 100000, step: 1 }) +
          selectField("Premio semanal", "weeklyPrizeEnabled", [{ value: "true", label: "Activado" }, { value: "false", label: "Desactivado" }], String(s.weeklyPrizeEnabled)),
          "Guardar reglas",
          "Una partida muy buena da entre 500 y 800 puntos. El tope diario evita que alguien junte premios en una sola tarde.")}
      </div>
      <section class="panel" style="margin-top:16px"><h2 class="section-title">Últimos canjes</h2>${redemptions}</section>`;
  }


  // ---------------- Catálogo de productos ----------------
  const CATALOG_ERRORS = {
    product_unavailable: "Ese producto no tiene stock en este momento.",
    too_many_reservations: "Ya tenés 5 reservas pendientes. Retirá o cancelá alguna antes de hacer otra.",
    reservation_closed: "Esa reserva ya estaba cerrada."
  };
  const catalogError = error => {
    const text = CATALOG_ERRORS[error?.code];
    return text ? Object.assign(new Error(text), { status: error.status }) : error;
  };
  const RESERVATION_STATUS = { pending: "Pendiente", delivered: "Entregada", cancelled: "Cancelada" };
  const priceLabel = price => price === null || price === undefined ? "Consultar precio" : money(price);
  const CATEGORY_SUGGESTIONS = ["Proteínas", "Creatina", "Barras", "Bebidas", "Suplementos", "Accesorios", "Indumentaria"];

  function productCard(p, canReserve) {
    const stock = p.available ? `<span class="badge success">Disponible</span>` : `<span class="badge warn">Sin stock</span>`;
    const reserve = canReserve && p.available ? `<form class="product-reserve" data-form="reserve-product"><input type="hidden" name="productId" value="${esc(p.id)}">
        <label>Cantidad <select name="quantity">${[1,2,3,4,5].map(n => `<option value="${n}">${n}</option>`).join("")}</select></label>
        <label class="grow">Nota (opcional) <input name="note" type="text" maxlength="200" placeholder="Ej. sabor vainilla, lo retiro el jueves"></label>
        <button class="button primary small" type="submit">Reservar</button></form>` : "";
    return `<article class="panel product-card"><div class="section-title"><span>${esc(p.name)}</span>${stock}</div>
      <p class="muted">${esc(p.category)}</p>${p.description ? `<p>${esc(p.description)}</p>` : ""}
      <p class="product-price">${esc(priceLabel(p.price))}</p>${reserve}</article>`;
  }
  function reservationTable(items, { admin = false, own = false } = {}) {
    const headers = ["Fecha", ...(admin ? ["Miembro"] : []), "Producto", "Cant.", "Precio ref.", "Nota", "Estado", ...(admin || own ? ["Acción"] : [])];
    return table(headers, items.map(r => row([
      esc(new Date(r.created_at).toLocaleDateString("es-AR")),
      ...(admin ? [esc(r.member_name)] : []),
      esc(r.product_name), esc(r.quantity), esc(priceLabel(r.unit_price_snapshot)), esc(r.note || "—"),
      esc(RESERVATION_STATUS[r.status] || r.status),
      ...(admin || own ? [r.status !== "pending" ? "—" : `${admin ? `<button class="button primary small" type="button" data-action="deliver-reservation" data-id="${esc(r.id)}" data-name="${esc(r.member_name)}">Entregada</button> ` : ""}<button class="button ghost small" type="button" data-action="cancel-reservation" data-id="${esc(r.id)}">Cancelar</button>`] : [])
    ])));
  }
  async function renderCatalog() {
    setPage("Productos");
    setLoading("Consultando el catálogo…");
    const [catalog, reservations] = await Promise.all([api.listProducts(), api.listReservations()]);
    state.products = catalog.products || [];
    const active = state.products.filter(p => p.active);
    const byCategory = new Map();
    for (const p of active) { if (!byCategory.has(p.category)) byCategory.set(p.category, []); byCategory.get(p.category).push(p); }
    const vitrine = active.length
      ? [...byCategory.entries()].map(([category, items]) => `<h2 class="section-title" style="margin-top:8px">${esc(category)}</h2><div class="product-grid">${items.map(p => productCard(p, catalog.canReserve)).join("")}</div>`).join("")
      : empty(isAdmin() ? "Todavía no cargaste productos. Usá el formulario de abajo." : "Todavía no hay productos cargados.");
    let extra = "";
    if (catalog.canReserve && !isAdmin()) {
      extra = `<section class="panel" style="margin-top:16px"><h2 class="section-title">Mis reservas</h2>
        <p class="muted">Reservás desde acá y pagás y retirás en recepción.</p>
        ${reservationTable([...(reservations.pending || []), ...(reservations.recent || [])], { own: true })}</section>`;
    }
    if (isAdmin()) {
      const datalist = `<datalist id="productCategories">${[...new Set([...CATEGORY_SUGGESTIONS, ...state.products.map(p => p.category)])].map(c => `<option value="${esc(c)}">`).join("")}</datalist>`;
      const manage = table(["Producto", "Categoría", "Precio", "Stock", "Estado", "Acciones"], state.products.map(p => row([
        esc(p.name), esc(p.category), esc(priceLabel(p.price)),
        p.available ? "Disponible" : "Sin stock",
        p.active ? `<span class="badge success">Visible</span>` : `<span class="badge">Oculto</span>`,
        `<button class="button ghost small" type="button" data-action="edit-product" data-id="${esc(p.id)}">Editar</button>
         <button class="button ghost small" type="button" data-action="toggle-product-stock" data-id="${esc(p.id)}" data-value="${p.available ? "false" : "true"}">${p.available ? "Marcar sin stock" : "Hay stock"}</button>
         <button class="button ghost small" type="button" data-action="toggle-product-active" data-id="${esc(p.id)}" data-value="${p.active ? "false" : "true"}">${p.active ? "Ocultar" : "Mostrar"}</button>`
      ])));
      extra = `<section class="panel" style="margin-top:16px"><h2 class="section-title">Reservas pendientes (${(reservations.pending || []).length})</h2>
          ${reservationTable(reservations.pending || [], { admin: true })}</section>
        <div class="two-col" style="margin-top:16px">
          ${form("Nuevo producto", "create-product",
            field("Nombre", "name", "text", { required: true, maxLength: 120, placeholder: "Ej. Whey protein 1 kg" }) +
            `<div class="field"><label for="f-category">Categoría</label><input id="f-category" name="category" list="productCategories" required maxlength="60" placeholder="Ej. Proteínas">${datalist}</div>` +
            field("Precio (vacío = consultar)", "price", "number", { min: 0, step: "0.01" }) +
            selectField("Stock", "available", [{ value: "true", label: "Disponible" }, { value: "false", label: "Sin stock" }], "true") +
            textareaField("Descripción", "description", { rows: 3, maxLength: 1000 }), "Agregar producto",
            "Los miembros ven el catálogo y reservan; el cobro y la entrega se hacen en el mostrador.")}
          <section class="panel"><h2 class="section-title">Productos (${state.products.length})</h2>${manage}</section>
        </div><div id="productEditor"></div>
        <section class="panel" style="margin-top:16px"><h2 class="section-title">Últimas reservas resueltas</h2>${reservationTable(reservations.recent || [], { admin: true })}</section>`;
    }
    $("#pageContent").innerHTML = `${vitrine}${extra}`;
  }

  async function renderView(view = state.currentView) {
    if (state.mustChange) view = "my-password";   // con la clave temporal pendiente no hay otra pantalla
    state.currentView = view;
    stopGame();
    hideNotice();
    document.querySelectorAll(".nav-link").forEach(button => button.classList.toggle("active", button.dataset.view === view));
    try {
      if (view === "dashboard") { await renderDashboard(); await showUnreadBanner(); }
      else if (view === "members") await renderMembers();
      else if (view === "services") await renderServices();
      else if (view === "memberships") await renderMemberships();
      else if (view === "accounts") await renderAccounts();
      else if (view === "my-routine") await renderMyRoutine();
      else if (view === "attendance") await renderAttendance();
      else if (view === "schedule") await renderSchedule();
      else if (view === "schedule-templates") await renderScheduleTemplates();
      else if (view === "coaches") await renderCoaches();
      else if (view === "invitations") await renderAccess();
      else if (view === "my-password") renderPasswordChange();
      else if (view === "routines") await renderRoutines();
      else if (view === "announcements") await renderAnnouncements();
      else if (view === "institution-settings") await renderInstitutionSettings();
      else if (view === "game") await renderGame();
      else if (view === "rewards") await renderRewards();
      else if (view === "catalog") await renderCatalog();
      else renderDenied("No disponible","Esta sección todavía no está conectada.");
    } catch (error) {
      if (error?.status === 401) { setUnauthenticated(); showNotice("La sesión venció. Iniciá sesión otra vez."); return; }
      showError(error);
      $("#pageContent").innerHTML = empty("No se pudo cargar esta sección. Revisá el mensaje de error y volvé a intentar.");
    }
  }

  async function handleForm(formNode) {
    const kind = formNode.dataset.form;
    const v = name => valueOf(formNode,name);
    const optional = name => v(name) || undefined;
    const body = Object.fromEntries(new FormData(formNode).entries());
    const btn = formNode.querySelector('button[type="submit"]');
    const originalLabel = btn ? btn.textContent : "Guardar";
    if (kind === "backup") {
      if (!isAdmin()) throw new Error("Esta sección es exclusiva de administración.");
      // Sin recortar espacios: la frase tiene que ser exactamente la que se vuelva a escribir al restaurar.
      const passphrase = String(new FormData(formNode).get("passphrase") ?? "");
      if (passphrase.trim().length < 12) { showNotice("La frase debe tener al menos 12 caracteres (sin contar espacios de los costados)."); return; }
      if (passphrase !== String(new FormData(formNode).get("passphrase2") ?? "")) { showNotice("Las dos frases no coinciden."); return; }
      if (btn) { btn.disabled = true; btn.textContent = "Generando respaldo…"; }
      try {
        const { blob, filename } = await api.downloadBackup(passphrase);
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        formNode.reset();
        showNotice(`Descargaste el respaldo (${filename}). Guardalo aparte y anotá la frase: sin ella no se puede abrir.`, "success");
      } catch (error) {
        showError(error);
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = originalLabel; }
      }
      return;
    }
    if (kind === "institution-settings") {
      if (!isAdmin()) throw new Error("Esta sección es exclusiva de administración.");
      if (btn) { btn.disabled = true; btn.textContent = "Guardando…"; }
      try {
        await api.updateInstitutionSettings({
          institution_name: v("institution_name"),
          contact_email: v("contact_email"),
          contact_phone: v("contact_phone"),
          address: v("address"),
          opening_hours: v("opening_hours")
        });
        await renderView("institution-settings");
        showNotice("Configuración institucional guardada en el servidor.", "success");
      } catch (error) {
        showError(error);
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = originalLabel; }
      }
      return;
    }
    if (btn) { btn.disabled = true; btn.textContent = "Procesando…"; }
    try {
      if (kind === "record-attendance") {
        if (!(isAdmin() || isCoach())) throw new Error("Sólo administración o el profesor asignado pueden registrar asistencia.");
        const records = Array.from(formNode.querySelectorAll("[data-booking-id]"))
          .filter(input => ["true", "late", "false"].includes(input.value))
          .map(input => ({
            bookingId: input.dataset.bookingId,
            attended: input.value !== "false",
            // «Presente» pisa una llegada tarde anterior; «Ausente» no puede llevarla (la API lo rechaza).
            ...(input.value === "false" ? {} : { arrivedLate: input.value === "late" })
          }));
        if (!records.length) throw new Error("Elegí Presente, Presente (llegó tarde) o Ausente para al menos una persona antes de guardar.");
        const result = await api.updateAttendance(v("sessionId"), records);
        await renderView("schedule");
        showNotice(`Asistencia guardada: ${result.created} nuevos, ${result.updated} corregidos y ${result.unchanged} sin cambios.`, "success");
        return;
      }
      if (kind === "create-template") {
        await api.createClassTemplate({
          service_id: v("service_id"), coach_id: v("coach_id"), weekday: Number(v("weekday")),
          local_start_time: v("local_start_time"), duration_minutes: Number(v("duration_minutes")), capacity: Number(v("capacity"))
        });
        await renderView("schedule-templates");
        showNotice("Plantilla creada. Generá las clases para que aparezcan en la agenda.", "success");
        return;
      }
      if (kind === "generate-sessions") {
        const result = await api.generateClassSessions(v("from_date"), v("to_date"));
        const turnos = result.recurringBookings;
        showNotice(`Clases generadas: ${result.created} nuevas y ${result.alreadyExisting} que ya existían. Turnos fijos reservados: ${turnos.confirmed}${turnos.waitlisted ? ` (y ${turnos.waitlisted} en lista de espera)` : ""}.`, "success");
        return;
      }
      if (kind === "create-assignment") {
        await api.createTemplateAssignment(v("template_id"), { member_id: v("member_id"), starts_on: v("starts_on"), ends_on: optional("ends_on") });
        showNotice("Turno fijo asignado. Se aplicará a las clases que se generen desde ahora.", "success");
        await renderTemplateAssignments(v("template_id"));
        return;
      }
      if (kind === "select-member") {
        state.selectedMember = v("memberId");
        await renderView(state.currentView);
        return;
      }
      if (kind === "create-member") {
        const result = await api.createMember({
          full_name:v("full_name"), email:optional("email"), phone:optional("phone"), address:optional("address"),
          dni:optional("dni"), emergency_contact_name:optional("emergency_contact_name"), emergency_contact_phone:optional("emergency_contact_phone"),
          status:v("status"), joined_on:optional("joined_on"), exited_on:optional("exited_on"), notes:optional("notes")
        });
        state.selectedMember = result.member.id;
        await renderView("members");
        showNotice("Miembro creado. El alta no generó un cargo ni una cuenta de acceso.", "success");
        return;
      }
      if (kind === "edit-member") {
        const id = v("id");
        await api.updateMember(id,{
          full_name:v("full_name"),email:v("email"),phone:v("phone"),address:v("address"),dni:v("dni"),
          emergency_contact_name:v("emergency_contact_name"),emergency_contact_phone:v("emergency_contact_phone"),
          status:v("status"),joined_on:v("joined_on") || undefined,exited_on:v("exited_on") || undefined,notes:v("notes")
        });
        await renderView("members");
        showNotice("Perfil actualizado.", "success");
        return;
      }
      if (kind === "create-service") {
        await api.createService({ name:v("name"), description:optional("description"), currentPrice:optional("currentPrice") });
        await renderView("services"); showNotice("Servicio creado.", "success"); return;
      }
      if (kind === "create-membership") {
        await api.createMembership(memberId(),{
          serviceId:v("serviceId"), startsOn:v("startsOn"), endsOn:optional("endsOn"),
          billingPeriod:v("billingPeriod"), agreedPrice:v("agreedPrice"), status:"active"
        });
        await renderView("memberships"); showNotice("Membresía creada. No se generó ningún cargo automático.", "success"); return;
      }
      if (kind === "create-ledger") {
        const type = v("type");
        const payload = { type, amount:v("amount"), description:v("description"), occurred_on:v("occurred_on"),
          applied_period:optional("applied_period"), payment_method:optional("payment_method"), reference:optional("reference") };
        if (type === "adjustment") {
          const direction = v("direction");
          if (!["debit","credit"].includes(direction)) throw new Error("Elegí si el ajuste aumenta la deuda o reconoce un crédito.");
          payload.direction = direction;
        }
        const key = api.idempotencyKeyFor(formNode,"ledger",payload);
        await api.createLedgerEntry(memberId(),payload,key);
        await renderView("accounts"); showNotice("Movimiento registrado.", "success"); return;
      }
      if (kind === "create-coach") {
        await api.createCoach({ full_name:v("full_name"),discipline:v("discipline"),email:optional("email"),phone:optional("phone") });
        await renderView("coaches"); showNotice("Profesor creado.", "success"); return;
      }
      if (kind === "create-obligation") {
        await api.createCoachObligation(state.selectedCoach,{
          period:month(),agreed_amount:v("agreed_amount"),due_on:v("due_on")
        });
        showNotice("Obligación mensual configurada.", "success"); await renderCoachFinance(state.selectedCoach); return;
      }
      if (kind === "coach-payment") {
        const payload = { amount:v("amount"),paid_on:v("paid_on"),payment_method:v("payment_method"),reference:optional("reference") };
        const key = api.idempotencyKeyFor(formNode,"coach-payment",payload);
        await api.recordCoachPayment($("#coachFinanceMount").dataset.obligationId || "",payload,key);
        showNotice("Pago registrado.", "success"); await renderCoachFinance(state.selectedCoach); return;
      }
      if (kind === "coach-adjustment") {
        const payload = { amount_delta:v("amount_delta"),reason:v("reason") };
        const key = api.idempotencyKeyFor(formNode,"coach-adjustment",payload);
        await api.createCoachAdjustment($("#coachFinanceMount").dataset.obligationId || "",payload,key);
        showNotice("Ajuste registrado.", "success"); await renderCoachFinance(state.selectedCoach); return;
      }
      if (kind === "link-admin-coach") {
        const result = await api.linkCoachToAdmin({ email:v("email"), coachId:v("coachId") });
        await renderView("invitations");
        showNotice(`La cuenta ${result.email} conserva administración y ahora también tiene rol de profesor. No se creó otro usuario.`, "success");
        return;
      }
      if (kind === "change-password") {
        if (v("newPassword") !== v("repeatPassword")) throw new Error("Las dos contraseñas nuevas no coinciden.");
        await api.changePassword(v("currentPassword"), v("newPassword"));
        const wasPending = state.mustChange;
        state.mustChange = false;
        $("#portalPanel").classList.remove("password-pending");
        if (wasPending) { await renderView("dashboard"); maybeStartTour(); }
        else renderPasswordChange();
        showNotice("Contraseña actualizada.", "success");
        return;
      }
      if (kind === "edit-own-contact") {
        await api.updateMember(state.user.memberId, {
          phone:v("phone"), address:v("address"), emergency_contact_name:v("emergency_contact_name"), emergency_contact_phone:v("emergency_contact_phone")
        });
        await renderView("dashboard");
        showNotice("Tus datos de contacto se actualizaron.", "success");
        return;
      }
      if (kind === "publish-announcement") {
        await api.publishAnnouncement({ title: v("title"), body: v("body"), audience: v("audience") });
        await renderAnnouncements();
        showNotice("Aviso publicado.", "success");
        return;
      }
      if (kind === "create-product") {
        const payload = { name: v("name"), category: v("category"), available: v("available") === "true" };
        if (v("price") !== "") payload.price = Number(v("price"));
        if (v("description")) payload.description = v("description");
        await api.createProduct(payload);
        await renderCatalog();
        showNotice("Producto agregado.", "success");
        return;
      }
      if (kind === "edit-product") {
        await api.updateProduct(v("productId"), {
          name: v("name"), category: v("category"),
          price: v("price") === "" ? null : Number(v("price")),
          description: v("description") || null
        });
        await renderCatalog();
        showNotice("Producto actualizado.", "success");
        return;
      }
      if (kind === "reserve-product") {
        const payload = { quantity: Number(v("quantity")) };
        if (v("note")) payload.note = v("note");
        try { await api.reserveProduct(v("productId"), payload); }
        catch (error) { throw catalogError(error); }
        await renderCatalog();
        showNotice("¡Reservado! Pagalo y retiralo en recepción.", "success");
        return;
      }
      if (kind === "reward-settings") {
        await api.updateRewardSettings({
          rewardName: v("rewardName"),
          pointsPerReward: Number(v("pointsPerReward")),
          dailyPointsCap: Number(v("dailyPointsCap")),
          weeklyPrizeEnabled: v("weeklyPrizeEnabled") === "true"
        });
        await renderRewards();
        showNotice("Reglas guardadas.", "success");
        return;
      }
      if (kind === "create-exercise") {
        const payload = { name: v("name") };
        for (const key of ["description", "equipment", "precautions"]) if (v(key)) payload[key] = v(key);
        await api.createExercise(payload);
        await renderRoutines();
        showNotice("Ejercicio creado.", "success");
        return;
      }
      if (kind === "create-routine") {
        const payload = { name: v("name"), discipline: v("discipline"), level: v("level"), exercises: readRoutineRows(formNode) };
        if (v("notes")) payload.notes = v("notes");
        await api.createRoutine(payload);
        await renderRoutines();
        showNotice("Rutina creada.", "success");
        return;
      }
      if (kind === "create-routine-version") {
        const payload = { exercises: readRoutineRows(formNode) };
        if (v("notes")) payload.notes = v("notes");
        await api.createRoutineVersion(v("routineId"), payload);
        await renderRoutines();
        showNotice("Nueva versión creada. Las asignaciones anteriores conservan la versión que recibieron.", "success");
        return;
      }
      if (kind === "assign-routine") {
        const payload = { routineVersionId: v("routineVersionId"), startsOn: v("startsOn") };
        if (v("endsOn")) payload.endsOn = v("endsOn");
        if (v("notes")) payload.notes = v("notes");
        const memberChoice = v("memberId");
        const result = await api.assignRoutine(memberChoice, payload);
        state.routineMember = memberChoice;
        await renderRoutines();
        showNotice(result.replayed ? "Esa asignación ya existía." : "Rutina asignada.", "success");
        return;
      }
      if (kind === "select-routine-member") {
        state.routineMember = v("memberId");
        const result = await api.listRoutineAssignments(state.routineMember);
        $("#routineAssignments").innerHTML = renderAssignmentList(result.assignments || []);
        return;
      }
      throw new Error("Formulario no reconocido.");
    } catch (error) {
      showError(error);
    } finally {
      if (btn && document.body.contains(btn)) { btn.disabled = false; btn.textContent = originalLabel; }
    }
  }

  document.addEventListener("click", async event => {
    const nav = event.target.closest("[data-view]");
    if (nav) { await renderView(nav.dataset.view); return; }
    const action = event.target.closest("[data-action]");
    if (!action) return;
    try {
      if (action.dataset.action === "create-booking") {
        await api.createBooking(action.dataset.id);
        await renderView("schedule");
        showNotice("Reserva procesada por el servidor.", "success");
      }
      else if (action.dataset.action === "cancel-booking") {
        await api.cancelBooking(action.dataset.id);
        await renderView("schedule");
        showNotice("Reserva cancelada.", "success");
      }
      else if (action.dataset.action === "session-attendance") {
        await renderSessionAttendance(action.dataset.id);
      }
      else if (action.dataset.action === "toggle-template") {
        await api.updateClassTemplate(action.dataset.id, { active: action.dataset.active === "true" });
        await renderView("schedule-templates");
        showNotice(action.dataset.active === "true" ? "Plantilla activada." : "Plantilla desactivada: ya no genera clases nuevas.", "success");
      }
      else if (action.dataset.action === "template-assignments") {
        await renderTemplateAssignments(action.dataset.id);
      }
      else if (action.dataset.action === "end-assignment") {
        const ended = await api.endRecurringAssignment(action.dataset.id);
        showNotice(ended.upcomingBookingsKept > 0
          ? `Turno fijo terminado. Las ${ended.upcomingBookingsKept} reservas ya generadas se mantienen: cancelalas desde la agenda si corresponde.`
          : "Turno fijo terminado.", "success");
        await renderTemplateAssignments(action.dataset.template);
      }
      else if (action.dataset.action === "cancel-session") {
        const reason = window.prompt("Motivo de la cancelación (opcional):", "");
        if (reason === null) return;
        const cancelled = await api.cancelClassSession(action.dataset.id, reason.trim() || undefined);
        await renderView("schedule");
        showNotice(`Clase cancelada. Se liberaron ${cancelled.cancelledBookings} reservas; no se generó ningún cargo ni devolución.`, "success");
      }
      else if (action.dataset.action === "notice") {
        const kind = action.dataset.kind;
        const note = window.prompt(kind === "late" ? "¿A qué hora llegás? (opcional)" : "¿Querés dejar una nota? (opcional)", "");
        if (note === null) return;
        await api.setBookingNotice(action.dataset.id, kind, note.trim() || undefined);
        await renderView("schedule");
        showNotice(kind === "late"
          ? "Avisaste que llegás tarde: el profesor lo ve en su lista. Tu lugar sigue reservado."
          : "Avisaste que no vas: el profesor lo ve en su lista, pero tu lugar sigue reservado. Para liberarlo, cancelá la reserva (hasta 40 minutos antes).", "success");
      }
      else if (action.dataset.action === "remove-notice") {
        await api.removeBookingNotice(action.dataset.id);
        await renderView("schedule");
        showNotice("Aviso quitado.", "success");
      }
      else if (action.dataset.action === "export-my-data" || action.dataset.action === "export-member") {
        const data = await api.exportMemberData(action.dataset.id);
        downloadJson(`ikigai-datos-${action.dataset.id}.json`, data);
        showNotice("Descargaste los datos personales en un archivo: guardalo en un lugar seguro.", "success");
      }
      else if (action.dataset.action === "anonymize-member") {
        const reason = window.prompt("Anonimizar a esta persona BORRA su nombre, contacto, DNI y notas y cierra su cuenta. Se conservan los movimientos de cuenta, membresías, reservas y asistencia sin identidad. NO se puede deshacer.\n\nEscribí el motivo (por ejemplo, «pedido de la persona al darse de baja»):", "");
        if (reason === null) return;
        const sure = window.prompt("Para confirmar, escribí ANONIMIZAR:", "");
        if (sure !== "ANONIMIZAR") { showNotice("No se anonimizó nada: la confirmación no coincide."); return; }
        const result = await api.anonymizeMember(action.dataset.id, reason);
        await renderView("members");
        showNotice(result.alreadyAnonymized ? "Esa persona ya estaba anonimizada." : "Persona anonimizada. Se conservó su historial de cuenta y asistencia sin identidad.", "success");
      }
      else if (action.dataset.action === "refresh-schedule") {
        await renderView("schedule");
      }
      if (action.dataset.action === "members-prev") {
        state.memberOffset = Math.max(0, state.memberOffset - state.memberPageSize);
        await renderView("members");
      }
      else if (action.dataset.action === "members-next") {
        if (state.memberOffset + state.memberPageSize < state.memberTotal) {
          state.memberOffset += state.memberPageSize;
          await renderView("members");
        }
      }
      else if (action.dataset.action === "edit-member") await renderMemberEdit(action.dataset.id);
      else if (action.dataset.action === "edit-service") {
        const service = state.services.find(s => s.id === action.dataset.id);
        if (!service) return;
        const mount = $("#pageContent");
        const old = $("#serviceEditMount");
        if (old) old.remove();
        const div = document.createElement("div"); div.id = "serviceEditMount"; div.style.marginTop = "16px";
        div.innerHTML = form("Editar servicio","edit-service",
          field("ID","id","text",{value:service.id,wide:true})+
          field("Nombre","name","text",{required:true,value:service.name})+
          field("Precio actual","currentPrice","number",{min:"0",step:"0.01",value:service.current_price ?? ""})+
          field("Descripción","description","text",{value:service.description || "",wide:true})+
          selectField("Estado","active",[{value:"true",label:"Activo"},{value:"false",label:"Inactivo"}],String(service.active)),
          "Guardar cambios");
        mount.append(div);
        const idInput = div.querySelector('[name="id"]'); if (idInput) idInput.readOnly = true;
        div.scrollIntoView({behavior:"smooth",block:"start"});
      }
      else if (action.dataset.action === "end-membership") {
        const endedOn = window.prompt("Fecha de finalización (AAAA-MM-DD):",today());
        if (!endedOn) return;
        await api.endMembership(action.dataset.id,endedOn);
        await renderView("memberships"); showNotice("Membresía finalizada.", "success");
      }
      else if (action.dataset.action === "coach-finance") {
        await renderCoachFinance(action.dataset.id);
        const mount = $("#coachFinanceMount"); if (mount) mount.dataset.coachId = action.dataset.id;
      }
      else if (action.dataset.action === "copy-credentials") {
        if (!state.lastCredentials) throw new Error("No hay un acceso para copiar.");
        await navigator.clipboard.writeText(state.lastCredentials);
        showNotice("Mensaje copiado al portapapeles.", "success");
      }
      else if (action.dataset.action === "create-account") {
        action.disabled = true;
        const role = action.dataset.roleKind;
        const result = await api.createAccount(role === "member" ? { role, memberId: action.dataset.profile } : { role, coachId: action.dataset.profile });
        await renderAccess();
        showCredentials(`Acceso creado (${ROLE_NAME[role] || role})`, result.account.fullName, result.account.username, result.temporaryPassword);
      }
      else if (action.dataset.action === "reset-account") {
        if (!window.confirm(`¿Restablecer la clave de ${action.dataset.name}? Se cierran sus sesiones y tendrá que elegir una nueva.`)) return;
        const result = await api.resetAccountPassword(action.dataset.user);
        await renderAccess();
        showCredentials("Clave restablecida", action.dataset.name, result.username, result.temporaryPassword);
      }
      else if (action.dataset.action === "disable-account") {
        if (!window.confirm(`¿Deshabilitar el acceso de ${action.dataset.name}? Se cierran sus sesiones y no podrá entrar hasta que lo habilites de nuevo. No se borra nada de su historial.`)) return;
        await api.disableAccount(action.dataset.user);
        await renderAccess();
        showNotice(`Acceso de ${action.dataset.name} deshabilitado.`, "success");
      }
      else if (action.dataset.action === "enable-account") {
        await api.enableAccount(action.dataset.user);
        await renderAccess();
        showNotice(`Acceso de ${action.dataset.name} habilitado.`, "success");
      }
      else if (action.dataset.action === "read-announcement") {
        await api.markAnnouncementRead(action.dataset.id);
        await renderAnnouncements();
      }
      else if (action.dataset.action === "read-all-announcements") {
        const pending = [...document.querySelectorAll(".notice-card.is-unread")].map(node => node.dataset.announcement);
        for (const announcementId of pending) await api.markAnnouncementRead(announcementId);
        await renderAnnouncements();
      }
      else if (action.dataset.action === "archive-announcement") {
        if (!window.confirm("¿Archivar este aviso? Deja de mostrarse para todos.")) return;
        await api.archiveAnnouncement(action.dataset.id);
        await renderAnnouncements();
        showNotice("Aviso archivado.", "success");
      }
      else if (action.dataset.action === "add-routine-row") {
        action.closest("form").querySelector("[data-routine-rows]").insertAdjacentHTML("beforeend", exerciseRow());
      }
      else if (action.dataset.action === "remove-routine-row") {
        const rows = action.closest("[data-routine-rows]");
        if (rows.children.length > 1) action.closest(".routine-row").remove();
      }
      else if (action.dataset.action === "pick-routine") {
        const select = document.querySelector('form[data-form="assign-routine"] [name="routineVersionId"]');
        if (select) { select.value = action.dataset.version; select.scrollIntoView({ behavior: "smooth", block: "center" }); select.focus(); }
      }
      else if (action.dataset.action === "edit-routine") {
        const routine = state.routines.find(r => r.id === action.dataset.id);
        if (!routine) return;
        const editor = $("#routineEditor");
        editor.innerHTML = `<section class="panel" style="margin-top:16px"><h2 class="section-title">Nueva versión de «${esc(routine.name)}»</h2>
          <form data-form="create-routine-version"><input type="hidden" name="routineId" value="${esc(routine.id)}">
          <div class="form-grid">${field("Qué cambia en esta versión", "notes", "text", { maxLength: 2000, wide: true })}</div>
          ${routineBuilder(routine.exercises || [])}
          <div class="form-actions"><button class="button primary" type="submit">Crear versión ${esc(Number(routine.version_number) + 1)}</button></div>
          <p class="footer-note">Las rutinas ya asignadas conservan la versión que recibieron; la nueva se asigna aparte.</p></form></section>`;
        editor.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      else if (action.dataset.action === "redeem-reward") {
        if (!window.confirm(`¿Entregar el premio a ${action.dataset.name}? Se descuentan los puntos de su saldo.`)) return;
        action.disabled = true;
        try { await api.redeemReward(action.dataset.id, Number(action.dataset.balance)); }
        catch (error) { throw gameError(error); }
        await renderRewards();
        showNotice(`Premio entregado a ${action.dataset.name}.`, "success");
      }
      else if (action.dataset.action === "deliver-prize") {
        if (!window.confirm(`¿Registrar que ${action.dataset.name} recibió el premio semanal?`)) return;
        action.disabled = true;
        try { await api.deliverWeeklyPrize(action.dataset.week); }
        catch (error) { throw gameError(error); }
        await renderRewards();
        showNotice("Premio semanal registrado.", "success");
      }
      else if (action.dataset.action === "edit-product") {
        const p = (state.products || []).find(item => item.id === action.dataset.id);
        if (!p) return;
        const editor = $("#productEditor");
        editor.innerHTML = `<section class="panel" style="margin-top:16px"><h2 class="section-title">Editar «${esc(p.name)}»</h2>
          <form data-form="edit-product"><input type="hidden" name="productId" value="${esc(p.id)}"><div class="form-grid">
          ${field("Nombre", "name", "text", { required: true, maxLength: 120, value: p.name })}
          ${field("Categoría", "category", "text", { required: true, maxLength: 60, value: p.category })}
          ${field("Precio (vacío = consultar)", "price", "number", { min: 0, step: "0.01", value: p.price ?? "" })}
          <div class="field full-span"><label for="f-edit-description">Descripción</label><textarea id="f-edit-description" name="description" rows="3" maxlength="1000">${esc(p.description || "")}</textarea></div>
          </div><div class="form-actions"><button class="button primary" type="submit">Guardar cambios</button></div>
          <p class="footer-note">Las reservas ya hechas conservan el precio de cuando se reservaron.</p></form></section>`;
        editor.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      else if (action.dataset.action === "toggle-product-stock" || action.dataset.action === "toggle-product-active") {
        const key = action.dataset.action === "toggle-product-stock" ? "available" : "active";
        action.disabled = true;
        await api.updateProduct(action.dataset.id, { [key]: action.dataset.value === "true" });
        await renderCatalog();
      }
      else if (action.dataset.action === "deliver-reservation") {
        action.disabled = true;
        try { await api.deliverReservation(action.dataset.id); }
        catch (error) { throw catalogError(error); }
        await renderCatalog();
        showNotice(`Reserva de ${action.dataset.name} marcada como entregada.`, "success");
      }
      else if (action.dataset.action === "cancel-reservation") {
        if (!window.confirm("¿Cancelar esta reserva?")) return;
        action.disabled = true;
        try { await api.cancelReservation(action.dataset.id); }
        catch (error) { throw catalogError(error); }
        await renderCatalog();
        showNotice("Reserva cancelada.", "success");
      }
      else if (action.dataset.action === "start-tour") { startTour(); }
    } catch (error) { showError(error); }
  });

  document.addEventListener("submit", async event => {
    const formNode = event.target.closest("form[data-form]");
    if (!formNode) return;
    event.preventDefault();
    if (formNode.dataset.form === "edit-service") {
      const v = name => valueOf(formNode,name);
      const id = v("id");
      const rawPrice = v("currentPrice");
      const body = { name:v("name"), description:v("description"), currentPrice:rawPrice || null, active:v("active") === "true" };
      const button = formNode.querySelector('button[type="submit"]'); if (button) button.disabled = true;
      try {
        await api.updateService(id,body);
        await renderView("services");
        showNotice("Servicio actualizado. Las membresías históricas mantienen su precio acordado.", "success");
      } catch (error) { showError(error); if(button)button.disabled=false; }
      return;
    }
    await handleForm(formNode);
  });

  $("#loginForm").addEventListener("submit", async event => {
    event.preventDefault(); hideNotice();
    const formNode = event.currentTarget;
    const button = formNode.querySelector('button[type="submit"]');
    button.disabled = true; button.textContent = "Validando…";
    try {
      const result = await api.login(valueOf(formNode,"login"),new FormData(formNode).get("password"));
      state.mustChange = result.mustChangePassword === true;
      state.tourDone = result.tourCompleted === true;
      setAuthenticated(result.user);
      await renderView("dashboard");
      refreshUnread();
      maybeStartTour();
    } catch (error) { showError(error); }
    finally { button.disabled=false; button.innerHTML='Ingresar <span aria-hidden="true">↗</span>'; }
  });
  $("#logoutButton").addEventListener("click", async () => {
    try { await api.logout(); } catch (error) { showError(error); }
    setUnauthenticated();
  });
  $("#refreshButton").addEventListener("click", async () => {
    try { await refreshReferenceData(); await renderView(state.currentView); }
    catch (error) { showError(error); }
  });


  // ---- Guia de primer uso (globos de texto) ----
  const TOUR_STEPS = [
    { view: "dashboard", target: ".nav-link[data-view='dashboard']", title: "Bienvenido a Ikigai", text: "Esta guía te muestra, en pocos pasos, cómo dejar el gimnasio funcionando. Podés salir cuando quieras y volver a verla desde «Guía de primer uso» en el menú." },
    { view: "institution-settings", target: "form[data-form='institution-settings']", title: "1. Datos del gimnasio", text: "Empezá por acá: nombre, contacto, dirección y horario de atención. Se guardan en el servidor y los ven todos los que entran." },
    { view: "services", target: "form[data-form='create-service']", title: "2. Servicios y precios", text: "Cargá cada disciplina con su precio mensual. Si después cambiás un precio, las membresías ya acordadas conservan el suyo." },
    { view: "coaches", target: "form[data-form='create-coach']", title: "3. Profesores", text: "Creá el perfil de cada profesor con su disciplina. Desde su ficha también acordás su obligación mensual y registrás pagos." },
    { view: "members", target: "form[data-form='create-member']", title: "4. Miembros", text: "Cargá a cada persona con sus datos. Solo el nombre es obligatorio; el DNI, el teléfono y el contacto de emergencia son opcionales. Crear un miembro no genera cobros ni accesos." },
    { view: "invitations", target: "[data-tour='access-intro']", title: "5. Accesos: usuario y clave", text: "Solo vos podés crear usuarios. Tocá «Crear acceso» junto a un profesor o miembro: se genera un usuario con su nombre y una clave temporal que se muestra una sola vez. Quien entra tiene que cambiarla." },
    { view: "schedule-templates", target: "#pageContent > :first-child", title: "6. Horarios semanales", text: "Definí qué clases hay, qué día y a qué hora, con qué profesor y cuántos lugares. De ahí se generan las clases reales de cada semana." },
    { view: "routines", target: "[data-tour='routine-library']", title: "7. Rutinas", text: "Creá los ejercicios, armá rutinas con series y repeticiones, y asignalas a cada miembro con fecha de inicio. Si cambiás una rutina se crea una versión nueva: las ya asignadas no se modifican." },
    { view: "memberships", target: "#pageContent > :first-child", title: "8. Membresías", text: "Elegí un miembro y asignale un servicio con el precio acordado. La membresía no cobra sola: los cargos los registrás vos en la cuenta corriente." },
    { view: "accounts", target: "#pageContent > :first-child", title: "9. Cuenta corriente", text: "Acá anotás cargos, pagos (completos o parciales) y ajustes. Los movimientos no se editan ni se borran: si algo se cargó mal, se corrige con un ajuste." },
    { view: "schedule", target: "#pageContent > :first-child", title: "10. Agenda y asistencia", text: "La agenda muestra las clases y sus reservas. Los profesores toman asistencia desde su cuenta; vos también podés hacerlo y corregirla." },
    { view: "announcements", target: "#pageContent > :first-child", title: "11. Avisos", text: "Publicá un aviso para todos, solo para miembros o solo para profesores. Cada persona lo ve en «Avisos», con un contador de los que todavía no leyó. Es un aviso general: no escribas datos personales." },
    { view: "dashboard", target: ".nav-link[data-action='start-tour']", title: "Listo", text: "Eso es todo para empezar. Si necesitás repasar algo, tocá «Guía de primer uso» y la guía vuelve a empezar." }
  ];
  function markTourDone() {
    state.tourDone = true;
    api.markTourCompleted().catch(() => { /* si falla, la guia se ofrece otra vez en el proximo ingreso: no es grave */ });
  }
  function startTour() {
    if (!window.IkigaiTour || !isAdmin() || state.mustChange) return;
    window.IkigaiTour.start(TOUR_STEPS, { navigate: view => renderView(view), onClose: markTourDone });
  }
  function maybeStartTour() { if (isAdmin() && !state.mustChange && !state.tourDone) startTour(); }

  function hideBootSplash() {
    const splash = $("#bootSplash");
    if (!splash) return;
    splash.classList.add("is-done");
    setTimeout(() => splash.remove(), 400);
  }
  async function boot() {
    // Textos de desarrollo (URL de la API local): solo se muestran en localhost, nunca a quien usa la app instalada.
    if (!["localhost", "127.0.0.1"].includes(window.location.hostname)) document.querySelectorAll("[data-dev-only]").forEach(el => el.remove());
    try { await bootSession(); } finally { hideBootSplash(); }
  }
  async function bootSession() {
    $("#connectionLabel").textContent = "API";
    if (api.configurationError) {
      showNotice(api.configurationError);
      return;
    }
    try {
      const result = await api.me();
      state.mustChange = result.mustChangePassword === true;
      state.tourDone = result.tourCompleted === true;
      setAuthenticated(result.user);
      await renderView("dashboard");
      refreshUnread();
      maybeStartTour();
    } catch (error) {
      setUnauthenticated();
      if (error.status !== 401) showError(error);
    }
  }
  // Dos formularios de una misma pantalla pueden tener un campo con el mismo nombre (por ejemplo
  // «email» al invitar a un miembro y a un profesor): los id repetidos rompen la asociacion
  // etiqueta-campo para lectores de pantalla. Se desambiguan dentro de cada formulario.
  function uniqueFormIds(root) {
    const seen = new Map();
    root.querySelectorAll("[id]").forEach(node => seen.set(node.id, (seen.get(node.id) || 0) + 1));
    root.querySelectorAll("form[data-form]").forEach(formNode => {
      formNode.querySelectorAll("[id]").forEach(node => {
        if (seen.get(node.id) < 2) return;
        const previous = node.id;
        node.id = `${formNode.dataset.form}-${previous}`;
        formNode.querySelectorAll(`label[for="${previous}"]`).forEach(label => { label.htmlFor = node.id; });
      });
    });
  }
  new MutationObserver(() => uniqueFormIds($("#pageContent"))).observe($("#pageContent"), { childList: true, subtree: true });
  boot();
})();
