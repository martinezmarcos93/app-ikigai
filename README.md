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

## Próxima etapa sugerida

1. Validar con Agustín las reglas de negocio: planes, precios, vigencias, quién puede asignar rutinas, cómo se liquida cada profe y políticas de cancelación.
2. Separar la interfaz de la API y persistencia real. Para una app Android, considerar frontend web instalable (PWA) primero o envoltorio Android después; la decisión depende de requerimientos offline y notificaciones push.
3. Añadir autenticación, roles de servidor, base de datos, historial de auditoría, notificaciones push y pruebas automatizadas antes de usar información real.
