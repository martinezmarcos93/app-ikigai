"""Genera los documentos para el dueño del gimnasio: el cuestionario de puesta en marcha y la hoja de costos.
HTML autocontenido (con la tipografia y el logo de Ikigai) + PDF (Chromium via Playwright) + version de texto para WhatsApp.

    python documentos.py            # escribe en docs/entrega/

Los montos en pesos son ESTIMACIONES con fuentes de terceros y fecha (ver COSTOS); se confirman al pagar.
"""
import base64
import html
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SALIDA = os.path.join(RAIZ, "docs", "entrega")

# ---------------------------------------------------------------------------------------------- costos
FECHA_COTIZACION = "11/10/2026"
DOLAR_OFICIAL = 1535          # Banco Nacion, venta, 11/10/2026 (nota periodistica; verificar al pagar)
PERCEPCION = 1.30             # 30 % de percepcion en consumos con tarjeta en el exterior pagados en pesos
IVA_DIGITAL = 1.21            # posible 21 % de IVA sobre servicios digitales del exterior (tope)
COM_USD = 10.46               # .com en Cloudflare Registrar, a precio de costo
VPS_USD = 12                  # servidor de 2 GB (DigitalOcean, plan basico), por mes
COM_AR = 8500                 # .com.ar en NIC Argentina por año (iProfesional, 16/7/2026)


def pesos(n):
    return "$" + f"{round(n / 500) * 500:,.0f}".replace(",", ".")      # redondeado a $500 para no aparentar falsa precision


def usd_a_ars(usd, con_iva):
    return usd * DOLAR_OFICIAL * PERCEPCION * (IVA_DIGITAL if con_iva else 1)


COSTOS = {
    "com_min": usd_a_ars(COM_USD, False), "com_max": usd_a_ars(COM_USD, True),
    "vps_min": usd_a_ars(VPS_USD, False), "vps_max": usd_a_ars(VPS_USD, True),
}
COSTOS["anio1_min"] = COM_AR + 12 * COSTOS["vps_min"]
COSTOS["anio1_max"] = COM_AR + 12 * COSTOS["vps_max"]
COSTOS["mes_min"], COSTOS["mes_max"] = COSTOS["vps_min"], COSTOS["vps_max"]

