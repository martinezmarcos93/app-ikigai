import type { FastifyInstance, FastifyReply } from "fastify";
import type { AppConfig } from "../config.js";
import type { Database, TransactionalDatabase } from "../db.js";
import {
  GAME_SECONDS, GYM_TIME_ZONE, MAX_PERFECT_REPS, MAX_REPS, MAX_RUNS_PER_DAY, REP_COOLDOWN_MS,
  competes, judgeRun, pointsForRun, rankingName
} from "../domain/game.js";
import { resolveActor } from "../security/actor.js";
import { requireCsrf } from "../security/csrf.js";

// La zona horaria sale de la configuración (GYM_TIMEZONE, validada como IANA al arrancar), nunca del pedido.
// Se escribe en el SQL solo después de comprobar que tiene la forma de un nombre de zona.
let TZ = `'${GYM_TIME_ZONE}'`;
let WEEK_START_NOW = "";
let TODAY = "";
function useTimeZone(zone: string) {
  if (!/^[A-Za-z0-9_+\-]+(\/[A-Za-z0-9_+\-]+)*$/.test(zone)) throw new Error("GYM_TIMEZONE has an unexpected format.");
  TZ = `'${zone}'`;
  WEEK_START_NOW = `date_trunc('week', now() AT TIME ZONE ${TZ})::date`;
  TODAY = `(now() AT TIME ZONE ${TZ})::date`;
}
useTimeZone(GYM_TIME_ZONE);

interface SettingsRow extends Record<string, unknown> {
  reward_name: string;
  points_per_reward: number;
  daily_points_cap: number;
  weekly_prize_enabled: boolean;
}
interface RunRow extends Record<string, unknown> {
  id: string;
  user_id: string;
  member_id: string | null;
  status: string;
  elapsed_ms: number;
}
interface RankingRow extends Record<string, unknown> {
  member_id: string;
  run_id: string;
  score: number;
  full_name: string;
}
interface FinishBody { reps: number; perfectReps: number }
interface RedeemBody { memberId: string; expectedBalance: number }
interface PrizeBody { weekStart: string }
interface SettingsBody {
  rewardName?: string;
  pointsPerReward?: number;
  dailyPointsCap?: number;
  weeklyPrizeEnabled?: boolean;
}

class GameError extends Error {
  constructor(readonly statusCode: number, readonly errorCode: string, message: string, readonly extra: Record<string, unknown> = {}) {
    super(message);
    this.name = "GameError";
  }
}
function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof GameError) {
    return reply.code(error.statusCode).send({ error: error.errorCode, message: error.message, ...error.extra });
  }
  throw error;
}

const unauthenticated = { error: "unauthenticated", message: "A valid session is required." };
const forbidden = { error: "forbidden", message: "Administrator permission is required." };
const idParams = { type: "object", required: ["id"], additionalProperties: false, properties: { id: { type: "string", format: "uuid" } } } as const;

async function loadSettings(db: Database): Promise<SettingsRow> {
  const result = await db.query<SettingsRow>(
    "SELECT reward_name, points_per_reward, daily_points_cap, weekly_prize_enabled FROM reward_settings WHERE id = true"
  );
  const row = result.rows[0];
  if (!row) throw new Error("reward_settings has no row; run the migrations.");
  return { ...row, points_per_reward: Number(row.points_per_reward), daily_points_cap: Number(row.daily_points_cap) };
}
const publicSettings = (s: SettingsRow) => ({
  rewardName: s.reward_name,
  pointsPerReward: s.points_per_reward,
  dailyPointsCap: s.daily_points_cap,
  weeklyPrizeEnabled: s.weekly_prize_enabled
});

async function balanceOf(db: Database, memberId: string): Promise<number> {
  const result = await db.query("SELECT COALESCE(SUM(delta), 0)::int AS balance FROM reward_points WHERE member_id = $1", [memberId]);
  return Number(result.rows[0]?.balance ?? 0);
}
async function earnedToday(db: Database, memberId: string): Promise<number> {
  const result = await db.query(
    `SELECT COALESCE(SUM(points_awarded), 0)::int AS earned FROM game_runs
      WHERE member_id = $1 AND status = 'finished' AND (finished_at AT TIME ZONE ${TZ})::date = ${TODAY}`,
    [memberId]
  );
  return Number(result.rows[0]?.earned ?? 0);
}

