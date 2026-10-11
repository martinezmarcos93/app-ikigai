import { randomInt } from "node:crypto";

export type AccountRole = "member" | "coach";

const ROLE_LABEL: Record<AccountRole, string> = { member: "miembro", coach: "profesor" };
// Sin 0/O, 1/I/L ni U/V confundibles al dictar o leer la clave en voz alta o en un papel.
const PASSWORD_ALPHABET = "23456789ABCDEFGHJKMNPQRSTWXYZ";
const SUFFIX_LENGTH = 8;

function words(fullName: string): string[] {
  return fullName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Candidatos de usuario en orden de preferencia: ikigai-miembro-marcos, ikigai-miembro-marcos-martinez, ...-2, ...-3 */
export function usernameCandidates(role: AccountRole, fullName: string, extra = 20): string[] {
  const parts = words(fullName);
  if (parts.length === 0) throw new Error("El nombre no tiene letras ni numeros para armar un usuario.");
  const prefix = `ikigai-${ROLE_LABEL[role]}`;
  const first = `${prefix}-${parts[0]}`;
  const full = parts.length > 1 ? `${first}-${parts[parts.length - 1]}` : first;
  const base = full.slice(0, 60).replace(/-+$/, "");
  const candidates = [first.slice(0, 60)];
  if (base !== candidates[0]) candidates.push(base);
  for (let n = 2; n <= extra + 1; n += 1) candidates.push(`${base}-${n}`);
  return candidates;
}

/** MM para "Marcos Martinez" (primer y ultimo nombre); dos primeras letras si hay una sola palabra. */
export function initials(fullName: string): string {
  const parts = words(fullName);
  if (parts.length === 0) return "XX";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase().padEnd(2, "X");
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** Clave temporal con formato: MM-Ikigai-K7Q4-9XMP (iniciales + 8 caracteres aleatorios criptograficos, ~39 bits). */
export function generateTemporaryPassword(fullName: string): string {
  let suffix = "";
  for (let i = 0; i < SUFFIX_LENGTH; i += 1) suffix += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
  return `${initials(fullName)}-Ikigai-${suffix.slice(0, 4)}-${suffix.slice(4)}`;
}
