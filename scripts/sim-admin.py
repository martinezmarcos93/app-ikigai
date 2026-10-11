"""Simulacion 1 — Agustin, administracion, el primer dia.

Entra con la clave temporal con la que se creo su cuenta, elige la suya, recorre la guia de primer uso y despues hace,
desde la pantalla, todo lo que administracion puede hacer: configurar el gimnasio, servicios, profesores (con su cuenta
corriente), miembros (editar, exportar, anonimizar), crear los accesos de profesores y miembros, horarios y turnos
fijos, clases, membresias, cuenta corriente, asistencia, ejercicios y rutinas (con versiones) asignadas a miembros,
avisos para todos / miembros / profesores, y consulta cada pantalla. Deja los accesos creados en el archivo de estado
para las simulaciones del profesor y del miembro.

Requisitos: API en marcha sobre una base DESCARTABLE recien migrada con el administrador creado con
`ADMIN_MUST_CHANGE_PASSWORD=1 npm run admin:create` (E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD), portal en E2E_BASE y el
contenedor de PostgreSQL de pruebas. No sirve para correrse dos veces sobre la misma base.
"""
import os
import re
import sys
from datetime import date, timedelta

from playwright.sync_api import expect, sync_playwright

from _sim import OUT, guardar_estado, Sim, sql

EMAIL = os.environ.get("E2E_ADMIN_EMAIL", "agustin@ikigai.test")
TEMPORAL = os.environ.get("E2E_ADMIN_PASSWORD", "Ikigai-Inicio-2026")
PROPIA = "clave-de-agustin-2026"
hoy = date.today()
estado = {"admin": {"usuario": EMAIL, "clave": PROPIA}}


def digits(text):
    return float(re.sub(r"[^\d,.-]", "", text).replace(".", "").replace(",", "."))


