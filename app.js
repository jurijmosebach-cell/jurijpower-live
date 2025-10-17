// === ⚽ JurijPower Live Tool - PRO Version + Alarm + Value Bets ===
// 🧠 Funktionen: Torwahrscheinlichkeit + Live Quoten + Value-Rechnung + Notification

const API_KEY = "c6ad1210c71b17cca24284ab8a9873b4";
const BASE_URL = "https://v3.football.api-sports.io";

// === Favoritenligen (IDs laut API-Football) ===
const FAVORITE_LEAGUES = [78, 79, 39, 135, 140, 61];
// Bundesliga 1, 2, Premier League, Serie A, LaLiga, Ligue 1

// === Buchmacher IDs laut API-Football ===
const BOOKMAKERS = [349, 115, 8]; // Betano, Tipico, Bet365

// === HTML Elemente ===
const liveContainer = document.getElementById("live-matches");
const upcomingContainer = document.getElementById("upcoming-matches");
const lastUpdate = document.getElementById("lastUpdate");
const refreshButton = document.getElementById("refreshButton");
const filterSelect = document.getElementById("filterSelect");

// === Notification Setup ===
if ("Notification" in window && Notification.permission !== "granted") {
  Notification.requestPermission();
}

// 🧠 Speicherung, um Mehrfach-Notifications zu vermeiden
const notifiedMatches = new Set();

// === 📡 Live Spiele laden ===
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

// === 📅 Spiele für heute und morgen laden ===
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

// === 🧮 Torwahrscheinlichkeit berechnen ===
function calcGoalProbability(match) {
  const homeGoals = match.goals.home;
  const awayGoals = match.goals.away;
  const totalGoals = homeGoals + awayGoals;
  const minute = match.fixture.status.elapsed || 0;
  return Math.min(100, Math.round((totalGoals * 20) + (minute / 2)));
}

// === 🧮 Value-Bet berechnen ===
function calcValue(prob, odd) {
  return (odd * (prob / 100)).toFixed(2);
}

// === 📊 Quoten abrufen ===
async function fetchOdds(fixtureId) {
  const headers = { "x-apisports-key": API_KEY };

  for (let bookmaker of BOOKMAKERS) {
    const url = `${BASE_URL}/odds?fixture=${fixtureId}&bookmaker=${bookmaker}`;
    const res = await fetch(url, { headers });
    const data = await res.json();

    if (data.response.length > 0) {
      const bookmakerData = data.response[0].bookmakers[0];
      const bets = bookmakerData.bets.find(b => b.name === "Match Winner");
      if (bets) {
        const odds = bets.values.reduce((acc, v) => {
          acc[v.value.toLowerCase()] = parseFloat(v.odd);
          return acc;
        }, {});
        return { bookmaker: bookmakerData.name, ...odds };
      }
    }
  }
  return null; // keine Quoten gefunden
}

// === 🔔 Notification ===
function sendNotification(matchId, teamA, teamB, prob) {
  if ("Notification" in window && Notification.permission === "granted") {
    if (!notifiedMatches.has(matchId)) {
      new Notification("🔥 Hohe Torwahrscheinlichkeit!", {
        body: `${teamA} vs ${teamB}\nTorwahrscheinlichkeit: ${prob}%`,
        icon: "https://cdn-icons-png.flaticon.com/512/51/51767.png"
      });
      notifiedMatches.add(matchId);
    }
  }
}

// === 🟡 Blinkeffekt aktivieren/deaktivieren ===
function toggleBlinkEffect(element, shouldBlink) {
  if (shouldBlink) {
    element.classList.add("blink");
  } else {
    element.classList.remove("blink");
  }
}

// === 🧾 Spiele darstellen ===
async function displayMatches(container, matches, isLive = false) {
  container.innerHTML = "";

  if (matches.length === 0) {
    container.innerHTML = `<p class="no-matches">❌ Keine Spiele aktuell.</p>`;
    return;
  }

  for (const match of matches) {
    const prob = calcGoalProbability(match);
    const matchId = match.fixture.id;
    const isHigh = prob >= 70;

    const div = document.createElement("div");
    div.classList.add("match-card");
    toggleBlinkEffect(div, isHigh && isLive);

    // 📊 Quoten & Value laden
    const odds = await fetchOdds(matchId);
    let valueText = "–";
    let bestValue = 0;

    if (odds && odds.home && odds.away) {
      const valueHome = parseFloat(calcValue(prob, odds.home));
      const valueAway = parseFloat(calcValue(prob, odds.away));
      bestValue = Math.max(valueHome, valueAway);

      if (bestValue > 1.05) {
        div.classList.add("value-highlight");
        valueText = `💰 ${bestValue} (${odds.bookmaker})`;
      } else {
        valueText = `📉 ${bestValue} (${odds.bookmaker})`;
      }
    }

    div.innerHTML = `
      <div class="match-teams icon-ball">${match.teams.home.name} vs ${match.teams.away.name}</div>
      <div class="match-info icon-clock">${
        match.fixture.status.elapsed
          ? match.fixture.status.elapsed + "'"
          : match.fixture.date.slice(11, 16)
      }</div>
      <div class="match-info icon-chart">Tor-Wahrsch.: <span class="high-prob">${prob}%</span></div>
      <div class="match-info icon-money">Value: ${valueText}</div>
    `;
    container.appendChild(div);

    // 🔔 Notification bei hoher Wahrscheinlichkeit
    if (isHigh && isLive) {
      sendNotification(matchId, match.teams.home.name, match.teams.away.name, prob);
    }
  }
}

// === 🔁 Daten aktualisieren ===
async function updateData() {
  const filter = filterSelect.value;
  const liveMatches = await fetchMatches(filter);
  const upcomingMatches = await fetchUpcoming(filter);

  displayMatches(liveContainer, liveMatches, true);
  displayMatches(upcomingContainer, upcomingMatches, false);

  lastUpdate.textContent = new Date().toLocaleTimeString();
}

// === 🧭 Events ===
refreshButton.addEventListener("click", updateData);
filterSelect.addEventListener("change", updateData);

// === 🚀 Start ===
updateData();
setInterval(updateData, 60000); // alle 60 Sekunden
