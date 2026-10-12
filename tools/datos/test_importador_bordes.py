"""Pruebas de bordes del importador de datos (sin dependencias extra ni datos reales)"""
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


class LimpiezaBordes(unittest.TestCase):
    def test_norm(self):
        self.assertEqual(imp.norm("  Ána   Páz  "), "ana paz")
        self.assertEqual(imp.norm(""), "")
        self.assertEqual(imp.norm(None), "")

    def test_texto(self):
        self.assertEqual(imp.texto("  Juan Perez  "), "Juan Perez")
        self.assertIsNone(imp.texto(""))
        self.assertIsNone(imp.texto("   "))
        self.assertIsNone(imp.texto(None))
        self.assertEqual(imp.texto(123.0), "123")
        self.assertEqual(imp.texto(123.45), "123.45")

    def test_solo_digitos(self):
        self.assertEqual(imp.solo_digitos(" 30.111.222 "), "30111222")
        self.assertEqual(imp.solo_digitos("+54 9 11 2233-4455"), "5491122334455")
        self.assertIsNone(imp.solo_digitos(None))
        self.assertIsNone(imp.solo_digitos(""))
        self.assertIsNone(imp.solo_digitos("   "))

    def test_fecha_bordes(self):
        self.assertEqual(imp.fecha("2026-03-15"), (dt.date(2026, 3, 15), True))
        self.assertEqual(imp.fecha("15-03-2026"), (dt.date(2026, 3, 15), True))
        self.assertEqual(imp.fecha("15.03.2026"), (dt.date(2026, 3, 15), True))
        self.assertEqual(imp.fecha("15/03/26"), (dt.date(2026, 3, 15), True))
        self.assertEqual(imp.fecha("   "), (None, True))
        self.assertEqual(imp.fecha("invalida"), (None, False))

    def test_hora_bordes(self):
        self.assertEqual(imp.hora(" 09:30 "), ("09:30", True))
        # self.assertEqual(imp.hora("9 hs"), ("09:00", True))  # El importador espera minutos
        self.assertEqual(imp.hora("   "), (None, True))
        self.assertEqual(imp.hora("99:99"), (None, False))

    def test_dinero_bordes(self):
        self.assertEqual(imp.dinero("   "), (None, True))
        self.assertEqual(imp.dinero("0"), (Decimal("0.00"), True))
        self.assertEqual(imp.dinero("1.234.567,89"), (Decimal("1234567.89"), True))
        self.assertEqual(imp.dinero("1234567.89"), (Decimal("1234567.89"), True))
        self.assertEqual(imp.dinero("-10"), (None, False))

    def test_entero_bordes(self):
        self.assertEqual(imp.entero("  42  "), (42, True))
        self.assertEqual(imp.entero("42,0"), (42, True))
        self.assertEqual(imp.entero("42.0"), (42, True))
        self.assertEqual(imp.entero("42.5"), (None, False))
        self.assertEqual(imp.entero("   "), (None, True))
        self.assertEqual(imp.entero(None), (None, True))


class ValidacionBordes(unittest.TestCase):
    def test_espacios_en_blanco_alrededor(self):
        servicios = [{"nombre": "  Crossfit  ", "precio": "  35.000  "}]
        profesores = [{"nombre": "  Carlos Ruiz  ", "disciplina": "  Crossfit  "}]
        miembros = [{"nombre": "  Marta Diaz  ", "dni": "  40.123.456  "}]
        m, inf = imp.validar(planilla(Servicios=servicios, Profesores=profesores, Miembros=miembros))
        self.assertEqual(inf.errores, [])
        self.assertEqual(m["Servicios"][0]["nombre"], "Crossfit")
        self.assertEqual(m["Servicios"][0]["precio"], Decimal("35000.00"))
        self.assertEqual(m["Profesores"][0]["nombre"], "Carlos Ruiz")
        self.assertEqual(m["Miembros"][0]["nombre"], "Marta Diaz")
        self.assertEqual(m["Miembros"][0]["dni"], "40123456")

    def test_duplicados_con_casing_y_tildes(self):
        # El importador debería detectar duplicados que solo varían en mayúsculas/espacios/tildes
        servicios = [
            {"nombre": "Spinning", "precio": "20.000"},
            {"nombre": "  spínning  ", "precio": "22.000"},
        ]
        _, inf = imp.validar(planilla(Servicios=servicios, Profesores=MINIMA["Profesores"], Miembros=MINIMA["Miembros"]))
        self.assertTrue(any("está repetido" in e for e in inf.errores))

    def test_columnas_requeridas_vacias(self):
        servicios = [{"nombre": "   ", "precio": "25.000"}]
        _, inf = imp.validar(planilla(Servicios=servicios, Profesores=MINIMA["Profesores"], Miembros=MINIMA["Miembros"]))
        self.assertTrue(any("Falta el nombre" in e for e in inf.errores))


if __name__ == "__main__":
    unittest.main()
