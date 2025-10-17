// === ⚽ JurijPower Live Tool - PRO + Value-Kombi ===

const API_KEY = "c6ad1210c71b17cca24284ab8a9873b4";
const BASE_URL = "https://v3.football.api-sports.io";

const FAVORITE_LEAGUES = [78, 79, 39, 135, 140, 61];
const BOOKMAKERS = [349, 115, 8]; // Betano, Tipico, Bet365

const liveContainer = document.getElementById("live-matches");
const upcomingContainer = document.getElementById("upcoming-matches");
const comboContainer = document.getElementById("combo-container");
const lastUpdate = document.getElementById("lastUpdate");
const refreshButton = document.getElementById("refreshButton");
const filterSelect = document.getElementById("filterSelect");

if ("Notification" in window && Notification.permission !== "granted") {
  Notification.requestPermission();
}
const notifiedMatches = new Set();

// 📡 Live Spiele
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

// 📅 Alle Spiele heute (für Kombi)
async function fetchAllToday() {
  const headers = { "x-apisports-key": API_KEY };
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const from = now.toISOString().split("T")[0];
  const to = tomorrow.toISOString().split("T")[0];
  const res = await fetch(`${BASE_URL}/fixtures?from=${from}&to=${to}`, { headers });
  const data = await res.json();
  return data.response;
}

// Torwahrscheinlichkeit
function calcGoalProbability(match) {
  const totalGoals = match.goals.home + match.goals.away;
  const minute = match.fixture.status.elapsed || 0;
  return Math.min(100, Math.round((totalGoals * 20) + (minute / 2)));
}

// Value-Bet
function calcValue(prob, odd) {
  return (odd * (prob / 100)).toFixed(2);
}

// Quoten
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

// Notification
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

// Anzeige der Spiele mit Value-Sortierung
async function displayMatches(container, matches, isLive = false) {
  container.innerHTML = "";
  if (matches.length === 0) {
    container.innerHTML = `<p class="no-matches">❌ Keine Spiele aktuell.</p>`;
    return;
  }

  const matchDataWithValue = [];
  for (const match of matches) {
    const prob = calcGoalProbability(match);
    const odds = await fetchOdds(match.fixture.id);
    let bestValue = 0;
    let bookmaker = null;
    let bestOdd = null;
    if (odds && odds.home && odds.away) {
      const valueHome = parseFloat(calcValue(prob, odds.home));
      const valueAway = parseFloat(calcValue(prob, odds.away));
      bestValue = Math.max(valueHome, valueAway);
      bookmaker = odds.bookmaker;
      bestOdd = bestValue === valueHome ? odds.home : odds.away;
    }
    matchDataWithValue.push({ match, prob, bestValue, bookmaker, bestOdd });
  }

  matchDataWithValue.sort((a, b) => b.bestValue - a.bestValue);

  for (const data of matchDataWithValue) {
    const { match, prob, bestValue, bookmaker } = data;
    const isHigh = prob >= 70;
    const div = document.createElement("div");
    div.classList.add("match-card");
    if (isHigh && isLive) div.classList.add("blink");

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

// 🧠 Kombi automatisch generieren
async function generateCombo() {
  comboContainer.innerHTML = "<p>📊 Kombi wird berechnet …</p>";

  const allMatches = await fetchAllToday();
  const matchData = [];

  for (const match of allMatches) {
    const prob = calcGoalProbability(match);
    const odds = await fetchOdds(match.fixture.id);
    if (!odds || !odds.home || !odds.away) continue;

    const valueHome = parseFloat(calcValue(prob, odds.home));
    const valueAway = parseFloat(calcValue(prob, odds.away));

    const bestValue = Math.max(valueHome, valueAway);
    const bestOdd = bestValue === valueHome ? odds.home : odds.away;
    const bestTeam = bestValue === valueHome ? match.teams.home.name : match.teams.away.name;

    matchData.push({
      id: match.fixture.id,
      match: `${match.teams.home.name} vs ${match.teams.away.name}`,
      bestValue,
      bestOdd,
      pick: bestTeam,
      bookmaker: odds.bookmaker
    });
  }

  matchData.sort((a, b) => b.bestValue - a.bestValue);

  const comboPicks = matchData.slice(0, 5); // Top 5 Tipps
  let totalOdds = 1;
  let totalValue = 1;

  comboContainer.innerHTML = "";
  comboPicks.forEach(tip => {
    totalOdds *= tip.bestOdd;
    totalValue *= tip.bestValue;

    const item = document.createElement("div");
    item.classList.add("combo-item");
    item.innerHTML = `
      <span>${tip.match} (${tip.pick})</span>
      <span>${tip.bestOdd.toFixed(2)} | ${tip.bestValue.toFixed(2)} (${tip.bookmaker})</span>
    `;
    comboContainer.appendChild(item);
  });

  const totalDiv = document.createElement("div");
  totalDiv.classList.add("combo-total");
  totalDiv.innerHTML = `
    <span>Gesamtquote:</span>
    <span class="combo-highlight">${totalOdds.toFixed(2)}</span>
  `;
  comboContainer.appendChild(totalDiv);

  const totalValueDiv = document.createElement("div");
  totalValueDiv.classList.add("combo-total");
  totalValueDiv.innerHTML = `
    <span>Kombi-Value:</span>
    <span class="combo-highlight">${totalValue.toFixed(2)}</span>
  `;
  comboContainer.appendChild(totalValueDiv);
}

// Daten aktualisieren
async function updateData() {
  const filter = filterSelect.value;
  const liveMatches = await fetchMatches(filter);
  const upcomingMatches = await fetchAllToday(); // für 24h

  displayMatches(liveContainer, liveMatches, true);
  displayMatches(upcomingContainer, upcomingMatches, false);
  generateCombo();

  lastUpdate.textContent = new Date().toLocaleTimeString();
}

// Events
refreshButton.addEventListener("click", updateData);
filterSelect.addEventListener("change", updateData);

// Start
updateData();
setInterval(updateData, 60000);
