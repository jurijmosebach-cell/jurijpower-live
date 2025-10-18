
const API_KEY = "c6ad1210c71b17cca24284ab8a9873b4";  // 👈 Deinen Key hier eintragen
const BASE_URL = "https://app.sportdataapi.com/api/v1/soccer";
const FAVORITE_LEAGUES = [78, 79, 39, 135, 140, 61]; // Beispiel-Ligen

const liveContainer = document.getElementById("live-matches");
const upcomingContainer = document.getElementById("upcoming-matches");
const lastUpdate = document.getElementById("lastUpdate");
const refreshButton = document.getElementById("refreshButton");
const filterSelect = document.getElementById("filterSelect");

// === Hilfsfunktionen ===
function getColor(prob) {
  if (prob >= 70) return "green";
  if (prob >= 50) return "yellow";
  return "red";
}

function calcValue(prob, odd) {
  return ((prob / 100) * odd - 1) * 100;
}

async function fetchMatches(status = "live", filter = "all") {
  const today = new Date().toISOString().split("T")[0];
  const url = `${BASE_URL}/matches?apikey=${API_KEY}&date_from=${today}&date_to=${today}`;
  const res = await fetch(url);
  const data = await res.json();

  let matches = data.data || [];
  if (filter === "favorites") {
    matches = matches.filter(m => FAVORITE_LEAGUES.includes(m.competition_id));
  }

  if (status === "live") {
    matches = matches.filter(m => m.status === "inplay");
  } else {
    matches = matches.filter(m => m.status === "notstarted");
  }
  return matches;
}

async function fetchOdds(matchId) {
  const url = `${BASE_URL}/odds?apikey=${API_KEY}&match_id=${matchId}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.data && data.data.length > 0 ? data.data[0] : null;
}

async function fetchTeamStats(teamId) {
  const url = `${BASE_URL}/team?apikey=${API_KEY}&team_id=${teamId}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.data || {};
}

// Statistisch vereinfachte Wahrscheinlichkeit (Platzhalter)
function estimateProbabilities(statsHome, statsAway) {
  const goalsHome = statsHome.avg_goals_scored || 1.5;
  const goalsAway = statsAway.avg_goals_scored || 1.2;

  const pHome = Math.min(90, Math.round((goalsHome / (goalsHome + goalsAway)) * 100));
  const pAway = Math.min(90, Math.round((goalsAway / (goalsHome + goalsAway)) * 100));
  const pDraw = Math.max(10, 100 - (pHome + pAway));

  const expectedGoals = goalsHome + goalsAway;
  const pOver = Math.min(95, Math.round((expectedGoals / 4) * 100));
  const pUnder = 100 - pOver;

  return { pHome, pDraw, pAway, pOver, pUnder };
}

function displayMatches(container, matches) {
  container.innerHTML = "";

  if (matches.length === 0) {
    container.innerHTML = `<p class="no-matches">❌ Keine Spiele gefunden.</p>`;
    return;
  }

  // Sortieren nach höchstem Value
  matches.sort((a, b) => (b.bestValue || 0) - (a.bestValue || 0));

  matches.forEach(match => {
    const div = document.createElement("div");
    div.classList.add("match-card");

    div.innerHTML = `
      <div class="match-header">
        <span>${match.home_team.name} vs ${match.away_team.name}</span>
        <span>${match.status === "inplay" ? "LIVE" : match.match_start.slice(11, 16)}</span>
      </div>
    `;

    if (match.valueOptions) {
      match.valueOptions.forEach(opt => {
        const betDiv = document.createElement("div");
        betDiv.classList.add("bet-option", opt.color);
        betDiv.textContent = `${opt.label}: ${opt.prob}% | Quote ${opt.odd} | Value ${opt.value.toFixed(1)}%`;
        div.appendChild(betDiv);
      });
    }

    container.appendChild(div);
  });
}

async function processMatches(status, container) {
  const filter = filterSelect.value;
  const matches = await fetchMatches(status, filter);

  for (let m of matches) {
    const [statsHome, statsAway, odds] = await Promise.all([
      fetchTeamStats(m.home_team.team_id),
      fetchTeamStats(m.away_team.team_id),
      fetchOdds(m.match_id)
    ]);

    const probs = estimateProbabilities(statsHome, statsAway);
    const options = [];

    if (odds && odds.bookmakers && odds.bookmakers[0]) {
      const market = odds.bookmakers[0].odds;
      const homeOdd = market["1"] || 2.0;
      const drawOdd = market["X"] || 3.0;
      const awayOdd = market["2"] || 3.5;
      const overOdd = market["Over 2.5"] || 1.9;
      const underOdd = market["Under 2.5"] || 2.0;

      const bets = [
        { label: "1", prob: probs.pHome, odd: homeOdd },
        { label: "X", prob: probs.pDraw, odd: drawOdd },
        { label: "2", prob: probs.pAway, odd: awayOdd },
        { label: "Over 2.5", prob: probs.pOver, odd: overOdd },
        { label: "Under 2.5", prob: probs.pUnder, odd: underOdd }
      ];

      bets.forEach(b => {
        const value = calcValue(b.prob, b.odd);
        const color = getColor(b.prob);
        options.push({ ...b, value, color });
      });

      options.sort((a, b) => b.value - a.value);
      m.valueOptions = options;
      m.bestValue = options[0].value;
    }
  }

  displayMatches(container, matches);
}

// === Events ===
refreshButton.addEventListener("click", updateData);
filterSelect.addEventListener("change", updateData);

// === Initialisierung ===
async function updateData() {
  await Promise.all([
    processMatches("live", liveContainer),
    processMatches("upcoming", upcomingContainer)
  ]);
  lastUpdate.textContent = `🕒 ${new Date().toLocaleTimeString()}`;
}

updateData();
setInterval(updateData, 60000);