with sync_playwright() as p:
    browser = p.chromium.launch()
    s = Sim(browser, "admin")
    pg = s.page

    # ------------------------------------------------------------------ primer ingreso
    print("Primer ingreso")
    s.entrar(EMAIL, TEMPORAL)
    s.elegir_clave_propia(TEMPORAL, PROPIA)
    s.paso("clave temporal cambiada por una propia")
    expect(pg.locator(".tour-bubble")).to_be_visible(timeout=15000)
    for i in range(13):                                   # recorre toda la guia de globos, esperando a cada paso
        expect(pg.locator(".tour-bubble .tour-count")).to_have_text(f"Paso {i + 1} de 13", timeout=15000)
        pg.locator(".tour-bubble").get_by_role("button", name="Terminar" if i == 12 else "Siguiente").click()
    expect(pg.locator(".tour-bubble")).to_have_count(0)
    s.paso("guia de primer uso recorrida completa")
    assert s.vistas_visibles() == ["dashboard", "members", "services", "memberships", "accounts", "schedule", "schedule-templates",
                                   "routines", "announcements", "coaches", "invitations", "institution-settings", "my-password"], s.vistas_visibles()
    s.ir("dashboard")
    assert "PRIMER USO" in s.texto(), "base vacia: debe ofrecer el primer uso"
    s.captura("01-primer-uso")

    # ------------------------------------------------------------------ configuracion institucional
    print("Configuracion")
    s.ir("institution-settings")
    s.enviar("institution-settings", institution_name="Ikigai Training", contact_email="contacto@ikigai.example.test",
             contact_phone="+54 11 5555-0100", address="Av. Siempreviva 742", opening_hours="Lun a Vie 8 a 21 · Sáb 9 a 13")
    s.aviso("Configuración institucional guardada")
    s.paso("datos del gimnasio guardados")

    # ------------------------------------------------------------------ servicios
    print("Servicios")
    s.ir("services")
    s.enviar("create-service", name="Funcional", currentPrice="18000", description="Entrenamiento funcional")
    s.aviso("Servicio creado")
    s.enviar("create-service", name="Yoga", currentPrice="15000", description="Yoga para todos los niveles")
    s.aviso("Servicio creado")
    fila = pg.locator("table tbody tr", has_text="Yoga")
    fila.locator('button[data-action="edit-service"]').click()
    pg.wait_for_selector('form[data-form="edit-service"]')
    pg.fill('form[data-form="edit-service"] [name="currentPrice"]', "16000")
    pg.click('form[data-form="edit-service"] button[type=submit]')
    s.aviso("Servicio actualizado")
    assert digits(pg.locator("table tbody tr", has_text="Yoga").inner_text().split("Yoga para todos los niveles")[1]) == 16000.0
    s.paso("2 servicios creados y un precio editado")

    # ------------------------------------------------------------------ profesores
    print("Profesores")
    s.ir("coaches")
    s.enviar("create-coach", full_name="Florencia Moyano", discipline="Yoga", email="florencia@ikigai.example.test")
    s.aviso("Profesor creado")
    s.enviar("create-coach", full_name="Diego Ruiz", discipline="Funcional")
    s.aviso("Profesor creado")
    pg.locator("table tbody tr", has_text="Florencia Moyano").locator('button[data-action="coach-finance"]').click()
    pg.wait_for_selector('form[data-form="create-obligation"]')
    s.enviar("create-obligation", agreed_amount="40000")
    s.aviso("Obligación mensual configurada")
    pg.wait_for_selector('form[data-form="coach-payment"]')
    s.enviar("coach-payment", amount="15000", payment_method="transfer")
    s.aviso("Pago registrado")
    pg.wait_for_selector('form[data-form="coach-adjustment"]')
    s.enviar("coach-adjustment", amount_delta="-1000", reason="Clase suspendida por feriado")
    s.aviso("Ajuste registrado")
    expect(pg.locator("#coachFinanceMount")).to_contain_text("24.000", timeout=15000)   # 40.000 - 1.000 - 15.000
    s.paso("2 profesores; obligacion mensual, pago parcial y ajuste de Florencia (saldo 24.000)")

    # ------------------------------------------------------------------ miembros
    print("Miembros")
    s.ir("members")
    alta = [
        dict(full_name="Marcos Martinez", email="marcos@example.test", phone="1155550001", dni="30111222", emergency_contact_name="Rosa Martinez",
             emergency_contact_phone="1155550002", status="active", joined_on=hoy.isoformat()),
        dict(full_name="Marcos Gómez", status="active", joined_on=hoy.isoformat()),
        dict(full_name="Ana López", phone="1155550003", status="active", joined_on=hoy.isoformat()),
        dict(full_name="Lucía Prueba", status="trial", joined_on=hoy.isoformat()),
        dict(full_name="Ex Socio Baja", email="baja@example.test", dni="30999888", status="exited", joined_on="2026-01-01", exited_on=hoy.isoformat()),
    ]
    for datos in alta:
        s.enviar("create-member", **datos)
        s.aviso("Miembro creado")
    expect(pg.locator("table tbody tr")).to_have_count(5)
    # ver y editar
    pg.locator("table tbody tr", has_text="Lucía Prueba").locator('button[data-action="edit-member"]').click()
    pg.wait_for_selector('form[data-form="edit-member"]')
    pg.select_option('form[data-form="edit-member"] [name="status"]', "active")
    pg.fill('form[data-form="edit-member"] [name="phone"]', "1155550004")
    pg.click('form[data-form="edit-member"] button[type=submit]')
    s.aviso("Perfil actualizado")
    # derecho de acceso: exportar los datos de una persona
    with pg.expect_download() as descarga:
        pg.locator("table tbody tr", has_text="Ex Socio Baja").locator('button[data-action="export-member"]').click()
    import json
    exportado = json.loads(open(descarga.value.path(), encoding="utf-8").read())
    assert exportado["member"]["dni"] == "30999888"
    # derecho de supresion: anonimizar a quien dejo el gimnasio
    # Un solo handler que contesta segun el texto del dialogo: encadenar dos pg.once() deja una carrera (si el segundo
    # prompt aparece antes de registrar el handler, Playwright lo descarta y el portal lo toma como «no coincide»).
    def responder(d):
        d.accept("ANONIMIZAR" if "ANONIMIZAR" in d.message and "escrib" in d.message else "Pedido de la persona al darse de baja")
    pg.on("dialog", responder)
    pg.locator("table tbody tr", has_text="Ex Socio Baja").locator('button[data-action="anonymize-member"]').click()
    s.aviso("Persona anonimizada")
    pg.remove_listener("dialog", responder)
    assert "baja@example.test" not in pg.inner_text("table")
    s.captura("02-miembros")
    s.paso("5 miembros; edicion, exportacion de datos y anonimizacion de una baja")

    # ------------------------------------------------------------------ accesos: usuario y clave temporal
    print("Accesos")
    s.ir("invitations")
    def crear_acceso(nombre, clave_estado):
        fila = pg.locator("table tbody tr", has_text=nombre).first
        pg.evaluate("() => { const r = document.querySelector('#accountResult'); if (r) r.innerHTML = ''; }")   # no leer el acceso anterior
        fila.locator('button[data-action="create-account"]').click()
        pg.wait_for_selector('[data-testid="new-password"]', timeout=20000)
        usuario = pg.locator('[data-testid="new-username"]').inner_text().strip()
        clave = pg.locator('[data-testid="new-password"]').inner_text().strip()
        assert re.fullmatch(r"[A-Z]{2}-Ikigai-[A-Z2-9]{4}-[A-Z2-9]{4}", clave), clave
        estado[clave_estado] = {"usuario": usuario, "temporal": clave, "nombre": nombre}
        return usuario
    u_flor = crear_acceso("Florencia Moyano", "profesor")
    u_diego = crear_acceso("Diego Ruiz", "profesor2")
    u_marcos = crear_acceso("Marcos Martinez", "miembro")
    u_marcos2 = crear_acceso("Marcos Gómez", "miembro_homonimo")
    u_ana = crear_acceso("Ana López", "miembro2")
    assert u_flor == "ikigai-profesor-florencia" and u_diego == "ikigai-profesor-diego", (u_flor, u_diego)
    assert u_marcos == "ikigai-miembro-marcos", u_marcos
    assert u_marcos2 == "ikigai-miembro-marcos-gomez", f"el homonimo debe llevar apellido: {u_marcos2}"
    assert u_ana == "ikigai-miembro-ana", u_ana
    s.captura("03-accesos")
    # restablecer la clave de Diego: la anterior deja de servir
    anterior = estado["profesor2"]["temporal"]
    pg.once("dialog", lambda d: d.accept())
    pg.locator("table tbody tr", has_text="Diego Ruiz").locator('button[data-action="reset-account"]').click()
    pg.wait_for_function("() => document.querySelector('[data-testid=\"new-password\"]') && document.querySelector('.credentials-panel h2').innerText.includes('restablecida')")
    nueva = pg.locator('[data-testid="new-password"]').inner_text().strip()
    assert nueva != anterior
    estado["profesor2"]["temporal"] = nueva
    guardar_estado(estado)
    # deshabilitar y volver a habilitar el acceso de Ana: la fila lo refleja y el estado vuelve a «debe cambiar la clave»
    fila = pg.locator("table tbody tr", has_text="Ana López")
    pg.once("dialog", lambda d: d.accept())
    fila.locator('button[data-action="disable-account"]').click()
    expect(pg.locator("table tbody tr", has_text="Ana López")).to_contain_text("Acceso deshabilitado")
    assert pg.locator("table tbody tr", has_text="Ana López").locator('button[data-action="reset-account"]').count() == 0
    assert sql("SELECT status FROM users WHERE username='ikigai-miembro-ana'") == "suspended"
    pg.locator("table tbody tr", has_text="Ana López").locator('button[data-action="enable-account"]').click()
    expect(pg.locator("table tbody tr", has_text="Ana López")).to_contain_text("Debe cambiar la clave")
    assert sql("SELECT status FROM users WHERE username='ikigai-miembro-ana'") == "active"
    s.paso("acceso de Ana deshabilitado (sin boton de restablecer) y habilitado de nuevo")
    s.paso(f"accesos creados: {u_flor}, {u_diego}, {u_marcos}, {u_marcos2} (homonimo con apellido), {u_ana}; clave de Diego restablecida")

    # ------------------------------------------------------------------ horarios, turnos fijos y clases
    print("Horarios y clases")
    s.ir("schedule-templates")
    pg.wait_for_selector('form[data-form="create-template"]')
    dia = (hoy + timedelta(days=2)).isoweekday() % 7
    s.enviar("create-template", service_id="Yoga", coach_id="Florencia", weekday=["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"][dia],
             local_start_time="19:00", duration_minutes="60", capacity="8")
    s.aviso("Plantilla creada")
    s.enviar("create-template", service_id="Funcional", coach_id="Diego", weekday=["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"][(dia + 1) % 7],
             local_start_time="20:00", duration_minutes="60", capacity="10")
    s.aviso("Plantilla creada")
    pg.locator("table tbody tr", has_text="Yoga").locator('button[data-action="template-assignments"]').click()
    pg.wait_for_selector('form[data-form="create-assignment"]')
    s.enviar("create-assignment", member_id="Marcos Martinez")
    s.aviso("Turno fijo asignado")
    s.enviar("generate-sessions", from_date=hoy.isoformat(), to_date=(hoy + timedelta(days=13)).isoformat())
    s.aviso("Clases generadas")
    texto_aviso = pg.locator("#globalNotice").inner_text()
    assert re.search(r"(\d+) nuevas", texto_aviso) and int(re.search(r"(\d+) nuevas", texto_aviso).group(1)) >= 3, texto_aviso
    # activar / desactivar una plantilla
    pg.locator("table tbody tr", has_text="Funcional").locator('button[data-action="toggle-template"]').click()
    pg.wait_for_function("() => !!document.querySelector('button[data-action=\"toggle-template\"][data-active=\"true\"]')")
    pg.locator('button[data-action="toggle-template"][data-active="true"]').click()
    pg.wait_for_function("() => !document.querySelector('button[data-action=\"toggle-template\"][data-active=\"true\"]')")
    s.captura("04-horarios")
    s.paso("2 plantillas, turno fijo de Marcos, clases generadas, plantilla desactivada y reactivada")

    # ------------------------------------------------------------------ membresias y cuenta corriente
    print("Membresias y cuenta corriente")
    s.ir("memberships")
    s.elegir_miembro("Marcos Martinez")
    pg.wait_for_selector('form[data-form="create-membership"]')
    s.enviar("create-membership", startsOn=hoy.isoformat(), agreedPrice="17000")
    s.aviso("Membresía creada")
    assert "17.000" in pg.inner_text("table")
    s.ir("memberships")
    s.elegir_miembro("Ana López")
    pg.wait_for_selector('form[data-form="create-membership"]')
    s.enviar("create-membership", startsOn=hoy.isoformat(), agreedPrice="15000")
    s.aviso("Membresía creada")
    pg.once("dialog", lambda d: d.accept(hoy.isoformat()))
    pg.locator("table tbody tr").first.locator('button[data-action="end-membership"]').click()
    s.aviso("Membresía finalizada")
    s.ir("accounts")
    s.elegir_miembro("Marcos Martinez")
    pg.wait_for_selector('form[data-form="create-ledger"]')
    s.enviar("create-ledger", type="charge", amount="17000", description="Cuota del mes")
    s.aviso("Movimiento registrado")
    s.enviar("create-ledger", type="payment", amount="10000", description="Pago parcial", payment_method="Efectivo")
    s.aviso("Movimiento registrado")
    s.enviar("create-ledger", type="adjustment", direction="credit", amount="500", description="Bonificación")
    s.aviso("Movimiento registrado")
    saldo = digits(pg.locator(".stat-card", has_text="Saldo neto").inner_text().replace("Saldo neto", ""))
    assert abs(saldo) == 6500.0, f"saldo inesperado: {saldo}"            # 17.000 - 10.000 - 500
    s.captura("05-cuenta-corriente")
    s.paso("membresias creadas (una finalizada); cuenta de Marcos: cargo, pago parcial y ajuste = saldo 6.500")

    # ------------------------------------------------------------------ asistencia de una clase ya dada
    print("Agenda y asistencia")
    yoga = sql("SELECT id FROM class_templates WHERE service_id=(SELECT id FROM services WHERE name='Yoga') LIMIT 1")
    sql(f"INSERT INTO class_sessions (template_id, starts_at, ends_at, capacity_snapshot) VALUES ('{yoga}', now() - interval '3 hours', now() - interval '2 hours', 8)")
    pasada = sql(f"SELECT id FROM class_sessions WHERE template_id='{yoga}' ORDER BY starts_at LIMIT 1")
    for nombre in ("Marcos Martinez", "Ana López"):
        sql(f"INSERT INTO bookings (session_id, member_id, status) SELECT '{pasada}', id, 'confirmed' FROM member_profiles WHERE full_name='{nombre}'")
    estado["clase_pasada"] = pasada
    guardar_estado(estado)
    s.ir("schedule")
    pg.wait_for_selector("table tbody tr")
    pg.locator('button[data-action="session-attendance"]').first.click()
    pg.wait_for_selector("select[data-booking-id]")
    pg.locator("label.attendance-entry", has_text="Marcos Martinez").locator("select").select_option("true")
    pg.locator("label.attendance-entry", has_text="Ana López").locator("select").select_option("false")
    pg.click('form[data-form="record-attendance"] button[type=submit]')
    s.aviso("Asistencia guardada")
    # cancelar una clase futura libera sus reservas
    pg.once("dialog", lambda d: d.accept("Profesor enfermo"))
    pg.locator('button[data-action="cancel-session"]').last.click()
    s.aviso("Clase cancelada")
    s.captura("06-agenda")
    s.paso("asistencia de una clase pasada (1 presente, 1 ausente); una clase futura cancelada")

    # ------------------------------------------------------------------ rutinas
    print("Rutinas")
    s.ir("routines")
    for nombre, equipo in [("Sentadilla", "Barra"), ("Flexiones", "Peso corporal"), ("Plancha", "Colchoneta"), ("Remo con mancuerna", "Mancuernas")]:
        s.enviar("create-exercise", name=nombre, equipment=equipo, description=f"{nombre} con técnica controlada", precautions="Mantené la espalda neutra")
        s.aviso("Ejercicio creado")
    form = pg.locator('form[data-form="create-routine"]')
    form.locator('[name="name"]').fill("Fuerza inicial")
    form.locator('[name="discipline"]').fill("Funcional")
    form.locator('[name="level"]').fill("Inicial")
    form.locator('[name="notes"]').fill("Tres días por semana, descansando un día entre sesiones")
    def completar(fila, ejercicio, series, reps, descanso):
        fila.locator('[name="exerciseId"]').select_option(label=ejercicio)
        fila.locator('[name="sets"]').fill(series)
        fila.locator('[name="reps"]').fill(reps)
        fila.locator('[name="restSeconds"]').fill(descanso)
    completar(form.locator(".routine-row").nth(0), "Sentadilla", "3", "12", "60")
    form.locator('button[data-action="add-routine-row"]').click()
    completar(form.locator(".routine-row").nth(1), "Flexiones", "3", "10", "45")
    form.locator('button[data-action="add-routine-row"]').click()
    completar(form.locator(".routine-row").nth(2), "Plancha", "3", "30 s", "30")
    form.locator('button[type=submit]').click()
    s.aviso("Rutina creada")
    expect(pg.locator('[data-routine] .section-title', has_text="Fuerza inicial")).to_be_visible()
    # nueva version: agrega un ejercicio; la primera asignacion conserva la version 1
    pg.locator('button[data-action="pick-routine"]').first.click()
    s.enviar("assign-routine", memberId="Marcos Martinez", startsOn=hoy.isoformat(), notes="Empezá con poco peso")
    s.aviso("Rutina asignada")
    pg.locator('button[data-action="edit-routine"]').first.click()
    pg.wait_for_selector('form[data-form="create-routine-version"]')
    ed = pg.locator('form[data-form="create-routine-version"]')
    ed.locator('[name="notes"]').fill("Se suma remo para la espalda")
    ed.locator('button[data-action="add-routine-row"]').click()
    completar(ed.locator(".routine-row").nth(3), "Remo con mancuerna", "3", "10", "60")
    ed.locator('button[type=submit]').click()
    s.aviso("Nueva versión creada")
    assert "Versión 2" in pg.inner_text("[data-routine]")
    s.enviar("assign-routine", memberId="Ana López", startsOn=hoy.isoformat(), notes="Versión con remo")
    s.aviso("Rutina asignada")
    s.enviar("select-routine-member", memberId="Marcos Martinez")
    pg.wait_for_selector("#routineAssignments article")
    assert "Versión 1" in pg.inner_text("#routineAssignments") and "Sentadilla" in pg.inner_text("#routineAssignments")
    s.enviar("select-routine-member", memberId="Ana López")
    pg.wait_for_function("() => document.querySelector('#routineAssignments').innerText.includes('Versión 2')")
    s.captura("07-rutinas")
    s.paso("4 ejercicios; rutina «Fuerza inicial» v1 a Marcos y v2 (con remo) a Ana; la v1 de Marcos no cambió")

    # ------------------------------------------------------------------ avisos
    print("Avisos")
    s.ir("announcements")
    s.enviar("publish-announcement", title="Feriado del lunes", body="El lunes no hay clases. ¡Nos vemos el martes!", audience="Todos")
    s.aviso("Aviso publicado")
    s.enviar("publish-announcement", title="Cuota de octubre", body="Podés abonar hasta el 10 por transferencia o en efectivo.", audience="Solo miembros")
    s.aviso("Aviso publicado")
    s.enviar("publish-announcement", title="Reunión de profesores", body="Reunión el jueves a las 18 h para coordinar horarios.", audience="Solo profesores")
    s.aviso("Aviso publicado")
    s.enviar("publish-announcement", title="Aviso de prueba", body="Este lo archivo enseguida.", audience="Todos")
    s.aviso("Aviso publicado")
    pg.once("dialog", lambda d: d.accept())
    pg.locator("article.notice-card", has_text="Aviso de prueba").locator('button[data-action="archive-announcement"]').click()
    s.aviso("Aviso archivado")
    assert pg.locator("article.notice-card").count() == 3
    s.captura("08-avisos")
    s.paso("4 avisos publicados (todos / miembros / profesores); uno archivado")

    # ------------------------------------------------------------------ consulta de todo
    print("Consulta de todas las pantallas")
    pg.click("#refreshButton")
    for vista in ["dashboard", "members", "services", "memberships", "accounts", "schedule", "schedule-templates", "routines",
                  "announcements", "coaches", "invitations", "institution-settings", "my-password"]:
        s.ir(vista)
        s.sin_error(f"vista {vista}")
        assert "No se pudo cargar" not in s.texto(), f"la vista {vista} no cargo"
    s.paso("las 13 pantallas cargan sin errores")
    s.ir("dashboard")
    assert "PRIMER USO" not in s.texto(), "con datos cargados ya no debe ofrecer el primer uso"
    s.captura("09-resumen")

    # ------------------------------------------------------------------ el administrador tambien da clases
    print("Administracion que tambien es profesor")
    s.ir("coaches")
    s.enviar("create-coach", full_name="Agustín (profesor)", discipline="Funcional", email=EMAIL)
    s.aviso("Profesor creado")
    s.ir("invitations")
    pg.wait_for_selector('form[data-form="link-admin-coach"]')
    s.enviar("link-admin-coach", coachId="Agustín")
    s.aviso("conserva administración y ahora también tiene rol de profesor")
    s.paso("la cuenta de administracion se vinculo a un perfil de profesor")

    # ------------------------------------------------------------------ cambiar la clave desde el menu y volver a entrar
    s.ir("my-password")
    nueva_clave = "otra-clave-de-agustin-2026"
    pg.fill("#cp-current", PROPIA); pg.fill("#cp-new", nueva_clave); pg.fill("#cp-repeat", nueva_clave)
    pg.click('form[data-form="change-password"] button[type=submit]')
    s.aviso("Contraseña actualizada")
    estado["admin"]["clave"] = nueva_clave
    guardar_estado(estado)
    s.salir()
    s.entrar(EMAIL, PROPIA); s.aviso_error = None
    pg.wait_for_selector("#globalNotice:not([hidden])")
    assert "incorrect" in pg.locator("#globalNotice").inner_text().lower(), "la clave vieja no debe servir"
    s.entrar(EMAIL, nueva_clave)
    s.esperar_sesion()
    s.paso("clave cambiada desde «Mi contraseña»; la anterior ya no sirve")
    sys.exit(s.cerrar("SIMULACION 1 (administracion)"))
