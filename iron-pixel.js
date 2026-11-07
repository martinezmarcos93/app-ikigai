const MARKUP = '\n    <div class="app">\n      <header class="top">\n        <div>\n          <div class="brand">IKIGAI <span>TRAINING</span></div>\n          <div class="sub">IRON PIXEL // ARCADE LAB V2</div>\n        </div>\n        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap">\n          <div class="badge">CIRCUITO OFICIAL · VERSIÓN 2</div>\n        </div>\n      </header>\n      <div class="layout">\n        <section class="main" aria-label="Juego Iron Pixel">\n          <div class="frame">\n            <canvas id="ip2-screen" data-ip2="screen" width="640" height="360" aria-label="Juego pixel art de gimnasio"></canvas>\n            <div class="overlay" id="ip2-overlay" data-ip2="overlay">\n              <div class="overlaybox">\n                <div class="otitle" id="ip2-overlayTitle" data-ip2="overlayTitle">IRON PIXEL V2</div>\n                <p class="ocopy" id="ip2-overlayCopy" data-ip2="overlayCopy">\n                  Cuatro pruebas. Construí tu combo y dominá el ritmo.\n                </p>\n                <button class="primary" id="ip2-startBtn" data-ip2="startBtn">INICIAR CIRCUITO</button>\n              </div>\n            </div>\n            <div class="notice" id="ip2-notice" data-ip2="notice" role="status"></div>\n          </div>\n          <div class="hud" aria-live="polite"><div class="stat"><label>RÉCORD PERSONAL</label><strong data-ip2="best">—</strong></div>\n            <div class="stat"><label>PUNTUACIÓN</label><strong id="ip2-score" data-ip2="score" class="red">00000</strong></div>\n            <div class="stat"><label>REPETICIONES</label><strong id="ip2-reps" data-ip2="reps">00</strong></div>\n            <div class="stat"><label>COMBO</label><strong id="ip2-combo" data-ip2="combo">×1.0</strong></div>\n            <div class="stat"><label>TIEMPO</label><strong id="ip2-time" data-ip2="time">30.0</strong></div>\n          </div>\n          <div class="controls">\n            <div>\n              <button class="primary action" id="ip2-actionBtn" data-ip2="actionBtn">▲ LEVANTAR</button>\n              <div class="bikebtns" id="ip2-bikeBtns" data-ip2="bikeBtns">\n                <button class="primary action" id="ip2-bikeL" data-ip2="bikeL">◀ IZQUIERDA</button>\n                <button class="primary action" id="ip2-bikeR" data-ip2="bikeR">DERECHA ▶</button>\n              </div>\n              <div class="hint" id="ip2-keyhint" data-ip2="keyhint">ESPACIO / ↑ / TOCAR PARA JUGAR</div>\n              <div class="zenbtns">\n                <button class="secondary" id="ip2-nextZen" data-ip2="nextZen" style="display: none">SIGUIENTE EJERCICIO</button\n                ><button class="secondary" id="ip2-endZen" data-ip2="endZen" style="display: none">TERMINAR ZEN</button>\n              </div>\n            </div>\n            <button class="secondary" id="ip2-soundBtn" data-ip2="soundBtn" aria-pressed="false">SONIDO: OFF</button>\n          </div>\n          <div class="settings" id="ip2-settings" data-ip2="settings">\n            <label class="field"\n              >MODO<select id="ip2-playMode" data-ip2="playMode">\n                <option value="circuit">CIRCUITO COMPLETO</option>\n                <option value="0">PRESS DE BANCA</option>\n                <option value="1">DOMINADAS</option>\n                <option value="2">CURL DE BÍCEPS</option>\n                <option value="3">BICICLETA ESTÁTICA</option>\n              </select></label\n            ><label class="field"\n              >PERSONAJE<select id="ip2-character" data-ip2="character">\n                <option value="male" selected>MASCULINO</option>\n                <option value="female">FEMENINO</option>\n              </select></label\n            ><label class="field"\n              >PESO<select id="ip2-weight" data-ip2="weight">\n                <option value="light">LIVIANO · ×1</option>\n                <option value="medium" selected>MEDIO · ×1.5</option>\n                <option value="heavy">PESADO · ×2</option>\n              </select></label\n            >\n            ><label class="toggle"\n              ><input id="ip2-zen" data-ip2="zen" type="checkbox" /> MODO ZEN (SIN TEMPORIZADOR · TOPE 500 · NO SUMA RÉCORD)</label\n            >\n            <p class="mini settingsnote" id="ip2-settingsNote" data-ip2="settingsNote">Modo, peso y Zen se aplican al iniciar la partida.</p>\n          </div>\n        </section>\n        <aside class="side">\n          <section class="card">\n            <div class="ctitle">CIRCUITO ACTUAL</div>\n            <div id="ip2-circuitList" data-ip2="circuitList"></div>\n            <p class="mini" id="ip2-circuitNote" data-ip2="circuitNote"></p>\n          </section>\n          <section class="card">\n            <div class="ctitle">PUNTOS POR REPETICIÓN</div>\n            <table>\n              <tr>\n                <td><span class="dot" style="background: #a3e635"></span>PERFECT</td>\n                <td>25 pts</td>\n              </tr>\n              <tr>\n                <td><span class="dot" style="background: #facc15"></span>GOOD</td>\n                <td>10 pts</td>\n              </tr>\n              <tr>\n                <td><span class="dot" style="background: #71717a"></span>FLOJO</td>\n                <td>2 pts</td>\n              </tr>\n              <tr>\n                <td>Combo cada 3</td>\n                <td>+0.5×</td>\n              </tr>\n            </table>\n            <p class="mini">Multiplicador de peso. Modo Zen limita la puntuación a 500.</p>\n          </section>\n          <section class="card">\n            <div class="ctitle">MISIONES DE ESTA SESIÓN</div>\n            <div class="mission">\n              <div class="mhead"><span>Conseguí 10 PERFECT</span><b id="ip2-mPerfect" data-ip2="mPerfect">0/10</b></div>\n              <div class="progress"><i id="ip2-pPerfect" data-ip2="pPerfect"></i></div>\n            </div>\n            <div class="mission">\n              <div class="mhead"><span>Llegá a combo ×3.0 (12 seguidas)</span><b id="ip2-mCombo" data-ip2="mCombo">PEND.</b></div>\n              <div class="progress"><i id="ip2-pCombo" data-ip2="pCombo"></i></div>\n            </div>\n            <div class="mission">\n              <div class="mhead"><span>Probá los 4 ejercicios</span><b id="ip2-mAll" data-ip2="mAll">0/4</b></div>\n              <div class="progress"><i id="ip2-pAll" data-ip2="pAll"></i></div>\n            </div>\n            <p class="mini">Misiones demostrativas locales. No se sincronizan con tu cuenta.</p>\n          </section>\n        </aside>\n      </div>\n      <footer class="foot">\n        <span>IKIGAI TRAINING · IRON PIXEL V2</span><span>IRON PIXEL V2 · IKIGAI</span>\n      </footer>\n    </div>\n    ';

