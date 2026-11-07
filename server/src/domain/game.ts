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

export const V2_EXERCISE_SECONDS = 30;
export const V2_TRANSITION_SECONDS = 5;
export const V2_EXERCISES = ["bench", "pull", "curl", "bike"] as const;
export const V2_MIN_RUN_MS = 133_000;
export const V2_WEIGHT_MULTIPLIERS = { light: 1, medium: 1.5, heavy: 2 } as const;
// 30 s / 250 ms entre toques = 120.
// perfect = total: la barra acelera con las reps de todo el circuito y el orden es aleatorio; solo limita el freno de 250 ms.
// 30 s / 700 ms entre ciclos completos = 42; cada ciclo admite PERFECT hasta 1250 ms.
// curl total: 30 s / 280 ms de freno al iniciar intentos = 107; PERFECT: 30 s / (590 ms mínimos + 280 ms) = 34.
// 30 s / 650 ms entre ciclos completos = 46; cada ciclo admite PERFECT hasta 1500 ms.
export const V2_CAPS = {
  bench: { total: 120, perfect: 120 },
  pull: { total: 42, perfect: 42 },
  curl: { total: 107, perfect: 34 },
  bike: { total: 46, perfect: 46 }
} as const;

export type V2Weight = keyof typeof V2_WEIGHT_MULTIPLIERS;
export type V2Exercises = Record<(typeof V2_EXERCISES)[number], string>;
export type RunV2Verdict =
  | { ok: true; score: number; reps: number; perfectReps: number }
  | { ok: false; reason: "too_fast" | "too_slow" | "invalid_weight" | `implausible_${(typeof V2_EXERCISES)[number]}` };

export function judgeRunV2(elapsedMs: number, weight: string, exercises: V2Exercises): RunV2Verdict {
  if (elapsedMs < V2_MIN_RUN_MS) return { ok: false, reason: "too_fast" };
  if (elapsedMs > MAX_RUN_MS) return { ok: false, reason: "too_slow" };
  if (!(weight in V2_WEIGHT_MULTIPLIERS)) return { ok: false, reason: "invalid_weight" };
  let score = 0, reps = 0, perfectReps = 0;
  for (const exercise of V2_EXERCISES) {
    const sequence = exercises[exercise];
    const caps = V2_CAPS[exercise];
    const perfect = [...sequence].filter((grade) => grade === "P").length;
    if (sequence.length > caps.total) return { ok: false, reason: `implausible_${exercise}` };
    if (perfect > caps.perfect) return { ok: false, reason: `implausible_${exercise}` };
    let combo = 0;
    for (const grade of sequence) {
      if (grade === "F") combo = 0;
      else combo++;
      const base = grade === "P" ? 25 : grade === "G" ? 10 : 2;
      score += Math.floor(base * Math.min(3, 1 + 0.5 * Math.floor(combo / 3)) * V2_WEIGHT_MULTIPLIERS[weight as V2Weight]);
      reps++;
      if (grade === "P") perfectReps++;
    }
  }
  return { ok: true, score, reps, perfectReps };
}

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
