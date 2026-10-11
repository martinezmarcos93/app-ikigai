"""Piezas comunes de las simulaciones de uso real (sim-admin.py, sim-profesor.py, sim-miembro.py).

Cada simulacion es una persona con su navegador: hace lo que su rol puede hacer desde la pantalla y comprueba lo que
no puede (tambien contra la API). Todas comparten un archivo de estado (E2E_STATE) donde la simulacion de
administracion deja los accesos que creo y las que siguen los usan.
"""
import json
import os
import re
import subprocess
import tempfile

BASE = os.environ.get("E2E_BASE", "http://localhost:8000")
OUT = os.environ.get("E2E_OUT", os.path.join(tempfile.gettempdir(), "ikigai-sim"))
STATE_FILE = os.environ.get("E2E_STATE", os.path.join(OUT, "estado.json"))
PG = (os.environ.get("E2E_PG_CONTAINER", "ikigai-pg"), os.environ.get("E2E_PG_USER", "ikigai"), os.environ.get("E2E_PG_DB", "ikigai_dev"))
os.makedirs(OUT, exist_ok=True)


def sql(statement):
    return subprocess.run(["docker", "exec", PG[0], "psql", "-U", PG[1], "-d", PG[2], "-tAc", statement],
                          capture_output=True, text=True, check=True).stdout.strip()


def cargar_estado():
    with open(STATE_FILE, encoding="utf-8") as f:
        return json.load(f)


def guardar_estado(estado):
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(estado, f, ensure_ascii=False, indent=2)