// Mejor partida de cada miembro en la semana que empieza en weekStart (lunes, hora del gimnasio).
// Empate: gana quien llegó primero a ese puntaje.
async function weeklyRanking(db: Database, weekStartSql: string, values: unknown[], limit: number): Promise<RankingRow[]> {
  const result = await db.query<RankingRow>(
    `WITH bounds AS (
       SELECT (${weekStartSql})::timestamp AT TIME ZONE ${TZ} AS starts,
              ((${weekStartSql}) + 7)::timestamp AT TIME ZONE ${TZ} AS ends
     ), best AS (
       SELECT DISTINCT ON (gr.member_id) gr.member_id, gr.id AS run_id, gr.score, gr.finished_at
         FROM game_runs gr CROSS JOIN bounds
        WHERE gr.status = 'finished' AND gr.member_id IS NOT NULL
          AND gr.finished_at >= bounds.starts AND gr.finished_at < bounds.ends
        ORDER BY gr.member_id, gr.score DESC, gr.finished_at ASC
     )
     SELECT b.member_id, b.run_id, b.score, mp.full_name
       FROM best b JOIN member_profiles mp ON mp.id = b.member_id
      WHERE mp.anonymized_at IS NULL
      ORDER BY b.score DESC, b.finished_at ASC, b.member_id
      LIMIT ${Math.max(1, Math.min(50, Math.trunc(limit)))}`,
    values
  );
  return result.rows.map((r) => ({ ...r, score: Number(r.score) }));
}

