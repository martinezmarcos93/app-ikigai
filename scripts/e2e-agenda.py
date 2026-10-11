"""Prueba de aceptacion de la agenda en un navegador real (Playwright + Chromium).

Recorre: login de administracion -> plantilla semanal -> plantilla duplicada (409
legible) -> turno fijo -> generar clases (dos veces, idempotente) -> agenda con la
reserva del turno fijo -> cancelar una clase.

Requisitos: API en marcha sobre una base DESCARTABLE y vacia (migrada, con un
administrador creado con `npm run admin:create`), portal servido en E2E_BASE y
`pip install playwright && playwright install chromium`. El script crea un servicio, un
profesor y un miembro con nombres fijos: no sirve para correr dos veces sobre la misma
base. Variables: E2E_BASE, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_OUT (capturas).
No lo ejecuta el CI (necesita navegador); ver docs/ACCEPTANCE_TESTS.md.
"""
import os, re, sys, tempfile
from datetime import date, timedelta
from playwright.sync_api import sync_playwright, expect

SC = os.environ.get("E2E_OUT", tempfile.gettempdir())
BASE = os.environ.get("E2E_BASE", "http://localhost:8000")
IGNORE_TLS = os.environ.get("E2E_IGNORE_HTTPS_ERRORS") == "1"  # certificado interno de Caddy en pruebas locales
EMAIL = os.environ.get("E2E_ADMIN_EMAIL", "admin.e2e@example.test")
PASSWORD = os.environ.get("E2E_ADMIN_PASSWORD", "clave-e2e-segura-2026")
errors = []
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_context(ignore_https_errors=IGNORE_TLS, viewport={"width": 1280, "height": 900}, locale="es-AR").new_page()
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
    page.goto(f"{BASE}/portal.html")
    page.fill("#loginEmail", EMAIL)
    page.fill("#loginPassword", PASSWORD)
    page.click("#loginForm button[type=submit]")
    page.wait_for_selector("text=Resumen", timeout=15000)

    # datos de referencia por la API del propio portal (misma sesion y CSRF)
    page.evaluate("""async () => {
      await IkigaiApi.createService({ name: 'Funcional E2E' });
      await IkigaiApi.createCoach({ full_name: 'Profe E2E', discipline: 'Funcional' });
      await IkigaiApi.createMember({ full_name: 'Socia E2E', status: 'active' });
    }""")

    page.click('button[data-view="schedule-templates"]')
    page.wait_for_selector("text=Plantillas semanales")
    assert page.locator('button[data-view="schedule-templates"]').is_visible()
    page.select_option("#f-weekday", str((date.today() + timedelta(days=3)).isoweekday() % 7))
    page.fill("#f-local_start_time", "19:30")
    page.fill("#f-capacity", "1")
    page.click('form[data-form="create-template"] button[type=submit]')
    page.wait_for_selector("text=Plantilla creada")
    expect(page.locator("table tbody tr")).to_have_count(1)
    assert "19:30" in page.locator("table tbody tr").inner_text()

    # plantilla duplicada -> error legible, no 500 mudo
    page.select_option("#f-weekday", str((date.today() + timedelta(days=3)).isoweekday() % 7))
    page.fill("#f-local_start_time", "19:30")
    page.click('form[data-form="create-template"] button[type=submit]')
    page.wait_for_selector("text=already has an active class")

    # turno fijo para la socia
    page.click('button[data-action="template-assignments"]')
    page.wait_for_selector("text=Asignar turno fijo")
    page.click('form[data-form="create-assignment"] button[type=submit]')
    page.wait_for_selector("text=Turno fijo asignado")
    expect(page.locator("#assignmentsMount table tbody tr")).to_have_count(1)

    # generar clases, dos veces (idempotente)
    page.click('form[data-form="generate-sessions"] button[type=submit]')
    page.wait_for_selector("text=Clases generadas")
    first = page.locator("#globalNotice").inner_text()
    m = re.search(r"(\d+) nuevas y (\d+) que ya existían", first)
    assert m and int(m.group(1)) >= 3, first
    page.click('form[data-form="generate-sessions"] button[type=submit]')
    page.wait_for_function("document.querySelector('#globalNotice').innerText.includes('0 nuevas')")
    assert page.locator('form[data-form="generate-sessions"] button[type=submit]').inner_text().strip() == "Generar clases"
    page.screenshot(path=f"{SC}/e2e-horarios.png")

    # agenda: las clases aparecen con la socia reservada por su turno fijo
    page.click('button[data-view="schedule"]')
    page.wait_for_selector("table tbody tr")
    rows = page.locator("table tbody tr")
    assert rows.count() >= 3, rows.count()
    assert "1/1" in rows.first.inner_text(), rows.first.inner_text()
    page.screenshot(path=f"{SC}/e2e-agenda.png")

    # cancelar la primera clase
    page.once("dialog", lambda d: d.accept("Profe enfermo"))
    page.locator('button[data-action="cancel-session"]').first.click()
    page.wait_for_selector("text=Clase cancelada")
    assert "Se liberaron 1 reservas" in page.locator("#globalNotice").inner_text() or "liberaron 1" in page.locator("#globalNotice").inner_text()

    browser.close()
print("ERRORES DE CONSOLA:", [e for e in errors if "favicon" not in e] or "ninguno")
print("E2E AGENDA OK")
