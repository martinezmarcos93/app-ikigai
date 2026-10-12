"""Arma el instructivo de Ikigai (HTML autocontenido + PDF) con las capturas de tools/instructivo/img (capturas.py).

    python construir.py          # escribe en docs/instructivo/

Produce: Guia-Ikigai-Administracion, Hoja-Profesores y Hoja-Miembros (.html y .pdf).
"""
import base64
import html
import os
import re
import sys
from datetime import date

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(AQUI))
IMG = os.path.join(AQUI, "img")
SALIDA = os.path.join(RAIZ, "docs", "instructivo")
faltan = []


def b64(ruta):
    with open(ruta, "rb") as f:
        return base64.b64encode(f.read()).decode()


def e(t):
    return html.escape(t)


def md(t):
    """Texto con **negrita** y `codigo` minimos."""
    t = e(t)
    t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)
    return re.sub(r"`(.+?)`", r"<code>\1</code>", t)


def fig(nombre, pie, ancho=None, clase=""):
    ruta = os.path.join(IMG, nombre + ".png")
    if not os.path.exists(ruta):
        faltan.append(nombre)
        return f'<p class="falta">[Falta la captura {e(nombre)}]</p>'
    estilo = f' style="max-width:{ancho}"' if ancho else ""
    return (f'<figure class="{clase}"{estilo}><img src="data:image/png;base64,{b64(ruta)}" alt="{e(pie)}">'
            f"<figcaption>{md(pie)}</figcaption></figure>")


def fila(*figuras, clase=""):
    return f'<div class="fila {clase}">' + "".join(figuras) + "</div>"


def paso(n, titulo, *contenido):
    return f'<section class="paso"><h3><span class="num">{n}</span>{md(titulo)}</h3>' + "".join(contenido) + "</section>"


def p(t):
    return f"<p>{md(t)}</p>"


def lista(*items, tipo="ul"):
    return f"<{tipo}>" + "".join(f"<li>{md(i)}</li>" for i in items) + f"</{tipo}>"


def tip(t):
    return f'<div class="tip"><b>Tip.</b> {md(t)}</div>'


def ojo(t):
    return f'<div class="ojo"><b>Ojo.</b> {md(t)}</div>'


def marcas(*items):
    """Referencias a los circulos amarillos de la captura."""
    return '<ol class="marcas">' + "".join(f"<li>{md(i)}</li>" for i in items) + "</ol>"


def tabla(cabecera, filas):
    return ("<table><tr>" + "".join(f"<th>{md(c)}</th>" for c in cabecera) + "</tr>"
            + "".join("<tr>" + "".join(f"<td>{md(c)}</td>" for c in f) + "</tr>" for f in filas) + "</table>")


