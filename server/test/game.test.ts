import test from "node:test";
import assert from "node:assert/strict";
import { MAX_PERFECT_REPS, MAX_REPS, MIN_RUN_MS, competes, judgeRun, pointsForRun, rankingName } from "../src/domain/game.js";

test("judgeRun calcula el puntaje en el servidor: 10 por repetición y 10 extra por perfecta", () => {
  assert.deepEqual(judgeRun(30_500, 40, 12), { ok: true, score: 520 });
  assert.deepEqual(judgeRun(30_500, 0, 0), { ok: true, score: 0 });
});

test("judgeRun rechaza partidas imposibles", () => {
  assert.deepEqual(judgeRun(MIN_RUN_MS - 1, 10, 0), { ok: false, reason: "too_fast" });
  assert.deepEqual(judgeRun(11 * 60_000, 10, 0), { ok: false, reason: "too_slow" });
  assert.deepEqual(judgeRun(30_500, MAX_REPS + 1, 0), { ok: false, reason: "implausible_reps" });
  assert.deepEqual(judgeRun(30_500, 50, MAX_PERFECT_REPS + 1), { ok: false, reason: "implausible_perfect" });
  assert.deepEqual(judgeRun(30_500, 5, 6), { ok: false, reason: "implausible_perfect" });
  assert.deepEqual(judgeRun(30_500, 2.5, 0), { ok: false, reason: "implausible_reps" });
});

test("pointsForRun respeta el tope diario", () => {
  assert.equal(pointsForRun(400, 0, 1000), 400);
  assert.equal(pointsForRun(400, 800, 1000), 200);
  assert.equal(pointsForRun(400, 1000, 1000), 0);
  assert.equal(pointsForRun(400, 1200, 1000), 0);
  assert.equal(pointsForRun(400, 0, 0), 0);
});

test("solo compiten los miembros sin rol de staff", () => {
  assert.equal(competes(["member"], "m1"), true);
  assert.equal(competes(["member", "coach"], "m1"), false);
  assert.equal(competes(["member", "admin"], "m1"), false);
  assert.equal(competes(["coach"], null), false);
  assert.equal(competes(["member"], null), false);
});

test("rankingName muestra nombre e inicial del apellido", () => {
  assert.equal(rankingName("Ana Pérez"), "Ana P.");
  assert.equal(rankingName("  maría  del carmen  ruiz "), "maría R.");
  assert.equal(rankingName("Cher"), "Cher");
  assert.equal(rankingName(""), "Miembro");
});
