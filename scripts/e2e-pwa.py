"""Prueba de aceptacion de la PWA en un navegador real (Playwright + Chromium): service worker, uso sin conexion,
recuperacion al volver la red, limites de cache y limpieza de caches viejos.

Comprueba: el service worker se activa y precachea el shell; el portal abre SIN red desde la cache; sin red un
inicio de sesion o una consulta fallan con un aviso de desconexion y nunca se presentan como hechas; al volver la
red todo se recupera; ninguna respuesta de /api/ entra en la cache; y al actualizar el service worker se borran los
caches de versiones anteriores.

Requisitos: API en marcha con un administrador existente (la prueba no modifica datos), portal servido en
E2E_BASE (localhost o HTTPS: el service worker no se registra en otros origenes) y Playwright con Chromium.
Variables: E2E_BASE, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_IGNORE_HTTPS_ERRORS. No lo ejecuta el CI.
"""
import os
import re
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get("E2E_BASE", "http://localhost:8000")
IGNORE_TLS = os.environ.get("E2E_IGNORE_HTTPS_ERRORS") == "1"
EMAIL = os.environ.get("E2E_ADMIN_EMAIL", "admin.e2e@example.test")
PASSWORD = os.environ.get("E2E_ADMIN_PASSWORD", "clave-e2e-segura-2026")
problems = []


def esperar_sw(page):
    page.evaluate("() => navigator.serviceWorker.ready.then(() => true)")
    page.wait_for_function("() => !!navigator.serviceWorker.controller || document.readyState === 'complete'")


def caches(page):
    return page.evaluate("() => caches.keys()")


with sync_playwright() as p:
    browser = p.chromium.launch()
    contexto = browser.new_context(ignore_https_errors=IGNORE_TLS, viewport={"width": 390, "height": 800}, locale="es-AR")
    page = contexto.new_page()
    page.on("pageerror", lambda e: problems.append(f"pageerror: {e}"))

    # 1. el service worker se activa y precachea el shell
    page.goto(f"{BASE}/portal.html")
    esperar_sw(page)
    page.reload()                                           # ya controlado por el service worker
    esperar_sw(page)
    nombres = caches(page)
    assert len(nombres) == 1 and re.fullmatch(r"ikigai-shell-v\d+", nombres[0]), nombres
    precacheados = page.evaluate("async n => (await (await caches.open(n)).keys()).map(r => new URL(r.url).pathname)", nombres[0])
    for esperado in ("/portal.html", "/portal.js", "/api-client.js", "/portal.css", "/sw-register.js", "/accept-invitation.html",
                     "/assets/fonts/fonts.css", "/assets/fonts/bebas-neue-400.woff2", "/manifest.webmanifest"):
        assert esperado in precacheados, f"el shell no precachea {esperado}"

    # 2. iniciar sesion y confirmar que la cache NO guarda nada de /api/
    page.fill("#loginEmail", EMAIL)
    page.fill("#loginPassword", PASSWORD)
    page.click("#loginForm button[type=submit]")
    page.wait_for_selector("#logoutButton:visible", timeout=15000)
    page.click('button[data-view="members"]')
    page.wait_for_selector("table, .empty")
    guardadas = page.evaluate("async () => { const out = []; for (const n of await caches.keys()) for (const r of await (await caches.open(n)).keys()) out.push(new URL(r.url).pathname); return out; }")
    assert not [u for u in guardadas if "/api/" in u], f"hay respuestas de la API en la cache: {guardadas}"

    # 2b. con la sesion abierta se corta la red: cada operacion falla con aviso de desconexion y NUNCA se muestra como hecha
    contexto.set_offline(True)
    page.click('button[data-view="services"]')
    page.wait_for_selector("#globalNotice:not([hidden])", timeout=15000)
    aviso = page.locator("#globalNotice")
    assert "success" not in (aviso.get_attribute("class") or ""), "se presento como hecho algo sin conexion"
    assert page.locator("#globalNotice img.notice-illustration").count() == 1, "falta la ilustracion de desconexion"
    escritura = page.evaluate("async () => { try { await IkigaiApi.createService({ name: 'No debe existir offline' }); return 'creado'; } catch (e) { return e.status; } }")
    assert escritura == 0, f"una escritura sin red devolvio {escritura}"
    contexto.set_offline(False)
    page.click('button[data-view="services"]')
    page.wait_for_selector("text=Catálogo de servicios", timeout=15000)       # se recupera al volver la red

    # 3. sin red: el portal abre desde la cache y las operaciones fallan con aviso, sin presentarse como hechas
    contexto.set_offline(True)
    page.reload()
    page.wait_for_selector("#logoutButton, #loginForm", state="attached", timeout=15000)
    assert "Ikigai" in page.title(), page.title()
    estaba_logueado = page.locator("#logoutButton").is_visible()
    page.click('button[data-view="services"]') if estaba_logueado else None
    page.wait_for_timeout(1500)
    if estaba_logueado:
        aviso = page.locator("#globalNotice")
        assert not aviso.get_attribute("class").__contains__("success"), "se presento como hecho algo sin conexion"
        assert not aviso.is_hidden(), "no hubo aviso de desconexion"
        assert page.locator("#globalNotice img.notice-illustration").count() == 1, "falta la ilustracion de desconexion"
        servicio_creado = page.evaluate("async () => { try { await IkigaiApi.createService({ name: 'No debe existir offline' }); return 'creado'; } catch (e) { return e.status; } }")
        assert servicio_creado == 0, f"una escritura sin red devolvio {servicio_creado}"
    else:
        page.fill("#loginEmail", EMAIL); page.fill("#loginPassword", PASSWORD)
        page.click("#loginForm button[type=submit]")
        page.wait_for_timeout(1500)
        assert not page.locator("#logoutButton").is_visible(), "inicio de sesion sin red"

    # 4. al volver la red, se recupera sin recargar a mano
    contexto.set_offline(False)
    page.reload()
    page.wait_for_selector("#logoutButton:visible", timeout=15000)
    page.click('button[data-view="services"]')
    page.wait_for_selector("text=Catálogo de servicios", timeout=15000)
    assert page.evaluate("async () => { const r = await IkigaiApi.listServices(); return r.services.every(s => s.name !== 'No debe existir offline'); }"), "una escritura offline quedo guardada"

    # 5. al actualizar el service worker se borran los caches de versiones anteriores
    page.evaluate("async () => { await caches.open('ikigai-shell-v0'); await caches.open('otra-cosa-vieja'); }")
    assert "ikigai-shell-v0" in caches(page)
    page.evaluate("async () => { const r = await navigator.serviceWorker.getRegistration(); await r.unregister(); }")
    page.goto("about:blank")
    page.goto(f"{BASE}/portal.html")
    esperar_sw(page)
    page.wait_for_function("async () => (await caches.keys()).every(k => !/v0$|otra-cosa-vieja/.test(k))", timeout=15000)
    final = caches(page)
    assert len(final) == 1 and re.fullmatch(r"ikigai-shell-v\d+", final[0]), final
    browser.close()

print("PROBLEMAS DE PAGINA:", problems or "ninguno")
print("E2E PWA OK")
sys.exit(1 if problems else 0)
