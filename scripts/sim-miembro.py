"""Simulacion 3 — Marcos Martinez, miembro, desde su telefono.

Usa el acceso que le creo administracion (sim-admin.py), en una pantalla de 390 px: entra con la clave temporal, elige la suya,
comprueba que ve solo lo suyo, lee sus avisos (los generales y los de miembros, nunca los de profesores), mira su membresia,
su cuenta y su asistencia, reserva y cancela una clase y avisa que llega tarde, ve las rutinas que le asignaron (la de
administracion y la de su profesora), descarga sus datos y comprueba, tambien contra la API, que no puede ver ni tocar los de
otra persona ni nada de administracion o de profesores.
"""
import json
import sys

from playwright.sync_api import sync_playwright

from _sim import cargar_estado, guardar_estado, Sim, sql

estado = cargar_estado()
cuenta = estado["miembro"]
PROPIA = "clave-de-marcos-2026"


def perfil(nombre):
    return sql(f"SELECT id FROM member_profiles WHERE full_name = '{nombre}'")


with sync_playwright() as p:
    browser = p.chromium.launch()
    s = Sim(browser, "miembro", ancho=390, alto=844, movil=True)
    pg = s.page

    print("Primer ingreso")
    s.entrar(cuenta["usuario"], cuenta["temporal"])
    s.elegir_clave_propia(cuenta["temporal"], PROPIA)
    s.esperar_sesion()
    pg.wait_for_timeout(1500)
    assert pg.locator(".tour-bubble").count() == 0, "la guia de primer uso es solo de administracion"
    vistas = s.vistas_visibles()
    assert vistas == ["dashboard", "memberships", "accounts", "schedule", "my-routine", "attendance", "announcements", "my-password"], vistas
    s.paso(f"el miembro ve solo: {', '.join(vistas)}")
    s.ir("dashboard")
    s.captura("01-resumen")
    assert "estado de cuenta" in s.texto().lower()    # los rotulos se muestran en mayusculas por CSS

    print("Avisos")
    pg.wait_for_function("() => !document.querySelector('#announcementBadge').hidden")
    assert pg.locator("#announcementBadge").inner_text().strip() == "2"
    s.ir("announcements")
    titulos = sorted(pg.locator("article.notice-card .section-title span:first-child").all_inner_texts())
    assert titulos == ["Cuota de octubre", "Feriado del lunes"], titulos
    assert pg.locator('form[data-form="publish-announcement"]').count() == 0 and pg.locator('button[data-action="archive-announcement"]').count() == 0
    pg.click('button[data-action="read-all-announcements"]')
    pg.wait_for_function("() => document.querySelector('#announcementBadge').hidden")
    s.captura("02-avisos")
    s.paso("2 avisos (general + de miembros); sin el de profesores; leidos")

    print("Membresia, cuenta y asistencia")
    s.ir("memberships")
    t = s.texto()
    assert "Funcional" in t and "17.000" in t
    assert pg.locator('form[data-form="create-membership"]').count() == 0 and pg.locator('button[data-action="end-membership"]').count() == 0, "un miembro no gestiona membresias"
    assert pg.locator('form[data-form="select-member"]').count() == 0, "un miembro no cambia de persona"
    s.ir("accounts")
    pg.wait_for_selector(".stat-card")
    t = s.texto()
    for dato in ("6.500", "Cuota del mes", "Pago parcial", "Bonificación"):
        assert dato in t, f"falta «{dato}» en su cuenta"
    assert pg.locator('form[data-form="create-ledger"]').count() == 0, "un miembro no registra movimientos"
    s.captura("03-cuenta")
    s.ir("attendance")
    pg.wait_for_selector(".stat-card")
    t = s.texto()
    assert "presente" in t.lower(), t[:300]
    s.paso("ve su membresia (17.000), su cuenta (saldo 6.500, con sus 3 movimientos) y su asistencia; sin poder modificar nada")

    print("Agenda")
    s.ir("schedule")
    pg.wait_for_selector("table tbody tr")
    cuadro = pg.locator("table tbody tr", has=pg.locator('button[data-action="create-booking"]')).first
    cuadro.locator('button[data-action="create-booking"]').click()
    s.aviso("Reserva procesada")
    pg.wait_for_selector('button[data-action="cancel-booking"]')
    reservada = pg.locator("table tbody tr", has=pg.locator('button[data-action="cancel-booking"]')).first
    pg.once("dialog", lambda d: d.accept("Llego a las 19:15"))
    reservada.locator('button[data-action="notice"][data-kind="late"]').click()
    s.aviso("Avisaste que llegás tarde")
    reservada = pg.locator("table tbody tr", has=pg.locator('button[data-action="remove-notice"]')).first
    assert "Reservada" in reservada.inner_text(), "un aviso no cancela la reserva"
    reservada.locator('button[data-action="remove-notice"]').click()
    s.aviso("Aviso quitado")
    s.limpiar_aviso()
    pg.locator('button[data-action="cancel-booking"]').first.click()
    s.aviso("Reserva cancelada")
    s.captura("04-agenda")
    s.paso("reservo una clase, aviso que llegaba tarde, quito el aviso y cancelo la reserva")

    print("Rutinas")
    s.ir("my-routine")
    pg.wait_for_selector("text=Fuerza inicial")
    t = s.texto()
    assert "Versión 1" in t and "Versión 2" in t, "ve la de administracion (v1) y la de su profesora (v2)"
    for dato in ("Sentadilla", "Flexiones", "Plancha", "Remo con mancuerna", "Empezá con poco peso", "Subí el peso si te resulta fácil"):
        assert dato in t, f"falta «{dato}» en sus rutinas"
    s.captura("05-rutina")
    s.paso("ve sus 2 rutinas asignadas (v1 de administracion, v2 de su profesora) con ejercicios e indicaciones")

    print("Sus datos")
    s.ir("dashboard")
    pg.wait_for_selector('button[data-action="export-my-data"]')
    # rectificacion: corrige su propio telefono y quita la direccion; no puede tocar su nombre ni su DNI
    pg.fill('form[data-form="edit-own-contact"] [name="phone"]', "1166667777")
    pg.fill('form[data-form="edit-own-contact"] [name="address"]', "")
    s.limpiar_aviso()
    pg.click('form[data-form="edit-own-contact"] button[type=submit]')
    s.aviso("Tus datos de contacto se actualizaron")
    assert sql("SELECT phone || '|' || COALESCE(address, 'NULL') FROM member_profiles WHERE full_name = 'Marcos Martinez'") == "1166667777|NULL"
    assert pg.locator('form[data-form="edit-own-contact"] [name="full_name"]').count() == 0 and pg.locator('form[data-form="edit-own-contact"] [name="dni"]').count() == 0
    with pg.expect_download() as descarga:
        pg.click('button[data-action="export-my-data"]')
    exportado = json.loads(open(descarga.value.path(), encoding="utf-8").read())
    assert exportado["member"]["dni"] == "30111222" and exportado["member"]["full_name"] == "Marcos Martinez"
    assert "password" not in json.dumps(exportado).lower() and "temporal" not in json.dumps(exportado).lower(), "la descarga incluye datos de acceso"
    s.paso("descargo sus datos personales (derecho de acceso), sin datos de acceso")

    print("Lo que no puede hacer (contra la API)")
    ana, gomez = perfil("Ana López"), perfil("Marcos Gómez")
    mi_id = perfil("Marcos Martinez")
    prohibido = [
        ("listMembers", "IkigaiApi.listMembers(10, 0)", (403,)),
        ("listCoaches", "IkigaiApi.listCoaches()", (403,)),
        ("listAccounts", "IkigaiApi.listAccounts()", (403,)),
        ("createAccount", f"IkigaiApi.createAccount({{ role: 'member', memberId: '{gomez}' }})", (403,)),
        ("resetAccountPassword", f"IkigaiApi.resetAccountPassword('{sql(chr(83)+'ELECT id FROM users LIMIT 1')}')", (403,)),
        ("createService", "IkigaiApi.createService({ name: 'Intruso', currentPrice: '1' })", (403,)),
        ("publishAnnouncement", "IkigaiApi.publishAnnouncement({ title: 'x', body: 'y', audience: 'all' })", (403,)),
        ("listRoutines", "IkigaiApi.listRoutines()", (403,)),
        ("listExercises", "IkigaiApi.listExercises()", (403,)),
        ("listCoachMembers", "IkigaiApi.listCoachMembers()", (403,)),
        ("createLedgerEntry propio", f"IkigaiApi.createLedgerEntry('{mi_id}', {{ type: 'adjustment', direction: 'credit', amount: '99999', description: 'x', occurred_on: '2026-10-11' }}, 'sim-key-1')", (403,)),
        ("createMembership propia", f"IkigaiApi.createMembership('{mi_id}', {{ serviceId: '{sql('SELECT id FROM services LIMIT 1')}', startsOn: '2026-10-11', billingPeriod: 'monthly', agreedPrice: '1', status: 'active' }})", (403,)),
        ("anonymizeMember", f"IkigaiApi.anonymizeMember('{mi_id}', 'Intento de borrarse a si mismo')", (403,)),
        ("datos de otra persona", f"IkigaiApi.getMember('{ana}')", (403, 404)),
        ("cuenta de otra persona", f"IkigaiApi.listLedger('{ana}')", (403, 404)),
        ("rutinas de otra persona", f"IkigaiApi.listRoutineAssignments('{ana}')", (403, 404)),
        ("asistencia de otra persona", f"IkigaiApi.listAttendance('{ana}')", (403, 404)),
        ("exportar a otra persona", f"IkigaiApi.exportMemberData('{ana}')", (403, 404)),
        ("editar a otra persona", f"IkigaiApi.updateMember('{ana}', {{ phone: '1' }})", (403, 404)),
        ("editar su estado", f"IkigaiApi.updateMember('{mi_id}', {{ status: 'exited' }})", (403,)),
        ("asistencia de una clase", f"IkigaiApi.getSessionAttendance('{estado['clase_pasada']}')", (403, 404)),
    ]
    for nombre, expresion, esperado in prohibido:
        r = s.api(expresion)
        assert r.get("status") in esperado, f"{nombre}: se esperaba {esperado} y fue {r}"
    s.paso(f"{len(prohibido)} acciones prohibidas rechazadas por el servidor")

    print("Cambio de clave")
    s.ir("my-password")
    nueva = "otra-clave-de-marcos-2026"
    pg.fill("#cp-current", PROPIA); pg.fill("#cp-new", nueva); pg.fill("#cp-repeat", nueva)
    s.limpiar_aviso()
    pg.click('form[data-form="change-password"] button[type=submit]')
    s.aviso("Contraseña actualizada")
    s.salir()
    s.entrar(cuenta["usuario"], PROPIA)
    pg.wait_for_selector("#globalNotice:not([hidden])")
    s.entrar(cuenta["usuario"], nueva)
    s.esperar_sesion()
    estado["miembro"]["clave"] = nueva
    guardar_estado(estado)
    s.paso("clave cambiada desde «Mi contraseña»; la anterior ya no sirve")
    sys.exit(s.cerrar("SIMULACION 3 (miembro)"))
