// === ⚽ JurijPower Live Tool - PRO Version + Quoten + Kombi ===
const API_KEY = "c6ad1210c71b17cca24284ab8a9873b4";
const BASE_URL = "https://v3.football.api-sports.io";

const FAVORITE_LEAGUES = [78, 79, 39, 135, 140, 61]; // Bundesliga 1, 2, PL, Serie A, LaLiga, Ligue 1

const liveContainer = document.getElementById("live-matches");
const upcomingContainer = document.getElementById("upcoming-matches");
const lastUpdate = document.getElementById("lastUpdate");
const refreshButton = document.getElementById("refreshButton");
const filterSelect = document.getElementById("filterSelect");
const errorBox = document.createElement("div");
errorBox.id = "errorBox";
document.body.insertBefore(errorBox, liveContainer);

const comboOddsEl = document.getElementById("combo-odds");
const comboValueEl = document.getElementById("combo-value");
const comboList = document.getElementById("combo-list");
const copyComboBtn = document.getElementById("copyComboBtn");

// === Notifications ===
if ("Notification" in window && Notification.permission !== "granted") {
  Notification.requestPermission();
}

// === API Abruf ===
async function fetchMatches(filter = "all") {
  const headers = { "x-apisports-key": API_KEY };
  const url = `${BASE_URL}/fixtures?live=all`;

  try {
    const res = await fetch(url, { headers });
    const data = await res.json();
    console.log("📡 Live Matches:", data);
    handleApiError(data);

    let matches = data.response;
    if (filter === "favorites") {
      matches = matches.filter(m => FAVORITE_LEAGUES.includes(m.league.id));
    }
    return matches;
  } catch (err) {
    showError("Fehler beim Abrufen der Live-Daten.");
    console.error(err);
    return [];
  }
}

async function fetchUpcoming(filter = "all") {
  const headers = { "x-apisports-key": API_KEY };
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const from = now.toISOString().split("T")[0];
  const to = tomorrow.toISOString().split("T")[0];
  const url = `${BASE_URL}/fixtures?from=${from}&to=${to}`;

  try {
    const res = await fetch(url, { headers });
    const data = await res.json();
    console.log("📅 Upcoming Matches:", data);
    handleApiError(data);

    let matches = data.response;
    if (filter === "favorites") {
      matches = matches.filter(m => FAVORITE_LEAGUES.includes(m.league.id));
    }
    return matches;
  } catch (err) {
    showError("Fehler beim Abrufen der kommenden Spiele.");
    console.error(err);
    return [];
  }
}

// === Fehlerbehandlung ===
function handleApiError(data) {
  if (data.errors && Object.keys(data.errors).length > 0) {
    showError("API Fehler: " + JSON.stringify(data.errors));
  } else if (data.results === 0) {
    showError("⚠️ Keine Spiele verfügbar (oder API-Limit erreicht).");
  } else {
    clearError();
  }
}

function showError(msg) {
  errorBox.textContent = msg;
}

function clearError() {
  errorBox.textContent = "";
}

// === Quoten Simulation ===
function getSimulatedOdds() {
  const bookmakers = ["Betano", "Tipico", "Bet365", "MerkurBet"];
  const odds = {};
  bookmakers.forEach(bookie => {
    odds[bookie] = (Math.random() * (3.5 - 1.4) + 1.4).toFixed(2);
  });
  return odds;
}

function getBestOdd(oddsObj) {
  return Math.max(...Object.values(oddsObj).map(Number));
}

// === Hilfsfunktionen ===
function calcGoalProbability(match) {
  const homeGoals = match.goals.home;
  const awayGoals = match.goals.away;
  const totalGoals = homeGoals + awayGoals;
  const minute = match.fixture.status.elapsed || 0;
  return Math.min(100, Math.round((totalGoals * 20) + (minute / 2)));
}

function calcValue(prob, odd) {
  return ((prob / 100) * odd).toFixed(2);
}

function sendNotification(teamA, teamB, prob) {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("🔥 Hohe Torwahrscheinlichkeit!", {
      body: `${teamA} vs ${teamB}\nTorwahrscheinlichkeit: ${prob}%`,
      icon: "https://cdn-icons-png.flaticon.com/512/51/51767.png"
    });
  }
}

// === Darstellung ===
function displayMatches(container, matches, isLive = false) {
  container.innerHTML = "";

  if (matches.length === 0) {
    container.innerHTML = `<p class="no-matches">❌ Keine Spiele aktuell.</p>`;
    return;
  }

  matches.forEach(match => {
    const prob = calcGoalProbability(match);
    const odds = getSimulatedOdds();
    const bestOdd = getBestOdd(odds);
    const value = calcValue(prob, bestOdd);
    const isHigh = prob >= 70;

    const div = document.createElement("div");
    div.classList.add("match-card");
    if (isHigh && isLive) div.classList.add("blink");

    div.innerHTML = `
      <div class="match-teams">${match.teams.home.name} vs ${match.teams.away.name}</div>
      <div class="match-info">⏳ ${match.fixture.status.elapsed || match.fixture.date.slice(11,16)}'</div>
      <div class="match-info">📊 Torwahrsch.: <span class="high-prob">${prob}%</span></div>
      <div class="match-info">💰 Beste Quote: ${bestOdd}</div>
      <div class="match-info">📈 Value: ${value}</div>
    `;

    div.dataset.odd = bestOdd;
    div.dataset.value = value;
    div.dataset.match = `${match.teams.home.name} vs ${match.teams.away.name}`;

    container.appendChild(div);

    if (isHigh && isLive) {
      sendNotification(match.teams.home.name, match.teams.away.name, prob);
    }
  });
}

// === Kombi Generator ===
function generateBestCombo() {
  const allCards = document.querySelectorAll(".match-card");
  const sorted = Array.from(allCards).sort((a, b) => b.dataset.value - a.dataset.value);
  const best = sorted.slice(0, 3); // z.B. Top 3 Spiele

  if (best.length === 0) {
    comboOddsEl.textContent = "1.00";
    comboValueEl.textContent = "1.00";
    comboList.innerHTML = "<li>❌ Keine Spiele für Kombi</li>";
    return;
  }

  let totalOdd = 1;
  let totalValue = 1;
  comboList.innerHTML = "";

  best.forEach(card => {
    const odd = parseFloat(card.dataset.odd);
    const val = parseFloat(card.dataset.value);
    totalOdd *= odd;
    totalValue *= val / odd;

    const li = document.createElement("li");
    li.textContent = `${card.dataset.match} | Quote: ${odd} | Value: ${val}`;
    comboList.appendChild(li);
  });

  comboOddsEl.textContent = totalOdd.toFixed(2);
  comboValueEl.textContent = totalValue.toFixed(2);
}

// === Kombi Kopieren ===
copyComboBtn.addEventListener("click", () => {
  const comboText = Array.from(comboList.querySelectorAll("li"))
    .map(li => li.textContent)
    .join("\n");
  navigator.clipboard.writeText(comboText);
  alert("📋 Kombi kopiert!");
});

// === Aktualisieren ===
async function updateData() {
  const filter = filterSelect.value;
  const liveMatches = await fetchMatches(filter);
  const upcomingMatches = await fetchUpcoming(filter);

  displayMatches(liveContainer, liveMatches, true);
  displayMatches(upcomingContainer, upcomingMatches, false);

  generateBestCombo();

  const now = new Date();
  lastUpdate.textContent = now.toLocaleTimeString();
}

refreshButton.addEventListener("click", updateData);
filterSelect.addEventListener("change", updateData);
updateData();
setInterval(updateData, 60000);
