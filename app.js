// Ninja Mode 🥷
// Login überspringen und direkt App laden
window.addEventListener("DOMContentLoaded", () => {
  const login = document.getElementById("loginSection");
  const app = document.getElementById("appSection");
  if (login && app) {
    login.style.display = "none";
    app.classList.remove("hidden");
  }
});
