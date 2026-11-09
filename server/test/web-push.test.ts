import test from "node:test";
import assert from "node:assert/strict";
import { createDecipheriv, createECDH, createHmac, createPublicKey, randomBytes, verify } from "node:crypto";
import { encryptPayload, generateVapidKeys, isAllowedPushEndpoint, validateVapidKeys, vapidAuthorization } from "../src/domain/web-push.js";
import { loadConfig } from "../src/config.js";

const hmac = (key: Buffer, data: Buffer) => createHmac("sha256", key).update(data).digest();

// Descifra como lo hace el navegador (RFC 8291): es el oraculo de que el mensaje llega legible al celular.
function decryptAsBrowser(message: Buffer, uaPrivate: ReturnType<typeof createECDH>, authSecret: Buffer): string {
  const salt = message.subarray(0, 16);
  const idlen = message.readUInt8(20);
  const asPublic = message.subarray(21, 21 + idlen);
  const ciphertext = message.subarray(21 + idlen);
  const uaPublic = uaPrivate.getPublicKey();
  const ecdhSecret = uaPrivate.computeSecret(asPublic);
  const prkKey = hmac(authSecret, ecdhSecret);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01", "binary")).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01", "binary")).subarray(0, 12);
  const decipher = createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(ciphertext.subarray(ciphertext.length - 16));
  const plain = Buffer.concat([decipher.update(ciphertext.subarray(0, ciphertext.length - 16)), decipher.final()]);
  assert.equal(plain[plain.length - 1], 2, "el ultimo registro termina con el delimitador 0x02");
  return plain.subarray(0, plain.length - 1).toString("utf8");
}

test("push: el mensaje cifrado se descifra con las claves del dispositivo", () => {
  const ua = createECDH("prime256v1");
  ua.generateKeys();
  const auth = randomBytes(16);
  const target = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", p256dh: ua.getPublicKey().toString("base64url"), auth: auth.toString("base64url") };
  const payload = JSON.stringify({ title: "Feriado", body: "El lunes no hay clases. Ñandú, acentos: áéíóú" });
  const message = encryptPayload(target, payload);
  assert.equal(message.readUInt32BE(16), 4096);
  assert.equal(decryptAsBrowser(message, ua, auth), payload);
  // Con otra clave de autenticacion no se puede leer.
  assert.throws(() => decryptAsBrowser(message, ua, randomBytes(16)));
});

test("push: la firma VAPID es un JWT ES256 valido para el origen del servicio", () => {
  const keys = { ...generateVapidKeys(), subject: "mailto:admin@example.com" };
  const header = vapidAuthorization("https://web.push.apple.com/QGuQyavXutnMH", keys, Date.UTC(2026, 10, 9));
  const match = header.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/);
  assert.ok(match);
  const [, h, c, s, k] = match;
  assert.equal(k, keys.publicKey);
  const claims = JSON.parse(Buffer.from(c!, "base64url").toString("utf8"));
  assert.equal(claims.aud, "https://web.push.apple.com");
  assert.equal(claims.sub, "mailto:admin@example.com");
  assert.equal(claims.exp, Date.UTC(2026, 10, 9) / 1000 + 12 * 3600);
  const pub = Buffer.from(keys.publicKey, "base64url");
  const publicKey = createPublicKey({ key: { kty: "EC", crv: "P-256", x: pub.subarray(1, 33).toString("base64url"), y: pub.subarray(33).toString("base64url") }, format: "jwk" });
  assert.ok(verify("sha256", Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(s!, "base64url")));
});

test("push: solo se aceptan endpoints de servicios de push conocidos", () => {
  for (const ok of ["https://fcm.googleapis.com/fcm/send/x", "https://web.push.apple.com/abc", "https://updates.push.services.mozilla.com/wpush/v2/x", "https://wns2-par02p.notify.windows.com/w/?token=x"])
    assert.ok(isAllowedPushEndpoint(ok), ok);
  for (const bad of ["http://fcm.googleapis.com/x", "https://evil.example.com/x", "https://fcm.googleapis.com.evil.com/x", "https://user:pw@fcm.googleapis.com/x", "https://fcm.googleapis.com:8443/x", "https://169.254.169.254/latest", "no es url"])
    assert.ok(!isAllowedPushEndpoint(bad), bad);
});

test("push: la configuracion VAPID se valida completa o no se usa", () => {
  const keys = generateVapidKeys();
  const base = { NODE_ENV: "test" as const };
  assert.equal(loadConfig(base).vapid, undefined);
  const config = loadConfig({ ...base, VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey, VAPID_SUBJECT: "mailto:a@b.com" });
  assert.equal(config.vapid?.publicKey, keys.publicKey);
  assert.throws(() => loadConfig({ ...base, VAPID_PUBLIC_KEY: keys.publicKey }), /together/);
  assert.throws(() => loadConfig({ ...base, VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey, VAPID_SUBJECT: "admin" }), /mailto/);
  const other = generateVapidKeys();
  assert.throws(() => loadConfig({ ...base, VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: other.privateKey, VAPID_SUBJECT: "mailto:a@b.com" }), /does not match/);
  assert.doesNotThrow(() => validateVapidKeys(keys.publicKey, keys.privateKey));
});