# ---------------------------------------------------------------------------------------------- cuestionario
CUESTIONARIO = [
    ("1. Datos del gimnasio", "Con esto se completa la pantalla de Configuración y la landing de descarga.", [
        "Nombre comercial exacto (cómo querés que figure en la app).",
        "Razón social y CUIT (los pide el dominio y se usan en los documentos legales).",
        "Dirección completa, localidad y cómo llegar (si hay algún dato útil).",
        "Teléfono / WhatsApp de contacto y correo del gimnasio.",
        "Instagram u otras redes que quieras mostrar.",
        "Horarios de atención al público (de la oficina o recepción, no de las clases).",
        "Logo: ¿tenés el archivo original (vectorial, .ai / .svg / .pdf / .eps) o quién lo diseñó? El que tenemos es una imagen con fondo negro.",
    ]),
    ("2. Dominio y cuentas", "La dirección de internet de la app (por ejemplo ikigaitraining.com.ar) y los correos con los que se abren las cuentas.", [
        "Dos o tres nombres de dominio que te gusten, en orden de preferencia (cortos, sin guiones).",
        "El dominio tiene que quedar a nombre del gimnasio o tuyo: ¿lo registrás vos con tu CUIT y Clave Fiscal (nivel 2 o más) o querés que lo haga otra persona a tu nombre?",
        "Un correo del gimnasio (mejor uno propio, no personal) para las cuentas de la app y para que lleguen los avisos del sistema.",
        "¿Quién más, además de vos, va a administrar la app? (nombre y correo de cada persona).",
    ]),
    ("3. Servicios y precios", "Qué se ofrece y cuánto cuesta. Se carga en la hoja «Servicios» de la planilla.", [
        "Lista de disciplinas / servicios (Kick Boxing, Tae Kwon Do, Funcional…) y el precio mensual de lista de cada una.",
        "¿Hay planes combinados o por cantidad de clases por semana (2 veces, 3 veces, pase libre)? ¿Con qué precios?",
        "¿Hay descuentos (familiar, estudiantes, pago adelantado, pareja)? ¿Cuáles y de cuánto?",
        "¿Cuál es el día de vencimiento de la cuota y qué pasa si alguien se atrasa?",
        "Medios de pago que aceptás (efectivo, transferencia, Mercado Pago, tarjeta…). ¿Querés registrar con cuál pagó cada persona?",
        "¿Ofrecés clase de prueba? ¿Es gratis? ¿Cuántas?",
        "¿Cobrás matrícula o inscripción?",
    ]),
    ("4. Profesores", "Se carga en la hoja «Profesores». Cada profesor recibe su usuario y clave.", [
        "Nombre completo, disciplina, teléfono y correo de cada profesor.",
        "La app lleva la cuenta de lo que cada profesor le debe al gimnasio por usar el espacio (monto mensual fijo, independiente de las reservas). ¿Cuál es el monto de cada uno? ¿Cómo y cuándo se paga?",
        "¿Algún profesor da más de una disciplina?",
        "¿Quién da clase como suplente cuando falta alguien?",
    ]),
    ("5. Horarios y cupos", "La grilla semanal. Con esto el sistema genera las clases y las reservas.", [
        "Grilla semanal completa: por cada clase, día, hora de inicio, duración, disciplina, profesor y cupo máximo.",
        "¿Qué días son feriados o no hay clases y cómo avisás hoy?",
        "¿Hay clases solo para ciertos grupos (niños, adultos, avanzados)? ¿Cómo se identifican?",
        "¿Los cupos se respetan siempre o a veces entra gente de más?",
    ]),
    ("6. Reglas de reserva y asistencia", "Hoy el sistema funciona así; confirmá si está bien o qué cambiarías.", [
        "Una persona puede cancelar su reserva hasta 40 minutos antes de la clase. ¿Está bien ese tiempo?",
        "Si la clase está llena, la persona entra a una lista de espera y el sistema la promueve solo si se libera un lugar. ¿Querés eso?",
        "Los alumnos en estado «Deudor» o «Suspendido» no pueden reservar clases nuevas (conservan las que ya tenían). ¿Está bien?",
        "No hay multas automáticas por faltar o llegar tarde; los alumnos solo avisan. ¿Querés alguna regla, aunque sea manual?",
        "¿Quién toma la asistencia: cada profesor desde su celular o la recepción?",
    ]),
    ("7. Alumnos", "Es lo más largo: se completa en la hoja «Miembros» de la planilla que te mando.", [
        "Planilla completa con todos los alumnos activos: nombre y apellido, DNI (si lo tenés), teléfono, correo y estado (Activo, En prueba, Deudor, Suspendido).",
        "¿Tenés alumnos menores de edad? ¿Cómo guardás hoy la autorización de los padres? (hay que definir cómo se maneja en la app).",
        "¿Pedís apto médico? ¿Dónde lo guardás hoy? (la app no lo guarda por ahora).",
        "Si hay deudas o saldos a favor de alumnos, quién debe cuánto el día que arrancamos (hoja «Saldos iniciales»).",
        "¿Qué alumnos tienen un turno fijo (siempre el mismo horario)?",
        "¿Los alumnos ya firmaron o aceptaron por escrito que el gimnasio guarde sus datos? (Por ahora esa constancia se guarda fuera de la app, en papel o en un archivo del gimnasio.)",
    ]),
    ("8. Cómo se va a usar en el día a día", "Para elegir bien cómo se entrega la app.", [
        "¿Qué celulares usan tus alumnos y profesores: Android o iPhone? (en Android se instala el archivo de la app; en iPhone se usa desde el navegador y se agrega a la pantalla de inicio).",
        "¿Quién va a cargar las reservas y cobros en recepción, y desde qué dispositivo (celular, computadora, tablet)?",
        "¿Hay internet estable en el gimnasio? ¿Y wifi para los alumnos?",
        "¿Cómo les avisás hoy a los alumnos las novedades (grupos de WhatsApp, Instagram, cartel)? La app tiene avisos dentro de la aplicación, pero no manda notificaciones al celular todavía.",
        "¿Querés que si alguien olvida su clave le llegue un mail para elegir otra? Para eso hace falta una casilla de correo de envío; si no, la clave se restablece desde administración.",
    ]),
    ("9. Privacidad y legales", "La ley de protección de datos personales (25.326) exige algunas cosas. Se revisa con una abogada.", [
        "¿El gimnasio está inscripto en el Registro Nacional de Bases de Datos Personales (AAIP)?",
        "¿Quién es la persona responsable de los datos (nombre, DNI, domicilio)?",
        "Te pasamos redactado un texto de consentimiento para que lo revisen con la abogada y lo firmen los alumnos al inscribirse. ¿Cómo querés juntar y guardar esas firmas (papel, foto, archivo)?",
        "¿Hay algún dato que NO quieras que quede en la app aunque sea posible?",
    ]),
    ("10. Fechas y puesta en marcha", "", [
        "¿Para qué fecha querés empezar a usar la app?",
        "Primero conviene un piloto con pocas personas (el gimnasio, 2 o 3 profesores y unos 10 alumnos de confianza) durante una o dos semanas. ¿Estás de acuerdo? ¿A quiénes sumarías?",
        "¿Quién es la persona de contacto para dudas durante las primeras semanas?",
        "¿Cómo querés pagar los servicios (dominio y servidor)? Ver hoja de costos.",
    ]),
]


