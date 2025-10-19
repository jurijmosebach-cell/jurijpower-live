// ================== CONFIG ==================
const API_KEY = "c6ad1210c71b17cca24284ab8a9873b4";
const BASE_URL = "https://v3.football.api-sports.io";
let comboText = "";
let pinnedMatches = new Set();
let quickFilterMode = "all";

// ================== EVENT LISTENERS ==================
document.getElementById('refresh').addEventListener('click', loadData);
document.getElementById('copy-combo').addEventListener('click', () => {
  navigator.clipboard.writeText(comboText);
  alert("Kombi kopiert ✅");
});
document.getElementById('filter-value').addEventListener('change', loadData);
document.getElementById('league-filter').addEventListener('change', loadData);
document.getElementById('match-date').addEventListener('change', loadData);
document.getElementById('team-search').addEventListener('input', loadData);
document.querySelectorAll('.quick-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    quickFilterMode = btn.dataset.type;
    loadData();
  });
});

// ================== API ==================
async function fetchAPI(endpoint) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method: "GET",
    headers: {
      "x-apisports-key": API_KEY,
      "accept": "application/json"
    }
  });
  return response.json();
}

// ================== LOAD DATA ==================
async function loadData() {
  document.getElementById('last-update').textContent = new Date().toLocaleTimeString();

  const selectedDate = document.getElementById('match-date').value || new Date().toISOString().split('T')[0];
  const liveFixtures = await fetchAPI("/fixtures?live=all");
  const upcomingFixtures = await fetchAPI(`/fixtures?date=${selectedDate}`);
  const oddsLive = await fetchAPI("/odds?live=all");
  const oddsUpcoming = await fetchAPI(`/odds?date=${selectedDate}`);

  renderMatches(liveFixtures.response, oddsLive.response, "live-matches");
  renderMatches(upcomingFixtures.response, oddsUpcoming.response, "upcoming-matches");

  buildBestCombo([...oddsLive.response, ...oddsUpcoming.response]);
  fillLeagueDropdown([...liveFixtures.response, ...upcomingFixtures.response]);
}

// ================== LEAGUE DROPDOWN ==================
function fillLeagueDropdown(matches) {
  const dropdown = document.getElementById('league-filter');
  const leagues = [...new Set(matches.map(m => `${m.league.id}|${m.league.name}`))];
  dropdown.innerHTML = `<option value="">Alle Ligen</option>`;
  leagues.forEach(l => {
    const [id, name] = l.split("|");
    const option = document.createElement("option");
    option.value = id;
    option.textContent = name;
    dropdown.appendChild(option);
  });
}

// ================== VALUE CALC ==================
function calculateValue(prob, odd) {
  if (!odd || odd <= 0) return 0;
  return prob * odd - 1;
}

