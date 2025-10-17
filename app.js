// === ⚽ JurijPower Live Tool – PRO Version mit Balkenanzeige ===
// API KEY + BASE URL
const API_KEY = "c6ad1210c71b17cca24284ab8a9873b4";  // <- Dein Schlüssel
const BASE_URL = "https://v3.football.api-sports.io";

// HTML Container
const liveContainer = document.getElementById("live-matches");
const lastUpdate = document.getElementById("lastUpdate");

// === TEST-FIXTURE (wenn keine Live-Spiele laufen) ===
const TEST_FIXTURE_ID = 1035059; // Beispiel-ID eines echten Spiels
let useTestFixture = true;       // <- auf true lassen zum Testen

// === LIVE SPIELE HOLEN ===
async function fetchMatches() {
  const headers = { "x-apisports-key": API_KEY };
  let url = `${BASE_URL}/fixtures?live=all`;
  const res = await fetch(url, { headers });
  const data = await res.json();

  // Wenn keine Live-Spiele gefunden → Test-FIXTURE laden
  if (data.response.length === 0 && useTestFixture) {
    const testUrl = `${BASE_URL}/fixtures?id=${TEST_FIXTURE_ID}`;
    const testRes = await fetch(testUrl, { headers });
    const testData = await testRes.json();
    return testData.response;
  }

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

// === HILFSFUNKTION: BALKEN HTML ===
function createBar(label, value, color) {
  return `
    <div class="bar-label">${label} ${value}%</div>
    <div class="bar-bg">
      <div class="bar-fill" style="width:${value}%; background:${color};"></div>
    </div>
  `;
}

// === SPIELE ANZEIGEN ===
async function renderLiveMatches() {
  liveContainer.innerHTML = "⏳ Lade Live-Spiele...";

  const matches = await fetchMatches();
  liveContainer.innerHTML = "";

  for (const match of matches) {
    const fixtureId = match.fixture.id;
    const stats = await fetchStats(fixtureId);
    if (!stats || stats.length < 2) continue;

    const statsA = stats[0].statistics;
    const statsB = stats[1].statistics;

    const teamA = match.teams.home.name;
    const teamB = match.teams.away.name;
    const goalsA = match.goals.home;
    const goalsB = match.goals.away;
    const minute = match.fixture.status.elapsed || 0;

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

  const now = new Date();
  lastUpdate.textContent = "Letzte Aktualisierung: " + now.toLocaleTimeString();
}

// === AUTO-UPDATE ALLE 30 SEKUNDEN ===
setInterval(renderLiveMatches, 30000);
renderLiveMatches();
