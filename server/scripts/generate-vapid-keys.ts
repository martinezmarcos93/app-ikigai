// Genera el par de claves VAPID para las notificaciones push de avisos.
// Uso: cd server && npm run push:keys  -> copiar las dos lineas a las variables de entorno del servidor (Render).
// La clave privada es un secreto: no se sube al repo. Si se cambia, los dispositivos tienen que volver a activar las notificaciones.
import { generateVapidKeys } from "../src/domain/web-push.js";

const keys = generateVapidKeys();
process.stdout.write(`VAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\n`);