// ================== RENDER ==================
function renderMatches(matches, odds, containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  const minValue = parseFloat(document.getElementById('filter-value').value) || 0;
  const leagueFilter = document.getElementById('league-filter').value;
  const teamSearch = document.getElementById('team-search').value.toLowerCase();

  if (!matches || matches.length === 0) {
    container.innerHTML = "<p>Keine Spiele gefunden</p>";
    return;
  }

  matches.sort((a, b) => (pinnedMatches.has(b.fixture.id) ? 1 : 0) - (pinnedMatches.has(a.fixture.id) ? 1 : 0));

  matches.forEach(match => {
    if (leagueFilter && match.league.id != leagueFilter) return;
    if (teamSearch && !match.teams.home.name.toLowerCase().includes(teamSearch) && !match.teams.away.name.toLowerCase().includes(teamSearch)) return;
    if (quickFilterMode === "top" && !isTopLeague(match.league.id)) return;

    const o = odds.find(x => x.fixture.id === match.fixture.id);
    if (!o || o.bookmakers.length === 0) return;

    const bets = o.bookmakers[0].bets;
    const bet1x2 = bets.find(b => b.name === "Match Winner");
    if (!bet1x2) return;

    // Marktquoten normalisieren
    const oddsArray = bet1x2.values.map(v => parseFloat(v.odd));
    const impliedProbs = oddsArray.map(o => 1 / o);
    const sumProbs = impliedProbs.reduce((a, b) => a + b, 0);
    const normalizedProbs = impliedProbs.map(p => p / sumProbs);

    // Maximales Value berechnen für Filter
    const maxVal = Math.max(...oddsArray.map((odd, i) => calculateValue(normalizedProbs[i], odd)));
    if (quickFilterMode === "value10" && maxVal < 0.1) return;
    if (maxVal < minValue) return;

    const div = document.createElement("div");
    div.className = "match-card";
    if (pinnedMatches.has(match.fixture.id)) div.classList.add("pinned");

    div.innerHTML = `
      <div class="match-header">
        <div>
          <img src="${match.teams.home.logo}"> ${match.teams.home.name} 
          <span>vs</span>
          ${match.teams.away.name} <img src="${match.teams.away.logo}">
        </div>
        <button class="pin-btn">${pinnedMatches.has(match.fixture.id) ? "📍" : "📌"}</button>
      </div>
      <div class="odds-list">
        ${bet1x2.values.map((v, i) => {
          const odd = parseFloat(v.odd);
          const val = calculateValue(normalizedProbs[i], odd);
          const cls = val >= 0.1 ? 'value-high' : val >= 0 ? 'value-mid' : 'value-low';
          return `<div class="odds-item"><span>${v.value} @ ${v.odd}</span><span class="${cls}">${(val * 100).toFixed(1)}%</span></div>`;
        }).join('')}
      </div>
    `;

    div.querySelector(".pin-btn").addEventListener('click', () => {
      if (pinnedMatches.has(match.fixture.id)) pinnedMatches.delete(match.fixture.id);
      else pinnedMatches.add(match.fixture.id);
      loadData();
    });

    container.appendChild(div);
  });
}

function isTopLeague(id) {
  const top = [39, 140, 135, 78, 61, 2]; // Premier League, La Liga, Serie A, Bundesliga, Ligue 1, CL
  return top.includes(Number(id));
}

// ================== COMBO ==================
function buildBestCombo(odds) {
  if (!odds || odds.length === 0) return;
  const combos = [];

  odds.forEach(o => {
    if (!o.bookmakers || o.bookmakers.length === 0) return;

    const bets = o.bookmakers[0].bets;
    const match = o.fixture;

    bets.forEach(bet => {
      // Nur 1X2 Markt berücksichtigen
      if (bet.name !== "Match Winner") return;

      const oddsArray = bet.values.map(v => parseFloat(v.odd));
      const impliedProbs = oddsArray.map(o => 1 / o);
      const sumProbs = impliedProbs.reduce((a, b) => a + b, 0);
      const normalizedProbs = impliedProbs.map(p => p / sumProbs);

      bet.values.forEach((v, i) => {
        const odd = parseFloat(v.odd);
        const val = calculateValue(normalizedProbs[i], odd);
        combos.push({
          match,
          market: v.value,
          odd,
          val
        });
      });
    });
  });

  // Sortieren nach Value
  combos.sort((a, b) => b.val - a.val);
  const best = combos.slice(0, 3);

  comboText = "";
  let totalOdds = 1;
  let totalVal = 0;

  best.forEach(c => {
    totalOdds *= c.odd;
    totalVal += c.val;
    comboText += `${c.match.teams.home.name} vs ${c.match.teams.away.name} | ${c.market} | Quote: ${c.odd.toFixed(2)} | Value: ${(c.val * 100).toFixed(1)}%\n`;
  });

  document.getElementById('combo-output').textContent = comboText;
  document.getElementById('total-odds').textContent = totalOdds.toFixed(2);
  document.getElementById('total-value').textContent = (totalVal * 100).toFixed(1) + "%";
}

// ================== INIT ==================
window.addEventListener('DOMContentLoaded', () => {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('match-date').value = today;
  loadData();
});
