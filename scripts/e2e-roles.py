"""Prueba de aceptacion por rol en un navegador real (Playwright + Chromium).

Recorre el ciclo completo con tres personas distintas, cada una en su propio contexto:
  administracion -> crea servicio, profesor, miembro, plantilla semanal y clases, e INVITA
                    al miembro y al profesor desde la pantalla «Accesos»;
  miembro        -> activa su cuenta desde el enlace, reserva y cancela una clase, ve su
                    asistencia, y NO ve ni puede usar lo exclusivo de administracion;
  profesor       -> activa su cuenta, ve su agenda y toma asistencia de una clase pasada.

Requisitos: API en marcha sobre una base DESCARTABLE y vacia (migrada y con un
administrador creado con `npm run admin:create`), portal servido en E2E_BASE, el
contenedor de PostgreSQL de pruebas accesible con `docker exec` (E2E_PG_CONTAINER, usuario,
base) y `pip install playwright && playwright install chromium`. Crea datos con nombres
fijos: no sirve para correr dos veces sobre la misma base. No lo ejecuta el CI.
Variables: E2E_BASE, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_PG_CONTAINER, E2E_PG_USER,
E2E_PG_DB, E2E_OUT (capturas).
"""
import os
import re
import subprocess
import sys
import tempfile
from datetime import date, timedelta

from playwright.sync_api import expect, sync_playwright

OUT = os.environ.get("E2E_OUT", tempfile.gettempdir())
BASE = os.environ.get("E2E_BASE", "http://localhost:8000")
IGNORE_TLS = os.environ.get("E2E_IGNORE_HTTPS_ERRORS") == "1"  # certificado interno de Caddy en pruebas locales
ADMIN_EMAIL = os.environ.get("E2E_ADMIN_EMAIL", "admin.e2e@example.test")
ADMIN_PASSWORD = os.environ.get("E2E_ADMIN_PASSWORD", "clave-e2e-segura-2026")
PG = (os.environ.get("E2E_PG_CONTAINER", "ikigai-pg"), os.environ.get("E2E_PG_USER", "ikigai"), os.environ.get("E2E_PG_DB", "ikigai_test"))
MEMBER_EMAIL = "socia.e2e@example.test"
COACH_EMAIL = "profe.e2e@example.test"
MEMBER_PASSWORD = "clave-socia-e2e-2026"
COACH_PASSWORD = "clave-profe-e2e-2026"
problems = []


def sql(statement):
    result = subprocess.run(["docker", "exec", PG[0], "psql", "-U", PG[1], "-d", PG[2], "-tAc", statement],
                            capture_output=True, text=True, check=True)
    return result.stdout.strip()


def new_page(browser):
    page = browser.new_context(ignore_https_errors=IGNORE_TLS, viewport={"width": 1280, "height": 900}, locale="es-AR").new_page()
    page.on("pageerror", lambda e: problems.append(f"pageerror: {e}"))
    return page


def login(page, email, password):
    page.goto(f"{BASE}/portal.html")
    page.fill("#loginEmail", email)
    page.fill("#loginPassword", password)
    page.click("#loginForm button[type=submit]")
    page.wait_for_selector("#logoutButton:visible", timeout=15000)


def invite(page, kind, email):
    page.click('button[data-view="invitations"]')
    form = page.locator(f'form[data-form="invite-{kind}"]')
    form.wait_for()
    form.locator('input[name="email"]').fill(email)
    form.locator('button[type=submit]').click()
    page.wait_for_selector(".token-box code")
    link = page.locator(".token-box code").inner_text().strip()
    assert "/accept-invitation.html#token=" in link, link
    return link


def accept(browser, link, password):
    page = new_page(browser)
    page.goto(link)
    # el token sale de la barra de direcciones apenas se lee
    page.wait_for_selector("#acceptForm:visible")
    assert "token" not in page.url, page.url
    page.fill("#newPassword", password)
    page.fill("#confirmPassword", password)
    page.click("#acceptForm button[type=submit]")
    page.wait_for_selector("text=Tu cuenta quedó activada")
    # el enlace es de un solo uso: volver a usarlo se rechaza con un mensaje claro
    page.goto("about:blank")  # un cambio solo de fragmento no recarga la pagina
    page.goto(link)
    page.fill("#newPassword", password)
    page.fill("#confirmPassword", password)
    page.click("#acceptForm button[type=submit]")
    page.wait_for_selector("text=no es válida, venció o ya se usó")
    page.context.close()


