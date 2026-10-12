"""Saca las capturas del instructivo recorriendo la app REAL (Playwright + Chromium) con los datos del gimnasio de
ejemplo. Marca con circulos amarillos numerados lo que hay que tocar. Se puede regenerar cada vez que cambie la interfaz.

Preparacion (base DESCARTABLE; ver tools/instructivo/README.md):
  1. API en :3001 y portal en :8000 sobre una base recien migrada.
  2. Un administrador con clave temporal:   ADMIN_EMAIL=agustin@ikigai.test ADMIN_PASSWORD=Ikigai-Inicio-2026 \
                                            ADMIN_MUST_CHANGE_PASSWORD=1 npm run admin:create
     y otro para cargar los datos:           (el importador de tools/datos con la planilla de ejemplo)
  3. Datos y accesos:  importar_datos.py Planilla-Ikigai-EJEMPLO.xlsx ... --aplicar --crear-accesos --generar-clases 21 --salida DIR
Uso:  python capturas.py --accesos DIR/accesos-XXXX.jsonl
Variables: E2E_BASE (portal), E2E_PG_CONTAINER / E2E_PG_DB (para algunos datos de apoyo).
"""
import argparse
import json
import os
import sys
import traceback
from datetime import date, timedelta

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(AQUI)), "scripts"))
from playwright.sync_api import expect, sync_playwright  # noqa: E402

import _sim  # noqa: E402
from _sim import BASE, Sim, sql  # noqa: E402

IMG = os.path.join(AQUI, "img")
os.makedirs(IMG, exist_ok=True)
ADMIN = ("agustin@ikigai.test", "Ikigai-Inicio-2026", "Agustin-Clave-Demo-2026")
fallos = []
hechas = []

CSS = """.guia-marca{outline:3px solid #ffd400!important;outline-offset:3px;border-radius:6px}
.guia-badge{position:absolute;width:30px;height:30px;border-radius:50%;background:#ffd400;color:#000;font:700 17px/30px system-ui,sans-serif;
text-align:center;box-shadow:0 0 0 2px #000,0 2px 8px rgba(0,0,0,.6);z-index:99999;pointer-events:none}"""


class Camara:
    """Envuelve una pagina: marca elementos, recorta zonas y guarda PNG con nombre estable."""

    def __init__(self, s):
        self.s, self.p = s, s.page

    def preparar(self):
        self.p.add_style_tag(content=CSS)

    def marcar(self, loc, n):
        # La pagina se recarga en cada login: el estilo se vuelve a inyectar si falta.
        if not self.p.evaluate("() => !!document.getElementById('guia-css')"):
            self.p.add_style_tag(content=CSS)
            self.p.evaluate("() => { const s = document.querySelector('style:last-of-type'); if (s) s.id = 'guia-css'; }")
        loc = loc.first
        loc.scroll_into_view_if_needed()
        loc.evaluate("""(el, n) => { el.classList.add('guia-marca'); const r = el.getBoundingClientRect();
            const b = document.createElement('div'); b.className = 'guia-badge'; b.textContent = n;
            const prev = el.previousElementSibling; const pegado = prev && (r.left - prev.getBoundingClientRect().right) < 40 && prev.getBoundingClientRect().right > 0;
            if (pegado) { b.style.left = (r.left + scrollX + r.width / 2 - 15) + 'px'; b.style.top = (r.top + scrollY - 24) + 'px'; }
            else { b.style.left = Math.max(4, r.left + scrollX - 38) + 'px'; b.style.top = (r.top + scrollY + r.height / 2 - 15) + 'px'; }
            document.body.appendChild(b); }""", n)

    def limpiar(self):
        self.p.evaluate("() => { document.querySelectorAll('.guia-badge').forEach(e => e.remove()); document.querySelectorAll('.guia-marca').forEach(e => e.classList.remove('guia-marca')); }")

    def foto(self, nombre, zona=None, margen=14, alto_max=720):
        """zona=None: lo que se ve en la ventana. zona=locator: ese elemento con un margen (la pagina se mide completa)."""
        self.p.wait_for_timeout(350)
        ruta = os.path.join(IMG, nombre + ".png")
        if zona is None:
            self.p.screenshot(path=ruta)
        else:
            zona = zona.first
            zona.scroll_into_view_if_needed()
            caja = zona.evaluate("""el => { const r = el.getBoundingClientRect(); return {x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height}; }""")
            ancho = self.p.evaluate("() => document.documentElement.clientWidth")
            x0 = max(0, caja["x"] - margen)
            self.p.screenshot(path=ruta, full_page=True, clip={"x": x0, "y": max(0, caja["y"] - margen),
                              "width": min(caja["w"] + 2 * margen, ancho - x0), "height": min(caja["h"], alto_max) + 2 * margen})
        hechas.append(nombre)
        print("  📷", nombre, flush=True)