def pagina(titulo, subtitulo, cuerpo, indice=None, compacta=False):
    logo = b64(os.path.join(RAIZ, "assets", "pwa", "icon-192.png"))
    fuentes = "".join(
        f"@font-face{{font-family:'{fam}';font-weight:{w};src:url(data:font/woff2;base64,{b64(os.path.join(RAIZ, 'assets', 'fonts', arch))}) format('woff2')}}"
        for fam, w, arch in (("Bebas Neue", 400, "bebas-neue-400.woff2"), ("Rajdhani", 400, "rajdhani-400.woff2"),
                             ("Rajdhani", 600, "rajdhani-600.woff2"), ("Rajdhani", 700, "rajdhani-700.woff2")))
    if compacta:
        portada = (f'<header class="cabecera"><img src="data:image/png;base64,{logo}" alt=""><div><small>IKIGAI TRAINING</small><h1>{titulo}</h1>'
                   f'<p>{md(subtitulo)}</p></div></header>')
    else:
        portada = (f'<section class="portada"><img src="data:image/png;base64,{logo}" alt=""><small>IKIGAI TRAINING</small><h1>{titulo}</h1><p>{md(subtitulo)}</p>'
                   f'<p><small>Versión {date.today():%d/%m/%Y}</small></p></section>')
    toc = ""
    if indice:
        toc = '<nav class="toc"><h2>Contenido</h2><ol>' + "".join(f'<li><a href="#{i}">{e(t)}</a></li>' for i, t in indice) + "</ol></nav>"
    return f"""<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(titulo)}</title><style>{fuentes}
@page{{size:A4;margin:14mm 13mm}}
*{{box-sizing:border-box}} html{{scroll-behavior:smooth}}
body{{margin:0;font-family:'Rajdhani',sans-serif;font-size:13pt;line-height:1.4;color:#17171a;background:#f4f4f6}}
main{{max-width:900px;margin:0 auto;background:#fff;padding:28px 34px 40px}}
.portada{{min-height:230mm;display:flex;flex-direction:column;justify-content:center;border-left:10px solid #e31a20;padding-left:28px;margin-bottom:10mm;break-after:page}}
.cabecera{{display:flex;gap:16px;align-items:center;border-bottom:4px solid #e31a20;padding-bottom:10px;margin-bottom:6px}} .cabecera img{{width:64px;height:64px;border-radius:10px}}
.cabecera h1{{font:400 34pt/1 'Bebas Neue';letter-spacing:1.5px;margin:0}} .cabecera p{{margin:2px 0 0;color:#555}} .cabecera small{{color:#777;letter-spacing:2px;font-weight:600}}
.portada img{{width:96px;height:96px;border-radius:14px;margin-bottom:18px}}
.portada h1{{font:400 54pt/0.95 'Bebas Neue';letter-spacing:2px;margin:0 0 10px}} .portada h1 span{{color:#e31a20}}
.portada p{{font-size:16pt;color:#444;max-width:560px}} .portada small{{color:#777;letter-spacing:2px;font-weight:600}}
h2{{font:400 25pt 'Bebas Neue';letter-spacing:1px;margin:30px 0 4px;padding:6px 0 6px 12px;border-left:7px solid #e31a20;background:#faf0f0;break-after:avoid}}
h3{{font:700 14.5pt 'Rajdhani';margin:18px 0 6px;display:flex;align-items:center;gap:10px;break-after:avoid}}
.num{{display:inline-grid;place-items:center;min-width:30px;height:30px;border-radius:50%;background:#e31a20;color:#fff;font:400 17pt 'Bebas Neue'}}
p{{margin:5px 0 9px}} ul,ol{{margin:5px 0 10px;padding-left:24px}} li{{margin:3px 0}}
code{{background:#eeeef1;border-radius:4px;padding:0 5px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.9em}}
.paso{{margin:8px 0 14px}}
figure{{margin:10px 0;border:1px solid #d6d6db;border-radius:8px;overflow:hidden;background:#111;break-inside:avoid}} figure img{{display:block;width:100%;height:auto;max-height:215mm;object-fit:contain;object-position:top;background:#111}}
figcaption{{background:#f4f4f6;color:#333;padding:6px 11px;font-size:11pt;border-top:1px solid #d6d6db}}
.fila{{display:flex;gap:12px;align-items:flex-start;break-inside:avoid}} .fila figure{{flex:1;margin:10px 0;min-width:0}}
.fila.movil figure{{max-width:250px}}
.marcas{{list-style:none;counter-reset:m;padding-left:0;margin:6px 0 12px}} .marcas li{{counter-increment:m;display:flex;gap:10px;align-items:baseline;margin:3px 0}}
.marcas li::before{{content:counter(m);display:inline-grid;place-items:center;min-width:25px;height:25px;border-radius:50%;background:#ffd400;color:#000;font:700 12pt system-ui;box-shadow:0 0 0 2px #000;flex:none}}
.tip,.ojo{{border-radius:7px;padding:8px 13px;margin:10px 0;break-inside:avoid}} .tip{{background:#eaf6ee;border-left:6px solid #2e9e5b}} .ojo{{background:#fff3d6;border-left:6px solid #e6a100}}
table{{width:100%;border-collapse:collapse;margin:8px 0 12px;font-size:12pt;break-inside:auto}} th,td{{border:1px solid #d6d6db;padding:6px 9px;text-align:left;vertical-align:top}} th{{background:#17171a;color:#fff}} tr{{break-inside:avoid}}
.toc{{background:#f8f8fa;border:1px solid #e1e1e6;border-radius:8px;padding:6px 18px 12px;margin:0 0 18px;break-inside:avoid}} .toc h2{{border:0;background:none;padding:0;margin:10px 0 0}} .toc ol{{columns:2;column-gap:30px}} .toc a{{color:#17171a;text-decoration:none}}
.falta{{background:#fde7e7;color:#a00;padding:20px;text-align:center;border:2px dashed #e31a20}}
.mensaje{{background:#f1f1f4;border-left:6px solid #888;padding:9px 14px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11pt;white-space:pre-wrap;margin:8px 0;break-inside:avoid}}
.pie{{margin-top:26px;border-top:1px solid #ccc;padding-top:8px;font-size:10.5pt;color:#666}}
@media print{{body{{background:#fff}} main{{max-width:none;padding:0}} h2{{break-before:auto}} a{{color:inherit;text-decoration:none}}}}
@media (max-width:640px){{main{{padding:16px}} .fila{{flex-direction:column}} .portada h1{{font-size:40pt}} .toc ol{{columns:1}}}}
</style></head><body><main>
{portada}
{toc}{cuerpo}
<p class="pie">Ikigai Training · {e(titulo)} · {date.today():%d/%m/%Y}. Las capturas usan un gimnasio de ejemplo con datos ficticios.</p>
</main></body></html>"""