def b64(ruta):
    with open(os.path.join(RAIZ, ruta), "rb") as f:
        return base64.b64encode(f.read()).decode()


def pagina(titulo, cuerpo):
    logo = b64("assets/pwa/icon-192.png")
    fuentes = "".join(
        f"@font-face{{font-family:'{fam}';font-weight:{w};src:url(data:font/woff2;base64,{b64('assets/fonts/' + arch)}) format('woff2')}}"
        for fam, w, arch in (("Bebas Neue", 400, "bebas-neue-400.woff2"), ("Rajdhani", 400, "rajdhani-400.woff2"),
                             ("Rajdhani", 600, "rajdhani-600.woff2"), ("Rajdhani", 700, "rajdhani-700.woff2")))
    return f"""<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(titulo)}</title><style>{fuentes}
@page{{size:A4;margin:16mm 15mm}}
*{{box-sizing:border-box}} body{{margin:0;font-family:'Rajdhani',sans-serif;font-size:12.5pt;line-height:1.35;color:#17171a;background:#fff}}
main{{max-width:820px;margin:0 auto;padding:24px}}
header.doc{{display:flex;align-items:center;gap:14px;border-bottom:3px solid #e31a20;padding-bottom:10px;margin-bottom:14px}}
header.doc img{{width:54px;height:54px;border-radius:8px}} header.doc strong{{display:block;font:400 28pt 'Bebas Neue';letter-spacing:1.5px;line-height:1}}
header.doc small{{letter-spacing:3px;color:#666;font-weight:600}}
h1{{font:400 26pt 'Bebas Neue';letter-spacing:1px;margin:6px 0 4px;color:#e31a20}} h2{{font:400 17pt 'Bebas Neue';letter-spacing:.8px;margin:20px 0 2px;color:#17171a;border-left:5px solid #e31a20;padding-left:9px}}
p{{margin:4px 0 8px}} .sub{{color:#555;font-size:11pt;margin:0 0 6px 14px}}
ol,ul{{margin:4px 0 8px;padding-left:22px}} li{{margin:6px 0;break-inside:avoid}} li .r{{display:block;border-bottom:1px dotted #aaa;height:19px;margin-top:2px}}
table{{width:100%;border-collapse:collapse;margin:8px 0;font-size:12pt}} th,td{{border:1px solid #d6d6db;padding:6px 9px;text-align:left;vertical-align:top}} th{{background:#17171a;color:#fff;font-weight:700}}
td.n{{text-align:right;white-space:nowrap;font-weight:700}} tr.tot td{{background:#fbe8e9;font-weight:700}}
.caja{{background:#fff7e0;border:1.5px solid #e6b755;border-radius:6px;padding:8px 12px;margin:10px 0;break-inside:avoid}} .nota{{font-size:10.5pt;color:#555}}
.firma{{margin-top:18px;font-size:11pt;color:#555;border-top:1px solid #ccc;padding-top:6px}}
@media print{{main{{padding:0}}}}
</style></head><body><main>
<header class="doc"><img src="data:image/png;base64,{logo}" alt=""><div><strong>IKIGAI TRAINING</strong><small>PUESTA EN MARCHA DE LA APP</small></div></header>
{cuerpo}
</main></body></html>"""


