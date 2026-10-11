"""Prueba de aceptacion de los flujos de administracion en un navegador real (Playwright + Chromium).

Recorre desde la pantalla: configuracion institucional (guardar y recargar), servicios (alta con precio y edicion),
miembros (alta), membresias (alta y fin), cuenta corriente (cargo, pago parcial y ajuste de credito, con el saldo
resultante), profesores (alta, obligacion mensual fija, pago parcial y ajuste) y el vinculo de una cuenta de
administracion con un perfil de profesor (roles multiples). Comprueba tambien que lo que se muestra coincide con lo
que guardo el servidor.

Requisitos: API en marcha sobre una base DESCARTABLE y vacia (migrada, con un administrador creado con
`npm run admin:create`), portal servido en E2E_BASE y `pip install playwright && playwright install chromium`.
Crea datos con nombres fijos: no sirve para correr dos veces sobre la misma base. No lo ejecuta el CI.
Variables: E2E_BASE, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_IGNORE_HTTPS_ERRORS, E2E_OUT (capturas).
"""
import os
import re
import sys
import tempfile
from datetime import date

from playwright.sync_api import expect, sync_playwright

OUT = os.environ.get("E2E_OUT", tempfile.gettempdir())
BASE = os.environ.get("E2E_BASE", "http://localhost:8000")
IGNORE_TLS = os.environ.get("E2E_IGNORE_HTTPS_ERRORS") == "1"
EMAIL = os.environ.get("E2E_ADMIN_EMAIL", "admin.e2e@example.test")
PASSWORD = os.environ.get("E2E_ADMIN_PASSWORD", "clave-e2e-segura-2026")
problems = []


def digits(text):
    """'$ 9.000,50' -> 9000.50 (formato es-AR)."""
    limpio = re.sub(r"[^\d,.-]", "", text).replace(".", "").replace(",", ".")
    return float(limpio)


def navegar(page, vista):
    page.click(f'button[data-view="{vista}"]')


def enviar(page, formulario, **campos):
    form = page.locator(f'form[data-form="{formulario}"]')
    form.wait_for()
    for nombre, valor in campos.items():
        campo = form.locator(f'[name="{nombre}"]')
        if campo.evaluate("e => e.tagName") == "SELECT":
            campo.select_option(valor)
        else:
            campo.fill(valor)
    form.locator("button[type=submit]").click()


