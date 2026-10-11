"""Auditoria movil automatizada del portal (Playwright + Chromium).

Para cada ancho de pantalla de la hoja de ruta (320, 360, 390, 412, 480 px) y cada vista
clave comprueba: sin desbordamiento horizontal de la pagina, objetivos tocables de al
menos 44x44 px, campos con etiqueta, imagenes con alt y sin ids duplicados. Informa cada
incumplimiento con el selector; sale con 1 si hay alguno.

Requisitos: igual que scripts/e2e-roles.py (API con datos, portal servido, Playwright).
Variables: E2E_BASE, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_OUT (capturas), AUDIT_SHOTS=1.
"""
import os
import sys
import tempfile

from playwright.sync_api import sync_playwright

OUT = os.environ.get("E2E_OUT", tempfile.gettempdir())
BASE = os.environ.get("E2E_BASE", "http://localhost:8000")
IGNORE_TLS = os.environ.get("E2E_IGNORE_HTTPS_ERRORS") == "1"  # certificado interno de Caddy en pruebas locales
EMAIL = os.environ.get("E2E_ADMIN_EMAIL", "admin.e2e@example.test")
PASSWORD = os.environ.get("E2E_ADMIN_PASSWORD", "clave-e2e-segura-2026")
WIDTHS = [320, 360, 390, 412, 480]
VIEWS = ["dashboard", "members", "services", "memberships", "accounts", "schedule", "schedule-templates", "coaches", "invitations", "institution-settings", "routines", "announcements", "my-password"]
MIN_TARGET = 44

from _audit_js import AUDIT  # noqa: E402

report = {}
with sync_playwright() as p:
    browser = p.chromium.launch()
    for width in WIDTHS:
        ctx = browser.new_context(ignore_https_errors=IGNORE_TLS, viewport={"width": width, "height": 800}, device_scale_factor=2, has_touch=True, is_mobile=True, locale="es-AR")
        page = ctx.new_page()
        page.goto(f"{BASE}/portal.html")
        report[(width, "login")] = page.evaluate(AUDIT, MIN_TARGET)
        page.fill("#loginEmail", EMAIL)
        page.fill("#loginPassword", PASSWORD)
        page.click("#loginForm button[type=submit]")
        page.wait_for_selector("#logoutButton:visible", timeout=15000)
        for view in VIEWS:
            page.evaluate("v => document.querySelector(`.nav-link[data-view=\"${v}\"]`)?.click()", view)
            page.wait_for_timeout(700)
            report[(width, view)] = page.evaluate(AUDIT, MIN_TARGET)
            if os.environ.get("AUDIT_SHOTS") == "1":
                page.screenshot(path=f"{OUT}/movil-{width}-{view}.png")
        for extra in ("reset-password.html", "accept-invitation.html"):
            page.goto(f"{BASE}/{extra}")
            report[(width, extra)] = page.evaluate(AUDIT, MIN_TARGET)
        ctx.close()
    browser.close()

total = 0
by_issue = {}
for (width, view), issues in report.items():
    for issue in issues:
        total += 1
        by_issue.setdefault(issue, []).append(f"{width}/{view}")
for issue, where in sorted(by_issue.items(), key=lambda kv: -len(kv[1])):
    print(f"[{len(where):>3}x] {issue}\n        en: {', '.join(where[:6])}{' ...' if len(where) > 6 else ''}")
print(f"\nAnchos: {WIDTHS} · vistas auditadas: {len(report)} · incumplimientos: {total} ({len(by_issue)} distintos)")
sys.exit(1 if total else 0)
