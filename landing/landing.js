// Datos de la descarga: los escribe scripts/build-apk (landing/app.json). Sin ese archivo o sin APK publicada,
// la página muestra "muy pronto" y no ofrece un enlace roto.
(async () => {
  "use strict";
  const $ = id => document.getElementById(id);
  let config = null;
  try {
    const respuesta = await fetch("./app.json", { cache: "no-cache" });
    if (respuesta.ok) config = await respuesta.json();
  } catch (error) {
    console.warn("app.json no disponible:", error);
  }

  const entrar = $("entrar");
  const notaPortal = $("portalNote");
  const portalUrl = (config && typeof config.portalUrl === "string" && /^https:\/\//.test(config.portalUrl))
    ? config.portalUrl
    : (config && /^https:\/\//.test(config.appUrl || "") ? config.appUrl.replace(/\/+$/, "") + "/portal.html" : "");
  if (portalUrl) {
    entrar.href = portalUrl;
    entrar.hidden = false;
    notaPortal.hidden = false;
  }

  const apk = config && config.apk;
  if (!apk || !/^[\w.\-/]+\.apk$/.test(apk.file || "")) {
    $("apkSoon").hidden = false;
    return;
  }

  const boton = $("apkButton");
  boton.href = apk.file;
  boton.setAttribute("download", "");
  boton.removeAttribute("aria-disabled");
  $("apkLabel").textContent = `Descargar APK · versión ${apk.version}`;

  const partes = [`Versión ${apk.version}`];
  if (apk.sizeMB) partes.push(`${apk.sizeMB} MB`);
  if (apk.date) partes.push(`publicada el ${apk.date}`);
  partes.push("Android 7 o superior");
  const meta = $("apkMeta");
  meta.textContent = partes.join(" · ");
  meta.hidden = false;

  if (/^[0-9a-f]{64}$/i.test(apk.sha256 || "")) {
    $("apkSha").textContent = apk.sha256.toLowerCase();
    $("apkHash").hidden = false;
  }
})();