def paso(nombre):
    def deco(fn):
        def interno(*a, **k):
            print(f"\n== {nombre}", flush=True)
            try:
                return fn(*a, **k)
            except Exception as e:                              # una captura fallida no frena al resto
                fallos.append(f"{nombre}: {e}")
                print(f"  ✗ {nombre}: {str(e).splitlines()[0][:200]}", flush=True)
                traceback.print_exc(limit=2)
        return interno
    return deco


def cerrar_guia(s):
    s.page.evaluate("() => window.IkigaiTour && window.IkigaiTour.stop()")
    s.page.wait_for_timeout(300)


# ---------------------------------------------------------------------------------------------- administracion
def admin(browser, jsonl):
    s = Sim(browser, "admin", 1280, 860)
    c = Camara(s)
    pg = s.page
    hoy = date.today()

    @paso("A1-A3 · Ingreso, clave propia y guía de primer uso")
    def ingreso():
        pg.goto(f"{BASE}/portal.html")
        pg.wait_for_selector("#loginForm")
        c.preparar()
        c.marcar(pg.locator("#loginEmail"), 1)
        c.marcar(pg.locator("#loginPassword"), 2)
        c.marcar(pg.locator("#loginForm button[type=submit]"), 3)
        c.foto("a01-ingreso", pg.locator("#loginPanel"))
        c.limpiar()
        s.entrar(ADMIN[0], ADMIN[1])
        pg.wait_for_selector('form[data-form="change-password"]')
        pg.fill("#cp-current", ADMIN[1])
        pg.fill("#cp-new", ADMIN[2])
        pg.fill("#cp-repeat", ADMIN[2])
        c.marcar(pg.locator("#cp-current"), 1)
        c.marcar(pg.locator("#cp-new"), 2)
        c.marcar(pg.locator("#cp-repeat"), 3)
        c.marcar(pg.locator('form[data-form="change-password"] button[type=submit]'), 4)
        c.foto("a02-elegir-clave", pg.locator("#pageContent"))
        c.limpiar()
        pg.click('form[data-form="change-password"] button[type=submit]')
        s.aviso("Contraseña actualizada")
        s.esperar_sesion()
        pg.wait_for_selector(".tour-bubble", timeout=15000)
        c.foto("a03-guia-primer-uso")
        cerrar_guia(s)
    ingreso()

    @paso("A4 · Resumen y menú")
    def resumen():
        s.ir("dashboard")
        c.marcar(pg.locator(".portal-nav"), 1)
        c.marcar(pg.locator(".stats-grid"), 2)
        c.marcar(pg.locator("#logoutButton"), 3)
        c.foto("a04-resumen")
        c.limpiar()
    resumen()

    @paso("A5 · Configuración")
    def configuracion():
        s.ir("institution-settings")
        c.foto("a05-configuracion", pg.locator("#pageContent"))
    configuracion()

    @paso("A6 · Servicios")
    def servicios():
        s.ir("services")
        c.marcar(pg.locator('button[data-action="edit-service"]'), 1)
        c.marcar(pg.locator('form[data-form="create-service"]'), 2)
        c.foto("a06-servicios", pg.locator("#pageContent"))
        c.limpiar()
    servicios()

    @paso("A7 · Profesores: alta")
    def profesores():
        s.ir("coaches")
        form = pg.locator('form[data-form="create-coach"]')
        form.wait_for()
        form.locator('[name="full_name"]').fill("Valeria Duarte")
        form.locator('[name="discipline"]').fill("Kick Boxing")
        form.locator('[name="email"]').fill("valeria@example.test")
        c.marcar(form.locator('[name="full_name"]'), 1)
        c.marcar(form.locator('[name="discipline"]'), 2)
        c.marcar(form.locator("button[type=submit]"), 3)
        c.foto("a07-profesor-alta", form)
        c.limpiar()
        s.limpiar_aviso()
        form.locator("button[type=submit]").click()
        s.aviso("Profesor")
    profesores()

    @paso("A8-A9 · Miembros: lista y alta")
    def miembros():
        s.ir("members")
        pg.wait_for_selector("table tbody tr")
        c.marcar(pg.locator('button[data-action="edit-member"]'), 1)
        c.marcar(pg.locator('button[data-action="export-member"]'), 2)
        c.foto("a08-miembros", pg.locator("#pageContent .panel").first)
        c.limpiar()
        form = pg.locator('form[data-form="create-member"]')
        for nombre, valor in (("full_name", "Pablo Ibarra"), ("email", "pablo@example.test"), ("phone", "11 5555-0199"), ("dni", "40222333")):
            form.locator(f'[name="{nombre}"]').fill(valor)
        c.marcar(form.locator('[name="full_name"]'), 1)
        c.marcar(form.locator('[name="status"]'), 2)
        c.marcar(form.locator("button[type=submit]"), 3)
        c.foto("a09-miembro-alta", form)
        c.limpiar()
        s.limpiar_aviso()
        form.locator("button[type=submit]").click()
        s.aviso("Miembro creado")
    miembros()

    @paso("A10-A12 · Horarios, turnos fijos y generar clases")
    def horarios():
        s.ir("schedule-templates")
        pg.wait_for_selector('form[data-form="create-template"]')
        form = pg.locator('form[data-form="create-template"]')
        form.locator('[name="service_id"]').select_option(label=form.locator('[name="service_id"] option', has_text="Kick Boxing").first.inner_text())
        form.locator('[name="coach_id"]').select_option(label=form.locator('[name="coach_id"] option', has_text="Valeria").first.inner_text())
        form.locator('[name="weekday"]').select_option(label="Sábado")
        form.locator('[name="local_start_time"]').fill("11:00")
        form.locator('[name="duration_minutes"]').fill("60")
        form.locator('[name="capacity"]').fill("10")
        c.marcar(form.locator('[name="service_id"]'), 1)
        c.marcar(form.locator('[name="coach_id"]'), 2)
        c.marcar(form.locator('[name="weekday"]'), 3)
        c.marcar(form.locator('[name="capacity"]'), 4)
        c.marcar(form.locator("button[type=submit]"), 5)
        c.foto("a10-horario-alta", form)
        c.limpiar()
        s.limpiar_aviso()
        form.locator("button[type=submit]").click()
        s.aviso("Plantilla creada")
        c.marcar(pg.locator('button[data-action="template-assignments"]').first, 1)
        c.marcar(pg.locator('button[data-action="toggle-template"]').first, 2)
        c.foto("a10b-horarios-lista", pg.locator("#pageContent table").first)
        c.limpiar()
        pg.locator('button[data-action="template-assignments"]').first.click()
        pg.wait_for_selector('form[data-form="create-assignment"]')
        c.marcar(pg.locator('form[data-form="create-assignment"] [name="member_id"]'), 1)
        c.marcar(pg.locator('form[data-form="create-assignment"] button[type=submit]'), 2)
        c.foto("a11-turno-fijo", pg.locator('form[data-form="create-assignment"]'))
        c.limpiar()
        gen = pg.locator('form[data-form="generate-sessions"]')
        gen.scroll_into_view_if_needed()
        c.marcar(gen.locator('[name="from_date"]'), 1)
        c.marcar(gen.locator('[name="to_date"]'), 2)
        c.marcar(gen.locator("button[type=submit]"), 3)
        c.foto("a12-generar-clases", gen)
        c.limpiar()
    horarios()

    @paso("A13 · Membresías")
    def membresias():
        s.ir("memberships")
        s.elegir_miembro("Pablo Ibarra")
        pg.wait_for_selector('form[data-form="create-membership"]')
        form = pg.locator('form[data-form="create-membership"]')
        form.locator('[name="agreedPrice"]').fill("28000")
        c.marcar(pg.locator('form[data-form="select-member"] select'), 1)
        c.marcar(form.locator('[name="serviceId"]'), 2)
        c.marcar(form.locator('[name="agreedPrice"]'), 3)
        c.marcar(form.locator("button[type=submit]"), 4)
        c.foto("a13-membresia", form)
        c.limpiar()
        s.limpiar_aviso()
        form.locator("button[type=submit]").click()
        s.aviso("Membresía creada")
    membresias()

    @paso("A14 · Cuenta corriente")
    def cuenta():
        s.ir("accounts")
        s.elegir_miembro("Pablo Ibarra")
        pg.wait_for_selector('form[data-form="create-ledger"]')
        form = pg.locator('form[data-form="create-ledger"]')
        form.locator('[name="type"]').select_option("charge")
        form.locator('[name="amount"]').fill("28000")
        form.locator('[name="description"]').fill("Cuota de octubre")
        c.marcar(form.locator('[name="type"]'), 1)
        c.marcar(form.locator('[name="amount"]'), 2)
        c.marcar(form.locator("button[type=submit]"), 3)
        c.foto("a14-cuenta-corriente", form)
        c.limpiar()
        s.limpiar_aviso()
        form.locator("button[type=submit]").click()
        s.aviso("Movimiento registrado")
        form.locator('[name="type"]').select_option("payment")
        form.locator('[name="amount"]').fill("28000")
        form.locator('[name="description"]').fill("Pago de la cuota")
        form.locator('[name="payment_method"]').fill("Transferencia")
        s.limpiar_aviso()
        form.locator("button[type=submit]").click()
        s.aviso("Movimiento registrado")
    cuenta()

    # ---- ACCESOS: el capitulo central
    @paso("A15 · Accesos: lista")
    def accesos_lista():
        s.ir("invitations")
        pg.wait_for_selector("table tbody tr")
        fila = pg.locator("table tbody tr", has_text="Lucas Benítez")
        c.marcar(pg.locator("h2.section-title", has_text="Profesores").first, 1)
        c.marcar(fila.locator(".badge"), 2)
        c.marcar(fila.locator('button[data-action="reset-account"]'), 3)
        c.marcar(fila.locator('button[data-action="disable-account"]'), 4)
        c.foto("a15-accesos")
        c.limpiar()
    accesos_lista()

    @paso("A16-A17 · Crear el acceso de un profesor")
    def acceso_profesor():
        s.ir("invitations")
        fila = pg.locator("table tbody tr", has_text="Valeria Duarte")
        c.marcar(fila.locator(".badge"), 1)
        c.marcar(fila.locator('button[data-action="create-account"]'), 2)
        c.foto("a16-acceso-profesor-antes", pg.locator('section[data-tour="access-coach"]'))
        c.limpiar()
        fila.locator('button[data-action="create-account"]').click()
        pg.wait_for_selector(".credentials-panel")
        panel = pg.locator(".credentials-panel")
        c.marcar(panel.locator("code").first, 1)
        c.marcar(pg.locator('[data-testid="new-password"]'), 2)
        c.marcar(panel.locator('button[data-action="copy-credentials"]'), 3)
        c.foto("a17-credenciales-profesor", panel)
        c.limpiar()
    acceso_profesor()

    @paso("A18-A19 · Crear el acceso de un miembro")
    def acceso_miembro():
        s.ir("invitations")
        fila = pg.locator("table tbody tr", has_text="Pablo Ibarra")
        c.marcar(fila.locator('button[data-action="create-account"]'), 1)
        c.foto("a18-acceso-miembro-antes", fila)
        c.limpiar()
        fila.locator('button[data-action="create-account"]').click()
        pg.wait_for_selector(".credentials-panel")
        c.foto("a19-credenciales-miembro", pg.locator(".credentials-panel"))
    acceso_miembro()

    @paso("A20 · Restablecer una clave")
    def restablecer():
        s.ir("invitations")
        fila = pg.locator("table tbody tr", has_text="Sofía Giménez")
        c.marcar(fila.locator('button[data-action="reset-account"]'), 1)
        c.foto("a20-restablecer-antes", fila)
        c.limpiar()
        pg.once("dialog", lambda d: d.accept())
        fila.locator('button[data-action="reset-account"]').click()
        pg.wait_for_selector(".credentials-panel h2")
        c.foto("a20b-restablecer-despues", pg.locator(".credentials-panel"))
    restablecer()

    @paso("A21-A22 · Deshabilitar y habilitar un acceso")
    def deshabilitar():
        s.ir("invitations")
        fila = pg.locator("table tbody tr", has_text="Delfina Molina")
        c.marcar(fila.locator('button[data-action="disable-account"]'), 1)
        c.foto("a21-deshabilitar-antes", fila)
        c.limpiar()
        pg.once("dialog", lambda d: d.accept())
        fila.locator('button[data-action="disable-account"]').click()
        fila = pg.locator("table tbody tr", has_text="Delfina Molina")
        expect(fila).to_contain_text("Acceso deshabilitado")
        c.marcar(fila.locator(".badge"), 1)
        c.marcar(fila.locator('button[data-action="enable-account"]'), 2)
        c.foto("a22-deshabilitado", fila)
        c.limpiar()
        fila.locator('button[data-action="enable-account"]').click()
        expect(pg.locator("table tbody tr", has_text="Delfina Molina")).not_to_contain_text("Acceso deshabilitado")
    deshabilitar()

    @paso("A23 · Agenda (y clase de ayer con asistencia para el profesor)")
    def agenda():
        # Una clase ya dada con reservas, para mostrar la toma de asistencia del profesor.
        tpl = sql("SELECT ct.id FROM class_templates ct JOIN coach_profiles cp ON cp.id=ct.coach_id WHERE cp.full_name='Camila Ortega' ORDER BY ct.weekday, ct.local_start_time LIMIT 1")
        sql(f"INSERT INTO class_sessions (template_id, starts_at, ends_at, capacity_snapshot, status) VALUES ('{tpl}', now() - interval '3 hours', now() - interval '2 hours', 12, 'scheduled')")
        sesion = sql(f"SELECT id FROM class_sessions WHERE template_id='{tpl}' AND starts_at < now() ORDER BY starts_at DESC LIMIT 1")
        for nombre in ("Lucas Benítez", "Sofía Giménez", "Mateo Aguirre", "Valentina Rojas"):
            sql(f"INSERT INTO bookings (session_id, member_id, status) SELECT '{sesion}', id, 'confirmed' FROM member_profiles WHERE full_name='{nombre}'")
        s.ir("schedule")
        pg.wait_for_selector("table tbody tr")
        c.marcar(pg.locator('button[data-action="session-attendance"]').first, 1)
        c.marcar(pg.locator('button[data-action="cancel-session"]').first, 2)
        c.foto("a23-agenda", pg.locator("#pageContent .panel").first)
        c.limpiar()
    agenda()

    @paso("A24 · Rutinas")
    def rutinas():
        s.ir("routines")
        for nombre, equipo in [("Sentadilla", "Barra"), ("Flexiones", "Peso corporal"), ("Plancha", "Colchoneta")]:
            s.enviar("create-exercise", name=nombre, equipment=equipo, description=f"{nombre} con técnica controlada", precautions="Mantené la espalda neutra")
            s.aviso("Ejercicio creado")
        form = pg.locator('form[data-form="create-routine"]')
        form.locator('[name="name"]').fill("Fuerza inicial")
        form.locator('[name="discipline"]').fill("Funcional")
        form.locator('[name="level"]').fill("Inicial")
        form.locator('[name="notes"]').fill("Tres días por semana, descansando un día entre sesiones")

        def completar(fila, ejercicio, series, reps, descanso):
            fila.locator('[name="exerciseId"]').select_option(label=ejercicio)
            fila.locator('[name="sets"]').fill(series)
            fila.locator('[name="reps"]').fill(reps)
            fila.locator('[name="restSeconds"]').fill(descanso)
        completar(form.locator(".routine-row").nth(0), "Sentadilla", "3", "12", "60")
        form.locator('button[data-action="add-routine-row"]').click()
        completar(form.locator(".routine-row").nth(1), "Flexiones", "3", "10", "45")
        form.locator('button[data-action="add-routine-row"]').click()
        completar(form.locator(".routine-row").nth(2), "Plancha", "3", "30 s", "30")
        c.marcar(form.locator('[name="name"]'), 1)
        c.marcar(form.locator('button[data-action="add-routine-row"]'), 2)
        c.marcar(form.locator("button[type=submit]"), 3)
        c.foto("a24-rutina-nueva", form)
        c.limpiar()
        form.locator("button[type=submit]").click()
        s.aviso("Rutina creada")
        pg.locator('button[data-action="pick-routine"]').first.click()
        s.enviar("assign-routine", memberId="Lucas Benítez", startsOn=hoy.isoformat(), notes="Empezá con poco peso y cuidá la técnica")
        s.aviso("Rutina asignada")
        c.marcar(pg.locator('form[data-form="assign-routine"]'), 1)
        c.foto("a24b-rutina-asignar", pg.locator('form[data-form="assign-routine"]'))
        c.limpiar()
    rutinas()

    @paso("A25 · Avisos")
    def avisos():
        s.ir("announcements")
        form = pg.locator('form[data-form="publish-announcement"]')
        form.locator('[name="title"]').fill("Cuota de octubre")
        form.locator('[name="body"]').fill("Podés abonar hasta el 10 por transferencia o en efectivo.")
        form.locator('[name="audience"]').select_option(label="Solo miembros")
        c.marcar(form.locator('[name="title"]'), 1)
        c.marcar(form.locator('[name="audience"]'), 2)
        c.marcar(form.locator("button[type=submit]"), 3)
        c.foto("a25-aviso", form)
        c.limpiar()
        form.locator("button[type=submit]").click()
        s.aviso("Aviso publicado")
        s.enviar("publish-announcement", title="Feriado del lunes", body="El lunes no hay clases. ¡Nos vemos el martes!", audience="Todos")
        s.aviso("Aviso publicado")
    avisos()
    s.salir()
    s.page.context.close()


