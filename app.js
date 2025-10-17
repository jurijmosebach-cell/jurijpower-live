const API_KEY = "DEIN_API_KEY_HIER"; // hier deinen API-Football Key einsetzen
const BASE_URL = "https://v3.football.api-sports.io";

const liveContainer = document.getElementById("live-matches");
const upcomingContainer = document.getElementById("upcoming-matches");
const lastUpdate = document.getElementById("lastUpdate");

async function fetchMatches(status) {
  const headers = { "x-apisports-key": API_KEY };
  const url = `${BASE_URL}/fixtures?live=all`;
  const res = await fetch(url, { headers });
  const data = await res.json();
  return data.response;
}

async function fetchUpcoming() {
  const headers = { "x-apisports-key": API_KEY };
  const now = new Date().toISOString().split("T")[0];
  const url = `${BASE_URL}/fixtures?date=${now}`;
  const res = await fetch(url, { headers });
  const data = await res.json();
  return data.response;
}

function renderMatches(matches, container) {
  container.innerHTML = "";
  matches.forEach(match => {
    const home = match.teams.home.name;
    const away = match.teams.away.name;
    const league = match.league.name;
    const goalsHome = match.goals.home ?? 0;
    const goalsAway = match.goals.away ?? 0;
    const status = match.fixture.status.short;

    const card = document.createElement("div");
    card.className = "match-card";
    card.innerHTML = `
      <h3>${home} vs ${away}</h3>
      <p>🏆 ${league} | 🕒 ${status} | ${goalsHome} : ${goalsAway}</p>
      <div>
        💶 Einsatz: <input type="number" class="einsatz" placeholder="€" />
        📈 Quote: <input type="number" class="quote" placeholder="z.B. 2.50" step="0.01" />
        🪙 Gewinn: <span class="gewinn">0 €</span>
      </div>
    `;
    container.appendChild(card);

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

async function updateData() {
  try {
    const liveMatches = await fetchMatches();
    const upcomingMatches = await fetchUpcoming();
    renderMatches(liveMatches, liveContainer);
    renderMatches(upcomingMatches, upcomingContainer);
    lastUpdate.textContent = new Date().toLocaleTimeString();
  } catch (err) {
    console.error("API Fehler:", err);
  }
}

document.getElementById("refreshButton").addEventListener("click", updateData);

// Notifications korrekt
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js");
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

updateData();
setInterval(updateData, 60 * 1000);