# =============================================================================================== GUIA DE ADMINISTRACION
def guia_admin():
    ind = [("s1", "1. Antes de empezar"), ("s2", "2. Tu primer ingreso"), ("s3", "3. Armar el gimnasio, en orden"),
           ("s4", "4. Accesos: darle cuenta a cada profesor y miembro"), ("s5", "5. El día a día"),
           ("s6", "6. Cuando alguien se va o cambia"), ("s7", "7. Datos personales y buenas costumbres"), ("s8", "8. Si algo no sale")]
    c = []
    c.append('<h2 id="s1">1. Antes de empezar</h2>')
    c.append(p("Ikigai es la app del gimnasio: las personas reservan clases, los profesores toman asistencia y vos llevás las cuentas, los horarios y los accesos. "
               "Funciona en el celular (se instala como una aplicación) y también en cualquier computadora, entrando desde el navegador."))
    c.append(tabla(["Quién", "Qué puede hacer"], [
        ["**Administración** (vos)", "Todo: miembros, servicios, profesores, horarios, membresías, cuenta corriente, accesos, rutinas, avisos y configuración."],
        ["**Profesor**", "Ver su agenda, tomar asistencia, ver y asignar rutinas a sus alumnos, leer avisos y ver su propia cuenta con el gimnasio."],
        ["**Miembro**", "Reservar y cancelar clases, avisar si falta o llega tarde, ver su rutina, su membresía y su cuenta, y leer avisos."]]))
    c.append(p("La regla más importante: **solo administración crea usuarios**. Nadie se registra solo. Vos le das a cada persona un usuario y una clave temporal (capítulo 4)."))
    c.append(tip("Cada persona ve únicamente lo suyo. Un miembro no ve datos de otro miembro y un profesor no ve la cuenta de otro profesor."))

    c.append('<h2 id="s2">2. Tu primer ingreso</h2>')
    c.append(paso(1, "Entrá con tu usuario y la clave temporal", p("Abrí la app (o la dirección web del gimnasio) e ingresá el correo y la clave temporal que te dieron."),
                  fig("a01-ingreso", "Pantalla de ingreso."), marcas("Usuario o correo (en administración es tu correo).", "Contraseña temporal.", "Botón **Ingresar**.")))
    c.append(paso(2, "Elegí tu propia clave", p("Por seguridad la clave temporal sirve solo una vez. El sistema te pide elegir una propia: **mínimo 12 caracteres**. Al guardarla se cierran las demás sesiones abiertas con tu cuenta."),
                  fig("a02-elegir-clave", "Elegir una contraseña propia."),
                  marcas("Contraseña actual (la temporal).", "Contraseña nueva (mínimo 12 caracteres).", "Repetir la contraseña nueva.", "**Guardar contraseña**."),
                  tip("Usá una frase que recuerdes, por ejemplo tres palabras sueltas y un número. Evitá claves obvias como `123456789012` o el nombre del gimnasio: el sistema las rechaza.")))
    c.append(paso(3, "Recorré la guía de primer uso", p("La primera vez aparece una guía con globos que te muestra cada sección del menú. Podés saltarla y volver a verla cuando quieras desde **Guía de primer uso**, al final del menú."),
                  fig("a03-guia-primer-uso", "La guía de primer uso.")))
    c.append(paso(4, "Conocé el menú", fig("a04-resumen", "Pantalla de Resumen."),
                  marcas("El menú de la izquierda (en el celular es una barra que se desliza de costado).", "Indicadores: cuántos miembros, servicios y profesores hay.", "**Cerrar sesión**: siempre al terminar si usás una computadora que no es tuya.")))

    c.append('<h2 id="s3">3. Armar el gimnasio, en orden</h2>')
    c.append(p("Si cargaron los datos con la planilla, este capítulo es para que sepas **dónde está cada cosa y cómo cambiarla**. Si empezás de cero, seguí este orden: cada paso necesita el anterior."))
    c.append(lista("**Configuración**: nombre, contacto y horarios del gimnasio.", "**Servicios**: las disciplinas y su precio.", "**Profesores**.", "**Miembros**.",
                   "**Horarios**: la grilla semanal; después **generar las clases**.", "**Membresías** y **Cuenta corriente**.", "**Accesos**: usuario y clave para cada persona (capítulo 4).", tipo="ol"))
    c.append(paso(1, "Configuración del gimnasio", fig("a05-configuracion", "Menú **Configuración**: nombre, correo, teléfono, dirección y horarios de atención."), p("Escribí lo que quieras que vean las personas. Los campos vacíos quedan sin configurar.")))
    c.append(paso(2, "Servicios", fig("a06-servicios", "Menú **Servicios**."),
                  marcas("**Editar**: cambiar nombre, descripción o precio (el cambio no modifica los precios ya acordados en membresías existentes).", "Formulario **Crear servicio**."),
                  ojo("El precio de lista es una referencia. Cada membresía guarda su propio precio acordado, así que cambiar la lista no toca lo que ya se pactó con cada persona.")))
    c.append(paso(3, "Profesores", fig("a07-profesor-alta", "Menú **Profesores → Registrar profesor**."),
                  marcas("Nombre completo.", "Disciplina.", "**Crear profesor**."),
                  p("Alcanza con nombre y disciplina; el correo y el teléfono son opcionales. Un profesor recién creado todavía **no tiene acceso a la app**: se lo das en el capítulo 4.")))
    c.append(paso(4, "Miembros", fig("a08-miembros", "Menú **Miembros**: la lista de personas."),
                  marcas("**Ver / editar**: datos de contacto, estado y notas.", "**Exportar datos**: descarga todo lo que el sistema guarda de esa persona (derecho de acceso)."),
                  fig("a09-miembro-alta", "**Alta de miembro**."),
                  marcas("Nombre completo (obligatorio).", "Estado: **Activo**, **En prueba**, **Deudor**, **Suspendido** o **Baja**.", "**Crear miembro**."),
                  tabla(["Estado", "Qué significa"], [["Activo / En prueba", "Puede reservar clases."], ["Deudor", "Conserva lo ya reservado, pero no puede reservar clases nuevas."],
                                                       ["Suspendido", "Igual que deudor: no reserva clases nuevas."], ["Baja", "Ya no entrena. Ver el capítulo 6."]])))
    c.append(paso(5, "Horarios y clases", p("Primero se define **la grilla semanal** (por ejemplo «Lunes 19:00, Kick Boxing, con Camila, cupo 12»). Después el sistema **genera las clases concretas** de cada fecha."),
                  fig("a10-horario-alta", "Menú **Horarios → crear horario semanal**."),
                  marcas("Servicio.", "Profesor.", "Día de la semana.", "Cupo máximo.", "**Crear**."),
                  fig("a10b-horarios-lista", "La grilla semanal."), marcas("**Turnos fijos**: personas que siempre van a ese horario.", "**Desactivar**: el horario deja de generar clases nuevas."),
                  fig("a11-turno-fijo", "Un turno fijo reserva el lugar de esa persona en cada clase de ese horario."),
                  marcas("Miembro.", "**Asignar turno fijo**."),
                  fig("a12-generar-clases", "**Generar clases**: elegí desde y hasta qué fecha."),
                  marcas("Desde.", "Hasta.", "**Generar**."),
                  tip("Generá las clases con un mes de anticipación, por ejemplo cada primero de mes. Repetir la operación no duplica nada: solo agrega lo que falta.")))
    c.append(paso(6, "Membresías", p("La membresía dice **qué servicio contrató** una persona, desde cuándo y **a qué precio**."),
                  fig("a13-membresia", "Menú **Membresías**."),
                  marcas("Elegí al miembro.", "Servicio.", "Precio acordado (si queda vacío se usa el de lista).", "**Asignar membresía**."),
                  p("Cuando alguien deja un servicio, usá **Finalizar** en su membresía: queda en el historial.")))
    c.append(paso(7, "Cuenta corriente", p("Acá se anota lo que cada persona **debe** (cargos) y lo que **paga**. Cada movimiento queda registrado y no se borra: si te equivocás, se corrige con un **ajuste**."),
                  fig("a14-cuenta-corriente", "Menú **Cuenta corriente**."),
                  marcas("Tipo: **Cargo** (la persona debe), **Pago**, **Ajuste** o **Reintegro**.", "Importe en pesos.", "**Registrar movimiento**."),
                  tabla(["Quiero…", "Tipo"], [["Anotar la cuota del mes", "Cargo"], ["Anotar que pagó (con efectivo, transferencia…)", "Pago (completá la forma de pago)"],
                                              ["Corregir un error o dar un descuento", "Ajuste (elegí si suma o resta)"], ["Devolver plata", "Reintegro"]]),
                  ojo("Nada se edita ni se borra. Si cargaste mal un importe, hacé un ajuste que lo compense y escribí el motivo.")))

    c.append('<h2 id="s4">4. Accesos: darle cuenta a cada profesor y miembro</h2>')
    c.append(p("Este es el paso que te hace falta para que alguien use la app. **Nadie puede entrar si vos no le creás el acceso.** "
               "El sistema le arma un **usuario** a partir de su nombre y le genera una **clave temporal** al azar."))
    c.append(tabla(["Dato", "Cómo es", "Ejemplo"], [["Usuario", "`ikigai-miembro-` o `ikigai-profesor-` + el primer nombre (si hay dos iguales, se agrega el apellido)", "`ikigai-miembro-lucas`"],
                                                   ["Clave temporal", "Iniciales + 8 caracteres al azar. Se muestra **una sola vez**.", "`LB-Ikigai-K7Q4-9XMP`"]]))
    c.append(paso(1, "Abrí «Accesos»", fig("a15-accesos", "Menú **Accesos**: todas las personas y su estado de acceso."),
                  marcas("Las dos listas: **Profesores** y **Miembros**.", "El estado: **Sin acceso** (todavía no tiene cuenta), **Debe cambiar la clave** (tiene cuenta pero no entró todavía) o **Activo**.",
                         "**Restablecer clave**: si la olvidó.", "**Deshabilitar acceso**: si no debe entrar más."),
                  ))
    c.append(paso(2, "Creá el acceso de un profesor", fig("a16-acceso-profesor-antes", "Un profesor sin acceso."),
                  marcas("Estado **Sin acceso**.", "Botón **Crear acceso**."),
                  p("Tocá **Crear acceso**. Aparece un cuadro con el usuario y la clave temporal:"),
                  fig("a17-credenciales-profesor", "El acceso recién creado."),
                  marcas("**Usuario** de la persona.", "**Clave temporal**.", "**Copiar mensaje con el acceso**: copia un mensaje listo para pegar en WhatsApp."),
                  ojo("La clave aparece **una sola vez**. Si cerrás la pantalla sin anotarla o copiarla, usá **Restablecer clave** para generar otra."),
                  p("El mensaje que se copia dice así:"),
                  '<div class="mensaje">Hola Valeria Duarte, este es tu acceso a Ikigai Training.\nUsuario: ikigai-profesor-valeria\nClave temporal: VD-Ikigai-AT3R-CPCF\nAl entrar por primera vez te va a pedir que la cambies por una propia.</div>',
                  tip("Entregá el acceso **en mano o por mensaje directo**, nunca en un grupo. Después de que la persona entra y elige su clave, la temporal ya no sirve para nada.")))
    c.append(paso(3, "Creá el acceso de un miembro", p("Es exactamente igual. Buscá a la persona en la lista **Miembros** y tocá **Crear acceso**."),
                  fig("a18-acceso-miembro-antes", "Un miembro sin acceso."), fig("a19-credenciales-miembro", "El acceso del miembro, listo para entregar.")))
    c.append(paso(4, "¿Muchas personas a la vez?", p("Para el primer día (o si cargaste muchos miembros) hay una herramienta que **crea todos los accesos de una vez** y arma **una hoja imprimible con una tarjeta por persona**. "
                                                    "Pedísela a quien te dio la app: se corre desde una computadora, no desde la app. Las tarjetas se imprimen, se recortan, se entregan en mano y el archivo se borra.")))
    c.append(paso(5, "Qué hace cada persona al recibir su acceso", lista(
        "Abre la app (o la dirección web del gimnasio).", "Ingresa su **usuario** y la **clave temporal**.", "El sistema le pide elegir **su propia clave** (mínimo 12 caracteres).",
        "Listo: ya ve lo suyo. Desde ese momento solo ella la conoce.", tipo="ol"),
                  tip("Si una persona no tiene correo electrónico, no importa: entra con su usuario. Solo que si olvida la clave **no recibe un mail**: tiene que pedírtela y vos usás **Restablecer clave**.")))
    c.append(paso(6, "Si alguien olvidó su clave", fig("a20-restablecer-antes", "El botón **Restablecer clave**.", ancho="780px"), p("Tocá **Restablecer clave**, confirmá, y se genera otra clave temporal (se cierran sus sesiones abiertas). Dásela como la primera vez."),
                  fig("a20b-restablecer-despues", "La nueva clave temporal.")))
    c.append(paso(7, "Si alguien no tiene que entrar más", p("Usá **Deshabilitar acceso**: la persona **queda afuera al instante** (se cierran sus sesiones) pero **no se borra nada de su historial**. Se puede revertir cuando quieras."),
                  fig("a21-deshabilitar-antes", "El botón **Deshabilitar acceso**."), fig("a22-deshabilitado", "Acceso deshabilitado: ahora aparece **Habilitar acceso**."),
                  p("**Habilitar acceso** le devuelve el ingreso con **la misma clave que ya tenía**."),
                  ojo("Deshabilitar el acceso no cambia el **estado del miembro** (Activo, Baja…). Son dos cosas distintas: ver el capítulo 6.")))

    c.append('<h2 id="s5">5. El día a día</h2>')
    c.append(paso(1, "Agenda y asistencia", fig("a23-agenda", "Menú **Agenda**."),
                  marcas("**Tomar asistencia** (el botón aparece cuando la clase ya empezó; la toma el profesor y vos también podés).", "**Cancelar clase**: se cancelan las reservas de esa clase. No hay aviso automático al celular: avisá por el grupo de WhatsApp."),
                  tabla(["Regla", "Cómo funciona"], [["Reservar", "Botón **Reservar clase**. Pueden reservar los miembros **Activos** y **En prueba**."], ["Cupo lleno", "El botón dice **Anotarme en espera**; si se libera un lugar, la persona pasa sola."],
                                                     ["Cancelar", "Hasta **40 minutos antes** de la clase."], ["Faltar o llegar tarde", "La persona **avisa** desde la app. Es informativo: no cancela la reserva ni genera multas."]])))
    c.append(paso(2, "Rutinas", p("Creás ejercicios, armás rutinas (con series, repeticiones y descansos) y se las asignás a cada miembro. Cada cambio crea una **versión nueva**: lo que ya tenía asignado la persona no cambia hasta que le asignes la nueva."),
                  fig("a24-rutina-nueva", "Menú **Rutinas → Nueva rutina**."), marcas("Nombre.", "Agregar otro ejercicio.", "**Crear rutina**."),
                  fig("a24b-rutina-asignar", "**Asignar una rutina** a un miembro con una nota.")))
    c.append(paso(3, "Avisos", p("Mensajes dentro de la app para todos, solo para miembros o solo para profesores. Cada persona ve su contador de avisos sin leer."),
                  fig("a25-aviso", "Menú **Avisos → Publicar un aviso**."), marcas("Título y mensaje.", "**Para**: Todos, Solo miembros o Solo profesores.", "**Publicar aviso**."),
                  p("Podés **archivar** un aviso cuando ya no corresponde: deja de mostrarse, no se borra."),
                  ojo("Los avisos se ven **dentro de la app**: todavía no llegan como notificación al celular. Para algo urgente, usá también el grupo de WhatsApp.")))

    c.append('<h2 id="s6">6. Cuando alguien se va o cambia</h2>')
    c.append(tabla(["Situación", "Qué hacer"], [
        ["Un miembro **se da de baja**", "1) **Miembros → Ver / editar → Estado: Baja**. 2) **Membresías → Finalizar** su membresía. 3) **Accesos → Deshabilitar acceso**. Queda todo el historial."],
        ["Un miembro **vuelve**", "**Miembros → Ver / editar → Estado: Activo** y **Accesos → Habilitar acceso**."],
        ["Un miembro **se atrasa en el pago**", "Estado **Deudor**: conserva sus clases ya reservadas pero no puede reservar nuevas hasta regularizar."],
        ["Un profesor **deja de dar clases**", "**Accesos → Deshabilitar acceso** y **Horarios → Desactivar** (o cambiar el profesor) sus horarios."],
        ["Alguien **cambia de teléfono**", "No hace falta nada: entra con el mismo usuario y su clave. Si perdió el teléfono, **Deshabilitar acceso** y luego **Habilitar** o **Restablecer clave**."],
        ["Hay que **borrar los datos** de alguien que se fue", "**Miembros**, persona en estado **Baja → Anonimizar**. Borra su nombre, DNI, contacto y notas, conserva los números (cobros, asistencias) sin identificarlo. **No se puede deshacer.**"]]))

    c.append('<h2 id="s7">7. Datos personales y buenas costumbres</h2>')
    c.append(lista("La app guarda datos personales (nombres, DNI, teléfonos): son **responsabilidad del gimnasio**. Cada miembro puede pedir que le muestres o le entregues sus datos: usá **Exportar datos**.",
                   "**No compartas tu clave de administración.** Si otra persona va a administrar, pedí que se le cree su propia cuenta.",
                   "Cerrá sesión en computadoras compartidas.",
                   "**No escribas datos de salud ni opiniones sobre terceros** en «Notas internas».",
                   "Entregá las claves temporales en mano o por mensaje directo, nunca en grupos.",
                   "Las **copias de seguridad** de la base de datos las hace el servidor; asegurate de que alguien las revise y las guarde también fuera del servidor."))

    c.append('<h2 id="s8">8. Si algo no sale</h2>')
    c.append(tabla(["Qué pasa", "Qué hacer"], [
        ["«Usuario o contraseña incorrectos»", "Revisá mayúsculas y espacios. Si la persona se equivocó muchas veces, la cuenta se bloquea unos minutos: esperá y probá de nuevo."],
        ["La persona no puede entrar nunca", "Mirá en **Accesos** si está **Acceso deshabilitado** (usá **Habilitar acceso**) o si todavía tiene **Debe cambiar la clave** (entra con la clave temporal)."],
        ["Se perdió la clave temporal", "**Restablecer clave** y entregar la nueva."],
        ["Un miembro no puede reservar", "Mirá su estado en **Miembros**: **Deudor**, **Suspendido** o **Baja** no reservan. También puede ser que la clase esté llena (lista de espera) o falte menos de 40 minutos."],
        ["No aparecen clases en la Agenda", "Falta **generar las clases** (capítulo 3, paso 5) o los horarios están desactivados."],
        ["La app no abre o dice «sin conexión»", "Revisá el internet del celular. La app guarda lo básico para abrir sin conexión pero **no registra nada** hasta que vuelva la red."],
        ["Algo se ve raro después de una actualización", "Cerrá la app por completo y volvé a abrirla."]]))
    c.append(p("Si ves un error que no figura acá, sacale una captura y mandásela a quien te dio la app, con el día y la hora."))
    return pagina("Guía de uso para administración", "Cómo armar el gimnasio y darle cuenta a cada profesor y miembro.", "".join(c), ind)