# ---------------------------------------------------------------------------------------------- profesor
def profesor(browser, cuenta):
    s = Sim(browser, "profesor", 1280, 860)
    c = Camara(s)
    pg = s.page
    nueva = "Camila-Clave-Demo-2026"

    @paso("P1-P3 · Primer ingreso del profesor, menú y asistencia")
    def flujo():
        s.entrar(cuenta["usuario"], cuenta["clave"])
        pg.wait_for_selector('form[data-form="change-password"]')
        c.preparar()
        c.foto("p01-profesor-clave", pg.locator("#pageContent"))
        s.elegir_clave_propia(cuenta["clave"], nueva)
        s.esperar_sesion()
        s.ir("dashboard")
        c.marcar(pg.locator(".portal-nav"), 1)
        c.foto("p02-profesor-resumen")
        c.limpiar()
        s.ir("schedule")
        pg.wait_for_selector("table tbody tr")
        c.marcar(pg.locator('button[data-action="session-attendance"]').first, 1)
        c.foto("p03-profesor-agenda", pg.locator("#pageContent"))
        c.limpiar()
        pg.locator('button[data-action="session-attendance"]').first.click()
        pg.wait_for_selector("select[data-booking-id]")
        fila = pg.locator("label.attendance-entry")
        fila.nth(0).locator("select").select_option("true")
        fila.nth(1).locator("select").select_option("true")
        fila.nth(2).locator("select").select_option("false")
        c.marcar(fila.nth(0).locator("select"), 1)
        c.marcar(pg.locator('form[data-form="record-attendance"] button[type=submit]'), 2)
        c.foto("p04-profesor-asistencia", pg.locator('form[data-form="record-attendance"]'))
        c.limpiar()
    flujo()
    s.page.context.close()


