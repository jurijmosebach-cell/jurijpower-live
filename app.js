// === ⚽ JurijPower Live Tool - PRO Version + Alarm ===
const API_KEY = "c6ad1210c71b17cca24284ab8a9873b4";
const BASE_URL = "https://v3.football.api-sports.io";

// === Favoritenligen (IDs laut API-Football) ===
const FAVORITE_LEAGUES = [78, 79, 39, 135, 140, 61];
// Bundesliga 1, 2, Premier League, Serie A, Primera Division, Ligue 1

// === HTML Elemente ===
const liveContainer = document.getElementById("live-matches");
const upcomingContainer = document.getElementById("upcoming-matches");
const lastUpdate = document.getElementById("lastUpdate");
const refreshButton = document.getElementById("refreshButton");
const filterSelect = document.getElementById("filterSelect");

// === Browser Notifications aktivieren ===
if ("Notification" in window && Notification.permission !== "granted") {
  Notification.requestPermission();
}

// === Daten abrufen ===
async function fetchMatches(filter = "all") {
  const headers = { "x-apisports-key": API_KEY };
  let url = `${BASE_URL}/fixtures?live=all`;

  const res = await fetch(url, { headers });
  const data = await res.json();

  let matches = data.response;
  if (filter === "favorites") {
    matches = matches.filter(m => FAVORITE_LEAGUES.includes(m.league.id));
  }
  return matches;
}

async function fetchUpcoming(filter = "all") {
  const headers = { "x-apisports-key": API_KEY };
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const from = now.toISOString().split("T")[0];
  const to = tomorrow.toISOString().split("T")[0];

  let url = `${BASE_URL}/fixtures?from=${from}&to=${to}`;
  const res = await fetch(url, { headers });
  const data = await res.json();

  let matches = data.response;
  if (filter === "favorites") {
    matches = matches.filter(m => FAVORITE_LEAGUES.includes(m.league.id));
  }
  return matches;
}

// === Hilfsfunktionen ===
function calcGoalProbability(match) {
  const homeGoals = match.goals.home;
  const awayGoals = match.goals.away;
  const totalGoals = homeGoals + awayGoals;
  const minute = match.fixture.status.elapsed || 0;
  return Math.min(100, Math.round((totalGoals * 20) + (minute / 2)));
}

function calcValueBet(prob) {
  return prob >= 60 ? "💰 Value Bet" : "";
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
    const value = calcValueBet(prob);
    const isHigh = prob >= 70;

    const div = document.createElement("div");
    div.classList.add("match-card");
    if (isHigh && isLive) div.classList.add("blink");

    div.innerHTML = `
      <div class="match-teams icon-ball">${match.teams.home.name} vs ${match.teams.away.name}</div>
      <div class="match-info icon-clock">${
        match.fixture.status.elapsed
          ? match.fixture.status.elapsed + "'"
          : match.fixture.date.slice(11, 16)
      }</div>
      <div class="match-info icon-chart">Tor-Wahrsch.: <span class="high-prob">${prob}%</span></div>
      <div class="match-info icon-money">${value}</div>
    `;
    container.appendChild(div);

    // 🔔 Notification nur bei Live-Spielen + hoher Wahrscheinlichkeit
    if (isHigh && isLive) {
      sendNotification(match.teams.home.name, match.teams.away.name, prob);
    }
  });
}

// === Aktualisieren ===
async function updateData() {
  const filter = filterSelect.value;
  const liveMatches = await fetchMatches(filter);
  const upcomingMatches = await fetchUpcoming(filter);

  displayMatches(liveContainer, liveMatches, true);
  displayMatches(upcomingContainer, upcomingMatches, false);

  const now = new Date();
  lastUpdate.textContent = now.toLocaleTimeString();
}

// === Events ===
refreshButton.addEventListener("click", updateData);
filterSelect.addEventListener("change", updateData);

// === Initial ===
updateData();
setInterval(updateData, 60000); // jede Minute
