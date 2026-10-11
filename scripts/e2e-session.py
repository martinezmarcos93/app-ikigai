"""Prueba de aceptacion de la sesion en un navegador real (Playwright + Chromium): expiracion, cierre, revocacion
por administracion y recuperacion.

Comprueba: cuando la sesion vence en el servidor, la interfaz lo dice con claridad y vuelve al inicio de sesion sin
dejar datos a la vista; volver a iniciar sesion recupera el uso normal; al cerrar sesion la cookie deja de servir
(un pedido posterior responde 401 aunque el navegador la conserve); y una revocacion de las sesiones de un usuario
por parte de administracion lo saca de inmediato.

Requisitos: API en marcha sobre una base DESCARTABLE con un administrador, portal servido en E2E_BASE, contenedor de
PostgreSQL accesible con `docker exec` (E2E_PG_CONTAINER, E2E_PG_USER, E2E_PG_DB) y Playwright con Chromium.
Variables: E2E_BASE, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_IGNORE_HTTPS_ERRORS. No lo ejecuta el CI.
"""
import os
import subprocess
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get("E2E_BASE", "http://localhost:8000")
IGNORE_TLS = os.environ.get("E2E_IGNORE_HTTPS_ERRORS") == "1"
EMAIL = os.environ.get("E2E_ADMIN_EMAIL", "admin.e2e@example.test")
PASSWORD = os.environ.get("E2E_ADMIN_PASSWORD", "clave-e2e-segura-2026")
PG = (os.environ.get("E2E_PG_CONTAINER", "ikigai-pg"), os.environ.get("E2E_PG_USER", "ikigai"), os.environ.get("E2E_PG_DB", "ikigai_test"))
problems = []


def sql(statement):
    return subprocess.run(["docker", "exec", PG[0], "psql", "-U", PG[1], "-d", PG[2], "-tAc", statement],
                          capture_output=True, text=True, check=True).stdout.strip()


def login(page):
    page.goto(f"{BASE}/portal.html")
    page.fill("#loginEmail", EMAIL)
    page.fill("#loginPassword", PASSWORD)
    page.click("#loginForm button[type=submit]")
    page.wait_for_selector("#logoutButton:visible", timeout=15000)


with sync_playwright() as p:
    browser = p.chromium.launch()
    contexto = browser.new_context(ignore_https_errors=IGNORE_TLS, viewport={"width": 1280, "height": 900}, locale="es-AR")
    page = contexto.new_page()
    page.on("pageerror", lambda e: problems.append(f"pageerror: {e}"))

    # 1. la sesion vence en el servidor: mensaje claro, vuelta al inicio de sesion, sin datos a la vista
    login(page)
    page.click('button[data-view="members"]')
    page.wait_for_selector("table, .empty")
    sql(f"UPDATE sessions SET created_at = now() - interval '8 days', expires_at = now() - interval '1 minute' WHERE user_id = (SELECT id FROM users WHERE email = '{EMAIL}')")
    page.click('button[data-view="services"]')
    page.wait_for_selector("#loginForm:visible", timeout=15000)
    assert page.locator("#globalNotice").is_visible()
    assert "venció" in page.locator("#globalNotice").inner_text(), page.locator("#globalNotice").inner_text()
    assert not page.locator("#logoutButton").is_visible()
    assert page.locator("#pageContent table").count() == 0, "quedaron datos de la sesion vencida a la vista"

    # 2. volver a iniciar sesion recupera el uso normal
    page.fill("#loginEmail", EMAIL)
    page.fill("#loginPassword", PASSWORD)
    page.click("#loginForm button[type=submit]")
    page.wait_for_selector("#logoutButton:visible", timeout=15000)
    page.click('button[data-view="services"]')
    page.wait_for_selector("text=Catálogo de servicios")

    # 3. cerrar sesion: la cookie que el navegador pudiera conservar ya no sirve
    cookie = next(c for c in contexto.cookies() if c["name"] == "ikigai_session")
    page.click("#logoutButton")
    page.wait_for_selector("#loginForm:visible", timeout=15000)
    contexto.add_cookies([cookie])                         # el navegador «conserva» la cookie vieja
    api_base = page.evaluate("() => { const u = new URL(location.href); return (u.port === '8000') ? `${u.protocol}//${u.hostname}:3001` : u.origin; }")
    respuesta = contexto.request.get(f"{api_base}/api/v1/auth/me")
    assert respuesta.status == 401, f"una sesion cerrada seguia sirviendo: {respuesta.status}"

    # 4. administracion revoca las sesiones de otra persona: queda afuera de inmediato
    login(page)
    page.evaluate("""async () => {
      const member = (await IkigaiApi.createMember({ full_name: 'Socia sesion', email: 'sesion@example.test', status: 'active' })).member;
      const inv = await IkigaiApi.createInvitation({ memberId: member.id, email: 'sesion@example.test', role: 'member' });
      await IkigaiApi.acceptInvitation(inv.invitationToken, 'clave-de-sesion-2026');
    }""")
    otra = browser.new_context(ignore_https_errors=IGNORE_TLS, locale="es-AR").new_page()
    otra.goto(f"{BASE}/portal.html")
    otra.fill("#loginEmail", "sesion@example.test")
    otra.fill("#loginPassword", "clave-de-sesion-2026")
    otra.click("#loginForm button[type=submit]")
    otra.wait_for_selector("#logoutButton:visible", timeout=15000)
    usuario = sql("SELECT id FROM users WHERE email = 'sesion@example.test'")
    page.evaluate("id => IkigaiApi.revokeUserSessions(id)", usuario)
    otra.click('button[data-view="memberships"]')
    otra.wait_for_selector("#loginForm:visible", timeout=15000)
    assert "venció" in otra.locator("#globalNotice").inner_text()
    browser.close()

print("PROBLEMAS DE PAGINA:", problems or "ninguno")
print("E2E SESION OK")
sys.exit(1 if problems else 0)
