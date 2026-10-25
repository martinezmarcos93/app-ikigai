// Reglas del juego Iron Pixel. El navegador solo informa repeticiones; el puntaje y los puntos los decide el servidor.
// Los límites salen del propio juego (portal: iron-pixel.js) y se tienen que mantener iguales en los dos lados:
//  - la partida dura GAME_SECONDS;
//  - entre una repetición y la siguiente pasan al menos REP_COOLDOWN_MS (no se puede sumar tocando sin parar);
//  - la barra de fuerza cruza la zona roja una vez por pasada (~1,07 s), así que las perfectas tienen techo.

export const GAME_SECONDS = 30;
export const REP_COOLDOWN_MS = 300;
export const POINTS_PER_REP = 10;
export const BONUS_PER_PERFECT = 10;
export const MAX_REPS = Math.floor((GAME_SECONDS * 1000) / REP_COOLDOWN_MS); // 100
export const MAX_PERFECT_REPS = 32;
// La partida empieza en el servidor antes de que corra el reloj del teléfono: tiene que durar al menos casi 30 s.
export const MIN_RUN_MS = (GAME_SECONDS - 1) * 1000;
// Una partida que no se cerró en este tiempo ya no cuenta (alguien dejó la pantalla abierta o armó el pedido a mano).
export const MAX_RUN_MS = 10 * 60 * 1000;
export const MAX_RUNS_PER_DAY = 60;
export const GYM_TIME_ZONE = "America/Argentina/Buenos_Aires";

export type RunVerdict =
  | { ok: true; score: number }
  | { ok: false; reason: "too_fast" | "too_slow" | "implausible_reps" | "implausible_perfect" };

export function judgeRun(elapsedMs: number, reps: number, perfectReps: number): RunVerdict {
  if (elapsedMs < MIN_RUN_MS) return { ok: false, reason: "too_fast" };
  if (elapsedMs > MAX_RUN_MS) return { ok: false, reason: "too_slow" };
  if (!Number.isInteger(reps) || reps < 0 || reps > MAX_REPS) return { ok: false, reason: "implausible_reps" };
  if (!Number.isInteger(perfectReps) || perfectReps < 0 || perfectReps > reps || perfectReps > MAX_PERFECT_REPS) {
    return { ok: false, reason: "implausible_perfect" };
  }
  return { ok: true, score: reps * POINTS_PER_REP + perfectReps * BONUS_PER_PERFECT };
}

// Puntos canjeables que deja una partida: el puntaje, recortado a lo que falta para el tope diario.
export function pointsForRun(score: number, earnedToday: number, dailyCap: number): number {
  return Math.max(0, Math.min(score, dailyCap - earnedToday));
}

// Compite (suma puntos y entra al ranking) solo quien es miembro y no tiene rol de staff.
export function competes(roles: string[], memberId: string | null): boolean {
  return Boolean(memberId) && roles.includes("member") && !roles.includes("admin") && !roles.includes("coach");
}

// Nombre para el ranking: nombre de pila + inicial del apellido ("Ana Pérez" → "Ana P."). Es lo único de la persona
// que ven los demás.
export function rankingName(fullName: string): string {
  const parts = String(fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Miembro";
  const first = parts[0] ?? "Miembro";
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  return last ? `${first} ${last.charAt(0).toUpperCase()}.` : first;
}