(function () {
  "use strict";
function mount(root, hooks = {}) {
        root.innerHTML = MARKUP;
        const ac = new AbortController();
        var $ = function (id) { return root.querySelector("[data-ip2=\"" + id + "\"]"); },
          canvas = $("screen"),
          ctx = canvas.getContext("2d"),
          W = 640,
          H = 360;
        // El lienzo lógico es 640x360. El backing store se ajusta al tamaño CSS real × devicePixelRatio para que
        // el pixel art no se escale con un factor no entero (que producía píxeles desparejos y texto "fantasma").
        var S = 1,
          T = 1, // escala del texto: en pantallas angostas el canvas se achica y el texto de 10 px quedaba en ~5 px
          offX = 0,
          offY = 0;
        function fitCanvas() {
          var dpr = window.devicePixelRatio || 1,
            cssW = canvas.getBoundingClientRect().width || W,
            pw = Math.max(320, Math.round(cssW * dpr));
          if (canvas.width !== pw) {
            canvas.width = pw;
            canvas.height = Math.round((pw * H) / W);
          }
          S = canvas.width / W;
          T = Math.min(1.6, Math.max(1, 560 / cssW));
          ctx.imageSmoothingEnabled = false;
        }
        $("best").textContent = hooks.best ? String(hooks.best) : "—";
        fitCanvas();
        var C = {
          bg: "#08080a",
          red: "#e31a20",
          bright: "#ff4148",
          white: "#f4f4f5",
          muted: "#a1a1aa",
          green: "#a3e635",
          yellow: "#facc15",
          skin: "#c98d68",
          shirt: "#e31a20",
          pants: "#414149",
          metal: "#c6c8cc",
        };
        var ex = [
          { name: "PRESS DE BANCA", id: "bench" },
          { name: "DOMINADAS", id: "pull" },
          { name: "CURL DE BÍCEPS", id: "curl" },
          { name: "BICICLETA ESTÁTICA", id: "bike" },
        ];
        var weights = {
          light: { label: "LIVIANO", mult: 1, speed: 1, zone: 1 },
          medium: { label: "MEDIO", mult: 1.5, speed: 1.17, zone: 0.83 },
          heavy: { label: "PESADO", mult: 2, speed: 1.34, zone: 0.68 },
        };
        // Ventanas de puntuación en ms. Se usan tanto para puntuar como para dibujar el medidor de cada ejercicio,
        // de modo que lo que se ve en pantalla coincide con lo que puntúa.
        var PULL = { min: 700, perfect: 1250, good: 1900, span: 2500 }, // ms entre el toque de subida y el de bajada
          BIKE = { min: 650, perfect: 1500, good: 2300, span: 2500 }, // ms entre pedal izquierdo y derecho
          CURL = { center: 750, max: 1500 }, // ms de mantener: óptimo en 750, se suelta solo a los 1500
          ZC = { perfect: C.green, good: "#a8890f", flojo: "#3d3d45", blocked: "#1a1a1f" }; // misma paleta que la leyenda
        function curlWindows() {
          var p = 160 * weight().zone;
          return { perfect: p, good: p * 2.6 };
        }
        function gradeCurl(held) {
          var w = curlWindows(),
            d = Math.abs(held - CURL.center);
          return d <= w.perfect ? "PERFECT" : d <= w.good ? "GOOD" : "FLOJO";
        }
        // Duración de cada prueba y de la transición. Con 20 s / 3 s el circuito se sentía apurado al probarlo en
        // un celular real; se alargó a 30 s / 5 s.
        var EX_SECONDS = 30,
          TRANSITION_SECONDS = 5;
        var state = "ready",
          exercise = 0,
          singleExercise = false,
          circuitOrder = [0, 1, 2, 3],
          circuitPos = 0,
          score = 0,
          reps = 0,
          perfects = 0,
          combo = 0,
          maxCombo = 0,
          visited = {},
          repsBy = {},
          timeLeft = EX_SECONDS,
          phaseEnd = 0,
          lastFrame = 0,
          bar = 0.05,
          dir = 1,
          benchSweep = 0,
          benchLastSweep = -1,
          holdStart = 0,
          holdActive = false,
          holdBy = "", // "key", "pointer" o "toggle": qué entrada mantiene el curl y debe soltarlo
          lastTap = -Infinity,
          lastPull = 0,
          pullPhase = "",
          liftY = 86,
          pullY = 0,
          curlLift = 0,
          lastBikeSide = null,
          nextBikeSide = "left",
          lastBikeAt = 0,
          lastBikePair = 0,
          bikePedalPhase = 0,
          bikePedalVel = 0,
          flash = "",
          flashUntil = 0,
          shake = 0,
          particles = [],
          audio = null,
          sound = false,
          zen = false,
          zenCapNotified = false,
          endTitle = "CIRCUITO COMPLETADO",
          transitionEnd = 0,
          raf = 0,
          destroyed = false,
          seq = { bench: "", pull: "", curl: "", bike: "" },
          resizeObserver = null;
        function pad(n, len) {
          return String(Math.max(0, Math.floor(n))).padStart(len || 5, "0");
        }
        function weight() {
          return weights[$("weight").value];
        }
        function comboMult() {
          return Math.min(3, 1 + 0.5 * Math.floor(combo / 3));
        }
        function female() {
          return $("character").value === "female";
        }
        function notice(s) {
          $("notice").textContent = s;
          $("notice").classList.add("show");
          clearTimeout(notice.timer);
          notice.timer = setTimeout(function () {
            $("notice").classList.remove("show");
          }, 2400);
        }
        function beep(freq, duration) {
          if (!sound) return;
          try {
            audio = audio || new (window.AudioContext || window.webkitAudioContext)();
            if (audio.state === "suspended") audio.resume();
            var o = audio.createOscillator(),
              g = audio.createGain();
            o.type = "square";
            o.frequency.value = freq;
            g.gain.setValueAtTime(0.035, audio.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
            o.connect(g);
            g.connect(audio.destination);
            o.start();
            o.stop(audio.currentTime + duration);
          } catch (e) {}
        }
        function soundGrade(g) {
          if (g === "PERFECT") {
            beep(880, 0.08);
            setTimeout(function () {
              beep(1175, 0.1);
            }, 55);
            if (combo >= 6)
              setTimeout(function () {
                beep(1480, 0.1);
              }, 110);
          } else if (g === "GOOD") beep(520, 0.07);
          else beep(180, 0.09);
        }
        // Solo la primera partícula tenía texto (las otras 7 dibujaban cadenas vacías): queda un único
        // puntaje flotante que sube unos píxeles desde el banner de resultado.
        function particlesFor(label, x, y, color) {
          particles.push({ x: x, y: y, vx: 0, vy: -0.9, life: 34, text: label, color: color });
        }
        function grade() {
          var z = 0.06 * Math.max(0.55, 1 - reps * 0.006) * weight().zone,
            d = Math.abs(bar - 0.5);
          if (d < z) return "PERFECT";
          if (d < z * 2.7) return "GOOD";
          return "FLOJO";
        }
        function updateHud() {
          $("score").textContent = pad(score);
          $("reps").textContent = pad(reps, 2);
          $("combo").textContent = "×" + comboMult().toFixed(1);
          $("time").textContent = zen && state === "running" ? "∞" : Math.max(0, timeLeft).toFixed(1);
          $("combo").className = combo >= 6 ? "good" : "";
        }
        function updateMissions() {
          $("mPerfect").textContent = Math.min(10, perfects) + "/10";
          $("pPerfect").style.width = Math.min(100, perfects * 10) + "%";
          $("mCombo").textContent = maxCombo >= 12 ? "COMPLETA" : "PEND.";
          $("pCombo").style.width = Math.min(100, (maxCombo / 12) * 100) + "%";
          var count = Object.keys(visited).length;
          $("mAll").textContent = count + "/4";
          $("pAll").style.width = (count / 4) * 100 + "%";
        }
        var exInfo = [
          "Pulsá cuando el marcador esté en la zona verde. Un intento por ida y vuelta.",
          "Tocá para subir y tocá de nuevo para bajar cuando el marcador esté en verde.",
          "Mantené apretado y soltá cuando el marcador llegue a la zona verde.",
          "Alterná pedal izquierdo y derecho con ritmo.",
        ];
        // El panel refleja el orden real (aleatorio) de la partida; antes mostraba siempre 01-04 en orden fijo.
        function renderCircuit() {
          var ready = state === "ready",
            n,
            single = ready ? $("playMode").value !== "circuit" : singleExercise,
            order = single ? [ready ? Number($("playMode").value) : exercise] : circuitOrder;
          $("circuitList").innerHTML = order
            .map(function (id, i) {
              var done = !ready && visited[ex[id].id],
                active = state === "running" && id === exercise,
                next = state === "transition" && !single && id === circuitOrder[circuitPos + 1],
                label = done
                  ? (n = repsBy[ex[id].id] || 0)
                    ? n + (n === 1 ? " REP" : " REPS")
                    : "SIN REPS"
                  : active
                    ? "ACTIVO"
                    : next
                      ? "SIGUE"
                      : "PENDIENTE";
              return (
                '<div class="row"><div><b>' +
                pad(i + 1, 2) +
                " / " +
                ex[id].name +
                "</b><small>" +
                exInfo[id] +
                '</small></div><span class="tag' +
                (active ? " active" : "") +
                '">' +
                label +
                "</span></div>"
              );
            })
            .join("");
          $("circuitNote").textContent = ready
            ? "El orden de las pruebas se sortea al iniciar. " +
              EX_SECONDS +
              " segundos por prueba · " +
              TRANSITION_SECONDS +
              " segundos de transición."
            : zen && state === "running"
              ? "Modo Zen: sin temporizador. Usá SIGUIENTE EJERCICIO para pasar de prueba o TERMINAR ZEN para cerrar."
              : EX_SECONDS + " segundos por prueba · " + TRANSITION_SECONDS + " segundos de transición. El peso cambia la dificultad.";
        }
        function hintText() {
          return exercise === 0
            ? "PRESS: PULSÁ CUANDO EL MARCADOR ESTÉ EN LA ZONA VERDE · UN INTENTO POR IDA Y VUELTA"
            : exercise === 1
              ? "DOMINADAS: TOCÁ PARA SUBIR Y TOCÁ DE NUEVO PARA BAJAR CON LA ZONA VERDE"
              : exercise === 2
                ? "CURL: MANTENÉ APRETADO (TECLA, BOTÓN O PANTALLA) Y SOLTÁ EN LA ZONA VERDE"
                : "BICICLETA: ALTERNÁ ←/→ O A/D (O LOS BOTONES) · EMPEZÁ POR LA IZQUIERDA";
        }
        // Modo, peso, Zen e iniciales solo se leen al iniciar: durante la partida quedan deshabilitados para que
        // no parezca que funcionan (antes se podían tocar sin ningún efecto visible).
        function lockSettings() {
          var playing = state === "running" || state === "transition";
          ["playMode", "weight", "zen"].forEach(function (id) {
            $(id).disabled = playing;
          });
          $("settingsNote").textContent = playing
            ? "Modo, peso y Zen quedan fijos hasta que termine la partida. El personaje se puede cambiar siempre."
            : "Modo, peso y Zen se aplican al iniciar la partida.";
        }
        function startLabel() {
          return $("zen").checked
            ? "INICIAR PRÁCTICA ZEN"
            : $("playMode").value === "circuit"
              ? "INICIAR CIRCUITO"
              : "INICIAR PRUEBA";
        }
        // Con la partida detenida, cambiar el modo o Zen actualiza el botón, el panel y la escena de inmediato.
        function previewSettings() {
          if (state === "running" || state === "transition") return;
          state = "ready";
          singleExercise = $("playMode").value !== "circuit";
          exercise = singleExercise ? Number($("playMode").value) : 0;
          $("startBtn").textContent = startLabel();
          tagExercise();
        }
        function updateBikeButtons() {
          $("bikeL").classList.toggle("next", nextBikeSide === "left");
          $("bikeR").classList.toggle("next", nextBikeSide === "right");
        }
        function tagExercise() {
          var bike = exercise === 3 && state !== "over";
          $("nextZen").style.display =
            zen && state === "running" && !singleExercise && circuitPos < circuitOrder.length - 1
              ? "inline-block"
              : "none";
          $("endZen").style.display = zen && state === "running" ? "inline-block" : "none";
          root.querySelector(".zenbtns").style.display = zen && state === "running" ? "" : "none";
          lockSettings();
          $("actionBtn").style.display = bike ? "none" : "";
          $("bikeBtns").style.display = bike ? "grid" : "none";
          updateBikeButtons();
          renderCircuit();
          if (state !== "over") {
            $("actionBtn").textContent =
              exercise === 0
                ? "▲ LEVANTAR"
                : exercise === 1
                  ? "▲ DOMINADAS"
                  : exercise === 2
                    ? holdActive
                      ? "▼ SOLTAR"
                      : "▲ CURL"
                    : "◀ ▶ PEDALEAR";
            $("keyhint").textContent = hintText();
          }
        }
        function award(g) {
          seq[ex[exercise].id] += g === "PERFECT" ? "P" : g === "GOOD" ? "G" : "F";
          var base = g === "PERFECT" ? 25 : g === "GOOD" ? 10 : 2;
          if (g === "FLOJO") combo = 0;
          else combo++;
          maxCombo = Math.max(maxCombo, combo);
          var pts = Math.floor(base * comboMult() * weight().mult);
          if (zen) pts = Math.min(pts, Math.max(0, 500 - score));
          score += pts;
          reps++;
          repsBy[ex[exercise].id] = (repsBy[ex[exercise].id] || 0) + 1;
          if (g === "PERFECT") perfects++;
          flash = g;
          flashUntil = performance.now() + 650;
          shake = g === "PERFECT" ? 3 : 0;
          particlesFor("+" + pts, 320, 292, g === "PERFECT" ? C.green : g === "GOOD" ? C.yellow : C.white);
          soundGrade(g);
          updateHud();
          updateMissions();
          if (g === "PERFECT") notice("¡PERFECT! " + pts + " puntos · combo ×" + comboMult().toFixed(1));
          // Va después del aviso de PERFECT para que no lo pise.
          if (zen && score >= 500 && !zenCapNotified) {
            zenCapNotified = true;
            notice("Tope del modo Zen alcanzado: 500 puntos. Podés seguir practicando.");
          }
        }
        async function startRun() {
          if (state === "running" || state === "transition" || state === "starting") return;
          singleExercise = $("playMode").value !== "circuit";
          score = 0;
          reps = 0;
          perfects = 0;
          combo = 0;
          maxCombo = 0;
          visited = {};
          repsBy = {};
          seq = { bench: "", pull: "", curl: "", bike: "" };
          circuitOrder = [0, 1, 2, 3];
          for (var ri = circuitOrder.length - 1; ri > 0; ri--) {
            var rj = Math.floor(Math.random() * (ri + 1));
            var rt = circuitOrder[ri];
            circuitOrder[ri] = circuitOrder[rj];
            circuitOrder[rj] = rt;
          }
          circuitPos = 0;
          exercise = singleExercise ? Number($("playMode").value) : circuitOrder[0];
          zen = $("zen").checked;
          if (!singleExercise && !zen && hooks.onStart) {
            state = "starting";
            try { await hooks.onStart(); } catch (error) { state = "ready"; notice(error.message || String(error)); return; }
          }
          zenCapNotified = false;
          timeLeft = zen ? 0 : EX_SECONDS;
          bar = 0.05;
          dir = 1;
          benchSweep = 0;
          benchLastSweep = -1;
          particles = [];
          flash = "";
          $("overlay").classList.add("hidden");
          $("actionBtn").disabled = false;
          $("actionBtn").textContent = "▲ LEVANTAR";
          state = "running";
          phaseEnd = zen ? Infinity : performance.now() + timeLeft * 1000;
          lastTap = -Infinity;
          lastPull = 0;
          pullPhase = "";
          liftY = 86;
          pullY = 0;
          curlLift = 0;
          lastBikeSide = null;
          nextBikeSide = "left";
          lastBikeAt = -Infinity;
          lastBikePair = performance.now();
          bikePedalPhase = 0;
          bikePedalVel = 0;
          lastPull = 0;
          holdActive = false;
          holdBy = "";
          tagExercise();
          updateHud();
          updateMissions();
          beep(660, 0.07);
        }
        function act(now, bikeSide) {
          now = now || performance.now();
          if (state !== "running") return;
          if (exercise === 0) {
            // Un intento por ida y vuelta del marcador; el primero vale desde el arranque. Antes había que esperar
            // una vuelta completa (~2,5 s) antes del primer intento y el aviso que lo explicaba no se veía. Con un
            // intento por pasada el press daba casi el doble de repeticiones que las otras pruebas.
            if (now - lastTap < 250) return;
            lastTap = now;
            if (benchLastSweep === benchSweep) {
              notice("Un intento por ida y vuelta del marcador.");
              return;
            }
            benchLastSweep = benchSweep;
            award(grade());
            return;
          }
          if (exercise === 1) {
            // La dominada usa una fase abajo y otra arriba: una repetición solo puntúa al completar ambas.
            if (now - lastTap < 220) return;
            if (!pullPhase) {
              pullPhase = "up";
              lastPull = now;
              lastTap = now;
              $("keyhint").textContent = "SUBIENDO · TOCÁ OTRA VEZ PARA BAJAR EN LA ZONA VERDE";
              beep(320, 0.05);
              return;
            }
            var gap = now - lastPull;
            if (gap < PULL.min) {
              notice("Completá la subida y bajada antes de repetir.");
              return;
            }
            pullPhase = "";
            lastTap = now;
            lastPull = now;
            $("keyhint").textContent = hintText();
            award(gap <= PULL.perfect ? "PERFECT" : gap <= PULL.good ? "GOOD" : "FLOJO");
            return;
          }
          if (exercise === 2) {
            if (holdActive) {
              curlRelease(now);
              return;
            }
            if (now - lastTap < 280) return;
            lastTap = now;
            holdActive = true;
            holdStart = now;
            holdBy = holdBy || "toggle";
            $("actionBtn").textContent = "▼ SOLTAR";
            $("keyhint").textContent = "MANTENIENDO · SOLTÁ CUANDO EL MARCADOR ESTÉ EN LA ZONA VERDE";
            beep(260, 0.04);
            return;
          }
          if (exercise === 3) {
            var side = bikeSide;
            if (!side) {
              notice("Pedaleá con ← / → (o A / D) o con los botones IZQUIERDA y DERECHA.");
              return;
            }
            // Validar el lado esperado antes de modificar el estado: el primer pedal siempre es izquierdo.
            if (side !== nextBikeSide) {
              notice("Alterná los pedales: ahora toca " + (nextBikeSide === "left" ? "izquierda" : "derecha") + ".");
              return;
            }
            if (now - lastBikeAt < 280) {
              notice("Pedaleá con un ritmo más controlado.");
              return;
            }
            // Un ciclo derecho demasiado rápido se rechaza sin consumir el turno ni reiniciar su referencia temporal.
            var cycleTime = side === "right" ? now - lastBikePair : 0;
            if (side === "right" && cycleTime < BIKE.min) {
              notice("Completá el ciclo de pedaleo.");
              return;
            }
            // Commit del estado solo después de validar la entrada.
            lastBikeAt = now;
            lastBikeSide = side;
            nextBikeSide = side === "left" ? "right" : "left";
            bikePedalVel = Math.max(bikePedalVel, 10);
            updateBikeButtons();
            if (side === "left") {
              lastBikePair = now;
            } else {
              lastBikePair = now;
              award(cycleTime <= BIKE.perfect ? "PERFECT" : cycleTime <= BIKE.good ? "GOOD" : "FLOJO");
            }
            $("keyhint").textContent =
              "ÚLTIMO PEDAL: " +
              (side === "left" ? "IZQUIERDO" : "DERECHO") +
              " · AHORA " +
              (nextBikeSide === "left" ? "← IZQUIERDA" : "DERECHA →");
            return;
          }
        }
        // El curl se mantiene con la tecla, el mouse o el dedo y puntúa al soltar. Antes se jugaba con dos
        // toques aunque la consigna decía "mantené y soltá". Con el teclado sobre un botón enfocado con Tab
        // sigue funcionando con dos pulsaciones.
        function curlRelease(now) {
          if (state !== "running" || exercise !== 2 || !holdActive) return;
          var held = now - holdStart;
          holdActive = false;
          holdBy = "";
          lastTap = now;
          $("actionBtn").textContent = "▲ CURL";
          $("keyhint").textContent = hintText();
          award(gradeCurl(held));
        }
        function transition(now) {
          state = "transition";
          transitionEnd = now + TRANSITION_SECONDS * 1000;
          timeLeft = TRANSITION_SECONDS;
          holdActive = false;
          holdBy = "";
          combo = 0;
          tagExercise();
          updateHud();
          beep(300, 0.08);
        }
        function nextExercise(now) {
          visited[ex[exercise].id] = true;
          circuitPos++;
          if (singleExercise || circuitPos >= circuitOrder.length) {
            finish();
            return;
          }
          exercise = circuitOrder[circuitPos];
          timeLeft = zen ? 0 : EX_SECONDS;
          state = "running";
          phaseEnd = zen ? Infinity : now + EX_SECONDS * 1000;
          bar = 0.04;
          dir = 1;
          benchSweep = 0;
          benchLastSweep = -1;
          lastPull = 0;
          lastTap = -Infinity;
          pullPhase = "";
          lastBikeSide = null;
          nextBikeSide = "left";
          lastBikeAt = -Infinity;
          lastBikePair = now;
          bikePedalVel = 0;
          holdActive = false;
          holdBy = "";
          tagExercise();
          updateMissions();
          notice("SIGUIENTE: " + ex[exercise].name);
          beep(700, 0.06);
        }
        async function finish() {
          visited[ex[exercise].id] = true;
          state = "over";
          holdActive = false;
          holdBy = "";
          tagExercise();
          updateMissions();
          // Solo el circuito completo cuenta para los récords: Zen (tope 500) y una sola prueba (≈1/4 del
          // puntaje posible) son práctica y no deben mezclarse con él.
          var practice = zen || singleExercise;
          var official = null;
          if (!practice && hooks.onFinish) {
            try { official = await hooks.onFinish({ weight: $("weight").value, exercises: Object.assign({}, seq) }); }
            catch (error) { official = { headline: "NO SE PUDO REGISTRAR", message: escapeHtml(error.message || String(error)) }; }
          }
          endTitle = zen ? "PRÁCTICA TERMINADA" : singleExercise ? "PRUEBA COMPLETADA" : "CIRCUITO COMPLETADO";

          $("notice").classList.remove("show");
          $("overlayTitle").textContent = official && official.headline ? official.headline : endTitle;
          $("overlayCopy").innerHTML = official && official.message
            ? official.message + (official.score != null ? "<br><b>PUNTAJE OFICIAL: " + official.score + "</b>" : "")
            : "Puntuación " + score + " · " + reps + " repeticiones · " + perfects + " PERFECT." +
              (practice ? " Práctica: no suma puntos." : "");
          $("startBtn").textContent = "JUGAR OTRA VEZ";
          $("overlay").classList.remove("hidden");
          $("actionBtn").disabled = true;
          $("actionBtn").textContent = endTitle;
          updateHud();
          if (official && official.score != null) $("score").textContent = pad(official.score);
          beep(880, 0.1);
          setTimeout(function () {
            beep(1100, 0.12);
          }, 100);
        }
        function escapeHtml(s) {
          return String(s).replace(/[&<>"']/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
          });
        }
        function escapeHtml(s) {
          return String(s).replace(/[&<>"']/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
          });
        }
        // Los rectángulos se alinean a píxeles de dispositivo: bordes nítidos y sin costuras entre piezas vecinas.
        function rect(x, y, w, h, c) {
          var x0 = Math.round(x * S + offX),
            y0 = Math.round(y * S + offY),
            x1 = Math.round((x + w) * S + offX),
            y1 = Math.round((y + h) * S + offY);
          if (x1 === x0 && w > 0) x1 = x0 + 1;
          if (y1 === y0 && h > 0) y1 = y0 + 1;
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.fillStyle = c;
          ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
          ctx.setTransform(S, 0, 0, S, offX, offY);
        }
        function txt(s, x, y, size, c, align) {
          ctx.fillStyle = c;
          ctx.font = "bold " + Math.round(size * (size < 13 ? T : Math.min(T, 1.25))) + "px monospace";
          ctx.textAlign = align || "center";
          ctx.fillText(s, x, y);
        }
        function background() {
          rect(0, 0, W, H, C.bg);
          rect(0, 0, W, 7, C.red);
          for (var x = 16; x < W; x += 32) rect(x, 18, 1, 270, "#17171c");
          rect(20, 28, 132, 60, "#111115");
          rect(24, 32, 124, 52, "#1b1b20");
          // El cartel izquierdo indica en qué prueba vas (antes repetía el logo de la cabecera).
          var playing = state === "running" || state === "transition";
          txt(
            !playing ? "IRON PIXEL" : singleExercise ? "PRUEBA" : "PRUEBA " + (circuitPos + 1) + "/" + circuitOrder.length,
            86,
            53,
            !playing ? 15 : 14,
            C.red,
          );
          txt(!playing ? "ARCADE LAB" : zen ? "MODO ZEN" : singleExercise ? "ÚNICA" : "CIRCUITO", 86, 73, 10, C.muted);
          rect(492, 28, 126, 60, "#111115");
          rect(496, 32, 118, 52, "#1b1b20");
          txt(weight().label, 555, 53, 12, C.white);
          txt("PESO ×" + weight().mult, 555, 72, 10, C.red);
          rect(0, 290, W, 70, "#151519");
          rect(0, 290, W, 4, "#34343b");
          for (var xx = 0; xx < W; xx += 32) rect(xx, 327, 16, 2, "#303036");
        }
        // Cuerpo (sin brazos ni equipo). (ox, oy) es la esquina del sprite.
        function body(ox, oy) {
          var isFemale = female(),
            skin = C.skin;
          rect(ox + 32, oy + 103, 35, 42, C.pants);
          rect(ox + 81, oy + 103, 35, 42, C.pants);
          rect(ox + 25, oy + 139, 44, 10, C.white);
          rect(ox + 77, oy + 139, 44, 10, C.white);
          rect(ox + 33, oy + 53, 80, 56, C.shirt);
          if (isFemale) {
            rect(ox + 48, oy + 57, 50, 47, "#ff4148");
            rect(ox + 56, oy + 57, 34, 14, "#f6c3a6");
            rect(ox + 58, oy + 39, 32, 18, skin);
          } else {
            rect(ox + 45, oy + 57, 10, 43, "#ff4148");
            rect(ox + 80, oy + 64, 10, 35, "#8a0c12");
            rect(ox + 57, oy + 39, 34, 18, skin);
          }
          rect(ox + 52, oy + 10, 44, 32, skin);
          if (isFemale) {
            rect(ox + 48, oy + 5, 52, 16, "#282228");
            rect(ox + 46, oy + 12, 8, 34, "#282228");
            rect(ox + 94, oy + 12, 8, 34, "#282228");
          } else {
            rect(ox + 52, oy + 7, 44, 10, "#222228");
            rect(ox + 47, oy + 15, 9, 17, "#222228");
            rect(ox + 91, oy + 15, 8, 13, "#222228");
          }
          rect(ox + 62, oy + 23, 6, 4, "#08080a");
          rect(ox + 81, oy + 23, 6, 4, "#08080a");
          rect(ox + 68, oy + 34, 17, 4, "#8b5140");
        }
        function barbell(ox, by) {
          rect(ox - 44, by, 220, 7, C.metal);
          rect(ox - 54, by - 14, 15, 34, C.white);
          rect(ox - 68, by - 22, 13, 50, "#777982");
          rect(ox - 82, by - 14, 13, 34, C.red);
          rect(ox + 176, by - 14, 15, 34, C.white);
          rect(ox + 191, by - 22, 13, 50, "#777982");
          rect(ox + 204, by - 14, 13, 34, C.red);
        }
        // Brazos del press y del curl: del hombro a las manos ancladas a la barra.
        function lifterArms(ox, oy, handY) {
          rect(ox + 23, oy + 56, 15, 13, C.shirt);
          rect(ox + 105, oy + 56, 15, 13, C.shirt);
          ctx.strokeStyle = C.skin;
          ctx.lineWidth = 13;
          ctx.lineCap = "square";
          ctx.beginPath();
          ctx.moveTo(ox + 30, oy + 66);
          ctx.lineTo(ox + 35, handY);
          ctx.moveTo(ox + 112, oy + 66);
          ctx.lineTo(ox + 109, handY);
          ctx.stroke();
          rect(ox + 28, handY - 3, 14, 8, C.skin);
          rect(ox + 103, handY - 3, 14, 8, C.skin);
        }
        // Curl de pie. La altura de la barra viene de curlLift, que se interpola en frame().
        function drawLift() {
          var ox = 240,
            oy = 120,
            by = oy + 96 - Math.round(curlLift * 50);
          body(ox, oy);
          barbell(ox, by);
          lifterArms(ox, oy, by + 3);
        }
        // Press de banca visto de costado: acostado en el banco, la barra (vista de frente: el disco) baja al
        // pecho y sube al acertar. Antes se dibujaba de pie, idéntico al curl.
        function drawBench() {
          var isFemale = female(),
            hair = isFemale ? "#282228" : "#222228",
            ext = Math.max(0, Math.min(1, (86 - liftY) / 80)),
            by = Math.round(206 - ext * 56),
            sx = 278,
            sy = 224;
          // Banco y soportes
          rect(196, 240, 230, 12, "#2b2b31");
          rect(196, 240, 230, 3, "#4a4a52");
          rect(212, 252, 10, 38, "#34343b");
          rect(400, 252, 10, 38, "#34343b");
          // Piernas: muslo sobre el banco y pierna apoyada en el piso
          rect(338, 218, 62, 22, C.pants);
          rect(392, 230, 20, 56, C.pants);
          rect(388, 282, 34, 8, C.white);
          // Torso y cabeza
          rect(240, 212, 100, 28, C.shirt);
          rect(250, 216, 70, 6, isFemale ? "#ff4148" : "#8a0c12");
          rect(206, 210, 34, 30, C.skin);
          rect(202, 208, 14, 28, hair);
          if (isFemale) rect(196, 214, 10, 30, hair);
          rect(226, 216, 4, 4, C.bg);
          rect(232, 230, 8, 3, "#8b5140");
          // Brazos: hombro → codo (flexionado hacia los pies con la barra abajo, recto arriba) → manos en la barra
          var ex2 = sx + 16 * (1 - ext),
            ey = 228 - 41 * ext;
          ctx.strokeStyle = C.skin;
          ctx.lineWidth = 12;
          ctx.lineCap = "square";
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(ex2, ey);
          ctx.lineTo(sx, by + 4);
          ctx.stroke();
          rect(sx - 10, sy - 8, 20, 14, C.shirt);
          // Barra vista de frente: disco y punta del eje
          rect(sx - 14, by - 26, 28, 52, "#777982");
          rect(sx - 9, by - 20, 18, 40, C.red);
          rect(sx - 4, by - 4, 8, 8, C.metal);
        }
        // Dominadas: el personaje cuelga de una barra fija (sin discos) y sube/baja con la fase del ejercicio.
        function drawPull() {
          var ox = 240,
            barY = 138,
            bodyY = barY - 1 + Math.round(pullY),
            shoulderY = bodyY + 58;
          rect(ox - 20, barY - 4, 8, 154, "#34343b");
          rect(ox + 162, barY - 4, 8, 154, "#34343b");
          rect(ox - 20, barY - 4, 190, 8, "#777982");
          body(ox, bodyY);
          rect(ox + 18, barY, 15, shoulderY - barY + 6, C.skin);
          rect(ox + 112, barY, 15, shoulderY - barY + 6, C.skin);
          rect(ox + 16, bodyY + 51, 19, 17, C.shirt);
          rect(ox + 111, bodyY + 51, 19, 17, C.shirt);
          rect(ox + 15, barY - 5, 20, 10, C.white);
          rect(ox + 110, barY - 5, 20, 10, C.white);
        }
        function guy() {
          if (exercise === 3) drawBike();
          else if (exercise === 1) drawPull();
          else if (exercise === 0) drawBench();
          else drawLift();
        }
        // Barra de precisión común: segmentos [desde, hasta, color] en fracciones 0..1, marcador y etiquetas.
        function track(segments, pos, labels) {
          var x = 110,
            y = 82,
            w = 420,
            h = 24,
            inner = w - 8,
            cx = x + 4;
          rect(x, y, w, h, "#29292f");
          rect(cx, y + 4, inner, h - 8, "#09090b");
          segments.forEach(function (sg) {
            rect(cx + inner * sg[0], y + 4, inner * (sg[1] - sg[0]), h - 8, sg[2]);
          });
          var px = cx + inner * Math.max(0, Math.min(1, pos));
          rect(px - 3, y - 5, 6, h + 10, C.white);
          rect(px - 1, y - 3, 2, h + 6, C.red);
          labels.forEach(function (lb) {
            txt(lb[0], cx + inner * lb[1], y + 37, 10, lb[2]);
          });
        }
        // Segmentos de una ventana de tiempo [bloqueado | PERFECT | GOOD | FLOJO] (dominadas y bicicleta).
        function timeSegments(r) {
          return [
            [0, r.min / r.span, ZC.blocked],
            [r.min / r.span, r.perfect / r.span, ZC.perfect],
            [r.perfect / r.span, r.good / r.span, ZC.good],
            [r.good / r.span, 1, ZC.flojo],
          ];
        }
        function timeLabels(r) {
          return [
            ["ESPERÁ", r.min / 2 / r.span, C.muted],
            ["PERFECT", (r.min + r.perfect) / 2 / r.span, C.green],
            ["GOOD", (r.perfect + r.good) / 2 / r.span, C.yellow],
            ["FLOJO", (r.good + r.span) / 2 / r.span, C.muted],
          ];
        }
        function meter(now) {
          txt(ex[exercise].name, 320, 68, 14, C.muted);
          if (exercise === 0) {
            var z = 0.06 * Math.max(0.55, 1 - reps * 0.006) * weight().zone;
            track(
              [
                [0, 0.5 - z * 2.7, ZC.flojo],
                [0.5 - z * 2.7, 0.5 - z, ZC.good],
                [0.5 - z, 0.5 + z, ZC.perfect],
                [0.5 + z, 0.5 + z * 2.7, ZC.good],
                [0.5 + z * 2.7, 1, ZC.flojo],
              ],
              bar,
              [
                ["FLOJO", 0.05, C.muted],
                ["PERFECT", 0.5, C.green],
                ["FLOJO", 0.95, C.muted],
              ],
            );
          } else if (exercise === 1) {
            track(timeSegments(PULL), pullPhase === "up" ? (now - lastPull) / PULL.span : 0, timeLabels(PULL));
          } else if (exercise === 2) {
            var w = curlWindows(),
              c = CURL.center / CURL.max,
              p = w.perfect / CURL.max,
              g = Math.min(w.good / CURL.max, 1 - c);
            track(
              [
                [0, c - g, ZC.flojo],
                [c - g, c - p, ZC.good],
                [c - p, c + p, ZC.perfect],
                [c + p, c + g, ZC.good],
                [c + g, 1, ZC.flojo],
              ],
              holdActive ? (now - holdStart) / CURL.max : 0,
              [
                ["FLOJO", (c - g) / 2, C.muted],
                ["PERFECT", c, C.green],
                ["FLOJO", (1 + c + g) / 2, C.muted],
              ],
            );
          } else {
            track(
              timeSegments(BIKE),
              nextBikeSide === "right" ? (now - lastBikePair) / BIKE.span : 0,
              timeLabels(BIKE),
            );
            // Al costado izquierdo de la bici, donde no tapa al ciclista.
            txt("AHORA", 130, 196, 11, C.muted);
            txt(nextBikeSide === "left" ? "◀ IZQUIERDA" : "DERECHA ▶", 130, 220, 13, C.white);
          }
        }
        // Bicicleta estática: base en el piso, volante de inercia adelante y bielas que siguen la fase del pedal.
        function drawBike() {
          ctx.lineCap = "square";
          // Base y patas
          rect(214, 282, 230, 8, "#34343b");
          rect(204, 278, 36, 12, "#4a4a52");
          rect(418, 278, 36, 12, "#4a4a52");
          // Volante de inercia con carcasa
          var fx = 404,
            fy = 248;
          ctx.fillStyle = "#1b1b20";
          ctx.beginPath();
          ctx.arc(fx, fy, 30, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#777982";
          ctx.lineWidth = 5;
          ctx.stroke();
          ctx.strokeStyle = "#4a4a52";
          ctx.lineWidth = 3;
          for (var i = 0; i < 6; i++) {
            var a = (i * Math.PI) / 3 + bikePedalPhase * 1.6;
            ctx.beginPath();
            ctx.moveTo(fx, fy);
            ctx.lineTo(fx + Math.cos(a) * 26, fy + Math.sin(a) * 26);
            ctx.stroke();
          }
          rect(fx - 4, fy - 4, 8, 8, C.metal);
          // Ciclista de perfil mirando al manubrio. El lado lejano (brazo, pierna, biela) se dibuja ANTES que el
          // cuadro y más oscuro, así queda tapado por la bici; el lado cercano va encima de todo. Las rodillas se
          // calculan con cinemática inversa de dos segmentos (muslo + pierna) a partir de la posición del pedal.
          var t = bikePedalPhase,
            cx = 322,
            cy = 252,
            cr = 18,
            hip = { x: 298, y: 196 },
            sh = { x: 336, y: 158 },
            grip = { x: 388, y: 214 },
            near = { x: cx + Math.cos(t) * cr, y: cy + Math.sin(t) * cr },
            far = { x: cx + Math.cos(t + Math.PI) * cr, y: cy + Math.sin(t + Math.PI) * cr },
            isFemale = female(),
            hair = "#282228",
            DARK = { pants: "#2a2a31", skin: "#8f6249", shirt: "#8a0c12", shoe: "#6d6d76", crank: "#8a6d0c" },
            NEAR_PANTS = "#5b5b67";
          function knee(p) {
            var L1 = 42,
              L2 = 40,
              dx = p.x - hip.x,
              dy = p.y - hip.y,
              d = Math.min(L1 + L2 - 1, Math.max(1, Math.hypot(dx, dy))),
              ang = Math.atan2(dy, dx),
              bend = Math.acos((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d));
            return { x: hip.x + Math.cos(ang - bend) * L1, y: hip.y + Math.sin(ang - bend) * L1 };
          }
          function seg(pts, width, color) {
            ctx.strokeStyle = color;
            ctx.lineWidth = width;
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (var k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
            ctx.stroke();
          }
          function leg(p, pants, shoe) {
            var k = knee(p);
            seg([hip, k], 13, pants);
            seg([k, { x: p.x, y: p.y - 4 }], 11, pants);
            rect(p.x - 8, p.y - 8, 19, 7, shoe);
          }
          function crank(p, color) {
            seg([{ x: cx, y: cy }, p], 5, color);
            rect(p.x - 6, p.y - 2, 12, 5, C.metal);
          }
          function arm(offset, skin, shirt) {
            var elbow = { x: 362 + offset, y: 188 };
            seg([{ x: sh.x + offset, y: sh.y + 4 }, elbow], 10, shirt);
            seg([elbow, { x: grip.x + offset, y: grip.y }], 9, skin);
          }
          // 1. Lado lejano, detrás del cuadro
          arm(-6, DARK.skin, DARK.shirt);
          crank(far, DARK.crank);
          leg(far, DARK.pants, DARK.shoe);
          // 2. Cuadro gris: en rojo se fundía con la remera del ciclista
          ctx.strokeStyle = "#6b6d75";
          ctx.lineWidth = 9;
          ctx.beginPath();
          ctx.moveTo(300, 204);
          ctx.lineTo(cx, cy);
          ctx.lineTo(300, 282);
          ctx.moveTo(cx, cy);
          ctx.lineTo(fx, fy);
          ctx.moveTo(382, 219);
          ctx.lineTo(fx, fy);
          ctx.lineTo(430, 282);
          ctx.stroke();
          rect(278, 198, 34, 7, C.metal);
          rect(370, 212, 30, 7, C.metal);
          rect(cx - 6, cy - 6, 12, 12, "#4a4a52");
          // 3. Torso inclinado hacia el manubrio y cabeza de perfil
          seg([hip, sh], 24, C.shirt);
          seg([{ x: hip.x + 4, y: hip.y - 6 }, { x: sh.x - 4, y: sh.y + 8 }], 5, "#ff4148");
          rect(sh.x + 1, sh.y - 10, 12, 8, C.skin);
          rect(sh.x - 6, sh.y - 34, 26, 26, C.skin);
          rect(sh.x - 8, sh.y - 37, 28, 8, hair);
          rect(sh.x - 8, sh.y - 32, 8, 13, hair);
          if (isFemale) rect(sh.x - 17, sh.y - 32, 10, 22, hair);
          rect(sh.x + 12, sh.y - 26, 4, 4, C.bg);
          rect(sh.x + 15, sh.y - 16, 5, 3, "#8b5140");
          // 4. Lado cercano, delante de todo
          crank(near, C.yellow);
          leg(near, NEAR_PANTS, C.white);
          arm(0, C.skin, C.shirt);
        }
        function draw(now) {
          offX = 0;
          offY = 0;
          if (shake > 0) {
            offX = (Math.random() - 0.5) * shake * S;
            offY = (Math.random() - 0.5) * shake * S;
            shake *= 0.83;
            if (shake < 0.3) shake = 0;
          }
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.setTransform(S, 0, 0, S, offX, offY);
          background();
          meter(now);
          guy();
          // Puntos, repeticiones y combo ya están en el HUD de abajo: no se repiten sobre el personaje.
          // El resultado de cada repetición se muestra en el piso, sin tapar al personaje ni la bicicleta.
          if (flashUntil > now) {
            rect(175, 298, 290, 28, "#050506");
            txt(
              flash,
              320,
              318,
              16,
              flash.indexOf("PERFECT") === 0 ? C.green : flash.indexOf("GOOD") === 0 ? C.yellow : C.white,
            );
          }
          particles.forEach(function (p) {
            txt(p.text, p.x, p.y, 12, p.color);
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.05;
            p.life--;
          });
          particles = particles.filter(function (p) {
            return p.life > 0;
          });
          // La transición oscurece toda la escena: antes el cartel quedaba montado sobre el medidor del
          // ejercicio anterior y se veían restos por detrás.
          if (state === "transition") {
            ctx.fillStyle = "rgba(5,5,6,0.82)";
            ctx.fillRect(0, 0, W, H);
            rect(110, 110, 420, 130, "#0b0b0e");
            rect(110, 110, 420, 4, C.red);
            rect(110, 236, 420, 4, C.red);
            txt("CAMBIO DE EJERCICIO", 320, 148, 17, C.white);
            txt("SIGUE: " + ex[circuitOrder[Math.min(circuitPos + 1, circuitOrder.length - 1)]].name, 320, 180, 15, C.red);
            txt(Math.max(0, (transitionEnd - now) / 1000).toFixed(1) + " s", 320, 212, 13, C.muted);
          }
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          offX = 0;
          offY = 0;
        }
        function frame(now) {
          if (destroyed) return;
          var dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000 || 0));
          lastFrame = now;
          bikePedalPhase += bikePedalVel * dt;
          bikePedalVel *= Math.exp(-3.5 * dt);
          if (bikePedalVel < 0.03) bikePedalVel = 0;
          // Animaciones suavizadas: la barra del press, el cuerpo en las dominadas y la barra del curl
          // se interpolan hacia su posición objetivo en lugar de saltar.
          liftY += ((flashUntil > now && exercise === 0 ? 6 : 86) - liftY) * Math.min(1, dt * 14);
          pullY += ((pullPhase === "up" ? -16 : 0) - pullY) * Math.min(1, dt * 9);
          if (holdActive) curlLift = Math.min(1, (now - holdStart) / CURL.center);
          else curlLift += (0 - curlLift) * Math.min(1, dt * 8);
          if (state === "running") {
            if (!zen) timeLeft = Math.max(0, (phaseEnd - now) / 1000);
            else timeLeft = 0;
            // El indicador que barre la zona de precisión solo existe en el press de banca.
            if (exercise === 0) {
              bar += dir * dt * 0.75 * weight().speed * (1 + reps * 0.025);
              if (bar > 0.98) {
                bar = 0.98;
                dir = -1;
              }
              if (bar < 0.02) {
                bar = 0.02;
                dir = 1;
                benchSweep++;
              }
            }
            if (exercise === 2 && holdActive && now - holdStart > CURL.max) {
              holdActive = false;
              holdBy = "";
              $("actionBtn").textContent = "▲ CURL";
              $("keyhint").textContent = hintText();
              award("FLOJO");
              notice("Lo mantuviste demasiado: el curl se soltó solo.");
            }
            // Dominada colgada arriba sin bajar: se cuenta como FLOJO en lugar de quedar trabada para siempre.
            if (exercise === 1 && pullPhase === "up" && now - lastPull > PULL.span) {
              pullPhase = "";
              lastTap = now;
              lastPull = now;
              $("keyhint").textContent = hintText();
              award("FLOJO");
              notice("Tardaste demasiado en bajar.");
            }
            if (!zen && timeLeft <= 0) {
              visited[ex[exercise].id] = true;
              if (!singleExercise && circuitPos < circuitOrder.length - 1) transition(now);
              else finish();
            }
          } else if (state === "transition") {
            timeLeft = Math.max(0, (transitionEnd - now) / 1000);
            if (now >= transitionEnd) nextExercise(now);
          }
          updateHud();
          draw(now);
          if (!destroyed) raf = requestAnimationFrame(frame);
        }
        $("startBtn").addEventListener("click", startRun, { signal: ac.signal });
        $("nextZen").addEventListener("click", function () {
          if (state === "running" && zen && !singleExercise) nextExercise(performance.now());
        }, { signal: ac.signal });
        $("endZen").addEventListener("click", function () {
          if (state === "running" && zen) finish();
        }, { signal: ac.signal });
        // En el curl el botón se mantiene: pointerdown empieza y pointerup suelta. El click que llega después
        // se ignora; un click de teclado (detail 0) usa el modo de dos pulsaciones.
        $("actionBtn").addEventListener("pointerdown", function (e) {
          if (state === "running" && exercise === 2 && !holdActive) {
            holdBy = "pointer";
            act(performance.now());
          }
        }, { signal: ac.signal });
        $("actionBtn").addEventListener("click", function (e) {
          if (exercise === 2 && e.detail > 0) return;
          act(performance.now());
        }, { signal: ac.signal });
        ["pointerup", "pointercancel"].forEach(function (type) {
          document.addEventListener(type, function () {
            if (holdBy === "pointer") curlRelease(performance.now());
          }, { signal: ac.signal });
        });
        document.addEventListener("keyup", function (e) {
          if (holdBy === "key" && ["Space", "ArrowUp", "Enter"].indexOf(e.code) >= 0) curlRelease(performance.now());
        }, { signal: ac.signal });
        window.addEventListener("blur", function () {
          if (holdBy === "key" || holdBy === "pointer") curlRelease(performance.now());
        }, { signal: ac.signal });
        $("bikeL").addEventListener("click", function () {
          act(performance.now(), "left");
        }, { signal: ac.signal });
        $("bikeR").addEventListener("click", function () {
          act(performance.now(), "right");
        }, { signal: ac.signal });
        $("soundBtn").addEventListener("click", function () {
          sound = !sound;
          $("soundBtn").textContent = "SONIDO: " + (sound ? "ON" : "OFF");
          $("soundBtn").setAttribute("aria-pressed", String(sound));
          if (sound) {
            beep(660, 0.06);
            notice("Audio activado.");
          }
        }, { signal: ac.signal });
        $("playMode").addEventListener("change", previewSettings, { signal: ac.signal });
        $("zen").addEventListener("change", previewSettings, { signal: ac.signal });
        $("weight").addEventListener("change", function () {
          notice("Peso " + weight().label + ": puntos ×" + weight().mult + ".");
        }, { signal: ac.signal });
        canvas.addEventListener("pointerdown", function (e) {
          if (state === "running") {
            if (exercise === 3) {
              // En la bici, la mitad izquierda del canvas es el pedal izquierdo y la derecha, el derecho.
              var r = canvas.getBoundingClientRect();
              act(performance.now(), e.clientX - r.left < r.width / 2 ? "left" : "right");
            } else {
              if (exercise === 2 && !holdActive) holdBy = "pointer";
              act(performance.now());
            }
          } else if (state === "ready" || state === "over") startRun();
        }, { signal: ac.signal });
        var pointerFocus = false;
        document.addEventListener(
          "pointerdown",
          function () {
            pointerFocus = true;
          },
          { capture: true, signal: ac.signal },
        );
        document.addEventListener("keydown", function (e) {
          var t = e.target;
          if (e.code === "Tab") {
            pointerFocus = false;
            return;
          }
          if (e.repeat || (t.closest && t.closest("input,select,textarea,a"))) return;
          // Un botón que quedó con foco tras un click de mouse o toque no debe tragarse el teclado de juego
          // (antes Espacio volvía a activar, por ejemplo, SONIDO). Si el foco llegó con Tab se respeta la
          // activación nativa del botón. (:focus-visible no sirve acá: ya vale durante el propio keydown.)
          if (t.closest && t.closest("button")) {
            if (!pointerFocus) return;
            t.blur();
          }
          if (
            exercise === 3 &&
            (e.code === "ArrowLeft" || e.code === "KeyA" || e.code === "ArrowRight" || e.code === "KeyD")
          ) {
            e.preventDefault();
            act(performance.now(), e.code === "ArrowLeft" || e.code === "KeyA" ? "left" : "right");
            return;
          }
          if (["Space", "ArrowUp", "Enter"].indexOf(e.code) >= 0) {
            e.preventDefault();
            if (state === "running" && exercise === 2 && !holdActive) holdBy = "key";
            act(performance.now());
          }
        }, { signal: ac.signal });
        if (window.ResizeObserver) { resizeObserver = new ResizeObserver(fitCanvas); resizeObserver.observe(canvas); }
        window.addEventListener("resize", fitCanvas, { signal: ac.signal });
        renderCircuit();
        updateHud();
        updateMissions();
        draw(0);
        lastFrame = performance.now();
        raf = requestAnimationFrame(frame);
        return { destroy: function () { destroyed = true; cancelAnimationFrame(raf); ac.abort(); if (resizeObserver) resizeObserver.disconnect(); if (audio) audio.close(); root.innerHTML = ""; } };
  }

  window.IkigaiIronPixel = { mount };
})();
