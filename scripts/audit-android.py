"""Auditoria del portal en un Chrome Android real (emulador o telefono) por el protocolo CDP.

Cubre lo que el Chromium de escritorio no puede: instalacion como app, service worker en el Chrome movil,
modo sin conexion, teclado virtual, texto ampliado del sistema y la auditoria tactil de audit-mobile.py
sobre las pantallas con el viewport real del dispositivo.

Preparacion (emulador o telefono con depuracion USB):
    adb reverse tcp:8000 tcp:8000 && adb reverse tcp:3001 tcp:3001      # portal y API de desarrollo
    adb forward tcp:9222 localabstract:chrome_devtools_remote            # Chrome abierto en el dispositivo
Variables: ANDROID_CDP (http://localhost:9222), E2E_BASE, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_OUT,
ADB (ruta de adb). Sale con 1 si algun control falla.
"""
import os
import subprocess
import sys
import tempfile
import time

from playwright.sync_api import sync_playwright

from _audit_js import AUDIT

CDP = os.environ.get("ANDROID_CDP", "http://localhost:9222")
BASE = os.environ.get("E2E_BASE", "http://localhost:8000")
OUT = os.environ.get("E2E_OUT", os.path.join(tempfile.gettempdir(), "ikigai-android"))
EMAIL = os.environ.get("E2E_ADMIN_EMAIL", "admin@ikigai.test")
PASSWORD = os.environ.get("E2E_ADMIN_PASSWORD", "Admin-Prueba-2026!")
ADB = os.environ.get("ADB", "adb")
VIEWS = ["dashboard", "members", "services", "memberships", "accounts", "schedule", "schedule-templates", "coaches",
         "institution-settings", "routines", "announcements", "my-password"]
os.makedirs(OUT, exist_ok=True)

fallos = []


def ok(texto):
    print(f"  ✓ {texto}", flush=True)


def falla(texto):
    fallos.append(texto)
    print(f"  ✗ {texto}", flush=True)


def comprobar(condicion, texto):
    (ok if condicion else falla)(texto)


def adb(*args):
    return subprocess.run([ADB, *args], capture_output=True, text=True, check=False).stdout.strip()


def entrar(page):
    page.context.clear_cookies()  # empezar siempre sin sesion
    page.goto(f"{BASE}/portal.html")
    page.wait_for_selector("#loginEmail", timeout=15000)
    page.fill("#loginEmail", EMAIL)
    page.fill("#loginPassword", PASSWORD)
    page.click("#loginForm button[type=submit]")
    page.wait_for_selector("#logoutButton:visible", timeout=20000)


def auditar_vistas(page, etiqueta):
    total = 0
    for view in VIEWS:
        page.evaluate("v => document.querySelector(`.nav-link[data-view=\"${v}\"]`)?.click()", view)
        page.wait_for_timeout(600)
        for incidencia in page.evaluate(AUDIT, 44):
            total += 1
            falla(f"{etiqueta}/{view}: {incidencia}")
    if not total:
        ok(f"{etiqueta}: {len(VIEWS)} pantallas sin desbordes, objetivos tactiles de 44 px ni campos sin etiqueta")