# ---------------------------------------------------------------------------------------------- miembro (celular)
def miembro(browser, cuenta):
    s = Sim(browser, "miembro", 390, 844, movil=True)
    c = Camara(s)
    pg = s.page
    nueva = "Lucas-Clave-Demo-2026"

    @paso("M1-M6 · El miembro en el celular")
    def flujo():
        s.entrar(cuenta["usuario"], cuenta["clave"])
        pg.wait_for_selector('form[data-form="change-password"]')
        c.preparar()
        c.foto("m01-miembro-clave")
        s.elegir_clave_propia(cuenta["clave"], nueva)
        s.esperar_sesion()
        pg.wait_for_timeout(800)
        s.ir("dashboard")
        c.foto("m02-miembro-resumen")
        s.ir("schedule")
        pg.wait_for_selector("table tbody tr")
        fila = pg.locator("table tbody tr", has=pg.locator('button[data-action="create-booking"]')).first
        c.marcar(fila.locator('button[data-action="create-booking"]'), 1)
        c.foto("m03-miembro-agenda")
        c.limpiar()
        fila.locator('button[data-action="create-booking"]').click()
        s.aviso("Reserva procesada")
        reservada = pg.locator("table tbody tr", has=pg.locator('button[data-action="cancel-booking"]')).first
        c.marcar(reservada.locator('button[data-action="cancel-booking"]'), 1)
        c.marcar(reservada.locator('button[data-action="notice"]').first, 2)
        c.foto("m04-miembro-reserva")
        c.limpiar()
        s.ir("my-routine")
        pg.wait_for_selector("text=Fuerza inicial")
        c.foto("m05-miembro-rutina")
        s.ir("accounts")
        pg.wait_for_selector(".stat-card")
        c.foto("m06-miembro-cuenta")
        s.ir("announcements")
        pg.wait_for_timeout(600)
        c.foto("m07-miembro-avisos")
    flujo()
    s.page.context.close()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--accesos", required=True, help="Archivo accesos-*.jsonl que dejo el importador (claves temporales).")
    a = ap.parse_args()
    cuentas = {}
    for linea in open(a.accesos, encoding="utf-8"):
        r = json.loads(linea)
        cuentas[r["nombre"]] = {"usuario": r["usuario"], "clave": r["clave"]}
    sql("UPDATE users SET tour_completed_at = now() WHERE email <> 'agustin@ikigai.test'")   # solo el administrador del instructivo ve la guia
    with sync_playwright() as p:
        browser = p.chromium.launch()
        admin(browser, a.accesos)
        profesor(browser, cuentas["Camila Ortega"])
        miembro(browser, cuentas["Lucas Benítez"])
        browser.close()
    with open(os.path.join(IMG, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(sorted(hechas), f, ensure_ascii=False, indent=1)
    print(f"\n{len(hechas)} capturas · {len(fallos)} fallo(s)")
    for x in fallos:
        print("  ✗", x)
    sys.exit(1 if fallos else 0)


if __name__ == "__main__":
    main()
