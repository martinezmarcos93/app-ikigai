"""Esquema de la planilla de carga de datos de Ikigai: una sola definicion de hojas y columnas que usan el generador
de la planilla (generar_planilla.py) y el importador (importar_datos.py), para que nunca se desincronicen.

Cada columna: (clave, encabezado, obligatoria, ancho, ayuda). Los encabezados terminados en * son obligatorios.
"""
DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]   # indice = weekday de la API (0 = domingo)
ESTADOS = {"Activo": "active", "En prueba": "trial", "Deudor": "debtor", "Suspendido": "suspended", "Baja": "exited"}
PERIODOS = {"Mensual": "monthly", "Semanal": "weekly", "Trimestral": "quarterly", "Anual": "annual", "Personalizado": "custom"}
SALDOS = {"Debe": "debit", "A favor": "credit"}

HOJAS = {
    "Gimnasio": {
        "titulo": "Datos del gimnasio",
        "ayuda": "Una sola fila. Sale en el portal y en los avisos.",
        "maximo": 1,
        "columnas": [
            ("nombre", "Nombre del gimnasio", False, 30, "Como querés que figure. Ej.: Ikigai Training."),
            ("email", "Correo de contacto", False, 30, "Correo público del gimnasio."),
            ("telefono", "Teléfono / WhatsApp", False, 22, "Ej.: 11 6282-1564."),
            ("direccion", "Dirección", False, 36, "Calle, número y localidad."),
            ("horarios", "Horarios de atención", False, 40, "Texto libre. Ej.: Lunes a viernes de 8 a 21 hs."),
        ],
    },
    "Servicios": {
        "titulo": "Servicios (disciplinas) que ofrece el gimnasio",
        "ayuda": "Una fila por servicio. El precio es el de lista; cada membresía puede tener el suyo.",
        "maximo": 60,
        "columnas": [
            ("nombre", "Servicio *", True, 28, "Ej.: Kick Boxing, Tae Kwon Do, Funcional."),
            ("descripcion", "Descripción", False, 40, "Opcional."),
            ("precio", "Precio mensual de lista", False, 22, "Solo números, sin $ ni puntos de miles. Ej.: 28000."),
        ],
    },
    "Profesores": {
        "titulo": "Profesores",
        "ayuda": "Una fila por profesor. Después se les crea el acceso a la app.",
        "maximo": 60,
        "columnas": [
            ("nombre", "Nombre completo *", True, 30, "Nombre y apellido, tal como se va a mostrar."),
            ("disciplina", "Disciplina *", True, 24, "Lo que enseña. Ej.: Kick Boxing."),
            ("email", "Correo", False, 30, "Opcional."),
            ("telefono", "Teléfono", False, 20, "Opcional."),
        ],
    },
    "Miembros": {
        "titulo": "Miembros (alumnos)",
        "ayuda": "Una fila por persona. Si dos personas se llaman igual, completá el DNI para distinguirlas.",
        "maximo": 500,
        "columnas": [
            ("nombre", "Nombre completo *", True, 30, "Nombre y apellido. Es la forma de nombrar al miembro en las otras hojas."),
            ("dni", "DNI", False, 14, "Solo números. Recomendado."),
            ("email", "Correo", False, 30, "Opcional."),
            ("telefono", "Teléfono", False, 20, "Opcional."),
            ("direccion", "Dirección", False, 30, "Opcional."),
            ("emergencia_nombre", "Contacto de emergencia", False, 26, "Nombre de a quién avisar."),
            ("emergencia_telefono", "Teléfono de emergencia", False, 22, "Opcional."),
            ("estado", "Estado", False, 14, "Activo (por defecto), En prueba, Deudor, Suspendido o Baja."),
            ("alta", "Fecha de alta", False, 14, "dd/mm/aaaa. Opcional."),
            ("notas", "Notas internas", False, 40, "Solo para el gimnasio. No anotar datos de salud ni opiniones sobre terceros."),
        ],
    },
    "Horarios": {
        "titulo": "Horarios semanales de clases",
        "ayuda": "Una fila por clase que se repite cada semana. Con esto el sistema genera las clases concretas.",
        "maximo": 300,
        "columnas": [
            ("servicio", "Servicio *", True, 24, "Elegilo de la lista (viene de la hoja Servicios)."),
            ("profesor", "Profesor *", True, 28, "Elegilo de la lista (viene de la hoja Profesores)."),
            ("dia", "Día *", True, 14, "Lunes a Domingo."),
            ("hora", "Hora de inicio *", True, 16, "Formato 19:00."),
            ("duracion", "Duración (minutos) *", True, 20, "Ej.: 60."),
            ("cupo", "Cupo *", True, 10, "Cantidad máxima de personas (1 a 30)."),
        ],
    },
    "Turnos fijos": {
        "titulo": "Turnos fijos (quien siempre va al mismo horario)",
        "ayuda": "Opcional. Reserva automática del lugar de una persona en un horario semanal.",
        "maximo": 1500,
        "columnas": [
            ("miembro", "Miembro *", True, 30, "Nombre completo (o DNI) tal como está en la hoja Miembros."),
            ("servicio", "Servicio *", True, 24, "El del horario."),
            ("profesor", "Profesor *", True, 28, "El del horario."),
            ("dia", "Día *", True, 14, "El del horario."),
            ("hora", "Hora *", True, 12, "La del horario. Formato 19:00."),
            ("desde", "Desde", False, 14, "dd/mm/aaaa. Si queda vacío, desde hoy."),
        ],
    },
    "Membresías": {
        "titulo": "Membresías (qué contrató cada miembro)",
        "ayuda": "Opcional pero recomendado: sin esto el sistema no sabe qué servicio paga cada persona.",
        "maximo": 1500,
        "columnas": [
            ("miembro", "Miembro *", True, 30, "Nombre completo (o DNI) tal como está en la hoja Miembros."),
            ("servicio", "Servicio *", True, 24, "Elegilo de la lista."),
            ("desde", "Desde *", True, 14, "dd/mm/aaaa. Fecha de inicio de la membresía."),
            ("hasta", "Hasta", False, 14, "dd/mm/aaaa. Vacío si no tiene fin."),
            ("periodo", "Período de cobro", False, 18, "Mensual (por defecto), Semanal, Trimestral, Anual o Personalizado."),
            ("precio", "Precio acordado", False, 18, "Solo números. Si queda vacío se usa el precio de lista del servicio."),
        ],
    },
    "Saldos iniciales": {
        "titulo": "Saldos iniciales (deudas o saldos a favor al empezar)",
        "ayuda": "Opcional. Lo que cada persona debe o tiene a favor HOY, para arrancar la cuenta corriente.",
        "maximo": 500,
        "columnas": [
            ("miembro", "Miembro *", True, 30, "Nombre completo (o DNI) tal como está en la hoja Miembros."),
            ("tipo", "Tipo *", True, 12, "Debe (la persona debe plata) o A favor (pagó de más)."),
            ("importe", "Importe *", True, 14, "Solo números, sin signo. Ej.: 15000."),
            ("fecha", "Fecha *", True, 14, "dd/mm/aaaa. Normalmente la de hoy."),
            ("detalle", "Detalle", False, 40, "Ej.: Cuota de septiembre pendiente."),
        ],
    },
}
ORDEN = list(HOJAS)