# =============================================================================================== HOJA PARA PROFESORES
def hoja_profesores():
    c = ['<h2>Tu app de profesor</h2>', p("Con la app ves tus clases, tomás asistencia y mirás las rutinas de tus alumnos. Todo desde el celular."),
         paso(1, "Primer ingreso", p("Administración te da un **usuario** (por ejemplo `ikigai-profesor-camila`) y una **clave temporal**. Ingresá con eso: la app te pide elegir **tu propia clave** (mínimo 12 caracteres). Anotala en un lugar seguro."),
              fig("p01-profesor-clave", "Elegir tu clave la primera vez.", ancho="700px")),
         paso(2, "Tu menú", fig("p02-profesor-resumen", "El menú del profesor.", ancho="800px"),
              marcas("**Agenda** (tus clases), **Rutinas**, **Avisos**, **Profesores** (acá ves tu propia cuenta con el gimnasio) y **Mi contraseña**.")),
         paso(3, "Tomar asistencia", p("Entrá a **Agenda**. Cuando la clase ya empezó aparece el botón **Tomar asistencia**."), fig("p03-profesor-agenda", "Tus clases en la Agenda.", ancho="800px"),
              marcas("**Tomar asistencia**."),
              fig("p04-profesor-asistencia", "Elegí para cada alumno: **presente**, **ausente** o **llegó tarde**, y tocá **Guardar asistencia**.", ancho="800px"),
              marcas("Estado de cada alumno.", "**Guardar asistencia**."),
              tip("Si te equivocás, volvé a entrar a la clase, corregí y guardá de nuevo: queda registrada la corrección.")),
         paso(4, "Rutinas, avisos y tu cuenta", lista("**Rutinas**: ves la biblioteca y podés **asignar una rutina** a tus alumnos con una nota.",
                                                      "**Avisos**: las novedades del gimnasio. El número rojo del menú son los que no leíste.",
                                                      "**Profesores** (en el menú): tu cuota mensual con el gimnasio, tus pagos y el saldo. Solo la ves vos.")),
         '<div class="ojo"><b>Importante.</b> Tu clave es personal. No la compartas. Si la olvidás, pedíle a administración que te genere una nueva: no hay forma de verla.</div>']
    return pagina("Hoja para profesores", "Lo básico para usar Ikigai en tus clases.", "".join(c), compacta=True)