def html_cuestionario():
    partes = ["<h1>Cuestionario para arrancar</h1>",
              "<p>Contestá lo que puedas, en el orden que quieras, por escrito, por audio o como te resulte más cómodo. Lo que no sepas lo dejamos para después. "
              "Con tus respuestas y la planilla de Excel cargo todos los datos del gimnasio en la app.</p>"]
    for titulo, ayuda, preguntas in CUESTIONARIO:
        partes.append(f"<h2>{html.escape(titulo)}</h2>")
        if ayuda:
            partes.append(f'<p class="sub">{html.escape(ayuda)}</p>')
        partes.append("<ol>" + "".join(f'<li>{html.escape(q)}<span class="r"></span></li>' for q in preguntas) + "</ol>")
    partes.append('<p class="firma">Cuando termines, mandame las respuestas y la planilla por un medio de confianza (no por grupos abiertos). '
                  "La planilla tiene datos personales: guardala en un lugar seguro y borrala del celular y del correo una vez cargada.</p>")
    return pagina("Cuestionario de puesta en marcha — Ikigai Training", "".join(partes))


def html_costos():
    c = COSTOS
    tabla = f"""<table><tr><th>Concepto</th><th>Cuándo</th><th>Monto estimado</th></tr>
<tr><td><b>Dominio</b> <code>.com.ar</code> (por ejemplo ikigaitraining.com.ar), registrado en NIC Argentina a nombre del gimnasio</td><td>Una vez por año</td><td class="n">{pesos(COM_AR)}</td></tr>
<tr><td><i>Alternativa:</i> dominio <code>.com</code> (en dólares, con tarjeta)</td><td>Una vez por año</td><td class="n">{pesos(c['com_min'])} a {pesos(c['com_max'])}</td></tr>
<tr><td><b>Servidor</b> (donde vive la app y los datos): 2 GB de memoria, copias de seguridad incluidas en el plan que elijamos</td><td>Por mes</td><td class="n">{pesos(c['vps_min'])} a {pesos(c['vps_max'])}</td></tr>
<tr><td>Landing de descarga (Cloudflare Pages) y certificado de seguridad (HTTPS)</td><td>—</td><td class="n">$0</td></tr>
<tr><td>Correo para recuperar claves (opcional, plan gratuito de un servicio de envío)</td><td>—</td><td class="n">$0</td></tr>
<tr class="tot"><td>Primer año, con dominio <code>.com.ar</code></td><td>12 meses</td><td class="n">{pesos(c['anio1_min'])} a {pesos(c['anio1_max'])}</td></tr>
<tr class="tot"><td>Costo mensual a partir del segundo mes (solo servidor)</td><td>Por mes</td><td class="n">{pesos(c['mes_min'])} a {pesos(c['mes_max'])}</td></tr></table>"""
    cuerpo = f"""<h1>Qué se paga y cuánto</h1>
<p>Para que la app funcione en internet las 24 horas hacen falta dos cosas: <b>un nombre en internet (dominio)</b> y <b>un servidor</b>. Lo demás (la aplicación, la página de descarga, la seguridad) está resuelto y no tiene costo mensual.</p>
<div class="caja"><b>Para pagar hoy: el dominio .com.ar → {pesos(COM_AR)}.</b> Lo más recomendable es que lo registres vos mismo en
<b>nic.ar</b> con tu CUIT y tu Clave Fiscal (nivel 2 o superior), así el dominio queda a nombre del gimnasio y no de un tercero. Lo paga el gimnasio en pesos, sin tarjeta del exterior.
Si preferís que lo haga otra persona, ese es el monto a transferir; el dominio igual se registra a tu nombre.</div>
<h2>Detalle</h2>{tabla}
<h2>Cómo se calcularon los montos en pesos</h2>
<ul class="nota">
<li>El dominio <code>.com.ar</code>: {pesos(COM_AR)} por año (alta, renovación y transferencia), según nota de iProfesional del 16/07/2026. Exige CUIT o CUIL y Clave Fiscal de ARCA nivel 2 o superior. <b>Confirmar el valor en nic.ar al pagar.</b></li>
<li>Los servicios del exterior (servidor y, si se elige, el dominio <code>.com</code>) se cobran en dólares: USD {COM_USD:.2f}/año el <code>.com</code> (Cloudflare Registrar, a precio de costo) y USD {VPS_USD}/mes el servidor de 2 GB (DigitalOcean, plan básico).</li>
<li>Se convierten a pesos con el dólar oficial del Banco Nación a la venta del {FECHA_COTIZACION} (${DOLAR_OFICIAL:,}). Si la tarjeta se cancela en pesos suma una percepción del 30 %, y el extremo alto del rango incluye además un posible IVA del 21 % sobre servicios digitales. Si el resumen de la tarjeta se paga directamente en dólares, la percepción del 30 % no se aplica y el costo baja.</li>
<li>Los importes están redondeados a $500. <b>Son estimaciones</b> con datos de terceros (precios y cotización cambian): el monto final aparece al contratar. Si sobra algo, se devuelve; si faltara, se avisa antes de pagar.</li></ul>
<h2>Qué NO está incluido</h2>
<ul class="nota"><li>Honorarios profesionales (abogada, auditoría de seguridad externa): se acuerdan aparte.</li>
<li>Notificaciones push al celular y pagos online: no existen todavía (la app tiene avisos internos).</li>
<li>Publicación en Play Store: no hace falta; la app se descarga desde la página del gimnasio.</li></ul>
<p class="nota">Cotización armada el {FECHA_COTIZACION}. Fuentes: nota de iProfesional (16/07/2026) sobre aranceles de NIC Argentina; páginas de precios públicas de Cloudflare y DigitalOcean; cotización publicada por la prensa el 11/10/2026.</p>"""
    return pagina("Qué se paga y cuánto — Ikigai Training", cuerpo)


