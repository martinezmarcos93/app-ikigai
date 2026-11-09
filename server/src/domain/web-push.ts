// Web Push estandar (RFC 8030 + VAPID RFC 8292 + cifrado aes128gcm RFC 8291) con node:crypto, sin dependencias.
// Sirve igual para Android (Chrome/TWA -> fcm.googleapis.com) y para iPhone (PWA en pantalla de inicio -> web.push.apple.com).
import { createECDH, createHmac, createCipheriv, createPrivateKey, randomBytes, sign, type ECDH } from "node:crypto";

export interface VapidKeys {
  /** Clave publica P-256 sin comprimir (65 bytes) en base64url: la usa el navegador para suscribirse. */
  publicKey: string;
  /** Escalar privado (32 bytes) en base64url. */
  privateKey: string;
  /** Contacto para el servicio de push: "mailto:..." o una URL https. */
  subject: string;
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type PushSender = (target: PushTarget, payload: string) => Promise<{ status: number }>;

// Solo se envia a servicios de push conocidos: el endpoint lo manda el cliente y no debe poder apuntar a cualquier host.
const ALLOWED_PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^web\.push\.apple\.com$/, /(^|\.)push\.apple\.com$/, /\.notify\.windows\.com$/];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try { url = new URL(endpoint); } catch { return false; }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  return ALLOWED_PUSH_HOSTS.some((pattern) => pattern.test(url.hostname));
}

const b64u = (value: string) => Buffer.from(value, "base64url");
const hmac = (key: Buffer, data: Buffer) => createHmac("sha256", key).update(data).digest();

export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return { publicKey: ecdh.getPublicKey().toString("base64url"), privateKey: ecdh.getPrivateKey().toString("base64url") };
}

export function validateVapidKeys(publicKey: string, privateKey: string): void {
  const pub = b64u(publicKey);
  const priv = b64u(privateKey);
  if (pub.length !== 65 || pub[0] !== 0x04) throw new Error("VAPID_PUBLIC_KEY must be an uncompressed P-256 public key (65 bytes, base64url).");
  if (priv.length !== 32) throw new Error("VAPID_PRIVATE_KEY must be a P-256 private key (32 bytes, base64url).");
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(priv);
  if (!ecdh.getPublicKey().equals(pub)) throw new Error("VAPID_PUBLIC_KEY does not match VAPID_PRIVATE_KEY.");
}

/** JWT ES256 que identifica al servidor ante el servicio de push (cabecera Authorization: vapid t=..., k=...). */
export function vapidAuthorization(endpoint: string, keys: VapidKeys, now = Date.now()): string {
  const pub = b64u(keys.publicKey);
  const key = createPrivateKey({
    key: { kty: "EC", crv: "P-256", d: keys.privateKey, x: pub.subarray(1, 33).toString("base64url"), y: pub.subarray(33, 65).toString("base64url") },
    format: "jwk"
  });
  const header = Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })).toString("base64url");
  const claims = Buffer.from(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: keys.subject })).toString("base64url");
  const signature = sign("sha256", Buffer.from(`${header}.${claims}`), { key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `vapid t=${header}.${claims}.${signature}, k=${keys.publicKey}`;
}

/** Cifra el mensaje para una suscripcion (RFC 8291, un solo registro aes128gcm). */
export function encryptPayload(target: PushTarget, payload: string, salt = randomBytes(16), serverKeys?: ECDH): Buffer {
  const uaPublic = b64u(target.p256dh);
  const authSecret = b64u(target.auth);
  if (uaPublic.length !== 65 || authSecret.length !== 16) throw new Error("Invalid push subscription keys.");
  const ecdh = serverKeys ?? createECDH("prime256v1");
  if (!serverKeys) ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const ecdhSecret = ecdh.computeSecret(uaPublic);
  const prkKey = hmac(authSecret, ecdhSecret);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from("Content-Encoding: aes128gcm\0"), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from("Content-Encoding: nonce\0"), Buffer.from([1])])).subarray(0, 12);
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload, "utf8"), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header.writeUInt8(asPublic.length, 20);
  return Buffer.concat([header, asPublic, body]);
}

export function createPushSender(keys: VapidKeys): PushSender {
  return async (target, payload) => {
    if (!isAllowedPushEndpoint(target.endpoint)) return { status: 410 };
    const body = encryptPayload(target, payload);
    const response = await fetch(target.endpoint, {
      method: "POST",
      headers: {
        Authorization: vapidAuthorization(target.endpoint, keys),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(3 * 24 * 3600),
        Urgency: "normal"
      },
      body,
      signal: AbortSignal.timeout(10_000)
    });
    await response.arrayBuffer().catch(() => undefined);
    return { status: response.status };
  };
}
