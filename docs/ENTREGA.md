# Entrega de Ikigai al gimnasio: lista de control

Pasos para pasar de la demo gratuita a la versión definitiva y entregarla «a la perfección» para el primer uso.
Marcar cada ítem con la fecha cuando esté hecho.

## 0. Material que ya está listo

| Qué | Dónde |
| --- | --- |
| Cuestionario y hoja de costos (PDF) y mensaje de WhatsApp | `docs/entrega/` (copia en `~/Documentos/Ikigai-entrega/`) |
| Planilla de datos vacía y de ejemplo | `tools/datos/plantillas/` |
| Importador de datos y accesos | `tools/datos/importar_datos.py` (ver su README) |
| Guía de administración (HTML + PDF), hojas de profesores y de miembros | `docs/instructivo/` |
| Landing con descarga de la APK | `landing/` (publicar con `deploy/publicar-landing.sh`) |
| Demo gratuita para mostrar | `deploy/demo-gratis.sh` (ver `docs/DEMO_GRATIS.md`) |

Regenerar los PDF del instructivo si cambia la interfaz: `bash tools/instructivo/preparar.sh` y después
`tools/instructivo/capturas.py` y `tools/instructivo/construir.py` (ver `tools/instructivo/README.md`).

## 1. Con el dueño (antes de arrancar)

- [ ] Enviarle el cuestionario, la hoja de costos y la planilla vacía (`Mensaje-WhatsApp-Agustin.txt`).
- [x] **Dominio** `ikigai-training.com`, comprado por Agustin en DonWeb el 12/10/2026 (vence el 12/10/2027). DNS delegado a Cloudflare (`brian.ns.cloudflare.com`, `jule.ns.cloudflare.com`); activación pendiente de verificación de Cloudflare. Pendientes: confirmar que el titular y el CUIT correspondan (persona física o jurídica), revisar DNSSEC y decidir si contrata la privacidad del registro (WHOIS). Los documentos de `docs/entrega/` (costos, cuestionario, mensaje) son anteriores a la compra y hablan de `.com.ar`.
- [ ] Definir dónde corre el **servidor** (ADR-001 §6: Neon + Render gratis como dirección elegida; VPS de 2 GB o más con Docker como plan B). Guardar los accesos en un gestor de claves.
- [ ] Recibir el cuestionario respondido y la planilla completa.
- [ ] Revisión jurídica de `docs/DATA_PROTECTION.md` y del texto de consentimiento (Fase 8, con la abogada).

## 2. Servidor y dominio (Fase 7)

- [ ] Delegar el DNS del dominio a Cloudflare (gratis) o apuntar un registro `A` de `app.<dominio>` a la IP del servidor.
- [ ] Instalar Docker y desplegar `deploy/compose.yaml` (ver `docs/DEPLOYMENT.md`) con `SITE_ADDRESS=app.<dominio>`.
- [ ] Configurar el adaptador de correo de recuperación (o dejarlo con valores de relleno y usar «Restablecer clave» desde administración).
- [ ] Crear el **primer administrador** con `ADMIN_MUST_CHANGE_PASSWORD=1` y entregarle la clave en mano.
- [ ] **Copias de seguridad**: programar `deploy/backup.sh` (cron/systemd) y una copia **fuera del servidor**; ensayar la restauración (`deploy/restore-check.sh`).
- [ ] Verificar `https://app.<dominio>/healthz` y `/.well-known/assetlinks.json`.

## 3. APK y landing definitivas

- [ ] `bash apk/build-apk.sh app.<dominio> 1.0.0 <versionCode mayor que el de la demo>` (misma clave de firma: se instala encima de la demo).
- [ ] **Respaldar `~/.ikigai-signing/`** fuera de esta computadora.
- [ ] Mover la landing al dominio propio (Cloudflare Pages → Custom domains) y `bash deploy/publicar-landing.sh`.
- [ ] Probar la descarga e instalación en **dos teléfonos Android** reales (uno de gama baja) y el alta en un iPhone (Safari → Agregar a inicio). Anotar modelo, Android y Chrome en la hoja de ruta (Fase 6).

## 4. Carga de datos reales

- [ ] Validar la planilla (`importar_datos.py` sin `--url`) y corregir con el dueño hasta que no haya errores.
- [ ] Ver el plan (`--url`) y luego aplicar con `--aplicar --crear-accesos --generar-clases 28`.
- [ ] Imprimir la hoja de accesos, entregar cada tarjeta **en mano** y **borrar** la hoja, el `.jsonl` y la planilla.
- [ ] Revisar en el portal: configuración, servicios, profesores, miembros, horarios y una semana de agenda.

## 5. Primera sesión con el dueño (1 hora)

1. Que entre con su usuario, elija su clave y recorra la **guía de primer uso**.
2. Mostrar **Accesos** (crear, restablecer, deshabilitar/habilitar) con una persona de prueba: es lo que más va a usar.
3. Mostrar la **Agenda**, la toma de **asistencia** y la **cuenta corriente**.
4. Entregarle la **guía de administración** (PDF) y las hojas para profesores y miembros.
5. Acordar el **piloto**: él + 2 o 3 profesores + unos 10 alumnos de confianza, 1 a 2 semanas.

## 6. Piloto y salida

- [ ] Lista de problemas del piloto (qué confundió, qué falló) y corrección.
- [ ] Auditoría de seguridad externa (humana) antes de cargar a todos los alumnos.
- [ ] Texto de consentimiento firmado por los alumnos (fuera de la app por ahora).
- [ ] Salida a todos: mensaje por WhatsApp con la dirección de la landing y las hojas de uso.
- [ ] Revisión a los 15 días: soporte, copias de seguridad, costos reales.

## Costos (estimación al 11/10/2026)

Ver `docs/entrega/Costos-puesta-en-marcha.pdf`. Dominio (ya pagado; el `.com` de DonWeb se renueva cada año, la hoja de costos calculó un `.com.ar` ≈ $8.500); servidor ≈ $24.000 a $29.000 por mes. Los montos se
confirman al contratar y se rinden al peso.
