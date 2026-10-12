"""Gimnasio FICTICIO para la planilla de ejemplo, la demo y las capturas del instructivo. Todos los nombres, DNI,
telefonos y correos son inventados (correos @example.test; telefonos con el rango 555 reservado a ficcion)."""
from datetime import date

HOY = date.today()


def _d(dia, mes, anio):
    return date(anio, mes, dia)


GIMNASIO = [{
    "nombre": "Gimnasio Ejemplo (datos ficticios)",
    "email": "contacto@example.test",
    "telefono": "11 5555-0100",
    "direccion": "Calle Ejemplo 1234, Localidad Ejemplo",
    "horarios": "Lunes a viernes de 8 a 21 hs. Sábados de 9 a 13 hs.",
}]

SERVICIOS = [
    {"nombre": "Kick Boxing", "descripcion": "Golpes y patadas: potencia, velocidad y resistencia.", "precio": 28000},
    {"nombre": "Tae Kwon Do", "descripcion": "Arte marcial coreano: técnica, disciplina y flexibilidad.", "precio": 26000},
    {"nombre": "Funcional", "descripcion": "Circuitos de alta intensidad.", "precio": 24000},
]

PROFESORES = [
    {"nombre": "Camila Ortega", "disciplina": "Kick Boxing", "email": "camila@example.test", "telefono": "11 5555-0111"},
    {"nombre": "Martín Sosa", "disciplina": "Tae Kwon Do", "email": "martin@example.test", "telefono": "11 5555-0122"},
    {"nombre": "Julieta Paz", "disciplina": "Funcional", "email": "julieta@example.test", "telefono": "11 5555-0133"},
]

_NOMBRES = [
    ("Lucas Benítez", "30111201", "Activo"), ("Sofía Giménez", "31222302", "Activo"), ("Mateo Aguirre", "32333403", "Activo"),
    ("Valentina Rojas", "33444504", "Activo"), ("Joaquín Méndez", "34555605", "Activo"), ("Agustina Herrera", "35666706", "Activo"),
    ("Tomás Vega", "36777807", "En prueba"), ("Martina Cabrera", "37888908", "Activo"), ("Nicolás Ríos", "38999009", "Deudor"),
    ("Emilia Navarro", "39000110", "Activo"), ("Bruno Castillo", "40111211", "Activo"), ("Delfina Molina", "41222312", "Activo"),
    ("Franco Silva", "42333413", "Deudor"), ("Renata Acosta", "43444514", "Activo"), ("Ignacio Peralta", "44555615", "Suspendido"),
    ("Julia Domínguez", "45666716", "Activo"),
]

MIEMBROS = [
    {
        "nombre": n, "dni": dni, "email": f"{n.split()[0].lower().replace('í', 'i').replace('á', 'a')}{i}@example.test",
        "telefono": f"11 5555-{1000 + i * 7:04d}", "direccion": f"Calle Ejemplo {100 + i * 10}", "estado": estado,
        "emergencia_nombre": "Familiar de ejemplo", "emergencia_telefono": f"11 5555-{2000 + i * 3:04d}",
        "alta": _d(1 + i % 27, 3 + i % 6, 2026), "notas": "Cuidado en rodilla derecha." if i == 2 else None,
    }
    for i, (n, dni, estado) in enumerate(_NOMBRES)
]

_SEMANA = [
    # (servicio, profesor, dias, hora, duracion, cupo)
    ("Kick Boxing", "Camila Ortega", ["Lunes", "Miércoles", "Viernes"], "19:00", 60, 12),
    ("Kick Boxing", "Camila Ortega", ["Lunes", "Miércoles", "Viernes"], "20:15", 60, 12),
    ("Tae Kwon Do", "Martín Sosa", ["Martes", "Jueves"], "18:30", 60, 10),
    ("Tae Kwon Do", "Martín Sosa", ["Sábado"], "10:00", 90, 10),
    ("Funcional", "Julieta Paz", ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"], "09:00", 50, 14),
    ("Funcional", "Julieta Paz", ["Martes", "Jueves"], "20:00", 50, 14),
]
HORARIOS = [
    {"servicio": s, "profesor": p, "dia": d, "hora": h, "duracion": dur, "cupo": c}
    for (s, p, dias, h, dur, c) in _SEMANA for d in dias
]

# Cada miembro sigue una disciplina principal; algunos tienen turno fijo.
_PRINCIPAL = ["Kick Boxing", "Kick Boxing", "Tae Kwon Do", "Funcional", "Kick Boxing", "Funcional", "Tae Kwon Do", "Funcional",
              "Kick Boxing", "Funcional", "Tae Kwon Do", "Kick Boxing", "Funcional", "Kick Boxing", "Tae Kwon Do", "Funcional"]
_PRECIO = {s["nombre"]: s["precio"] for s in SERVICIOS}

MEMBRESIAS = [
    {"miembro": m["nombre"], "servicio": _PRINCIPAL[i], "desde": _d(1, 3 + i % 6, 2026), "hasta": None,
     "periodo": "Mensual", "precio": _PRECIO[_PRINCIPAL[i]] - (2000 if i % 5 == 0 else 0)}
    for i, m in enumerate(MIEMBROS) if m["estado"] != "Suspendido"
]

TURNOS_FIJOS = [
    {"miembro": MIEMBROS[0]["nombre"], "servicio": "Kick Boxing", "profesor": "Camila Ortega", "dia": "Lunes", "hora": "19:00", "desde": None},
    {"miembro": MIEMBROS[0]["nombre"], "servicio": "Kick Boxing", "profesor": "Camila Ortega", "dia": "Miércoles", "hora": "19:00", "desde": None},
    {"miembro": MIEMBROS[1]["nombre"], "servicio": "Kick Boxing", "profesor": "Camila Ortega", "dia": "Lunes", "hora": "20:15", "desde": None},
    {"miembro": MIEMBROS[2]["nombre"], "servicio": "Tae Kwon Do", "profesor": "Martín Sosa", "dia": "Martes", "hora": "18:30", "desde": None},
    {"miembro": MIEMBROS[3]["nombre"], "servicio": "Funcional", "profesor": "Julieta Paz", "dia": "Lunes", "hora": "09:00", "desde": None},
    {"miembro": MIEMBROS[5]["nombre"], "servicio": "Funcional", "profesor": "Julieta Paz", "dia": "Martes", "hora": "20:00", "desde": None},
]

SALDOS = [
    {"miembro": "Nicolás Ríos", "tipo": "Debe", "importe": 28000, "fecha": HOY, "detalle": "Cuota del mes anterior pendiente."},
    {"miembro": "Franco Silva", "tipo": "Debe", "importe": 48000, "fecha": HOY, "detalle": "Dos cuotas pendientes."},
    {"miembro": "Emilia Navarro", "tipo": "A favor", "importe": 5000, "fecha": HOY, "detalle": "Pagó de más el mes pasado."},
]

DATOS = {
    "Gimnasio": GIMNASIO, "Servicios": SERVICIOS, "Profesores": PROFESORES, "Miembros": MIEMBROS, "Horarios": HORARIOS,
    "Turnos fijos": TURNOS_FIJOS, "Membresías": MEMBRESIAS, "Saldos iniciales": SALDOS,
}
