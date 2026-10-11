(() => {
  "use strict";

  const api = window.IkigaiApi;
  const $ = selector => document.querySelector(selector);
  const form = $("#acceptForm");
  const missing = $("#missingToken");
  const notice = $("#inviteNotice");
  let invitationToken = new URLSearchParams(window.location.hash.slice(1)).get("token") || "";

  // El token viaja en el fragmento de la URL, que el navegador no envia al servidor web.
  // Se quita de la barra de direcciones apenas se lee.
  if (invitationToken) {
    form.hidden = false;
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  } else {
    missing.hidden = false;
  }

  function showNotice(message, success = false) {
    notice.textContent = message;
    notice.className = success ? "notice success" : "notice";
    notice.hidden = false;
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const password = $("#newPassword").value;
    if (password !== $("#confirmPassword").value) {
      showNotice("Las contraseñas no coinciden.");
      return;
    }
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      await api.acceptInvitation(invitationToken, password);
      invitationToken = "";
      form.reset();
      form.hidden = true;
      showNotice("Tu cuenta quedó activada. Ya podés iniciar sesión con tu correo y tu contraseña.", true);
    } catch (error) {
      showNotice(error?.status === 429
        ? "Se realizaron demasiados intentos. Esperá un minuto antes de volver a intentarlo."
        : error?.status === 400
          ? "La invitación no es válida, venció o ya se usó. Pedí otra a administración."
          : error?.message || "No se pudo activar la cuenta. Intentá nuevamente.");
    } finally {
      button.disabled = false;
    }
  });
})();
