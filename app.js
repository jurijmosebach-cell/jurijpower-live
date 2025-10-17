// =============================
// ⚽ JurijPower Pro - Live App
// =============================

const API_KEY = "c6ad1210c71b17cca24284ab8a9873b4";
const BASE_URL = "https://v3.football.api-sports.io";

const liveContainer = document.getElementById("live-matches");
const upcomingContainer = document.getElementById("upcoming-matches");
const lastUpdate = document.getElementById("lastUpdate");
const refreshButton = document.getElementById("refreshButton");

// =============================
// 📡 Live Spiele abrufen
// =============================
async function fetchLiveMatches() {
  const headers = { "x-apisports-key": API_KEY };
  const url = `${BASE_URL}/fixtures?live=all`;
  const res = await fetch(url, { headers });
  const data = await res.json();
  return data.response;
}

// =============================
// 📅 Kommende Spiele (24h)
// =============================
async function fetchUpcomingMatches() {
  const headers = { "x-apisports-key": API_KEY };
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const from = today.toISOString().split("T")[0];
  const to = tomorrow.toISOString().split("T")[0];

  const url = `${BASE_URL}/fixtures?from=${from}&to=${to}`;
  const res = await fetch(url, { headers });
  const data = await res.json();
  return data.response;
}

// =============================
// 🖼️ Spielkarten rendern
// =============================
function renderMatches(matches, container) {
  container.innerHTML = "";

  if (matches.length === 0) {
    container.innerHTML = `<p style="opacity:0.7;">Keine Spiele gefunden</p>`;
    return;
  }

  matches.forEach(match => {
    const home = match.teams.home.name;
    const away = match.teams.away.name;
    const league = match.league.name;
    const goalsHome = match.goals.home ?? 0;
    const goalsAway = match.goals.away ?? 0;
    const status = match.fixture.status.short;
    const time = new Date(match.fixture.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const card = document.createElement("div");
    card.className = "match-card";
    card.innerHTML = `
      <h3>${home} vs ${away}</h3>
      <p>🏆 ${league} | 🕒 ${status} | ${goalsHome} : ${goalsAway} (${time})</p>
      <div>
        💶 Einsatz: <input type="number" class="einsatz" placeholder="€" />
        📈 Quote: <input type="number" class="quote" placeholder="z.B. 2.50" step="0.01" />
        🪙 Gewinn: <span class="gewinn">0 €</span>
      </div>
    `;
    container.appendChild(card);

    // Gewinnrechner
    const einsatz = card.querySelector(".einsatz");
    const quote = card.querySelector(".quote");
    const gewinn = card.querySelector(".gewinn");

    const calc = () => {
      const e = parseFloat(einsatz.value) || 0;
      const q = parseFloat(quote.value) || 0;
      gewinn.textContent = (e * q).toFixed(2) + " €";
    };

    einsatz.addEventListener("input", calc);
    quote.addEventListener("input", calc);
  });
}

// =============================
// 🔄 Daten aktualisieren
// =============================
async function updateData() {
  try {
    const [liveMatches, upcomingMatches] = await Promise.all([
      fetchLiveMatches(),
      fetchUpcomingMatches()
    ]);

    renderMatches(liveMatches, liveContainer);
    renderMatches(upcomingMatches, upcomingContainer);
    lastUpdate.textContent = new Date().toLocaleTimeString();
  } catch (err) {
    console.error("API Fehler:", err);
    lastUpdate.textContent = "Fehler bei der API";
  }
}

// =============================
// 🛎️ Push Notifications
// =============================
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js").catch(err =>
    console.error("Service Worker Fehler:", err)
  );
}

if (Notification.permission !== "granted") {
  Notification.requestPermission();
}

function sendGoalNotification(home, away, score) {
  if (Notification.permission === "granted" && navigator.serviceWorker) {
    navigator.serviceWorker.getRegistration().then(reg => {
      if (reg) {
        reg.showNotification("⚽ TOR!", {
          body: `${home} vs ${away}\nSpielstand: ${score}`,
          icon: "https://cdn-icons-png.flaticon.com/512/51/51767.png"
        });
      }
    });
  }
}

// =============================
// 🧭 Events & Intervalle
// =============================
refreshButton.addEventListener("click", updateData);
updateData();
setInterval(updateData, 60 * 1000);