# =============================================================================================== HOJA PARA MIEMBROS
def hoja_miembros():
    c = ['<h2>Tu app del gimnasio</h2>', p("Reservá tus clases, avisá si no vas, mirá tu rutina y tu cuenta. Todo desde el celular."),
         paso(1, "Instalala", tabla(["Tu celular", "Cómo"], [
             ["**Android**", "Entrá a la página del gimnasio y tocá **Descargar APK**. Si Chrome avisa que puede dañar el dispositivo, tocá *Descargar de todos modos*. Abrí el archivo y permití instalar desde esa fuente."],
             ["**iPhone**", "Abrí la dirección web del gimnasio en **Safari**, tocá el botón **Compartir** y elegí **Agregar a pantalla de inicio**."]])),
         paso(2, "Primer ingreso", p("En recepción te dan un **usuario** (por ejemplo `ikigai-miembro-lucas`) y una **clave temporal**. Ingresá con eso y elegí **tu propia clave** (mínimo 12 caracteres)."),
              fila(fig("m01-miembro-clave", "Elegí tu clave."), fig("m02-miembro-resumen", "Tu resumen."), clase="movil")),
         paso(3, "Reservar una clase", p("Entrá a **Agenda**. Tocá **Reservar clase** en la que quieras. Si está llena dice **Anotarme en espera**: entrás a la lista y pasás solo y te pasa sola si se libera un lugar."),
              fila(fig("m03-miembro-agenda", "Tocá **Reservar clase**."), fig("m04-miembro-reserva", "Reservada: podés **cancelar** (hasta 40 minutos antes) o **avisar**."), clase="movil"),
              marcas("**Reservar clase**.", "**Cancelar reserva**.", "Avisar que **no vas** o que **llegás tarde** (es solo un aviso para el profesor)."),
              tip("Si tenés un turno fijo, tu lugar ya está reservado en cada clase: si un día no vas, avisalo desde la reserva.")),
         paso(4, "Tu rutina y tu cuenta", fila(fig("m05-miembro-rutina", "Tu rutina con los ejercicios y las notas de tu profesor."), fig("m06-miembro-cuenta", "Tu cuenta: cuánto pagaste y tu saldo."), clase="movil")),
         paso(5, "Avisos", fila(fig("m07-miembro-avisos", "Las novedades del gimnasio."), clase="movil"), p("El número rojo del menú son los avisos que todavía no leíste.")),
         paso(6, "Tus datos", p("En **Resumen** podés **actualizar tu teléfono y dirección** y **descargar tus datos** cuando quieras.")),
         '<div class="ojo"><b>Importante.</b> Tu clave es solo tuya. Si la olvidás, pedí en recepción que te generen otra.</div>']
    return pagina("Hoja para miembros", "Cómo reservar tus clases y usar Ikigai.", "".join(c), compacta=True)