with sync_playwright() as p:
    browser = p.chromium.launch()

    # ------------------------------------------------------------------ administracion
    admin = new_page(browser)
    login(admin, ADMIN_EMAIL, ADMIN_PASSWORD)
    ids = admin.evaluate("""async () => {
      const first = r => r.service?.id ?? r.coach?.id ?? r.member?.id ?? r.id;
      const service = first(await IkigaiApi.createService({ name: 'Funcional rol E2E' }));
      const coach = first(await IkigaiApi.createCoach({ full_name: 'Profe rol E2E', discipline: 'Funcional', email: 'profe.e2e@example.test' }));
      const member = first(await IkigaiApi.createMember({ full_name: 'Socia rol E2E', email: 'socia.e2e@example.test', status: 'active' }));
      return { service, coach, member };
    }""")
    weekday = (date.today() + timedelta(days=3)).isoweekday() % 7
    admin.evaluate("""async ({ ids, weekday }) => {
      const tpl = await IkigaiApi.createClassTemplate({ service_id: ids.service, coach_id: ids.coach, weekday, local_start_time: '19:30', duration_minutes: 60, capacity: 5 });
      const today = new Date().toISOString().slice(0, 10);
      const to = new Date(Date.now() + 13 * 86400000).toISOString().slice(0, 10);
      await IkigaiApi.generateClassSessions(today, to);
    }""", {"ids": ids, "weekday": weekday})
    member_link = invite(admin, "member", MEMBER_EMAIL)
    coach_link = invite(admin, "coach", COACH_EMAIL)
    # los dos formularios de invitacion no deben compartir ids (accesibilidad)
    duplicated = admin.evaluate("""() => { const ids = [...document.querySelectorAll('[id]')].map(n => n.id); return ids.filter((id, i) => ids.indexOf(id) !== i); }""")
    assert duplicated == [], f"ids duplicados: {duplicated}"
    admin.screenshot(path=f"{OUT}/roles-invitaciones.png")

    # una clase ya dada, con la socia reservada, para tomar asistencia
    template_id = sql(f"SELECT id FROM class_templates WHERE coach_id='{ids['coach']}' LIMIT 1")
    sql(f"INSERT INTO class_sessions (template_id, starts_at, ends_at, capacity_snapshot) "
        f"VALUES ('{template_id}', now() - interval '3 hours', now() - interval '2 hours', 5)")
    past_session = sql(f"SELECT id FROM class_sessions WHERE template_id='{template_id}' ORDER BY starts_at LIMIT 1")
    sql(f"INSERT INTO bookings (session_id, member_id, status) VALUES ('{past_session}', '{ids['member']}', 'confirmed')")
    # el aviso de llegada tarde que la socia dejo antes de que empezara esa clase
    sql(f"INSERT INTO booking_notices (booking_id, kind, note, created_by) "
        f"SELECT b.id, 'late', 'Llego 10:15', mp.user_id FROM bookings b JOIN member_profiles mp ON mp.id = b.member_id "
        f"WHERE b.session_id = '{past_session}'")

    # ------------------------------------------------------------------ activacion de cuentas
    accept(browser, member_link, MEMBER_PASSWORD)
    accept(browser, coach_link, COACH_PASSWORD)

    # ------------------------------------------------------------------ miembro
    member = new_page(browser)
    login(member, MEMBER_EMAIL, MEMBER_PASSWORD)
    for hidden in ("members", "services", "schedule-templates", "invitations", "institution-settings"):
        assert not member.locator(f'button[data-view="{hidden}"]').is_visible(), f"el miembro ve «{hidden}»"
    member.click('button[data-view="schedule"]')
    member.wait_for_selector("table tbody tr")
    member.locator('button[data-action="create-booking"]').first.click()
    member.wait_for_selector("text=Reserva procesada")
    member.wait_for_selector('button[data-action="cancel-booking"]')
    assert "Reservada" in member.locator("table tbody tr", has=member.locator('button[data-action="cancel-booking"]')).first.inner_text()
    # avisos: informativos, no cancelan ni liberan el cupo; se pueden quitar
    fila = member.locator("table tbody tr", has=member.locator('button[data-action="cancel-booking"]')).first
    member.once("dialog", lambda d: d.accept("10:15"))
    fila.locator('button[data-action="notice"][data-kind="late"]').click()
    member.wait_for_selector("text=Avisaste que llegás tarde")
    fila = member.locator("table tbody tr", has=member.locator('button[data-action="remove-notice"]')).first
    assert "avisaste que llegás tarde" in fila.inner_text()
    assert "Reservada" in fila.inner_text(), "un aviso no debe cancelar la reserva"
    fila.locator('button[data-action="remove-notice"]').click()
    member.wait_for_selector("text=Aviso quitado")
    assert member.locator('button[data-action="remove-notice"]').count() == 0
    member.locator('button[data-action="cancel-booking"]').first.click()
    member.wait_for_selector("text=Reserva cancelada")
    # lo exclusivo de administracion se rechaza tambien por la API, aunque el cliente lo intente
    denied = member.evaluate("""async () => { try { await IkigaiApi.listCoaches(); return 'permitido'; } catch (e) { return e.status; } }""")
    assert denied == 403, f"el miembro pudo listar profesores: {denied}"
    denied = member.evaluate("""async () => { try { await IkigaiApi.generateClassSessions('2031-01-01', '2031-01-10'); return 'permitido'; } catch (e) { return e.status; } }""")
    assert denied == 403, f"el miembro pudo generar clases: {denied}"
    member.screenshot(path=f"{OUT}/roles-miembro.png")

    # ------------------------------------------------------------------ profesor
    coach = new_page(browser)
    login(coach, COACH_EMAIL, COACH_PASSWORD)
    assert not coach.locator('button[data-view="invitations"]').is_visible()
    coach.click('button[data-view="schedule"]')
    coach.wait_for_selector("table tbody tr")
    coach.locator('button[data-action="session-attendance"]').first.click()
    coach.wait_for_selector('select[data-booking-id]')
    assert "llegará tarde — «Llego 10:15»" in coach.locator(".attendance-entry").first.inner_text(), "el profesor no ve el aviso"
    coach.select_option('select[data-booking-id]', "late")
    coach.click('form[data-form="record-attendance"] button[type=submit]')
    coach.wait_for_selector("text=Asistencia guardada: 1 nuevos")
    coach.screenshot(path=f"{OUT}/roles-profesor.png")

    # ------------------------------------------------------------------ la socia ve su asistencia
    member.click('button[data-view="attendance"]')
    member.wait_for_selector("text=Presente")
    assert "Llegó tarde" in member.locator("table tbody").inner_text(), "el historial no muestra la llegada tarde"
    assert member.locator(".stat-card", has_text="Llegadas tarde").inner_text().split()[-1] == "1"
    member.screenshot(path=f"{OUT}/roles-asistencia.png")
    browser.close()

print("PROBLEMAS DE PAGINA:", problems or "ninguno")
print("E2E ROLES OK")
sys.exit(1 if problems else 0)
