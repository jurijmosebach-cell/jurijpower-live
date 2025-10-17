// === ⚽ JurijPower Live Tool PRO ===
// API KEY + BASE URL
const API_KEY = "c6ad1210c71b17cca24284ab8a9873b4";
const BASE_URL = "https://v3.football.api-sports.io";

// === HTML Elemente ===
const liveContainer = document.getElementById("live-matches");
const upcomingContainer = document.getElementById("upcoming-matches");
const lastUpdate = document.getElementById("lastUpdate");

// === LIVE SPIELE HOLEN ===
async function fetchMatches() {
  const headers = { "x-apisports-key": API_KEY };
  const url = `${BASE_URL}/fixtures?live=all`;
  const res = await fetch(url, { headers });
  const data = await res.json();
  return data.response;
}

// === KOMMENDE SPIELE HOLEN (24h) ===
async function fetchUpcoming() {
  const headers = { "x-apisports-key": API_KEY };
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const from = now.toISOString().split("T")[0];
  const to = tomorrow.toISOString().split("T")[0];

  const url = `${BASE_URL}/fixtures?from=${from}&to=${to}`;
  const res = await fetch(url, { headers });
  const data = await res.json();
  return data.response;
}

// === STATISTIKEN HOLEN ===
async function fetchStats(fixtureId) {
  const headers = { "x-apisports-key": API_KEY };
  const url = `${BASE_URL}/fixtures/statistics?fixture=${fixtureId}`;
  const res = await fetch(url, { headers });
  const data = await res.json();
  return data.response;
}

// === EINFACHE WAHRSCHEINLICHKEIT BERECHNUNG ===
function calculateProbabilities(statsA, statsB, scoreA, scoreB, minute) {
  let shotsA = 0, shotsB = 0;
  let possessionA = 50, possessionB = 50;

  const statA = statsA.find(s => s.type === "Shots on Goal");
  const statB = statsB.find(s => s.type === "Shots on Goal");
  const posA = statsA.find(s => s.type === "Ball Possession");
  const posB = statsB.find(s => s.type === "Ball Possession");

  if (statA) shotsA = statA.value;
  if (statB) shotsB = statB.value;
  if (posA) possessionA = parseInt(posA.value);
  if (posB) possessionB = parseInt(posB.value);

  const totalShots = shotsA + shotsB + 1;
  const totalPoss = possessionA + possessionB;

  const probNextA = ((shotsA / totalShots) * 0.6 + (possessionA / totalPoss) * 0.4) * 100;
  const probNextB = ((shotsB / totalShots) * 0.6 + (possessionB / totalPoss) * 0.4) * 100;
  const probNoGoal = Math.max(0, 100 - (probNextA + probNextB));

  // Sieg-Wahrscheinlichkeit
  const remaining = 90 - minute;
  let winA = 0, winB = 0, draw = 0;

  if (scoreA > scoreB) {
    winA = 60 + remaining * 0.3;
    winB = 100 - winA - 10;
    draw = 10;
  } else if (scoreA < scoreB) {
    winB = 60 + remaining * 0.3;
    winA = 100 - winB - 10;
    draw = 10;
  } else {
    draw = 50 - remaining * 0.1;
    winA = (50 - draw) * (possessionA / 100);
    winB = (50 - draw) * (possessionB / 100);
  }

  return {
    next: {
      teamA: Math.round(probNextA),
      teamB: Math.round(probNextB),
      none: Math.round(probNoGoal)
    },
    result: {
      winA: Math.max(0, Math.round(winA)),
      draw: Math.max(0, Math.round(draw)),
      winB: Math.max(0, Math.round(winB))
    }
  };
}

// === HILFSFUNKTION: BALKEN ===
function createBar(label, value, color) {
  return `
    <div class="bar-label">${label} ${value}%</div>
    <div class="bar-bg">
      <div class="bar-fill" style="width:${value}%; background:${color};"></div>
    </div>
  `;
}

// === LIVE SPIELE ANZEIGEN ===
async function renderLiveMatches() {
  liveContainer.innerHTML = "⏳ Lade Live-Spiele...";
  const matches = await fetchMatches();
  liveContainer.innerHTML = "";

  if (matches.length === 0) {
    liveContainer.innerHTML = "❌ Keine Live-Spiele zurzeit";
    return;
  }

  for (const match of matches) {
    const fixtureId = match.fixture.id;
    const stats = await fetchStats(fixtureId);
    if (stats.length < 2) continue;

    const statsA = stats[0].statistics;
    const statsB = stats[1].statistics;

    const teamA = match.teams.home.name;
    const teamB = match.teams.away.name;
    const goalsA = match.goals.home;
    const goalsB = match.goals.away;
    const minute = match.fixture.status.elapsed;

    const prob = calculateProbabilities(statsA, statsB, goalsA, goalsB, minute);

    const card = document.createElement("div");
    card.className = "match-card";
    card.innerHTML = `
      <h3>${teamA} vs ${teamB}</h3>
      <p>⏱️ ${minute}' | ⚽ ${goalsA} : ${goalsB}</p>
      <hr>
      <strong>Nächstes Tor:</strong>
      ${createBar(teamA, prob.next.teamA, "#4caf50")}
      ${createBar(teamB, prob.next.teamB, "#2196f3")}
      ${createBar("Kein Tor", prob.next.none, "#9e9e9e")}
      <hr>
      <strong>Sieg-Wahrscheinlichkeit:</strong>
      ${createBar(teamA, prob.result.winA, "#4caf50")}
      ${createBar("Unentschieden", prob.result.draw, "#ff9800")}
      ${createBar(teamB, prob.result.winB, "#2196f3")}
    `;
    liveContainer.appendChild(card);
  }
}

// === KOMMENDE SPIELE ANZEIGEN ===
async function renderUpcomingMatches() {
  upcomingContainer.innerHTML = "⏳ Lade kommende Spiele...";
  const matches = await fetchUpcoming();
  upcomingContainer.innerHTML = "";

  if (matches.length === 0) {
    upcomingContainer.innerHTML = "❌ Keine kommenden Spiele in den nächsten 24 Stunden";
    return;
  }

  for (const match of matches) {
    const teamA = match.teams.home.name;
    const teamB = match.teams.away.name;
    const league = match.league.name;
    const date = new Date(match.fixture.date);
    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const card = document.createElement("div");
    card.className = "match-card";
    card.innerHTML = `
      <h3>${teamA} vs ${teamB}</h3>
      <p>🏆 ${league}</p>
      <p>🕒 ${time}</p>
    `;
    upcomingContainer.appendChild(card);
  }
}

// === AUTO-UPDATE ===
async function updateAll() {
  await renderLiveMatches();
  await renderUpcomingMatches();
  lastUpdate.textContent = "Letzte Aktualisierung: " + new Date().toLocaleTimeString();
}

updateAll();
setInterval(updateAll, 30000);
