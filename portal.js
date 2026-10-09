(() => {
  "use strict";
  const api = window.IkigaiApi;
  const $ = (selector, root = document) => root.querySelector(selector);
  const state = { user: null, members: [], services: [], coaches: [], selectedMember: "", selectedCoach: "", currentView: "dashboard", lastToken: "" };
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
  };
  const setLoading = (message = "Consultando la API…") => {
    $("#pageContent").innerHTML = `<div class="loading">${esc(message)}</div>`;
  };
  const empty = (message, illustration = null) => `<div class="empty">${illustration ? `<img class="state-illustration empty-illustration" src="./assets/illustrations/${esc(illustration)}" alt="" aria-hidden="true">` : ""}<p>${esc(message)}</p></div>`;
  const field = (label, name, type = "text", opts = {}) => {
    const required = opts.required ? " required" : "";
    const min = opts.min !== undefined ? ` min="${esc(opts.min)}"` : "";
    const max = opts.max !== undefined ? ` max="${esc(opts.max)}"` : "";
    const step = opts.step ? ` step="${esc(opts.step)}"` : "";
    const placeholder = opts.placeholder ? ` placeholder="${esc(opts.placeholder)}"` : "";
    const value = opts.value !== undefined ? ` value="${esc(opts.value)}"` : "";
    const wide = opts.wide ? " full-span" : "";
    return `<div class="field${wide}"><label for="f-${esc(name)}">${esc(label)}</label><input id="f-${esc(name)}" name="${esc(name)}" type="${esc(type)}"${required}${min}${max}${step}${placeholder}${value}></div>`;
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
  const pageNames = { dashboard:"Resumen", members:"Miembros", services:"Servicios", memberships:"Membresías", accounts:"Cuenta corriente", coaches:"Profesores", invitations:"Accesos" };

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
    $("#accountEmail").textContent = user.email;
    $("#accountRole").textContent = (user.roles || []).map(r => ({ admin:"Administración", coach:"Profesor", member:"Miembro" }[r] || r)).join(" · ");
    $("#connectionLabel").textContent = "Sesión activa";
    $("#apiBaseLabel").textContent = api.baseUrl;
    applyRoleNavigation();
  }
  function setUnauthenticated() {
    state.user = null;
    $("#loginPanel").hidden = false;
    $("#portalPanel").hidden = true;
    $("#accountArea").hidden = true;
    $("#connectionLabel").textContent = "Sin sesión";
  }
  function setPage(title, eyebrow = "IKIGAI TRAINING") {
    $("#pageTitle").textContent = title;
    $("#pageEyebrow").textContent = eyebrow;
  }

  async function renderDashboard() {
    setPage("Resumen");
    setLoading("Cargando información de tu cuenta…");
    if (isAdmin()) {
      const [members, services, coaches] = await Promise.all([
        api.listMembers(100, 0), api.listServices(), api.listCoaches()
      ]);
      state.members = members.items || [];
      state.services = services.services || [];
      state.coaches = coaches.coaches || [];
      $("#pageContent").innerHTML = `
        <div class="stats-grid">
          <div class="stat-card"><small>Miembros registrados</small><strong>${members.total ?? state.members.length}</strong></div>
          <div class="stat-card"><small>Servicios activos</small><strong>${state.services.filter(s => s.active).length}</strong></div>
          <div class="stat-card"><small>Profesores activos</small><strong>${state.coaches.filter(c => c.active).length}</strong></div>
        </div>
        <div class="content-grid">
          <section class="panel"><h2 class="section-title">Últimos miembros</h2>${table(["Nombre","Estado","Alta"], state.members.slice(0,6).map(m => row([`<strong>${esc(m.full_name)}</strong><small class="muted">${esc(m.email || m.phone || "Sin contacto")}</small>`,statusBadge(m.status),date(m.joined_on)])))}</section>
          <section class="panel"><h2 class="section-title">Servicios disponibles</h2>${table(["Servicio","Precio actual"], state.services.slice(0,6).map(s => row([`<strong>${esc(s.name)}</strong><small class="muted">${esc(s.description || "")}</small>`,s.current_price == null ? "Sin configurar" : money(s.current_price)])))}</section>
        </div>
        <p class="footer-note">Los indicadores se consultan al servidor. Esta pantalla no lee ni modifica el localStorage de la demo anterior.</p>`;
    } else if (isMember() && state.user.memberId) {
      const [profile, memberships, ledger] = await Promise.all([
        api.getMember(state.user.memberId),
        api.listMemberships(state.user.memberId),
        api.listLedger(state.user.memberId)
      ]);
      $("#pageContent").innerHTML = `
        <div class="stats-grid">
          <div class="stat-card"><small>Estado de cuenta</small><strong>${money(ledger.balance)}</strong></div>
          <div class="stat-card"><small>Membresías</small><strong>${memberships.memberships.length}</strong></div>
          <div class="stat-card"><small>Estado del perfil</small><strong>${esc(labels[profile.member.status] || profile.member.status)}</strong></div>
        </div>
        <section class="panel"><h2 class="section-title">Mi perfil</h2>
        ${table(["Dato","Información"],[
          row(["Nombre",esc(profile.member.full_name)]),
          row(["Correo",esc(profile.member.email || "—")]),
          row(["Teléfono",esc(profile.member.phone || "—")]),
          row(["Dirección",esc(profile.member.address || "—")])
        ])}</section><p class="footer-note">Tu cuenta muestra exclusivamente información asociada a tu perfil.</p>`;
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
    const result = await api.listMembers(100, 0);
    state.members = result.items || [];
    state.selectedMember = selected(memberOptions(), state.selectedMember);
    const list = state.members.length
      ? table(["Miembro","Estado","Alta","Acciones"], state.members.map(m => row([
          `<strong>${esc(m.full_name)}</strong><small class="muted">${esc(m.email || m.phone || "Sin contacto")}</small>`,
          statusBadge(m.status),date(m.joined_on),
          `<button class="button small" type="button" data-action="edit-member" data-id="${esc(m.id)}">Ver / editar</button>`
        ])))
      : empty("Todavía no hay miembros registrados.", "empty-members.svg");
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
      <div class="panel"><div class="section-title"><span>Registro de miembros</span><span class="badge">${result.total ?? state.members.length} registros</span></div>${list}</div>
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
    if (isAdmin()) await loadMembers();
    const options = isAdmin() ? memberOptions() : memberOptions();
    state.selectedMember = selected(options, state.selectedMember || state.user.memberId);
    if (!state.selectedMember) {
      $("#pageContent").innerHTML = empty("No hay miembros disponibles.");
      return;
    }
    const result = await api.listMemberships(state.selectedMember);
    const list = table(["Servicio","Período","Desde","Hasta","Precio acordado","Estado","Acción"],(result.memberships || []).map(m => row([
      esc(m.service_name),esc(labels[m.billing_period] || m.billing_period),date(m.starts_on),date(m.ends_on),
      money(m.agreed_price),statusBadge(m.status),
      m.status !== "ended" && m.status !== "cancelled" ? `<button class="button small danger" data-action="end-membership" data-id="${esc(m.id)}" type="button">Finalizar</button>` : "—"
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
    if (isAdmin()) await loadMembers();
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

  async function renderInvitations() {
    if (!isAdmin()) throw new Error("Esta sección es exclusiva de administración.");
    setPage("Accesos");
    await Promise.all([loadMembers(),loadCoaches()]);
    const memberOpts = memberOptions();
    const coachOpts = coachOptions();
    $("#pageContent").innerHTML = `
      <div class="two-col">
        ${form("Invitar a un miembro","invite-member",selectField("Perfil de miembro","memberId",memberOpts,memberOpts[0]?.value)+field("Correo de acceso","email","email",{required:true}),"Generar invitación")}
        ${form("Invitar a un profesor","invite-coach",selectField("Perfil de profesor","coachId",coachOpts,coachOpts[0]?.value)+field("Correo de acceso","email","email",{required:true}),"Generar invitación")}
      </div>
      <div id="invitationResult" style="margin-top:16px"></div>
      <p class="footer-note">La API no envía correos todavía. El token aparece una sola vez en esta pantalla: entregalo por un canal seguro y no lo incluyas en capturas o mensajes públicos. Vence a las 24 horas.</p>`;
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

  async function renderAttendance() {
    if (!isMember() || !state.user.memberId) throw new Error("Esta sección es exclusiva del perfil de miembro.");
    setPage("Asistencia");
    setLoading("Consultando el historial de asistencia…");
    const result = await api.listAttendance(state.user.memberId);
    const records = result.records || [];
    const attendedCount = records.filter(record => record.attended === true).length;
    const missedCount = records.filter(record => record.attended === false).length;
    $("#pageContent").innerHTML = `
      <div class="stats-grid">
        <div class="stat-card"><small>Clases registradas</small><strong>${records.length}</strong></div>
        <div class="stat-card"><small>Asistencias</small><strong>${attendedCount}</strong></div>
        <div class="stat-card"><small>Ausencias</small><strong>${missedCount}</strong></div>
      </div>
      <section class="panel"><h2 class="section-title">Historial por clase</h2>
      ${table(["Fecha y hora","Clase / servicio","Registro"],records.map(record=>row([
        esc(record.starts_at ? new Date(record.starts_at).toLocaleString("es-AR",{dateStyle:"medium",timeStyle:"short"}) : date(record.recorded_at)),
        esc(record.service_name || "Clase"),
        record.attended ? '<span class="badge success">Presente</span>' : '<span class="badge warn">Ausente</span>'
      ])))}</section>
      <p class="footer-note">La asistencia queda asociada a cada clase histórica. Una corrección del registro no crea una segunda asistencia.</p>`;
  }

  function renderDenied(title, message) {
    setPage(title);
    $("#pageContent").innerHTML = empty(message);
  }

  async function renderView(view = state.currentView) {
    state.currentView = view;
    hideNotice();
    document.querySelectorAll(".nav-link").forEach(button => button.classList.toggle("active", button.dataset.view === view));
    try {
      if (view === "dashboard") await renderDashboard();
      else if (view === "members") await renderMembers();
      else if (view === "services") await renderServices();
      else if (view === "memberships") await renderMemberships();
      else if (view === "accounts") await renderAccounts();
      else if (view === "my-routine") await renderMyRoutine();
      else if (view === "attendance") await renderAttendance();
      else if (view === "coaches") await renderCoaches();
      else if (view === "invitations") await renderInvitations();
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
    if (btn) { btn.disabled = true; btn.textContent = "Procesando…"; }
    try {
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
        showNotice("Miembro creado. El alta no generó un cargo ni una cuenta de acceso.", "success");
        await renderView("members");
        return;
      }
      if (kind === "edit-member") {
        const id = v("id");
        await api.updateMember(id,{
          full_name:v("full_name"),email:v("email"),phone:v("phone"),address:v("address"),dni:v("dni"),
          emergency_contact_name:v("emergency_contact_name"),emergency_contact_phone:v("emergency_contact_phone"),
          status:v("status"),joined_on:v("joined_on") || undefined,exited_on:v("exited_on") || undefined,notes:v("notes")
        });
        showNotice("Perfil actualizado.", "success");
        await renderView("members");
        return;
      }
      if (kind === "create-service") {
        await api.createService({ name:v("name"), description:optional("description"), currentPrice:optional("currentPrice") });
        showNotice("Servicio creado.", "success"); await renderView("services"); return;
      }
      if (kind === "create-membership") {
        await api.createMembership(memberId(),{
          serviceId:v("serviceId"), startsOn:v("startsOn"), endsOn:optional("endsOn"),
          billingPeriod:v("billingPeriod"), agreedPrice:v("agreedPrice"), status:"active"
        });
        showNotice("Membresía creada. No se generó ningún cargo automático.", "success"); await renderView("memberships"); return;
      }
      if (kind === "create-ledger") {
        const type = v("type");
        const payload = { type, amount:v("amount"), description:v("description"), occurred_on:v("occurred_on"),
          applied_period:optional("applied_period"), payment_method:optional("payment_method"), reference:optional("reference") };
        if (type === "adjustment") {
          const direction = window.prompt("Dirección del ajuste: escribí 'debit' para sumar deuda o 'credit' para reconocer un crédito.");
          if (!["debit","credit"].includes(String(direction).trim().toLowerCase())) throw new Error("El ajuste necesita dirección debit o credit.");
          payload.direction = String(direction).trim().toLowerCase();
        }
        const key = `ledger-${crypto.randomUUID ? crypto.randomUUID() : Date.now()+"-"+Math.random().toString(36).slice(2)}`;
        await api.createLedgerEntry(memberId(),payload,key);
        showNotice("Movimiento registrado.", "success"); await renderView("accounts"); return;
      }
      if (kind === "create-coach") {
        await api.createCoach({ full_name:v("full_name"),discipline:v("discipline"),email:optional("email"),phone:optional("phone") });
        showNotice("Profesor creado.", "success"); await renderView("coaches"); return;
      }
      if (kind === "create-obligation") {
        await api.createCoachObligation(state.selectedCoach,{
          period:month(),agreed_amount:v("agreed_amount"),due_on:v("due_on")
        });
        showNotice("Obligación mensual configurada.", "success"); await renderCoachFinance(state.selectedCoach); return;
      }
      if (kind === "coach-payment") {
        const key = `coach-payment-${crypto.randomUUID ? crypto.randomUUID() : Date.now()+"-"+Math.random().toString(36).slice(2)}`;
        await api.recordCoachPayment($("#coachFinanceMount").dataset.obligationId || "",{
          amount:v("amount"),paid_on:v("paid_on"),payment_method:v("payment_method"),reference:optional("reference")
        },key);
        showNotice("Pago registrado.", "success"); await renderCoachFinance(state.selectedCoach); return;
      }
      if (kind === "coach-adjustment") {
        const key = `coach-adjust-${crypto.randomUUID ? crypto.randomUUID() : Date.now()+"-"+Math.random().toString(36).slice(2)}`;
        await api.createCoachAdjustment($("#coachFinanceMount").dataset.obligationId || "",{
          amount_delta:v("amount_delta"),reason:v("reason")
        },key);
        showNotice("Ajuste registrado.", "success"); await renderCoachFinance(state.selectedCoach); return;
      }
      if (kind === "invite-member" || kind === "invite-coach") {
        const role = kind === "invite-member" ? "member" : "coach";
        const payload = { email:v("email"),role };
        if (role === "member") payload.memberId = v("memberId"); else payload.coachId = v("coachId");
        const result = await api.createInvitation(payload);
        state.lastToken = result.invitationToken;
        $("#invitationResult").innerHTML = `<section class="panel"><h2 class="section-title">Invitación generada</h2><p>Cuenta: <strong>${esc(result.invitation.email)}</strong></p><p>Vence: ${esc(new Date(result.invitation.expiresAt).toLocaleString("es-AR"))}</p><div class="token-box"><strong>Token de un solo uso</strong><code>${esc(result.invitationToken)}</code><button class="button" type="button" data-action="copy-token">Copiar token</button></div><p class="footer-note">Entrega manual requerida. El token se almacena en el servidor como hash y no se puede recuperar después de abandonar esta pantalla.</p></section>`;
        showNotice("Invitación generada. Entregá el token por un canal seguro.", "success");
        return;
      }
      throw new Error("Formulario no reconocido.");
    } catch (error) {
      showError(error);
    } finally {
      if (btn && document.body.contains(btn)) { btn.disabled = false; btn.textContent = "Guardar"; }
    }
  }

  document.addEventListener("click", async event => {
    const nav = event.target.closest("[data-view]");
    if (nav) { await renderView(nav.dataset.view); return; }
    const action = event.target.closest("[data-action]");
    if (!action) return;
    try {
      if (action.dataset.action === "edit-member") await renderMemberEdit(action.dataset.id);
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
        showNotice("Membresía finalizada.", "success"); await renderView("memberships");
      }
      else if (action.dataset.action === "coach-finance") {
        await renderCoachFinance(action.dataset.id);
        const mount = $("#coachFinanceMount"); if (mount) mount.dataset.coachId = action.dataset.id;
      }
      else if (action.dataset.action === "copy-token") {
        const token = state.lastToken;
        if (!token) throw new Error("No hay un token disponible para copiar.");
        await navigator.clipboard.writeText(token);
        showNotice("Token copiado al portapapeles.", "success");
      }
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
        showNotice("Servicio actualizado. Las membresías históricas mantienen su precio acordado.", "success");
        await renderView("services");
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
      const result = await api.login(valueOf(formNode,"email"),new FormData(formNode).get("password"));
      setAuthenticated(result.user);
      await renderView("dashboard");
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

  async function boot() {
    $("#connectionLabel").textContent = "API";
    if (api.configurationError) {
      showNotice(api.configurationError);
      return;
    }
    try {
      const result = await api.me();
      setAuthenticated(result.user);
      await renderView("dashboard");
    } catch (error) {
      setUnauthenticated();
      if (error.status !== 401) showError(error);
    }
  }
  boot();
})();
