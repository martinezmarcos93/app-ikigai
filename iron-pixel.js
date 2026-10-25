/* Iron Pixel: minijuego de pesas en pixel art (prototipo de updates/01-Primer actualizacion, adaptado al portal).
 * El juego solo cuenta repeticiones; el puntaje que vale y los puntos los calcula el servidor (server/src/domain/game.ts).
 * Las reglas tienen que coincidir con las del servidor: 30 s, 300 ms entre repeticiones, zona roja .43–.62.
 * Uso: const game = IkigaiIronPixel.mount(nodo, { onStart: async () => ..., onFinish: async ({reps, perfectReps}) => resultado });
 *      game.destroy() al salir de la pantalla. */
(() => {
  "use strict";
  const GAME_SECONDS = 30;
  const REP_COOLDOWN_MS = 300;
  const PERFECT_FROM = 0.43;
  const PERFECT_TO = 0.62;
  const BAR_SPEED = 0.9;

  function mount(root, hooks = {}) {
    root.innerHTML = `
      <div class="ip-shell">
        <div class="ip-header">
          <div><div class="ip-brand">IKIGAI <span>TRAINING</span></div><div class="ip-sub">IRON PIXEL // MINI GAME 001</div></div>
          <div class="ip-pill">8-BIT MODE</div>
        </div>
        <div class="ip-screen"><canvas width="320" height="240" aria-label="Juego pixel art de levantamiento de pesas"></canvas></div>
        <div class="ip-hud" aria-live="polite">
          <div class="ip-stat"><span>PUNTOS</span><strong class="ip-red" data-ip="score">0000</strong></div>
          <div class="ip-stat"><span>REPETICIONES</span><strong data-ip="reps">00</strong></div>
          <div class="ip-stat"><span>RÉCORD</span><strong data-ip="best">0000</strong></div>
        </div>
        <div class="ip-help" data-ip="help"><b>OBJETIVO:</b> completá tantas repeticiones como puedas en 30 segundos. Tocá <b>LEVANTAR</b> cuando el indicador esté en la zona roja para sumar puntos extra.</div>
        <div class="ip-controls">
          <button class="ip-button ip-primary" type="button" data-ip="lift">▲ LEVANTAR</button>
          <button class="ip-button" type="button" data-ip="start">▶ INICIAR</button>
        </div>
      </div>`;
    const canvas = root.querySelector("canvas");
    const x = canvas.getContext("2d");
    x.imageSmoothingEnabled = false;
    const el = name => root.querySelector(`[data-ip="${name}"]`);
    let running = false, starting = false, finishing = false, over = false, destroyed = false;
    let score = 0, reps = 0, perfectReps = 0, best = Number(hooks.best || 0), left = GAME_SECONDS;
    let last = performance.now(), endsAt = 0, bar = 0, barDir = 1, pose = 0, flash = 0, lastRepAt = -Infinity, raf = 0, resultText = "";

    const rect = (a, b, w, h, col) => { x.fillStyle = col; x.fillRect(a, b, w, h); };
    const txt = (s, a, b, size, col = "#f3f3f5") => { x.fillStyle = col; x.font = `bold ${size}px monospace`; x.textAlign = "center"; x.fillText(s, a, b); };
    const pad = (n, w) => String(Math.max(0, n)).padStart(w, "0");
    const setHelp = html => { el("help").innerHTML = html; };

    function drawGuy(lifted) {
      const skin = "#c98d68", shadow = "#8b5140", shirt = "#e31a20", shirtShade = "#7c090f", pants = "#45454a", light = "#f3f3f5", metal = "#b9bbbd", dark = "#171719";
      rect(130, 181, 22, 28, pants); rect(163, 181, 22, 28, pants);
      rect(125, 204, 29, 9, light); rect(160, 204, 29, 9, light); rect(125, 212, 29, 4, shirtShade); rect(160, 212, 29, 4, shirtShade);
      rect(132, 132, 51, 48, shirt); rect(126, 140, 8, 33, shirtShade); rect(181, 140, 7, 33, shirtShade);
      rect(140, 137, 7, 35, "#f04448"); rect(158, 145, 7, 27, shirtShade); rect(134, 176, 49, 8, dark);
      rect(148, 119, 18, 16, skin); rect(145, 105, 25, 20, skin); rect(145, 102, 25, 7, "#222226"); rect(141, 108, 7, 10, "#222226"); rect(166, 108, 6, 8, "#222226");
      rect(150, 113, 4, 3, "#171719"); rect(162, 113, 4, 3, "#171719"); rect(153, 121, 8, 3, shadow);
      if (!lifted) {
        rect(122, 143, 12, 30, skin); rect(116, 165, 14, 10, skin); rect(181, 143, 12, 30, skin); rect(190, 165, 14, 10, skin);
        rect(119, 141, 12, 13, shirt); rect(184, 141, 12, 13, shirt);
      } else {
        rect(122, 133, 10, 25, skin); rect(119, 119, 11, 22, skin); rect(119, 113, 13, 12, skin);
        rect(183, 133, 10, 25, skin); rect(190, 119, 11, 22, skin); rect(188, 113, 13, 12, skin);
        rect(119, 136, 13, 11, shirt); rect(183, 136, 13, 11, shirt);
      }
      const by = lifted ? 89 : 166;
      rect(76, by, 168, 5, metal); rect(70, by - 7, 10, 19, light); rect(61, by - 12, 10, 29, "#77797c"); rect(51, by - 8, 10, 21, shirt);
      rect(244, by - 7, 10, 19, light); rect(254, by - 12, 10, 29, "#77797c"); rect(264, by - 8, 10, 21, shirt);
      rect(61, by - 12, 2, 29, light); rect(264, by - 8, 2, 21, "#ff777a");
    }
    function background() {
      rect(0, 0, 320, 240, "#090a0c");
      rect(0, 0, 320, 5, "#e31a20"); rect(0, 5, 320, 1, "#7c090f");
      for (let i = 0; i < 8; i++) rect(i * 46 + 5, 20, 1, 140, "#171719");
      rect(14, 35, 74, 44, "#111112"); rect(17, 38, 68, 38, "#171719"); txt("IKIGAI", 51, 54, 9, "#e31a20"); txt("GYM", 51, 68, 9, "#9c9ca3");
      rect(231, 35, 75, 44, "#111112"); rect(235, 39, 67, 36, "#171719"); txt("POWER", 268, 54, 8, "#f3f3f5"); txt("UP!", 268, 68, 10, "#e31a20");
      rect(0, 216, 320, 24, "#171719"); rect(0, 216, 320, 3, "#45454a");
      for (let i = 0; i < 320; i += 16) rect(i, 228, 8, 1, "#303034");
      rect(96, 211, 128, 5, "#7c090f"); rect(102, 216, 116, 3, "#303034");
    }
    function meter() {
      txt("FUERZA", 160, 24, 9, "#9c9ca3");
      rect(91, 31, 138, 10, "#303034"); rect(94, 34, 132, 4, "#171719");
      rect(94, 34, 30, 4, "#7c090f"); rect(124, 34, 34, 4, "#e31a20"); rect(158, 34, 34, 4, "#ec2124"); rect(192, 34, 34, 4, "#7c090f");
      const px = 94 + Math.round(bar * 128);
      rect(px - 2, 29, 4, 14, "#f3f3f5"); rect(px - 1, 30, 2, 12, "#000");
    }
    function draw() {
      background(); meter(); drawGuy(pose > 0);
      txt("TIME", 45, 99, 8, "#9c9ca3"); txt(pad(Math.ceil(left), 2), 45, 116, 17, left <= 5 ? "#e31a20" : "#f3f3f5");
      txt("KG", 276, 99, 8, "#9c9ca3"); txt(String(20 + Math.floor(reps / 5) * 5), 276, 116, 17, "#f3f3f5");
      if (flash > 0) { rect(70, 128, 180, 30, "#080808"); rect(70, 128, 180, 2, "#e31a20"); txt(flash === 2 ? "¡PERFECTO!" : "+10 REP", 160, 148, 13, flash === 2 ? "#ec2124" : "#f3f3f5"); }
      if (!running) {
        rect(25, 88, 270, 105, "#050505"); rect(25, 88, 270, 3, "#e31a20"); rect(25, 190, 270, 3, "#e31a20");
        if (starting) { txt("PREPARANDO…", 160, 140, 14, "#f3f3f5"); return; }
        txt(over ? "FIN DEL ENTRENAMIENTO" : "IRON PIXEL", 160, 113, 14, "#f3f3f5");
        txt(over ? `PUNTOS ${score}` : "LEVANTÁ LA BARRA", 160, 137, 10, "#e31a20");
        txt(over ? (resultText || "PULSÁ INICIAR PARA OTRA") : "PULSÁ INICIAR", 160, 155, 9, "#9c9ca3");
        txt("30 SEGUNDOS · SUMÁ REPETICIONES", 160, 177, 8, "#808281");
      }
    }
    function hud() { el("score").textContent = pad(score, 4); el("reps").textContent = pad(reps, 2); el("best").textContent = pad(best, 4); }

    async function start() {
      if (starting || running || finishing || destroyed) return;
      starting = true; over = false; resultText = ""; draw();
      try {
        if (hooks.onStart) await hooks.onStart();
      } catch (error) {
        starting = false; draw();
        setHelp(`<b>NO SE PUDO EMPEZAR.</b> ${escapeHtml(error?.message || "Revisá la conexión y volvé a intentar.")}`);
        return;
      }
      if (destroyed) return;
      starting = false;
      score = 0; reps = 0; perfectReps = 0; left = GAME_SECONDS; running = true; pose = 0; flash = 0; lastRepAt = -Infinity;
      last = performance.now();
      endsAt = last + GAME_SECONDS * 1000;   // reloj real: un teléfono lento no alarga la partida
      el("start").textContent = "EN JUEGO…"; el("start").disabled = true;
      setHelp("<b>EN JUEGO:</b> tocá <b>LEVANTAR</b> para cada repetición. En la zona roja del centro sumás puntos extra. ¡No pares!");
      hud(); draw();
    }
    function lift() {
      // Antes de la primera partida, LEVANTAR también arranca; al terminar no (los toques de último segundo
      // no tienen que empezar otra partida sin querer): para jugar de nuevo está «OTRA PARTIDA».
      if (!running) { if (!starting && !finishing && !over) start(); return; }
      const now = performance.now();
      if (now - lastRepAt < REP_COOLDOWN_MS) return;   // la barra todavía está bajando
      lastRepAt = now;
      const perfect = bar > PERFECT_FROM && bar < PERFECT_TO;
      reps++; if (perfect) perfectReps++;
      score += perfect ? 20 : 10; pose = 1; flash = perfect ? 2 : 1;
      hud(); draw();
      setTimeout(() => { pose = 0; flash = 0; if (running && !destroyed) draw(); }, 230);
    }
    async function finish() {
      running = false; over = true; finishing = true;
      el("start").disabled = true; el("start").textContent = "REGISTRANDO…";
      setHelp("<b>ENTRENAMIENTO COMPLETADO.</b> Registrando tu resultado…");
      draw();
      try {
        const result = hooks.onFinish ? await hooks.onFinish({ reps, perfectReps }) : null;
        if (result && typeof result.score === "number") {
          score = result.score;
          if (score > best) best = score;
          resultText = result.headline || "";
          setHelp(result.message || "<b>RESULTADO REGISTRADO.</b>");
        }
      } catch (error) {
        resultText = "NO SE REGISTRÓ";
        setHelp(`<b>NO SE PUDO REGISTRAR.</b> ${escapeHtml(error?.message || "Revisá la conexión.")}`);
      }
      finishing = false;
      if (destroyed) return;
      el("start").disabled = false; el("start").textContent = "▶ OTRA PARTIDA";
      hud(); draw();
    }
    function loop(t) {
      if (destroyed) return;
      const dt = Math.min((t - last) / 1000, 0.05); last = t;
      if (running) {
        left = Math.max(0, (endsAt - t) / 1000);
        bar += barDir * dt * BAR_SPEED;
        if (bar > 0.98) { bar = 0.98; barDir = -1; }
        if (bar < 0.02) { bar = 0.02; barDir = 1; }
        if (left <= 0) { left = 0; finish(); }
      }
      draw();
      raf = requestAnimationFrame(loop);
    }
    const onLift = e => { e.preventDefault(); lift(); };
    const onCanvas = e => { e.preventDefault(); if (running) lift(); else if (!over) start(); };
    const onKey = e => {
      if (!["Space", "ArrowUp", "Enter"].includes(e.code)) return;
      if (e.target && e.target.closest && e.target.closest("input, textarea, select, button, a")) return;
      e.preventDefault(); lift();
    };
    el("lift").addEventListener("pointerdown", onLift);
    el("start").addEventListener("click", start);
    canvas.addEventListener("pointerdown", onCanvas);
    document.addEventListener("keydown", onKey);
    hud(); draw();
    raf = requestAnimationFrame(loop);

    return {
      setBest(value) { best = Math.max(best, Number(value) || 0); hud(); },
      destroy() {
        destroyed = true; running = false;
        cancelAnimationFrame(raf);
        document.removeEventListener("keydown", onKey);
      }
    };
  }
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  }
  window.IkigaiIronPixel = { mount, GAME_SECONDS, REP_COOLDOWN_MS };
})();