class Sim:
    """Un navegador con su registro de problemas: errores de pagina, respuestas 5xx y avisos de error inesperados."""

    def __init__(self, browser, nombre, ancho=1280, alto=900, movil=False):
        self.nombre = nombre
        self.problemas = []
        self.hechos = []
        opciones = dict(viewport={"width": ancho, "height": alto}, locale="es-AR")
        if movil:
            opciones.update(device_scale_factor=2, has_touch=True, is_mobile=True)
        self.page = browser.new_context(**opciones).new_page()
        self.page.on("pageerror", lambda e: self.problemas.append(f"pageerror: {e}"))
        self.page.on("response", lambda r: self.problemas.append(f"HTTP {r.status} {r.request.method} {r.url}") if r.status >= 500 else None)

    # ---- registro
    def paso(self, texto):
        self.hechos.append(texto)
        print(f"  · {texto}", flush=True)

    def captura(self, nombre):
        self.page.screenshot(path=f"{OUT}/{self.nombre}-{nombre}.png")

    # ---- navegacion y formularios
    def entrar(self, usuario, clave):
        p = self.page
        p.goto(f"{BASE}/portal.html")
        p.fill("#loginEmail", usuario)
        p.fill("#loginPassword", clave)
        p.click("#loginForm button[type=submit]")

    def esperar_sesion(self):
        self.page.wait_for_selector("#logoutButton:visible", timeout=20000)

    def elegir_clave_propia(self, temporal, propia):
        p = self.page
        p.wait_for_selector('form[data-form="change-password"]', timeout=20000)
        p.fill("#cp-current", temporal)
        p.fill("#cp-new", propia)
        p.fill("#cp-repeat", propia)
        p.click('form[data-form="change-password"] button[type=submit]')
        self.aviso("Contraseña actualizada")

    def salir(self):
        self.page.click("#logoutButton")
        self.page.wait_for_selector("#loginForm:visible")

    def ir(self, vista):
        """Navega y espera a que la pantalla nueva reemplace a la anterior (se marca el contenido viejo y se espera que desaparezca)."""
        p = self.page
        p.evaluate("() => { const c = document.querySelector('#pageContent'); if (c) c.insertAdjacentHTML('afterbegin', '<i data-sim-stale hidden></i>'); }")
        p.click(f'button[data-view="{vista}"]')
        p.wait_for_function("() => !document.querySelector('#pageContent [data-sim-stale]') && !document.querySelector('#pageContent .loading')", timeout=20000)

    def aviso(self, texto, timeout=20000):
        """Espera el aviso de exito esperado; si aparece un aviso de error, falla enseguida con su texto."""
        resultado = self.page.wait_for_function(
            """t => { const n = document.querySelector('#globalNotice'); if (!n || n.hidden) return false;
                     if (n.innerText.includes(t)) return 'ok';
                     return n.classList.contains('success') ? false : 'error: ' + n.innerText; }""",
            arg=texto, timeout=timeout).json_value()
        if resultado != "ok":
            raise AssertionError(f"se esperaba «{texto}» y la pantalla mostro: {resultado}")

    def aviso_de_error(self):
        """Texto del aviso si es un error visible (no uno de exito); None si no hay."""
        return self.page.evaluate(
            "() => { const n = document.querySelector('#globalNotice'); return n && !n.hidden && !n.classList.contains('success') ? n.innerText : null; }")

    def sin_error(self, contexto):
        texto = self.aviso_de_error()
        if texto:
            self.problemas.append(f"{contexto}: aviso de error «{texto.strip()[:160]}»")

    def limpiar_aviso(self):
        """Oculta el aviso anterior: si dos acciones seguidas dan el mismo mensaje, hay que esperar el nuevo, no el viejo."""
        self.page.evaluate("() => { const n = document.querySelector('#globalNotice'); if (n) n.hidden = true; }")

    def enviar(self, formulario, **campos):
        self.limpiar_aviso()
        form = self.page.locator(f'form[data-form="{formulario}"]').first
        form.wait_for()
        for nombre, valor in campos.items():
            campo = form.locator(f'[name="{nombre}"]').first
            etiqueta = campo.evaluate("e => e.tagName")
            if etiqueta == "SELECT":
                opciones = form.locator(f'[name="{nombre}"] option', has_text=str(valor))
                if opciones.count():                       # por el texto visible («Yoga», «Marcos Martinez»)...
                    campo.select_option(opciones.first.get_attribute("value"))
                else:                                      # ...o por el valor interno («active», «charge»)
                    campo.select_option(str(valor))
            else:
                campo.fill(str(valor))
        form.locator("button[type=submit]").first.click()

    def elegir_miembro(self, nombre):
        """Cambia el miembro de la pantalla actual (membresias, cuenta corriente) y espera a que se vuelva a dibujar."""
        p = self.page
        valor = p.locator('form[data-form="select-member"] select option', has_text=nombre).first.get_attribute("value")
        p.select_option('form[data-form="select-member"] select', value=valor)
        p.evaluate("() => { document.querySelector('form[data-form=\"select-member\"]').dataset.simStale = '1'; }")
        p.click('form[data-form="select-member"] button[type=submit]')
        p.wait_for_selector('form[data-form="select-member"]:not([data-sim-stale])', timeout=20000)

    def texto(self):
        return self.page.inner_text("#pageContent")

    def vistas_visibles(self):
        return self.page.evaluate("() => [...document.querySelectorAll('.nav-link[data-view]')].filter(b => b.offsetParent !== null).map(b => b.dataset.view)")

    def api(self, expresion, *args):
        """Ejecuta una llamada del cliente del portal (misma sesion y CSRF) y devuelve su resultado o {status, code}."""
        return self.page.evaluate(
            "async ([expr, args]) => { try { const f = new Function('IkigaiApi', 'args', 'return ' + expr); return {ok: await f(IkigaiApi, args)}; } catch (e) { return {status: e.status, code: e.code}; } }",
            [expresion, list(args)])

    def cerrar(self, titulo):
        self.page.context.close()
        print(f"\nPROBLEMAS ({self.nombre}):", self.problemas or "ninguno")
        print(titulo + (" OK" if not self.problemas else " CON PROBLEMAS"))
        return 1 if self.problemas else 0
