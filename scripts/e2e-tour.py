"""Prueba de aceptacion del PRIMER USO de administracion en un navegador real (Playwright + Chromium).

Recorre lo que vive Agustin la primera vez: entra con la clave temporal con la que se creo la cuenta, el portal le
obliga a elegir una propia, y arranca solo la guia de globos de texto. Comprueba que la guia recorre las 13 pantallas
en orden (cada globo dentro de la pantalla, tambien en un telefono), que se puede saltar con Escape, que no vuelve a
aparecer despues de terminada o saltada (se recuerda en el servidor, no en el navegador) y que se puede repetir.

Requisitos: API en marcha sobre una base DESCARTABLE y vacia con un administrador creado con `npm run admin:create`
SIN la guia hecha (tour_completed_at nulo), portal en E2E_BASE y el contenedor de PostgreSQL de pruebas
(E2E_PG_CONTAINER, E2E_PG_USER, E2E_PG_DB). Variables: E2E_BASE, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_OUT.
"""
import os
import subprocess
import sys
import tempfile

from playwright.sync_api import expect, sync_playwright

OUT = os.environ.get("E2E_OUT", tempfile.gettempdir())
BASE = os.environ.get("E2E_BASE", "http://localhost:8000")
EMAIL = os.environ.get("E2E_ADMIN_EMAIL", "admin.e2e@example.test")
TEMPORAL = os.environ.get("E2E_ADMIN_PASSWORD", "clave-e2e-segura-2026")
PROPIA = "clave-propia-de-agustin-2026"
PG = (os.environ.get("E2E_PG_CONTAINER", "ikigai-pg"), os.environ.get("E2E_PG_USER", "ikigai"), os.environ.get("E2E_PG_DB", "ikigai_test"))
problems = []
TITULOS = ["Bienvenido a Ikigai", "1. Datos del gimnasio", "2. Servicios y precios", "3. Profesores", "4. Miembros",
           "5. Accesos: usuario y clave", "6. Horarios semanales", "7. Rutinas", "8. Membresías", "9. Cuenta corriente",
           "10. Agenda y asistencia", "11. Avisos", "Listo"]


def sql(statement):
    return subprocess.run(["docker", "exec", PG[0], "psql", "-U", PG[1], "-d", PG[2], "-tAc", statement],
                          capture_output=True, text=True, check=True).stdout.strip()


def login(page, clave):
    page.goto(f"{BASE}/portal.html")
    page.fill("#loginEmail", EMAIL)
    page.fill("#loginPassword", clave)
    page.click("#loginForm button[type=submit]")


def dentro_de_pantalla(page, globo):
    caja = globo.bounding_box()
    vista = page.viewport_size
    assert caja and caja["x"] >= 0 and caja["y"] >= 0, caja
    assert caja["x"] + caja["width"] <= vista["width"] + 1 and caja["y"] + caja["height"] <= vista["height"] + 1, (caja, vista)


def recorrer(page, globo, capturas=None):
    for i, titulo in enumerate(TITULOS):
        expect(globo.locator("h3")).to_have_text(titulo, timeout=10000)
        expect(globo.locator(".tour-count")).to_have_text(f"Paso {i + 1} de {len(TITULOS)}")
        page.wait_for_timeout(500)                       # el globo se acomoda junto a su elemento
        try:
            dentro_de_pantalla(page, globo)
        except AssertionError as e:
            raise AssertionError(f"paso {i + 1} ({titulo}): {e}")
        assert page.locator(".tour-highlight").count() == 1, f"paso {i + 1}: nada resaltado"
        if capturas and i in capturas:
            page.screenshot(path=f"{OUT}/{capturas[i]}")
        globo.get_by_role("button", name="Terminar" if i == len(TITULOS) - 1 else "Siguiente").click()


with sync_playwright() as p:
    browser = p.chromium.launch()
    sql(f"UPDATE users SET must_change_password = true, tour_completed_at = NULL WHERE email = '{EMAIL}'")
    page = browser.new_context(viewport={"width": 1280, "height": 900}, locale="es-AR").new_page()
    page.on("pageerror", lambda e: problems.append(f"pageerror: {e}"))

    # ---- 1. clave temporal: primero elegir la propia; la guia espera
    login(page, TEMPORAL)
    page.wait_for_selector('form[data-form="change-password"]')
    assert page.locator(".tour-bubble").count() == 0, "la guia no debe empezar antes de elegir la clave"
    page.fill("#cp-current", TEMPORAL)
    page.fill("#cp-new", PROPIA)
    page.fill("#cp-repeat", PROPIA)
    page.click('form[data-form="change-password"] button[type=submit]')

    # ---- 2. la guia arranca sola y recorre todo en orden
    globo = page.locator(".tour-bubble")
    expect(globo).to_be_visible(timeout=10000)
    recorrer(page, globo, {0: "tour-1-bienvenida.png", 5: "tour-6-accesos.png"})
    expect(page.locator(".tour-bubble")).to_have_count(0)
    assert sql(f"SELECT tour_completed_at IS NOT NULL FROM users WHERE email = '{EMAIL}'") == "t", "no se recordo en el servidor"
    assert page.evaluate("() => Object.keys(localStorage).filter(k => /tour/i.test(k))") == [], "la guia uso el almacenamiento del navegador"

    # ---- 3. terminada: no vuelve a aparecer al recargar ni al entrar desde otro dispositivo
    page.reload()
    page.wait_for_selector("#logoutButton:visible")
    page.wait_for_timeout(1500)
    assert page.locator(".tour-bubble").count() == 0, "la guia reaparecio tras terminarla"
    otro = browser.new_context(viewport={"width": 1280, "height": 900}, locale="es-AR").new_page()
    login(otro, PROPIA)
    otro.wait_for_selector("#logoutButton:visible")
    otro.wait_for_timeout(1500)
    assert otro.locator(".tour-bubble").count() == 0, "la guia reaparecio en otro dispositivo"
    otro.context.close()

    # ---- 4. se repite a pedido y se puede saltar con Escape (y eso tambien cuenta como vista)
    page.click('button[data-action="start-tour"]')
    globo = page.locator(".tour-bubble")
    expect(globo.locator("h3")).to_have_text(TITULOS[0], timeout=10000)
    globo.get_by_role("button", name="Siguiente").click()
    expect(globo.locator("h3")).to_have_text(TITULOS[1])
    globo.get_by_role("button", name="Anterior").click()
    expect(globo.locator("h3")).to_have_text(TITULOS[0])
    page.keyboard.press("Escape")
    expect(page.locator(".tour-bubble")).to_have_count(0)
    assert page.locator(".tour-highlight").count() == 0, "quedo un elemento resaltado"

    # ---- 5. en un telefono el globo va abajo y entra en pantalla en todos los pasos
    sql(f"UPDATE users SET tour_completed_at = NULL WHERE email = '{EMAIL}'")
    movil = browser.new_context(viewport={"width": 360, "height": 740}, device_scale_factor=2, has_touch=True, is_mobile=True, locale="es-AR").new_page()
    movil.on("pageerror", lambda e: problems.append(f"pageerror movil: {e}"))
    login(movil, PROPIA)
    globo = movil.locator(".tour-bubble")
    expect(globo).to_be_visible(timeout=10000)
    recorrer(movil, globo, {0: "tour-movil-1.png", 4: "tour-movil-5.png"})
    movil.context.close()
    browser.close()

print("PROBLEMAS DE PAGINA:", problems or "ninguno")
print("E2E TOUR OK")
sys.exit(1 if problems else 0)
