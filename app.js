// === ⚽ JurijPower Live Tool – PRO Version ===
// Live-Spiele + Kommende Spiele (48h) + Tor- & Sieg-Wahrscheinlichkeit

// === API KEY ===
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

// === KOMMENDE SPIELE HOLEN (48h) ===
async function fetchUpcomingMatches() {
  const headers = { "x-apisports-key": API_KEY };

  const today = new Date();
  const to48h = new Date();
  to48h.setDate(today.getDate() + 2); // ⬅️ 48 Stunden

  const fromDate = today.toISOString().split("T")[0];
  const toDate = to48h.toISOString().split("T")[0];

  const url = `${BASE_URL}/fixtures?from=${fromDate}&to=${toDate}`;
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

// === WAHRSCHEINLICHKEITEN BERECHNEN ===
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

// === BALKEN HTML ===
function createBar(label, value, color) {
  return `
    <div class="bar-label">${label} ${value}%</div>
    <div class="bar-bg">
      <div class="bar-fill" style="width:${value}%; background:${color};"></div>
    </div>
  `;
}

// === LIVE SPIELE RENDERN ===
async function renderLiveMatches() {
  const matches = await fetchMatches();
  liveContainer.innerHTML = "";

  if (!matches || matches.length === 0) {
    liveContainer.innerHTML = "❌ Keine Live-Spiele aktuell.";
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

// === KOMMENDE SPIELE RENDERN ===
async function renderUpcomingMatches() {
  const matches = await fetchUpcomingMatches();
  upcomingContainer.innerHTML = "";

  if (!matches || matches.length === 0) {
    upcomingContainer.innerHTML = "❌ Keine kommenden Spiele in den nächsten 48h.";
    return;
  }

  matches.forEach(match => {
    const teamA = match.teams.home.name;
    const teamB = match.teams.away.name;
    const date = new Date(match.fixture.date);
    const time = date.toLocaleString();

    const card = document.createElement("div");
    card.className = "match-card";
    card.innerHTML = `
      <h3>${teamA} vs ${teamB}</h3>
      <p>🕒 ${time}</p>
    `;
    upcomingContainer.appendChild(card);
  });
}

// === AUTO-UPDATE ===
async function updateAll() {
  await renderLiveMatches();
  await renderUpcomingMatches();
  lastUpdate.textContent = new Date().toLocaleTimeString();
}

setInterval(updateAll, 30000);
updateAll();
