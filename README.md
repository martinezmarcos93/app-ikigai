# Ikigai Training — Demo local

Prototipo navegable de administración de gimnasio, con estilo basado en la identidad visual de Ikigai Training (negro, rojo y tipografía condensada).

## Abrir la demo

Opción directa: abrí `index.html` en un navegador moderno.

Opción recomendada: desde esta carpeta ejecutá uno de estos comandos:

```bash
python -m http.server 8000
```

Después entrá a http://localhost:8000.

No requiere instalar dependencias. Usa HTML, CSS y JavaScript sin backend. Los cambios quedan guardados en `localStorage` del navegador utilizado. El botón **Reiniciar datos de prueba** restaura los datos iniciales.

## Qué puede probarse

- Cambio entre vista de administrador y miembro.
- Panel de resumen con miembros, deudas, turnos, cupos y avisos.
- Alta/edición de miembros, búsqueda/filtros y exportación a CSV.
- Cuentas corrientes: cargos, pagos, saldos y movimientos.
- Agenda por fecha, turnos con cupo máximo 7, reservas, cancelaciones y lista de asistencia de muestra.
- Catálogo y edición de rutinas/ejercicios.
- Perfiles de profesores, contactos públicos y cálculo económico ilustrativo de rendición.
- Publicación de avisos y registro de ausencias/llegadas tarde.
- Diseño responsive para teléfono, tablet y escritorio.

## Credenciales y límites

No hay inicio de sesión real ni separación de permisos segura: el selector de rol es sólo para recorrer la demo. Los datos son ficticios y se guardan en el navegador. Las notificaciones son internas de la demo; no se envían push, email ni WhatsApp. El registro de asistencia no tiene historial persistente separado. No usar importes de profesores, saldos ni datos de ejemplo para operar el gimnasio.

## Enfoque Android-first

La rama `feat/android-first-product-foundation` incorpora mejoras iniciales para pantallas compactas, objetivos táctiles, áreas seguras, navegación móvil accesible y una base PWA instalable con caché del shell estático. La caché no sincroniza datos entre dispositivos ni convierte `localStorage` en almacenamiento multiusuario.

## Hoja de ruta

Consultar [`docs/PRODUCT_PLAN.md`](docs/PRODUCT_PLAN.md) para las decisiones de producto, reglas funcionales, fases y criterios de aceptación móvil. La demo sigue siendo local: no usar datos reales hasta implementar backend, autenticación, autorización del lado servidor, base de datos compartida y pruebas.