def pdf(ruta_html, ruta_pdf):
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page()
        pg.goto("file://" + ruta_html)
        pg.wait_for_timeout(800)
        pg.pdf(path=ruta_pdf, format="A4", print_background=True, margin={"top": "13mm", "bottom": "13mm", "left": "12mm", "right": "12mm"},
               display_header_footer=True, header_template="<span></span>",
               footer_template='<div style="font-size:8px;width:100%;text-align:center;color:#777;font-family:sans-serif">Ikigai Training · <span class="pageNumber"></span> / <span class="totalPages"></span></div>')
        b.close()


def main():
    os.makedirs(SALIDA, exist_ok=True)
    docs = {"Guia-Ikigai-Administracion": guia_admin(), "Hoja-Profesores": hoja_profesores(), "Hoja-Miembros": hoja_miembros()}
    for nombre, contenido in docs.items():
        h = os.path.join(SALIDA, nombre + ".html")
        with open(h, "w", encoding="utf-8") as f:
            f.write(contenido)
        pdf(h, os.path.join(SALIDA, nombre + ".pdf"))
        print("escrito", nombre, f"({os.path.getsize(h) // 1024} KB html)")
    if faltan:
        print("FALTAN CAPTURAS:", sorted(set(faltan)))
        sys.exit(1)


if __name__ == "__main__":
    main()