export function registerGameRoutes(
  app: FastifyInstance,
  db: Database,
  transactionalDb: TransactionalDatabase,
  config: AppConfig
): void {
  useTimeZone(config.gymTimezone || GYM_TIME_ZONE);
  // Todo lo que necesita la pantalla del juego: reglas, saldo propio y ranking de la semana.
  app.get("/api/v1/game/summary", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send(unauthenticated);
    const settings = await loadSettings(db);
    const isCompetitor = competes(actor.roles, actor.memberId);
    const [ranking, lastWeek, lastWeekStart, delivered, personal] = await Promise.all([
      weeklyRanking(db, WEEK_START_NOW, [], 10),
      weeklyRanking(db, `${WEEK_START_NOW} - 7`, [], 3),
      db.query(`SELECT ${WEEK_START_NOW}::text AS current, (${WEEK_START_NOW} - 7)::text AS previous`),
      db.query(`SELECT member_id FROM weekly_prizes WHERE week_start = ${WEEK_START_NOW} - 7`),
      db.query(
        `SELECT COALESCE(MAX(score), 0)::int AS best,
                COALESCE(MAX(score) FILTER (WHERE finished_at >= (${WEEK_START_NOW})::timestamp AT TIME ZONE ${TZ}), 0)::int AS best_week
           FROM game_runs WHERE user_id = $1 AND status = 'finished'`,
        [actor.userId]
      )
    ]);
    const me = isCompetitor && actor.memberId
      ? { balance: await balanceOf(db, actor.memberId), earnedToday: await earnedToday(db, actor.memberId) }
      : null;
    const winner = lastWeek[0];
    return reply.send({
      rules: { gameSeconds: GAME_SECONDS, repCooldownMs: REP_COOLDOWN_MS, maxReps: MAX_REPS, maxPerfectReps: MAX_PERFECT_REPS },
      settings: publicSettings(settings),
      competes: isCompetitor,
      me: {
        personalBest: Number(personal.rows[0]?.best ?? 0),
        bestThisWeek: Number(personal.rows[0]?.best_week ?? 0),
        balance: me?.balance ?? null,
        earnedToday: me?.earnedToday ?? null
      },
      week: {
        start: String(lastWeekStart.rows[0]?.current ?? ""),
        ranking: ranking.map((r, i) => ({ position: i + 1, name: rankingName(r.full_name), score: r.score, me: r.member_id === actor.memberId }))
      },
      lastWeek: {
        start: String(lastWeekStart.rows[0]?.previous ?? ""),
        winner: winner ? { name: rankingName(winner.full_name), score: winner.score, me: winner.member_id === actor.memberId } : null,
        delivered: Boolean(delivered.rows[0])
      }
    });
  });

  // Empieza una partida: el reloj que vale es el del servidor.
  app.post("/api/v1/game/runs", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send(unauthenticated);
    if (!requireCsrf(request, reply, actor.sessionToken, config)) return;
    const memberId = competes(actor.roles, actor.memberId) ? actor.memberId : null;
    try {
      const run = await transactionalDb.transaction(async (tx) => {
        // Serializa las partidas de la misma persona (dos pestañas a la vez no duplican nada).
        await tx.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [actor.userId]);
        const today = await tx.query(
          `SELECT count(*)::int AS runs FROM game_runs WHERE user_id = $1 AND (started_at AT TIME ZONE ${TZ})::date = ${TODAY}`,
          [actor.userId]
        );
        if (Number(today.rows[0]?.runs ?? 0) >= MAX_RUNS_PER_DAY) {
          throw new GameError(429, "daily_run_limit", "You reached today's game limit. Come back tomorrow.");
        }
        await tx.query("UPDATE game_runs SET status = 'abandoned', finished_at = clock_timestamp() WHERE user_id = $1 AND status = 'started'", [actor.userId]);
        const inserted = await tx.query("INSERT INTO game_runs (user_id, member_id) VALUES ($1, $2) RETURNING id, started_at", [actor.userId, memberId]);
        const row = inserted.rows[0];
        if (!row) throw new Error("Game run insert did not return a row.");
        return row;
      });
      return reply.code(201).send({ run: { id: run.id, startedAt: run.started_at }, gameSeconds: GAME_SECONDS, competes: Boolean(memberId) });
    } catch (error) { return sendError(reply, error); }
  });

  // Cierra la partida con las repeticiones: el servidor valida, calcula el puntaje y acredita los puntos.
  app.post<{ Params: { id: string }; Body: FinishBody }>("/api/v1/game/runs/:id/finish", {
    schema: {
      params: idParams,
      body: {
        type: "object", required: ["reps", "perfectReps"], additionalProperties: false,
        properties: { reps: { type: "integer", minimum: 0, maximum: 1000 }, perfectReps: { type: "integer", minimum: 0, maximum: 1000 } }
      }
    },
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send(unauthenticated);
    if (!requireCsrf(request, reply, actor.sessionToken, config)) return;
    try {
      const result = await transactionalDb.transaction(async (tx) => {
        const found = await tx.query<RunRow>(
          `SELECT id, user_id, member_id, status,
                  (extract(epoch FROM clock_timestamp() - started_at) * 1000)::bigint AS elapsed_ms
             FROM game_runs WHERE id = $1 AND user_id = $2 FOR UPDATE`,
          [request.params.id, actor.userId]
        );
        const run = found.rows[0];
        if (!run) throw new GameError(404, "not_found", "The requested resource was not found.");
        if (run.status !== "started") throw new GameError(409, "run_closed", "This game was already closed.");
        const { reps, perfectReps } = request.body;
        const verdict = judgeRun(Number(run.elapsed_ms), reps, perfectReps);
        if (!verdict.ok) {
          await tx.query(
            "UPDATE game_runs SET status = 'rejected', finished_at = clock_timestamp(), reps = $2, perfect_reps = $3, reject_reason = $4 WHERE id = $1",
            [run.id, Math.min(reps, 1000), Math.min(perfectReps, reps, 1000), verdict.reason]
          );
          return { rejected: verdict.reason };
        }
        let pointsAwarded = 0;
        let balance: number | null = null;
        let earned: number | null = null;
        const settings = await loadSettings(tx);
        if (run.member_id) {
          await tx.query("SELECT id FROM member_profiles WHERE id = $1 FOR UPDATE", [run.member_id]);
          const before = await earnedToday(tx, run.member_id);
          pointsAwarded = pointsForRun(verdict.score, before, settings.daily_points_cap);
          earned = before + pointsAwarded;
        }
        await tx.query(
          "UPDATE game_runs SET status = 'finished', finished_at = clock_timestamp(), reps = $2, perfect_reps = $3, score = $4, points_awarded = $5 WHERE id = $1",
          [run.id, reps, perfectReps, verdict.score, pointsAwarded]
        );
        if (run.member_id) {
          if (pointsAwarded > 0) {
            await tx.query(
              "INSERT INTO reward_points (member_id, delta, kind, game_run_id, created_by) VALUES ($1, $2, 'game', $3, $4)",
              [run.member_id, pointsAwarded, run.id, actor.userId]
            );
          }
          balance = await balanceOf(tx, run.member_id);
        }
        return {
          score: verdict.score, reps, perfectReps, pointsAwarded, balance, earnedToday: earned,
          dailyPointsCap: settings.daily_points_cap, pointsPerReward: settings.points_per_reward, competes: Boolean(run.member_id)
        };
      });
      if ("rejected" in result) {
        return reply.code(422).send({ error: "run_rejected", reason: result.rejected, message: "The game result could not be validated." });
      }
      return reply.send(result);
    } catch (error) { return sendError(reply, error); }
  });

  // ---------------- Administración ----------------
  app.get("/api/v1/admin/rewards", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send(unauthenticated);
    if (!actor.roles.includes("admin")) return reply.code(403).send(forbidden);
    const settings = await loadSettings(db);
    const [balances, redemptions, weeks] = await Promise.all([
      db.query(
        `SELECT mp.id, mp.full_name, SUM(rp.delta)::int AS balance
           FROM reward_points rp JOIN member_profiles mp ON mp.id = rp.member_id
          WHERE mp.anonymized_at IS NULL
          GROUP BY mp.id, mp.full_name
         HAVING SUM(rp.delta) > 0
          ORDER BY SUM(rp.delta) DESC, lower(mp.full_name)
          LIMIT 200`
      ),
      db.query(
        `SELECT rp.id, rp.delta, rp.note, rp.created_at, mp.full_name, u.email AS by_email, u.username AS by_username
           FROM reward_points rp JOIN member_profiles mp ON mp.id = rp.member_id LEFT JOIN users u ON u.id = rp.created_by
          WHERE rp.kind = 'redemption' ORDER BY rp.created_at DESC LIMIT 20`
      ),
      db.query(`SELECT (${WEEK_START_NOW} - 7 * g)::text AS week_start FROM generate_series(1, 4) AS g`)
    ]);
    const prizes = [];
    for (const week of weeks.rows) {
      const weekStart = String(week.week_start);
      const [winner] = await weeklyRanking(db, "$1::date", [weekStart], 1);
      const delivered = await db.query(
        "SELECT wp.delivered_at, mp.full_name FROM weekly_prizes wp JOIN member_profiles mp ON mp.id = wp.member_id WHERE wp.week_start = $1::date",
        [weekStart]
      );
      prizes.push({
        weekStart,
        winner: winner ? { memberId: winner.member_id, name: winner.full_name, score: winner.score } : null,
        delivered: delivered.rows[0] ? { at: delivered.rows[0].delivered_at, name: delivered.rows[0].full_name } : null
      });
    }
    return reply.send({
      settings: publicSettings(settings),
      balances: balances.rows.map((r) => ({ memberId: r.id, name: r.full_name, balance: Number(r.balance), rewardsAvailable: Math.floor(Number(r.balance) / settings.points_per_reward) })),
      redemptions: redemptions.rows,
      weeklyPrizes: prizes
    });
  });

  // Canje en el mostrador: descuenta los puntos de un premio. expectedBalance evita un doble canje por doble toque.
  app.post<{ Body: RedeemBody }>("/api/v1/admin/rewards/redeem", {
    schema: {
      body: {
        type: "object", required: ["memberId", "expectedBalance"], additionalProperties: false,
        properties: { memberId: { type: "string", format: "uuid" }, expectedBalance: { type: "integer", minimum: 0, maximum: 100000000 } }
      }
    },
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send(unauthenticated);
    if (!actor.roles.includes("admin")) return reply.code(403).send(forbidden);
    if (!requireCsrf(request, reply, actor.sessionToken, config)) return;
    try {
      const result = await transactionalDb.transaction(async (tx) => {
        const member = await tx.query("SELECT id FROM member_profiles WHERE id = $1 AND anonymized_at IS NULL FOR UPDATE", [request.body.memberId]);
        if (!member.rows[0]) throw new GameError(404, "not_found", "The requested resource was not found.");
        const settings = await loadSettings(tx);
        const balance = await balanceOf(tx, request.body.memberId);
        if (balance !== request.body.expectedBalance) {
          throw new GameError(409, "balance_changed", "The balance changed; reload before redeeming.", { balance });
        }
        if (balance < settings.points_per_reward) {
          throw new GameError(409, "insufficient_points", "The member does not have enough points.", { balance });
        }
        const inserted = await tx.query(
          "INSERT INTO reward_points (member_id, delta, kind, note, created_by) VALUES ($1, $2, 'redemption', $3, $4) RETURNING id",
          [request.body.memberId, -settings.points_per_reward, settings.reward_name, actor.userId]
        );
        await tx.query(
          "INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id,request_id,after_data) VALUES ($1,'reward.redeemed','member_profile',$2,$3,$4::jsonb)",
          [actor.userId, request.body.memberId, request.id, JSON.stringify({ points: settings.points_per_reward, reward: settings.reward_name, entry: inserted.rows[0]?.id })]
        );
        return { balance: balance - settings.points_per_reward, redeemed: settings.reward_name };
      });
      return reply.code(201).send(result);
    } catch (error) { return sendError(reply, error); }
  });

  // Registra la entrega del premio de una semana ya cerrada. El ganador lo calcula el servidor.
  app.post<{ Body: PrizeBody }>("/api/v1/admin/rewards/weekly-prizes", {
    schema: {
      body: { type: "object", required: ["weekStart"], additionalProperties: false, properties: { weekStart: { type: "string", format: "date" } } }
    },
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send(unauthenticated);
    if (!actor.roles.includes("admin")) return reply.code(403).send(forbidden);
    if (!requireCsrf(request, reply, actor.sessionToken, config)) return;
    try {
      const result = await transactionalDb.transaction(async (tx) => {
        const check = await tx.query(
          `SELECT extract(isodow FROM $1::date) = 1 AS monday, $1::date < ${WEEK_START_NOW} AS closed`,
          [request.body.weekStart]
        );
        if (check.rows[0]?.monday !== true) throw new GameError(400, "invalid_week", "The week must start on a Monday.");
        if (check.rows[0]?.closed !== true) throw new GameError(409, "week_not_closed", "The week is not over yet.");
        await tx.query("LOCK TABLE weekly_prizes IN SHARE ROW EXCLUSIVE MODE");
        const existing = await tx.query("SELECT 1 FROM weekly_prizes WHERE week_start = $1::date", [request.body.weekStart]);
        if (existing.rows[0]) throw new GameError(409, "already_delivered", "The prize for this week was already delivered.");
        const [winner] = await weeklyRanking(tx, "$1::date", [request.body.weekStart], 1);
        if (!winner) throw new GameError(404, "no_winner", "Nobody played that week.");
        await tx.query(
          "INSERT INTO weekly_prizes (week_start, member_id, game_run_id, score, delivered_by) VALUES ($1::date, $2, $3, $4, $5)",
          [request.body.weekStart, winner.member_id, winner.run_id, winner.score, actor.userId]
        );
        await tx.query(
          "INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id,request_id,after_data) VALUES ($1,'reward.weekly_prize_delivered','member_profile',$2,$3,$4::jsonb)",
          [actor.userId, winner.member_id, request.id, JSON.stringify({ weekStart: request.body.weekStart, score: winner.score })]
        );
        return { weekStart: request.body.weekStart, winner: { name: winner.full_name, score: winner.score } };
      });
      return reply.code(201).send(result);
    } catch (error) { return sendError(reply, error); }
  });

  app.patch<{ Body: SettingsBody }>("/api/v1/admin/rewards/settings", {
    schema: {
      body: {
        type: "object", additionalProperties: false, minProperties: 1,
        properties: {
          rewardName: { type: "string", minLength: 1, maxLength: 80 },
          pointsPerReward: { type: "integer", minimum: 100, maximum: 1000000 },
          dailyPointsCap: { type: "integer", minimum: 0, maximum: 100000 },
          weeklyPrizeEnabled: { type: "boolean" }
        }
      }
    },
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const actor = await resolveActor(request, db);
    if (!actor) return reply.code(401).send(unauthenticated);
    if (!actor.roles.includes("admin")) return reply.code(403).send(forbidden);
    if (!requireCsrf(request, reply, actor.sessionToken, config)) return;
    const body = request.body;
    const rewardName = body.rewardName?.trim();
    if (body.rewardName !== undefined && !rewardName) return reply.code(400).send({ error: "invalid_settings", message: "The reward name cannot be empty." });
    const settings = await transactionalDb.transaction(async (tx) => {
      const before = await loadSettings(tx);
      await tx.query(
        `UPDATE reward_settings SET
           reward_name = COALESCE($1, reward_name), points_per_reward = COALESCE($2, points_per_reward),
           daily_points_cap = COALESCE($3, daily_points_cap), weekly_prize_enabled = COALESCE($4, weekly_prize_enabled),
           updated_by = $5, updated_at = now()
         WHERE id = true`,
        [rewardName ?? null, body.pointsPerReward ?? null, body.dailyPointsCap ?? null, body.weeklyPrizeEnabled ?? null, actor.userId]
      );
      const after = await loadSettings(tx);
      await tx.query(
        "INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id,request_id,before_data,after_data) VALUES ($1,'reward.settings_updated','reward_settings','singleton',$2,$3::jsonb,$4::jsonb)",
        [actor.userId, request.id, JSON.stringify(publicSettings(before)), JSON.stringify(publicSettings(after))]
      );
      return after;
    });
    return reply.send({ settings: publicSettings(settings) });
  });
}
