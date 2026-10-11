/* Guia de primer uso: globos de texto que recorren la aplicacion paso a paso.
 * Sin dependencias ni estilos en linea (la CSP del portal solo admite recursos propios). */
(() => {
  "use strict";
  let bubble = null;
  let highlighted = null;
  let session = 0;

  function clear() {
    if (highlighted) highlighted.classList.remove("tour-highlight");
    highlighted = null;
    if (bubble) bubble.remove();
    bubble = null;
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", reposition);
  }

  let current = null;
  function onKey(event) { if (event.key === "Escape" && current) { event.stopPropagation(); finish(false); } }
  function reposition() { if (bubble && highlighted) place(); }

  function place() {
    // En pantallas chicas el globo va fijo abajo (CSS); en las grandes se ubica junto al elemento.
    if (window.matchMedia("(max-width: 720px)").matches) { bubble.style.top = ""; bubble.style.left = ""; return; }
    const rect = highlighted.getBoundingClientRect();
    const width = bubble.offsetWidth, height = bubble.offsetHeight;
    const below = rect.bottom + 12 + height <= window.innerHeight;
    const right = rect.right + 12 + width <= window.innerWidth;
    let top = below ? rect.bottom + 12 : Math.max(8, rect.top - height - 12);
    let left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
    if (!below && rect.height > window.innerHeight / 2 && right) { top = Math.max(8, rect.top); left = rect.right + 12; }
    bubble.style.top = `${top}px`;
    bubble.style.left = `${left}px`;
  }

  async function waitFor(selector, ms = 3000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const node = document.querySelector(selector);
      if (node && node.getClientRects().length) return node;
      await new Promise(resolve => setTimeout(resolve, 80));
    }
    return null;
  }

  function finish(completed) {
    const options = current && current.options;
    current = null;
    session += 1;
    clear();
    if (options && options.onClose) options.onClose(completed);
  }

  async function show(index) {
    if (!current) return;
    const mine = ++session;
    const { steps, options } = current;
    const step = steps[index];
    current.index = index;
    await options.navigate(step.view);
    const target = await waitFor(step.target);
    if (mine !== session || !current) return;
    clear();
    current && document.addEventListener("keydown", onKey, true);
    highlighted = target;
    const last = index === steps.length - 1;
    bubble = document.createElement("div");
    bubble.className = "tour-bubble";
    bubble.setAttribute("role", "dialog");
    bubble.setAttribute("aria-live", "polite");
    bubble.setAttribute("aria-label", "Guía de primer uso");
    const counter = document.createElement("p");
    counter.className = "tour-count";
    counter.textContent = `Paso ${index + 1} de ${steps.length}`;
    const title = document.createElement("h3");
    title.textContent = step.title;
    const text = document.createElement("p");
    text.textContent = step.text;
    const actions = document.createElement("div");
    actions.className = "tour-actions";
    const button = (label, className, handler) => {
      const node = document.createElement("button");
      node.type = "button";
      node.className = `button small ${className}`;
      node.textContent = label;
      node.addEventListener("click", handler);
      return node;
    };
    actions.append(button(last ? "" : "Saltar guía", "ghost", () => finish(false)));
    if (last) actions.firstChild.remove();
    if (index > 0) actions.append(button("Anterior", "ghost", () => show(index - 1)));
    const next = button(last ? "Terminar" : "Siguiente", "primary", () => (last ? finish(true) : show(index + 1)));
    actions.append(next);
    bubble.append(counter, title, text, actions);
    document.body.append(bubble);
    if (target) {
      target.classList.add("tour-highlight");
      target.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    window.addEventListener("resize", reposition);
    // Sin elemento que senalar (la pantalla cambio), el globo se centra en vez de quedar fuera de lugar.
    if (!target) bubble.classList.add("tour-centered");
    else setTimeout(() => { if (bubble && mine === session) place(); }, 350);
    next.focus({ preventScroll: true });
  }

  window.IkigaiTour = {
    start(steps, options) {
      if (current) finish(false);
      current = { steps, options, index: 0 };
      show(0);
    },
    stop() { if (current) { current = null; session += 1; } clear(); }
  };
})();
