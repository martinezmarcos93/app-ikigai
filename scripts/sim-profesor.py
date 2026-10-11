"""Simulacion 2 — Florencia, profesora de yoga.

Usa el acceso que le creo administracion (sim-admin.py): entra con la clave temporal, elige la suya, comprueba que ve solo
lo de su rol, lee sus avisos (los generales y los de profesores, nunca los de miembros), toma y corrige asistencia, mira su
cuenta, consulta la biblioteca de rutinas (solo lectura), asigna una rutina a un miembro con quien tiene clases y comprueba,
tambien contra la API, que no puede tocar a quien no es de su grupo ni nada de administracion.
"""
import sys
from datetime import date, timedelta

from playwright.sync_api import expect, sync_playwright

from _sim import cargar_estado, guardar_estado, Sim, sql

estado = cargar_estado()
cuenta = estado["profesor"]
PROPIA = "clave-de-florencia-2026"


def perfil(nombre):
    return sql(f"SELECT id FROM member_profiles WHERE full_name = '{nombre}'")


with sync_playwright() as p:
    browser = p.chromium.launch()
    s = Sim(browser, "profesor")
    pg = s.page

    print("Primer ingreso")
    s.entrar(cuenta["usuario"], cuenta["temporal"])
    s.elegir_clave_propia(cuenta["temporal"], PROPIA)
    s.paso("clave temporal cambiada por una propia")
    s.esperar_sesion()
    pg.wait_for_timeout(1500)
    assert pg.locator(".tour-bubble").count() == 0, "la guia de primer uso es solo de administracion"
    vistas = s.vistas_visibles()
    assert vistas == ["dashboard", "schedule", "routines", "announcements", "coaches", "my-password"], vistas
    assert pg.locator('button[data-action="start-tour"]').is_visible() is False
    s.paso(f"el profesor ve solo: {', '.join(vistas)}")
    s.ir("dashboard")
    s.captura("01-resumen")

    print("Avisos")
    pg.wait_for_function("() => !document.querySelector('#announcementBadge').hidden")
    assert pg.locator("#announcementBadge").inner_text().strip() == "2", pg.locator("#announcementBadge").inner_text()
    s.ir("announcements")
    titulos = sorted(pg.locator("article.notice-card .section-title span:first-child").all_inner_texts())
    assert titulos == ["Feriado del lunes", "Reunión de profesores"], titulos
    assert pg.locator('form[data-form="publish-announcement"]').count() == 0, "un profesor no publica avisos"
    assert pg.locator('button[data-action="archive-announcement"]').count() == 0
    pg.locator("article.notice-card", has_text="Reunión de profesores").locator('button[data-action="read-announcement"]').click()
    pg.wait_for_function("() => document.querySelector('#announcementBadge').innerText.trim() === '1'")
    pg.click('button[data-action="read-all-announcements"]')
    pg.wait_for_function("() => document.querySelector('#announcementBadge').hidden")
    s.captura("02-avisos")
    s.paso("2 avisos (general + de profesores); sin el de miembros; leidos con el contador bajando a 0")

    print("Agenda y asistencia")
    s.ir("schedule")
    pg.wait_for_selector("table tbody tr")
    assert pg.locator('button[data-action="cancel-session"]').count() == 0, "un profesor no cancela clases"
    pg.locator('button[data-action="session-attendance"]').first.click()
    pg.wait_for_selector("select[data-booking-id]")
    texto = s.texto()
    assert "Marcos Martinez" in texto and "Ana López" in texto
    assert "Último registro: presente" in texto and "Último registro: ausente" in texto, "ve lo que administracion registro"
    fila_ana = pg.locator("label.attendance-entry", has_text="Ana López").locator("select")
    fila_ana.select_option("late")
    s.limpiar_aviso()
    pg.click('form[data-form="record-attendance"] button[type=submit]')
    s.aviso("Asistencia guardada")
    s.captura("03-asistencia")
    s.paso("corrigio la asistencia de Ana: de ausente a presente (llego tarde)")

    print("Cuenta propia")
    s.ir("coaches")
    pg.wait_for_function("() => document.querySelector('#pageContent').innerText.includes('24.000')", timeout=20000)   # la cuenta se carga aparte
    assert pg.locator('form[data-form="create-coach"]').count() == 0, "un profesor no crea profesores"
    assert pg.locator('form[data-form="coach-payment"]').count() == 0 and pg.locator('form[data-form="create-obligation"]').count() == 0, "un profesor no se registra pagos"
    cuenta_texto = s.texto()
    for importe in ("40.000,00", "15.000,00", "1.000,00", "24.000,00"):          # el formato es es-AR; el espacio tras «$» puede ser no separable
        assert importe in cuenta_texto, f"falta {importe} en: {cuenta_texto[:400]}"
    s.captura("04-mi-cuenta")
    s.paso("ve su propia obligacion mensual (40.000), el pago (15.000), el ajuste y el saldo (24.000), sin poder modificarlos")

    print("Rutinas")
    s.ir("routines")
    pg.wait_for_selector("[data-routine]")
    assert "Fuerza inicial" in s.texto() and "Versión 2" in s.texto()
    assert pg.locator('form[data-form="create-routine"]').count() == 0 and pg.locator('form[data-form="create-exercise"]').count() == 0
    assert pg.locator('button[data-action="edit-routine"]').count() == 0, "solo administracion crea versiones"
    opciones = pg.locator('form[data-form="assign-routine"] [name="memberId"] option').all_inner_texts()
    assert sorted(opciones) == ["Ana López", "Marcos Martinez"], opciones      # solo quienes tienen clases con ella
    pg.locator('button[data-action="pick-routine"]').first.click()
    manana = (date.today() + timedelta(days=1)).isoformat()
    s.enviar("assign-routine", memberId="Marcos Martinez", startsOn=manana, notes="Subí el peso si te resulta fácil")
    s.aviso("Rutina asignada")
    s.enviar("select-routine-member", memberId="Marcos Martinez")
    pg.wait_for_selector("#routineAssignments article")
    asignadas = pg.inner_text("#routineAssignments")
    assert "Versión 1" in asignadas and "Versión 2" in asignadas, asignadas[:300]
    s.captura("05-rutinas")
    s.paso("ve la biblioteca (solo lectura), asigna la v2 a Marcos y ve que ya tenia la v1")

    print("Lo que no puede hacer (contra la API)")
    marcos_gomez = perfil("Marcos Gómez")
    diego_id = sql("SELECT id FROM coach_profiles WHERE full_name='Diego Ruiz'")
    prohibido = [
        ("listMembers", "IkigaiApi.listMembers(10, 0)", (403,)),
        ("listAccounts", "IkigaiApi.listAccounts()", (403,)),
        ("createAccount", f"IkigaiApi.createAccount({{ role: 'member', memberId: '{marcos_gomez}' }})", (403,)),
        ("createService", "IkigaiApi.createService({ name: 'Intruso', currentPrice: '1' })", (403,)),
        ("publishAnnouncement", "IkigaiApi.publishAnnouncement({ title: 'x', body: 'y', audience: 'all' })", (403,)),
        ("createExercise", "IkigaiApi.createExercise({ name: 'Intruso' })", (403,)),
        ("generateClassSessions", "IkigaiApi.generateClassSessions('2031-01-01', '2031-01-10')", (403,)),
        ("getInstitutionSettings", "IkigaiApi.getInstitutionSettings()", (403,)),
        ("asignar a un miembro ajeno", f"IkigaiApi.assignRoutine('{marcos_gomez}', {{ routineVersionId: '{sql('SELECT id FROM routine_versions ORDER BY created_at LIMIT 1')}', startsOn: '2031-01-01' }})", (404,)),
        ("rutinas de un miembro ajeno", f"IkigaiApi.listRoutineAssignments('{marcos_gomez}')", (404,)),
        ("datos de un miembro ajeno", f"IkigaiApi.getMember('{marcos_gomez}')", (403, 404)),
        ("cuenta de otro profesor", f"IkigaiApi.getCoachObligations('{diego_id}', '{date.today().strftime('%Y-%m')}')", (403, 404)),
        ("exportar datos de un miembro", f"IkigaiApi.exportMemberData('{perfil('Marcos Martinez')}')", (403, 404)),
    ]
    for nombre, expresion, esperado in prohibido:
        r = s.api(expresion)
        assert r.get("status") in esperado, f"{nombre}: se esperaba {esperado} y fue {r}"
    s.paso(f"{len(prohibido)} acciones prohibidas rechazadas por el servidor")

    print("Cambio de clave")
    s.ir("my-password")
    nueva = "otra-clave-de-florencia-2026"
    pg.fill("#cp-current", PROPIA); pg.fill("#cp-new", nueva); pg.fill("#cp-repeat", nueva)
    s.limpiar_aviso()
    pg.click('form[data-form="change-password"] button[type=submit]')
    s.aviso("Contraseña actualizada")
    s.salir()
    s.entrar(cuenta["usuario"], PROPIA)
    pg.wait_for_selector("#globalNotice:not([hidden])")
    s.entrar(cuenta["usuario"], nueva)
    s.esperar_sesion()
    estado["profesor"]["clave"] = nueva
    guardar_estado(estado)
    s.paso("clave cambiada desde «Mi contraseña»; la anterior ya no sirve")
    sys.exit(s.cerrar("SIMULACION 2 (profesor)"))