def texto_whatsapp():
    c = COSTOS
    lineas = ["*IKIGAI TRAINING · Puesta en marcha*", "",
              f"*Para pagar hoy:* dominio .com.ar → *{pesos(COM_AR)}* por año (se registra en nic.ar con tu CUIT y Clave Fiscal, así queda a nombre del gimnasio).", "",
              f"*Después, cada mes:* servidor → entre {pesos(c['mes_min'])} y {pesos(c['mes_max'])} (depende del dólar y los impuestos de la tarjeta).",
              f"*Primer año completo:* entre {pesos(c['anio1_min'])} y {pesos(c['anio1_max'])}.", "",
              "Son estimaciones con la cotización del 11/10/2026; el monto final se confirma al pagar y se rinde al peso.", "",
              "*Cuestionario* (respondé por escrito o audio, en cualquier orden):"]
    for titulo, _ayuda, preguntas in CUESTIONARIO:
        lineas.append("")
        lineas.append(f"*{titulo}*")
        lineas += [f"  {i}. {q}" for i, q in enumerate(preguntas, start=1)]
    return "\n".join(lineas) + "\n"


def pdf(ruta_html, ruta_pdf):
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page()
        pg.goto("file://" + ruta_html)
        pg.wait_for_timeout(500)
        pg.pdf(path=ruta_pdf, format="A4", print_background=True, margin={"top": "14mm", "bottom": "14mm", "left": "13mm", "right": "13mm"})
        b.close()


def main():
    os.makedirs(SALIDA, exist_ok=True)
    docs = {"Cuestionario-Agustin": html_cuestionario(), "Costos-puesta-en-marcha": html_costos()}
    for nombre, contenido in docs.items():
        h = os.path.join(SALIDA, nombre + ".html")
        with open(h, "w", encoding="utf-8") as f:
            f.write(contenido)
        pdf(h, os.path.join(SALIDA, nombre + ".pdf"))
        print("escrito", nombre)
    with open(os.path.join(SALIDA, "Mensaje-WhatsApp-Agustin.txt"), "w", encoding="utf-8") as f:
        f.write(texto_whatsapp())
    print("escrito Mensaje-WhatsApp-Agustin.txt")
    for k, v in COSTOS.items():
        print(f"  {k}: {pesos(v)}")


if __name__ == "__main__":
    main()
