"""Pruebas del validador de la planilla (sin red ni openpyxl): python -m unittest tools/datos/test_importador.py"""
import datetime as dt
import os
import sys
import unittest
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importar_datos as imp  # noqa: E402
from esquema import ORDEN  # noqa: E402


def planilla(**hojas):
    base = {n: [] for n in ORDEN}
    for nombre, filas in hojas.items():
        base[nombre.replace("_", " ")] = [dict(f, _fila=i + 2) for i, f in enumerate(filas)]
    return base


MINIMA = dict(
    Servicios=[{"nombre": "Yoga", "precio": "25.000"}],
    Profesores=[{"nombre": "Ana Paz", "disciplina": "Yoga"}],
    Miembros=[{"nombre": "Luis Gómez", "dni": "30.111.222"}, {"nombre": "Luisa Gómez"}],
)


class Limpieza(unittest.TestCase):
    def test_fechas(self):
        self.assertEqual(imp.fecha("15/03/2026"), (dt.date(2026, 3, 15), True))
        self.assertEqual(imp.fecha(dt.datetime(2026, 3, 15, 0, 0)), (dt.date(2026, 3, 15), True))
        self.assertEqual(imp.fecha(46103), (dt.date(2026, 3, 22), True))   # serie de Excel
        self.assertEqual(imp.fecha("mañana"), (None, False))
        self.assertEqual(imp.fecha(None), (None, True))

    def test_horas(self):
        self.assertEqual(imp.hora("9:00"), ("09:00", True))
        self.assertEqual(imp.hora("19.30"), ("19:30", True))
        self.assertEqual(imp.hora(dt.time(8, 5)), ("08:05", True))
        self.assertEqual(imp.hora(0.75), ("18:00", True))
        self.assertEqual(imp.hora("25:00"), (None, False))

    def test_dinero_argentino(self):
        self.assertEqual(imp.dinero("28.000"), (Decimal("28000.00"), True))
        self.assertEqual(imp.dinero("$ 28.000,50"), (Decimal("28000.50"), True))
        self.assertEqual(imp.dinero(28000), (Decimal("28000.00"), True))
        self.assertEqual(imp.dinero("abc"), (None, False))
        self.assertEqual(imp.dinero(-5), (None, False))


class Validacion(unittest.TestCase):
    def test_planilla_correcta(self):
        m, inf = imp.validar(planilla(**MINIMA))
        self.assertEqual(inf.errores, [])
        self.assertEqual(m["Servicios"][0]["precio"], Decimal("25000.00"))
        self.assertEqual(m["Miembros"][0]["dni"], "30111222")

    def test_vacia(self):
        _, inf = imp.validar(planilla())
        self.assertTrue(any("vacía" in e for e in inf.errores))

    def test_referencias_rotas_se_informan_con_hoja_y_fila(self):
        horarios = [{"servicio": "Boxeo", "profesor": "Ana Paz", "dia": "Lunes", "hora": "19:00", "duracion": 60, "cupo": 10}]
        _, inf = imp.validar(planilla(**MINIMA, Horarios=horarios))
        self.assertTrue(any(e.startswith("[Horarios, fila 2]") and "Boxeo" in e for e in inf.errores), inf.errores)

    def test_homonimos_exigen_dni(self):
        miembros = [{"nombre": "Juan Pérez"}, {"nombre": "juan perez", "dni": "1234567"}]
        _, inf = imp.validar(planilla(Servicios=MINIMA["Servicios"], Profesores=MINIMA["Profesores"], Miembros=miembros))
        self.assertTrue(any("completá el DNI" in e for e in inf.errores))

    def test_dni_repetido(self):
        miembros = [{"nombre": "A B", "dni": "1234567"}, {"nombre": "C D", "dni": "1.234.567"}]
        _, inf = imp.validar(planilla(Servicios=MINIMA["Servicios"], Profesores=MINIMA["Profesores"], Miembros=miembros))
        self.assertTrue(any("DNI 1234567 ya está" in e for e in inf.errores))

    def test_membresia_hasta_antes_de_desde_y_miembro_inexistente(self):
        ms = [{"miembro": "Luis Gómez", "servicio": "Yoga", "desde": "10/03/2026", "hasta": "01/03/2026"},
              {"miembro": "Nadie", "servicio": "Yoga", "desde": "10/03/2026"}]
        _, inf = imp.validar(planilla(**MINIMA, Membresías=ms))
        self.assertTrue(any("anterior a" in e for e in inf.errores))
        self.assertTrue(any("«Nadie»" in e for e in inf.errores))

    def test_turno_fijo_exige_el_horario(self):
        tf = [{"miembro": "Luis Gómez", "servicio": "Yoga", "profesor": "Ana Paz", "dia": "Lunes", "hora": "19:00"}]
        _, inf = imp.validar(planilla(**MINIMA, Turnos_fijos=tf))
        self.assertTrue(any("No existe ese horario" in e for e in inf.errores))
        hor = [{"servicio": "Yoga", "profesor": "Ana Paz", "dia": "Lunes", "hora": "19:00", "duracion": 60, "cupo": 8}]
        m, inf = imp.validar(planilla(**MINIMA, Horarios=hor, Turnos_fijos=tf))
        self.assertEqual(inf.errores, [])
        self.assertEqual(len(m["Turnos fijos"]), 1)

    def test_saldo_usa_el_tipo_de_la_api(self):
        s = [{"miembro": "Luis Gómez", "tipo": "A favor", "importe": "5.000", "fecha": "01/10/2026"}]
        m, inf = imp.validar(planilla(**MINIMA, Saldos_iniciales=s))
        self.assertEqual(inf.errores, [])
        self.assertEqual(m["Saldos iniciales"][0]["tipo"], "credit")


if __name__ == "__main__":
    unittest.main()
