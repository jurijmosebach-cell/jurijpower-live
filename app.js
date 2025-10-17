// === ⚽ JurijPower Live Tool - PRO Version ===
// 📊 Quoten (Betano, Tipico, Bet365) + 🧮 Value-Bet Berechnung + 🔔 Notifications + Sortierung

const API_KEY = "c6ad1210c71b17cca24284ab8a9873b4";
const BASE_URL = "https://v3.football.api-sports.io";

const FAVORITE_LEAGUES = [78, 79, 39, 135, 140, 61];
const BOOKMAKERS = [349, 115, 8]; // Betano, Tipico, Bet365

const liveContainer = document.getElementById("live-matches");
const upcomingContainer = document.getElementById("upcoming-matches");
const lastUpdate = document.getElementById("lastUpdate");
const refreshButton = document.getElementById("refreshButton");
const filterSelect = document.getElementById("filterSelect");

if ("Notification" in window && Notification.permission !== "granted") {
  Notification.requestPermission();
}
const notifiedMatches = new Set();

// === 📡 Live Spiele laden ===
async function fetchMatches(filter = "all") {
  const headers = { "x-apisports-key": API_KEY };
  const res = await fetch(`${BASE_URL}/fixtures?live=all`, { headers });
  const data = await res.json();
  let matches = data.response;
  if (filter === "favorites") {
    matches = matches.filter(m => FAVORITE_LEAGUES.includes(m.league.id));
  }
  return matches;
}

// === 📅 Kommende Spiele ===
async function fetchUpcoming(filter = "all") {
  const headers = { "x-apisports-key": API_KEY };
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const from = now.toISOString().split("T")[0];
  const to = tomorrow.toISOString().split("T")[0];
  const res = await fetch(`${BASE_URL}/fixtures?from=${from}&to=${to}`, { headers });
  const data = await res.json();
  let matches = data.response;
  if (filter === "favorites") {
    matches = matches.filter(m => FAVORITE_LEAGUES.includes(m.league.id));
  }
  return matches;
}

// === 🧮 Torwahrscheinlichkeit ===
function calcGoalProbability(match) {
  const totalGoals = match.goals.home + match.goals.away;
  const minute = match.fixture.status.elapsed || 0;
  return Math.min(100, Math.round((totalGoals * 20) + (minute / 2)));
}

// === 🧮 Value-Bet ===
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
  return null;
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

// === 🟡 Blinkeffekt ===
function toggleBlinkEffect(element, shouldBlink) {
  if (shouldBlink) element.classList.add("blink");
  else element.classList.remove("blink");
}

// === 🧾 Spiele anzeigen (inkl. Sortierung nach Value) ===
async function displayMatches(container, matches, isLive = false) {
  container.innerHTML = "";
  if (matches.length === 0) {
    container.innerHTML = `<p class="no-matches">❌ Keine Spiele aktuell.</p>`;
    return;
  }

  // ➕ Liste mit Value vorbereiten
  const matchDataWithValue = [];

  for (const match of matches) {
    const prob = calcGoalProbability(match);
    const matchId = match.fixture.id;
    const odds = await fetchOdds(matchId);

    let bestValue = 0;
    let bookmaker = null;
    if (odds && odds.home && odds.away) {
      const valueHome = parseFloat(calcValue(prob, odds.home));
      const valueAway = parseFloat(calcValue(prob, odds.away));
      bestValue = Math.max(valueHome, valueAway);
      bookmaker = odds.bookmaker;
    }

    matchDataWithValue.push({ match, prob, bestValue, bookmaker });
  }

  // 📊 Sortieren nach Value (höchster zuerst)
  matchDataWithValue.sort((a, b) => b.bestValue - a.bestValue);

  // 🧱 Anzeige
  for (const data of matchDataWithValue) {
    const { match, prob, bestValue, bookmaker } = data;
    const isHigh = prob >= 70;

    const div = document.createElement("div");
    div.classList.add("match-card");
    toggleBlinkEffect(div, isHigh && isLive);

    let valueText = "–";
    if (bestValue >= 1.20) {
      div.classList.add("value-highlight-red");
      valueText = `🔥 ${bestValue.toFixed(2)} (${bookmaker})`;
    } else if (bestValue >= 1.10) {
      div.classList.add("value-highlight-orange");
      valueText = `💰 ${bestValue.toFixed(2)} (${bookmaker})`;
    } else if (bestValue >= 1.05) {
      div.classList.add("value-highlight-green");
      valueText = `✅ ${bestValue.toFixed(2)} (${bookmaker})`;
    }

    div.innerHTML = `
      <div class="match-teams">${match.teams.home.name} vs ${match.teams.away.name}</div>
      <div class="match-info">
        <span>⏱ ${
          match.fixture.status.elapsed
            ? match.fixture.status.elapsed + "'"
            : match.fixture.date.slice(11, 16)
        }</span>
        <span>⚽ ${prob}%</span>
      </div>
      <div class="match-info"><span>Value:</span><span>${valueText}</span></div>
    `;

    container.appendChild(div);

    if (isHigh && isLive) {
      sendNotification(match.fixture.id, match.teams.home.name, match.teams.away.name, prob);
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
setInterval(updateData, 60000);
