(() => {
  "use strict";

  const api = window.IkigaiApi;
  const $ = selector => document.querySelector(selector);
  const requestForm = $("#requestForm");
  const confirmForm = $("#confirmForm");
  const notice = $("#resetNotice");
  let resetToken = new URLSearchParams(window.location.hash.slice(1)).get("token") || "";

  // The token is delivered in the URL fragment, which browsers do not send to
  // the web server. Remove it from the address bar immediately after reading.
  if (resetToken) {
    confirmForm.hidden = false;
    requestForm.hidden = true;
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }

  function showNotice(message, success = false) {
    notice.textContent = message;
    notice.className = success ? "notice success" : "notice";
    notice.hidden = false;
  }

  requestForm.addEventListener("submit", async event => {
    event.preventDefault();
    const button = requestForm.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      await api.request("/auth/password-reset/request", {
        method: "POST",
        body: { email: $("#resetEmail").value.trim() },
        skipCsrf: true
      });
      showNotice("Si existe una cuenta habilitada con ese correo, recibirás instrucciones para continuar.", true);
      requestForm.reset();
    } catch (error) {
      showNotice(error?.status === 429
        ? "Se realizaron demasiados intentos. Esperá antes de volver a solicitar instrucciones."
        : error?.message || "No se pudo completar la solicitud. Intentá nuevamente.");
    } finally {
      button.disabled = false;
    }
  });

  confirmForm.addEventListener("submit", async event => {
    event.preventDefault();
    const password = $("#newPassword").value;
    const confirmation = $("#confirmPassword").value;
    if (password !== confirmation) {
      showNotice("Las contraseñas no coinciden.");
      return;
    }
    const button = confirmForm.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      await api.request("/auth/password-reset/complete", {
        method: "POST",
        body: { token: resetToken, password },
        skipCsrf: true
      });
      resetToken = "";
      confirmForm.reset();
      confirmForm.hidden = true;
      showNotice("La contraseña se cambió correctamente. Ya podés iniciar sesión.", true);
    } catch (error) {
      showNotice(error?.status === 429
        ? "Se realizaron demasiados intentos. Esperá antes de volver a intentarlo."
        : error?.message || "El enlace no es válido o venció. Solicitá uno nuevo.");
    } finally {
      button.disabled = false;
    }
  });
})();
