import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// Hash de contrasenas con scrypt. Los parametros viajan DENTRO del hash (`scrypt$N$r$p$sal$clave`), asi se puede subir el
// costo sin invalidar las contrasenas guardadas: se verifican con los parametros con que se crearon y, al iniciar sesion,
// las que quedaron con un costo menor al actual se vuelven a guardar con el actual (`needsRehash`).
//
// Costo actual: N=2^16, r=8, p=2 (64 MiB, una de las configuraciones equivalentes que recomienda OWASP; antes N=2^14, p=1,
// por debajo de ese minimo). Cada verificacion usa unos 64 MiB: con el limite de intentos de /auth/login el consumo
// maximo es acotado, pero el contenedor debe tener memoria para varios hashes a la vez (ver docs/DEPLOYMENT.md).

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export interface ScryptParameters { N: number; r: number; p: number }

export const CURRENT_PARAMETERS: ScryptParameters = { N: 65_536, r: 8, p: 2 };

// Solo se aceptan combinaciones conocidas: un hash con parametros enormes no debe poder agotar la memoria del servidor.
const ALLOWED_N = new Set([16_384, 32_768, 65_536, 131_072]);
const ALLOWED_P = new Set([1, 2, 3, 5]);

function deriveKey(password: string, salt: Buffer, { N, r, p }: ScryptParameters): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // maxmem exige estrictamente mas que 128*N*r bytes.
    scrypt(password, salt, KEY_LENGTH, { N, r, p, maxmem: 128 * N * r * 2 }, (error, key) => {
      if (error) reject(error);
      else resolve(key as Buffer);
    });
  });
}

const ENCODED = /^scrypt\$(\d+)\$(\d+)\$(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/;

function parse(encoded: string): { parameters: ScryptParameters; salt: Buffer; expected: Buffer } | null {
  const match = ENCODED.exec(encoded);
  if (!match) return null;
  const parameters = { N: Number(match[1]), r: Number(match[2]), p: Number(match[3]) };
  if (!ALLOWED_N.has(parameters.N) || parameters.r !== 8 || !ALLOWED_P.has(parameters.p)) return null;
  const salt = Buffer.from(match[4]!, "base64url");
  const expected = Buffer.from(match[5]!, "base64url");
  if (salt.length !== SALT_LENGTH || expected.length !== KEY_LENGTH) return null;
  return { parameters, salt, expected };
}

export async function hashPassword(password: string, parameters: ScryptParameters = CURRENT_PARAMETERS): Promise<string> {
  if (password.length < 12 || password.length > 128) {
    throw new Error("Passwords must contain between 12 and 128 characters.");
  }
  const salt = randomBytes(SALT_LENGTH);
  const derived = await deriveKey(password, salt, parameters);
  return `scrypt$${parameters.N}$${parameters.r}$${parameters.p}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  if (password.length > 128) return false;
  const parsed = parse(encoded);
  if (!parsed) return false;
  const actual = await deriveKey(password, parsed.salt, parsed.parameters);
  return timingSafeEqual(actual, parsed.expected);
}

/** ¿El hash esta bien formado pero con un costo menor al actual? Entonces conviene volver a guardarlo. */
export function needsRehash(encoded: string): boolean {
  const parsed = parse(encoded);
  if (!parsed) return false;
  const { N, r, p } = parsed.parameters;
  return N * r * p < CURRENT_PARAMETERS.N * CURRENT_PARAMETERS.r * CURRENT_PARAMETERS.p;
}