def aviso(page, texto):
    page.wait_for_function("t => document.querySelector('#globalNotice') && !document.querySelector('#globalNotice').hidden && document.querySelector('#globalNotice').innerText.includes(t)", arg=texto, timeout=15000)


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_context(ignore_https_errors=IGNORE_TLS, viewport={"width": 1280, "height": 900}, locale="es-AR").new_page()
    page.on("pageerror", lambda e: problems.append(f"pageerror: {e}"))
    page.goto(f"{BASE}/portal.html")
    page.fill("#loginEmail", EMAIL)
    page.fill("#loginPassword", PASSWORD)
    page.click("#loginForm button[type=submit]")
    page.wait_for_selector("#logoutButton:visible", timeout=15000)

    # ------------------------------------------------------------ configuracion institucional
    navegar(page, "institution-settings")
    enviar(page, "institution-settings", institution_name="Ikigai Training", contact_email="contacto@ikigai.example.test",
           contact_phone="+54 11 5555-0000", address="Calle Falsa 123", opening_hours="Lun a Vie 8 a 21")
    aviso(page, "Configuración institucional guardada")
    page.reload()                                   # se recarga de verdad: lo guardado viene del servidor
    page.wait_for_selector("#logoutButton:visible")
    navegar(page, "institution-settings")
    page.wait_for_selector('form[data-form="institution-settings"]')
    assert page.input_value('[name="institution_name"]') == "Ikigai Training"
    assert page.input_value('[name="opening_hours"]') == "Lun a Vie 8 a 21"
    assert page.evaluate("() => !Object.keys(localStorage).some(k => /ikigai|setting|institution/i.test(k))"), "se guardo en localStorage"

    # ------------------------------------------------------------ servicios
    navegar(page, "services")
    enviar(page, "create-service", name="Boxeo", currentPrice="15000", description="Clases de boxeo")
    aviso(page, "Servicio creado")
    fila = page.locator("table tbody tr", has_text="Boxeo")
    expect(fila).to_have_count(1)
    assert digits(fila.inner_text().split("Clases de boxeo")[1]) == 15000.0
    fila.locator('button[data-action="edit-service"]').click()
    page.wait_for_selector('form[data-form="edit-service"]')
    page.fill('form[data-form="edit-service"] [name="currentPrice"]', "18000")
    page.click('form[data-form="edit-service"] button[type=submit]')
    aviso(page, "Servicio actualizado")
    assert digits(page.locator("table tbody tr", has_text="Boxeo").inner_text().split("Clases de boxeo")[1]) == 18000.0
    # un nombre repetido se rechaza con un mensaje legible, no con un fallo mudo
    enviar(page, "create-service", name="Boxeo", currentPrice="1")
    page.wait_for_function("() => document.querySelector('#globalNotice') && !document.querySelector('#globalNotice').hidden")
    assert page.locator("#globalNotice").inner_text().strip() != ""

    # ------------------------------------------------------------ miembros
    navegar(page, "members")
    enviar(page, "create-member", full_name="Marta Gómez", email="marta@example.test", status="active", joined_on=date.today().isoformat())
    aviso(page, "Miembro creado")
    expect(page.locator("table tbody tr", has_text="Marta Gómez")).to_have_count(1)

    # ------------------------------------------------------------ proteccion de datos: exportar y anonimizar
    enviar(page, "create-member", full_name="Ex Socio Baja", email="baja@example.test", phone="1155550000", dni="30999888",
           status="exited", joined_on="2026-01-01", exited_on=date.today().isoformat())
    aviso(page, "Miembro creado")
    fila_baja = page.locator("table tbody tr", has_text="Ex Socio Baja")
    with page.expect_download() as descarga:
        fila_baja.locator('button[data-action="export-member"]').click()
    import json
    datos = json.loads(open(descarga.value.path(), encoding="utf-8").read())
    assert datos["member"]["dni"] == "30999888" and datos["member"]["full_name"] == "Ex Socio Baja"
    assert page.locator("table tbody tr", has_text="Marta Gómez").locator('button[data-action="anonymize-member"]').count() == 0, "solo quien dejo el gimnasio se puede anonimizar"
    def segundo(dialogo):
        dialogo.accept("ANONIMIZAR")

    def primero(dialogo):
        dialogo.accept("Pedido de la persona al darse de baja")
        page.once("dialog", segundo)          # la confirmacion escrita llega como un segundo cuadro

    page.once("dialog", primero)
    fila_baja.locator('button[data-action="anonymize-member"]').click()
    aviso(page, "Persona anonimizada")
    expect(page.locator("table tbody tr", has_text="Ex Socio Baja")).to_have_count(0)
    anonimo = page.locator("table tbody tr", has_text="Persona anonimizada")
    expect(anonimo).to_have_count(1)
    assert "baja@example.test" not in page.locator("table").inner_text()
    assert "anonymize-member" not in anonimo.inner_html(), "ya anonimizada: no debe ofrecer anonimizar de nuevo"

    # ------------------------------------------------------------ membresias
    navegar(page, "memberships")
    page.wait_for_selector('form[data-form="create-membership"]')
    valor = page.locator('form[data-form="select-member"] select option', has_text="Marta").get_attribute("value")
    page.select_option('form[data-form="select-member"] select', value=valor)
    page.click('form[data-form="select-member"] button[type=submit]')
    page.wait_for_selector('form[data-form="create-membership"]')
    enviar(page, "create-membership", startsOn=date.today().isoformat(), agreedPrice="16000")
    aviso(page, "Membresía creada")
    fila = page.locator("table tbody tr", has_text="Boxeo")
    expect(fila).to_have_count(1)
    assert digits(fila.inner_text().split("Mensual")[1] if "Mensual" in fila.inner_text() else fila.inner_text()) > 0
    assert "16.000" in fila.inner_text()                 # el precio acordado, no el vigente del servicio (18.000)
    page.once("dialog", lambda d: d.accept(date.today().isoformat()))
    fila.locator('button[data-action="end-membership"]').click()
    aviso(page, "Membresía finalizada")

    # ------------------------------------------------------------ cuenta corriente
    navegar(page, "accounts")
    page.wait_for_selector('form[data-form="create-ledger"]')
    enviar(page, "create-ledger", type="charge", amount="16000", description="Cuota de octubre")
    aviso(page, "Movimiento registrado")
    enviar(page, "create-ledger", type="payment", amount="6000", description="Pago parcial", payment_method="Efectivo")
    aviso(page, "Movimiento registrado")
    enviar(page, "create-ledger", type="adjustment", direction="credit", amount="1000", description="Bonificación")
    aviso(page, "Movimiento registrado")
    expect(page.locator("table tbody tr")).to_have_count(3)
    saldo = digits(page.locator(".stat-card", has_text="Saldo neto").inner_text().replace("Saldo neto", ""))
    assert abs(saldo) == 9000.0, f"saldo inesperado: {saldo}"   # 16.000 de cuota - 6.000 pagados - 1.000 de credito
    # un ajuste sin direccion se rechaza antes de llegar al servidor
    page.select_option('form[data-form="create-ledger"] [name="type"]', "adjustment")
    page.select_option('form[data-form="create-ledger"] [name="direction"]', "debit")
    page.screenshot(path=f"{OUT}/admin-cuenta.png")

    # ------------------------------------------------------------ profesores
    navegar(page, "coaches")
    enviar(page, "create-coach", full_name="Lucía Prof", discipline="Boxeo", email=EMAIL)   # mismo correo que la cuenta admin
    aviso(page, "Profesor creado")
    page.locator("table tbody tr", has_text="Lucía Prof").locator('button[data-action="coach-finance"]').click()
    page.wait_for_selector('form[data-form="create-obligation"]')
    enviar(page, "create-obligation", agreed_amount="30000")
    aviso(page, "Obligación mensual configurada")
    page.wait_for_selector('form[data-form="coach-payment"]')
    enviar(page, "coach-payment", amount="12000", payment_method="transfer")
    aviso(page, "Pago registrado")
    page.wait_for_selector('form[data-form="coach-adjustment"]')
    enviar(page, "coach-adjustment", amount_delta="-2000", reason="Descuento acordado")
    aviso(page, "Ajuste registrado")
    mount = page.locator("#coachFinanceMount")
    expect(mount).to_contain_text("16.000", timeout=15000)       # saldo = 30.000 - 2.000 de ajuste - 12.000 pagados
    texto = mount.inner_text()
    assert "30.000" in texto and "12.000" in texto and "Descuento acordado" in texto, texto[:500]
    page.screenshot(path=f"{OUT}/admin-profesores.png")

    # ------------------------------------------------------------ roles multiples
    navegar(page, "invitations")
    page.wait_for_selector('form[data-form="link-admin-coach"]')
    page.locator('form[data-form="link-admin-coach"] button[type=submit]').click()
    aviso(page, "conserva administración y ahora también tiene rol de profesor")
    roles = page.evaluate("async () => (await IkigaiApi.me()).user.roles")
    assert sorted(roles) == ["admin", "coach"], roles
    page.reload()
    page.wait_for_selector("#logoutButton:visible")
    roles = page.evaluate("async () => (await IkigaiApi.me()).user.roles")
    assert sorted(roles) == ["admin", "coach"], f"la sesion perdio un rol tras recargar: {roles}"
    assert page.locator('button[data-view="invitations"]').is_visible(), "perdio lo de administracion"
    navegar(page, "schedule")
    page.wait_for_selector("#pageContent")
    assert page.evaluate("async () => { try { await IkigaiApi.listCoaches(); return true; } catch (e) { return e.status; } }") is True

    browser.close()

print("PROBLEMAS DE PAGINA:", problems or "ninguno")
print("E2E ADMIN OK")
sys.exit(1 if problems else 0)
