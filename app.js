// ✅ Dein API Key (fertig eingetragen)
const API_KEY = "c6ad1210c71b17cca24284ab8a9873b4";
const BASE_URL = "https://v3.football.api-sports.io";

const liveContainer = document.getElementById("live-matches");
const upcomingContainer = document.getElementById("upcoming-matches");
const lastUpdate = document.getElementById("lastUpdate");

// 📡 API abrufen
async function fetchAPI(url) {
  const headers = { "x-apisports-key": API_KEY };
  const res = await fetch(url, { headers });
  return res.json();
}

// 🟢 Live Spiele laden
async function fetchMatches() {
  const data = await fetchAPI(`${BASE_URL}/fixtures?live=all`);
  return data.response;
}

// 🕓 Spiele in den nächsten 24h
async function fetchUpcoming() {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const dateNow = now.toISOString().split("T")[0];
  const dateTomorrow = tomorrow.toISOString().split("T")[0];

  const data = await fetchAPI(`${BASE_URL}/fixtures?from=${dateNow}&to=${dateTomorrow}`);
  return data.response;
}

// ⚽ Statistiken abrufen (für Druckerkennung)
async function fetchStats(fixtureId) {
  const data = await fetchAPI(`${BASE_URL}/fixtures/statistics?fixture=${fixtureId}`);
  return data.response;
}

// 🧮 Value berechnen (Wahrscheinlichkeit * Quote - 1)
function calcValue(probability, quote) {
  return (probability * quote - 1) * 100; // in %
}

// 🔥 Druckwahrscheinlichkeit ermitteln
function estimateOverProbabilities(stats) {
  let pressureScore = 0;
  let over15 = 0.5; // Basiswahrscheinlichkeit
  let over25 = 0.35;

  if (stats.length > 0) {
    const team1 = stats[0].statistics;
    const team2 = stats[1].statistics;

    const s1Shots = parseInt(team1.find(s => s.type === "Shots on Goal")?.value || 0);
    const s2Shots = parseInt(team2.find(s => s.type === "Shots on Goal")?.value || 0);
    const possession1 = parseInt(team1.find(s => s.type === "Ball Possession")?.value.replace('%','') || 0);
    const possession2 = parseInt(team2.find(s => s.type === "Ball Possession")?.value.replace('%','') || 0);

    pressureScore = s1Shots + s2Shots;

    // Druckindikatoren
    if (pressureScore >= 5) over15 += 0.15;
    if (pressureScore >= 8) over15 += 0.25;

    if (pressureScore >= 5) over25 += 0.15;
    if (pressureScore >= 8) over25 += 0.25;

    // Ballbesitz einbeziehen
    if (possession1 > 60 || possession2 > 60) {
      over15 += 0.1;
      over25 += 0.1;
    }
  }

  // Maximal 95%
  return {
    over15: Math.min(over15, 0.95),
    over25: Math.min(over25, 0.95)
  };
}

// 📊 Spiele darstellen
function renderMatches(matches, container, isLive = false) {
  container.innerHTML = "";
  matches.forEach(async match => {
    const home = match.teams.home.name;
    const away = match.teams.away.name;
    const league = match.league.name;
    const goalsHome = match.goals.home ?? 0;
    const goalsAway = match.goals.away ?? 0;
    const status = match.fixture.status.short;
    const fixtureId = match.fixture.id;

    let over15Prob = 0.55;
    let over25Prob = 0.40;
    let over15Val = 0;
    let over25Val = 0;

    if (isLive) {
      const stats = await fetchStats(fixtureId);
      const prob = estimateOverProbabilities(stats);
      over15Prob = prob.over15;
      over25Prob = prob.over25;

      // Beispielquote — kann später dynamisch durch API ersetzt werden
      const quote15 = 1.60;
      const quote25 = 2.20;
      over15Val = calcValue(over15Prob, quote15);
      over25Val = calcValue(over25Prob, quote25);
    }

    const card = document.createElement("div");
    card.className = "match-card";
    card.innerHTML = `
      <h3>${home} vs ${away}</h3>
      <p>🏆 ${league} | 🕒 ${status} | ${goalsHome} : ${goalsAway}</p>
      ${
        isLive
          ? `
      <div>
        <p>📊 Over 1.5 Value: 
          <span style="color:${over15Val>0?'limegreen':'red'}">
            ${over15Val.toFixed(1)}%
          </span>
        </p>
        <p>📊 Over 2.5 Value: 
          <span style="color:${over25Val>0?'limegreen':'red'}">
            ${over25Val.toFixed(1)}%
          </span>
        </p>
      </div>
      `
          : ""
      }
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

// 🔄 Daten aktualisieren
async function updateData() {
  try {
    const [liveMatches, upcomingMatches] = await Promise.all([fetchMatches(), fetchUpcoming()]);
    renderMatches(liveMatches, liveContainer, true);
    renderMatches(upcomingMatches, upcomingContainer, false);
    lastUpdate.textContent = new Date().toLocaleTimeString();
  } catch (err) {
    console.error("API Fehler:", err);
  }
}

// 🔘 Refresh Button
document.getElementById("refreshButton").addEventListener("click", updateData);

// 📢 Notifications aktivieren
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js");
}

if (Notification.permission !== "granted") {
  Notification.requestPermission();
}

updateData();
setInterval(updateData, 60 * 1000);
