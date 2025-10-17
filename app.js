// === ⚽ JurijPower Live Tool – PRO Version mit Value Bets & Filter ===
const API_KEY = "c6ad1210c71b17cca24284ab8a9873b4";
const BASE_URL = "https://v3.football.api-sports.io";

// Favoriten-Ligen (ID laut API-Football)
const FAVORITE_LEAGUES = [78, 79, 39, 135, 140, 61, 208]; 
// Bundesliga 1, 2, Premier League, Serie A, La Liga, Ligue 1, Superligaen

// HTML Elemente
const liveContainer = document.getElementById("live-matches");
const upcomingContainer = document.getElementById("upcoming-matches");
const lastUpdate = document.getElementById("lastUpdate");
const filterSelect = document.getElementById("filterSelect");

// === API Funktionen ===
async function fetchMatches(filter = "all") {
  const headers = { "x-apisports-key": API_KEY };
  let url = `${BASE_URL}/fixtures?live=all`;

  const res = await fetch(url, { headers });
  const data = await res.json();

  if (filter === "favorites") {
    return data.response.filter(m => FAVORITE_LEAGUES.includes(m.league.id));
  }
  return data.response;
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

  if (filter === "favorites") {
    return data.response.filter(m => FAVORITE_LEAGUES.includes(m.league.id));
  }
  return data.response;
}

async function fetchStats(fixtureId) {
  const headers = { "x-apisports-key": API_KEY };
  const url = `${BASE_URL}/fixtures/statistics?fixture=${fixtureId}`;
  const res = await fetch(url, { headers });
  const data = await res.json();
  return data.response;
}

// === Berechnung Torwahrscheinlichkeit & Value Bets ===
function calculateProbabilities(statsA, statsB, scoreA, scoreB, minute) {
  const getVal = (arr, type) => {
    const s = arr.find(x => x.type === type);
    return s ? parseInt(s.value) : 0;
  };

  const shotsA = getVal(statsA, "Shots on Goal");
  const shotsB = getVal(statsB, "Shots on Goal");
  const possA = getVal(statsA, "Ball Possession") || 50;
  const possB = getVal(statsB, "Ball Possession") || 50;

  const totalShots = shotsA + shotsB + 1;
  const totalPoss = possA + possB;

  const probNextA = ((shotsA / totalShots) * 0.6 + (possA / totalPoss) * 0.4) * 100;
  const probNextB = ((shotsB / totalShots) * 0.6 + (possB / totalPoss) * 0.4) * 100;
  const probNone = Math.max(0, 100 - (probNextA + probNextB));

  return {
    next: {
      teamA: Math.round(probNextA),
      teamB: Math.round(probNextB),
      none: Math.round(probNone)
    }
  };
}

function calculateValueBet(shotsA, shotsB, minute) {
  const totalShots = shotsA + shotsB;
  const expectedGoals = (totalShots * 0.12); // einfache Schätzung: 0,12 Tore pro Schuss
  const remainingTimeFactor = (90 - minute) / 90;
  const projectedGoals = expectedGoals + remainingTimeFactor * 1.2;
  const probOver25 = Math.min(100, (projectedGoals / 2.5) * 100);
  const quote = 2.00; // Beispielquote Over 2.5

  const value = (probOver25 / 100) * quote;
  return {
    probOver25: Math.round(probOver25),
    isValue: value > 1
  };
}

// === UI Funktionen ===
function createBar(label, value, color) {
  return `
    <div class="bar-label">${label} ${value}%</div>
    <div class="bar-bg"><div class="bar-fill" style="width:${value}%;background:${color};"></div></div>
  `;
}

async function renderMatches(matches, container, type = "live") {
  container.innerHTML = "";

  for (const match of matches) {
    const teamA = match.teams.home.name;
    const teamB = match.teams.away.name;
    const goalsA = match.goals.home;
    const goalsB = match.goals.away;
    const minute = match.fixture.status.elapsed || 0;

    let extraHTML = "";

    if (type === "live") {
      const stats = await fetchStats(match.fixture.id);
      if (stats.length >= 2) {
        const statsA = stats[0].statistics;
        const statsB = stats[1].statistics;

        const shotsA = parseInt(statsA.find(x => x.type === "Shots on Goal")?.value || 0);
        const shotsB = parseInt(statsB.find(x => x.type === "Shots on Goal")?.value || 0);

        const prob = calculateProbabilities(statsA, statsB, goalsA, goalsB, minute);
        const value = calculateValueBet(shotsA, shotsB, minute);

        extraHTML = `
          <strong>📊 Nächstes Tor:</strong>
          ${createBar(teamA, prob.next.teamA, "#4caf50")}
          ${createBar(teamB, prob.next.teamB, "#2196f3")}
          ${createBar("Kein Tor", prob.next.none, "#9e9e9e")}
          <hr>
          <strong>💰 Value Bet (Over 2.5):</strong>
          ${value.isValue ? `<span style="color:green;">✅ Value (${value.probOver25}% / Quote 2.00)</span>` : `<span style="color:red;">⚠️ Kein Value (${value.probOver25}%)</span>`}
        `;
      }
    }

    const card = document.createElement("div");
    card.className = "match-card";
    card.innerHTML = `
      <h3>${teamA} vs ${teamB}</h3>
      <p>${match.league.name}</p>
      ${type === "live" ? `<p>⏱️ ${minute}' | ⚽ ${goalsA}:${goalsB}</p>` : `<p>🕒 ${new Date(match.fixture.date).toLocaleString()}</p>`}
      ${extraHTML}
    `;
    container.appendChild(card);
  }
}

async function updateData() {
  const filter = filterSelect.value;
  const liveMatches = await fetchMatches(filter);
  const upcomingMatches = await fetchUpcoming(filter);

  await renderMatches(liveMatches, liveContainer, "live");
  await renderMatches(upcomingMatches, upcomingContainer, "upcoming");

  lastUpdate.textContent = "Letzte Aktualisierung: " + new Date().toLocaleTimeString();
}

// === Event Listener ===
filterSelect.addEventListener("change", updateData);
setInterval(updateData, 60000);
updateData();