with sync_playwright() as p:
    def conectar(playwright):
        for _ in range(10):
            try:
                browser = playwright.chromium.connect_over_cdp(CDP)
                ctx = browser.contexts[0]
                page = ctx.pages[0] if ctx.pages else ctx.new_page()
                page.on("pageerror", lambda e: falla(f"pageerror: {e}"))
                return page, ctx, ctx.new_cdp_session(page)
            except Exception:  # noqa: BLE001 - Chrome todavia esta reiniciando
                time.sleep(2)
        raise RuntimeError("no se pudo reconectar con Chrome")

    page, ctx, cdp = conectar(p)

    print("Dispositivo")
    info = page.evaluate("[navigator.userAgent, innerWidth, innerHeight, devicePixelRatio]")
    print(f"  {info}")

    print("Instalacion como app")
    page.goto(f"{BASE}/portal.html")
    page.wait_for_timeout(1500)
    manifest = page.evaluate("""async () => {
      const link = document.querySelector('link[rel=manifest]');
      if (!link) return null;
      const r = await fetch(link.href); return r.ok ? await r.json() : null;
    }""")
    comprobar(bool(manifest), "el manifiesto se descarga")
    if manifest:
        comprobar(manifest.get("display") in ("standalone", "fullscreen"), f"display={manifest.get('display')}")
        tamanos = {(i.get("sizes"), i.get("purpose", "any")) for i in manifest.get("icons", [])}
        comprobar(("192x192", "any") in tamanos and ("512x512", "any") in tamanos, "iconos 192 y 512")
        comprobar(("512x512", "maskable") in tamanos, "icono maskable")
    sw = page.evaluate("""async () => { const r = await navigator.serviceWorker.ready; return !!r.active; }""")
    comprobar(sw, "service worker activo en Chrome movil")
    comprobar(page.evaluate("matchMedia('(display-mode: browser)').matches"), "se ejecuta en pestana de navegador (la TWA lo cambiara a standalone)")
    comprobar(page.evaluate("document.querySelector('meta[name=theme-color]')?.content === '#080808'"), "theme-color definido")
    comprobar(page.evaluate("document.querySelector('meta[name=viewport]').content.includes('viewport-fit=cover')"), "viewport-fit=cover (areas seguras)")
    page.screenshot(path=f"{OUT}/01-login.png")

    print("Sesion y pantallas con el viewport real")
    entrar(page)
    ok("inicio de sesion")
    page.screenshot(path=f"{OUT}/02-resumen.png")
    auditar_vistas(page, "normal")

    print("Texto ampliado del sistema (accesibilidad)")
    for escala in ("1.3", "1.6"):
        adb("shell", "settings", "put", "system", "font_scale", escala)
        time.sleep(4)  # Android reinicia Chrome al cambiar la escala y la conexion CDP se cae
        page, ctx, cdp = conectar(p)
        page.goto(f"{BASE}/portal.html")
        page.wait_for_selector("#logoutButton:visible", timeout=15000)
        page.wait_for_timeout(800)
        ancho = page.evaluate("document.documentElement.scrollWidth - innerWidth")
        comprobar(ancho <= 1, f"escala {escala}: sin desborde horizontal ({ancho} px)")
        page.screenshot(path=f"{OUT}/03-texto-{escala}.png")
        auditar_vistas(page, f"texto x{escala}")
    adb("shell", "settings", "put", "system", "font_scale", "1.0")
    time.sleep(4)
    page, ctx, cdp = conectar(p)
    page.goto(f"{BASE}/portal.html")
    page.wait_for_selector("#logoutButton:visible", timeout=15000)

    print("Teclado virtual")
    page.evaluate("document.querySelector('.nav-link[data-view=\"members\"]')?.click()")
    page.wait_for_timeout(600)
    campo = page.query_selector("#view-members input:not([type=hidden]), #members input:not([type=hidden])") or page.query_selector("main input:visible")
    if campo:
        campo.scroll_into_view_if_needed()
        campo.tap()
        page.wait_for_timeout(1200)
        vv = page.evaluate("[visualViewport.height, innerHeight, (() => { const r = document.activeElement.getBoundingClientRect(); return [r.top, r.bottom]; })()]")
        visible = vv[2][0] >= 0 and vv[2][1] <= vv[0] + 1
        comprobar(visible, f"el campo enfocado queda visible sobre el teclado (viewport {vv[0]:.0f}/{vv[1]} px, campo {vv[2][0]:.0f}-{vv[2][1]:.0f})")
        page.screenshot(path=f"{OUT}/04-teclado.png")
        adb("shell", "input", "keyevent", "KEYCODE_BACK")
    else:
        falla("no se encontro un campo para probar el teclado")

    print("Sin conexion")
    cdp.send("Network.enable")
    cdp.send("Network.emulateNetworkConditions", {"offline": True, "latency": 0, "downloadThroughput": 0, "uploadThroughput": 0})
    try:
        page.goto(f"{BASE}/portal.html", wait_until="domcontentloaded", timeout=15000)
        page.wait_for_timeout(1500)
        comprobar(page.evaluate("!!document.querySelector('#loginPanel, #portalPanel')"), "el shell carga sin red desde la cache")
        page.screenshot(path=f"{OUT}/05-offline.png")
    except Exception as e:  # noqa: BLE001 - se informa como fallo de la prueba
        falla(f"sin red la pagina no carga: {e}")
    cdp.send("Network.emulateNetworkConditions", {"offline": False, "latency": 0, "downloadThroughput": -1, "uploadThroughput": -1})

    print("Actualizacion del service worker")
    versiones = page.evaluate("caches.keys()")
    comprobar(sum(1 for v in versiones if v.startswith("ikigai-shell-")) == 1, f"una sola cache de shell vigente: {versiones}")

print()
print(f"Capturas en {OUT}")
print(f"{len(fallos)} fallo(s)" if fallos else "Sin fallos")
sys.exit(1 if fallos else 0)
