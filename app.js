// ================== CONFIG ==================
const API_KEY = "c6ad1210c71b17cca24284ab8a9873b4"; // ⬅️ hier deinen eigenen Key eintragen!
const BASE_URL = "https://v3.football.api-sports.io";

let comboText = "";
const CACHE_DURATION = 60 * 1000; // 1 Minute Caching

// ================== EVENT LISTENERS ==================
document.getElementById('refresh').addEventListener('click', loadData);
document.getElementById('copy-combo').addEventListener('click', () => {
  navigator.clipboard.writeText(comboText);
  alert("Kombi kopiert ✅");
});
document.getElementById('filter-value').addEventListener('change', loadData);
document.getElementById('league-filter').addEventListener('change', loadData);
document.getElementById('match-date').addEventListener('change', loadData);

// ================== API + CACHE ==================
async function fetchWithCache(endpoint) {
  const cacheKey = `cache_${endpoint}`;
  const cached = localStorage.getItem(cacheKey);

  if (cached) {
    const data = JSON.parse(cached);
    if (Date.now() - data.timestamp < CACHE_DURATION) {
      return data.response;
    }
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    headers: {
      "x-apisports-key": API_KEY,
      "accept": "application/json"
    }
  });

  const json = await response.json();
  localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), response: json.response }));
  return json.response;
}

// ================== MAIN ==================
async function loadData() {
  document.getElementById('last-update').textContent = new Date().toLocaleTimeString();
  const selectedDate = document.getElementById('match-date').value || new Date().toISOString().split('T')[0];

  const liveFixtures = await fetchWithCache("/fixtures?live=all");
  const upcomingFixtures = await fetchWithCache(`/fixtures?date=${selectedDate}`);

  const oddsLive = await fetchWithCache("/odds?live=all");
  const oddsUpcoming = await fetchWithCache(`/odds?date=${selectedDate}`);

  renderMatches(liveFixtures, oddsLive, "live-matches");
  renderMatches(upcomingFixtures, oddsUpcoming, "upcoming-matches");
  buildBestCombo([...oddsLive, ...oddsUpcoming]);
}

// ================== VALUE BERECHNUNG ==================
function calculateValue(prob, odd) {
  if (!odd || odd <= 0) return 0;
  return prob * odd - 1;
}

function calculateWinProbabilities(homeStats, awayStats) {
  const homeForm = homeStats?.form || "";
  const awayForm = awayStats?.form || "";

  const homeWins = (homeForm.match(/W/g) || []).length;
  const awayWins = (awayForm.match(/W/g) || []).length;
  const games = Math.max(homeForm.length, awayForm.length, 1);

  const homeGoals = parseFloat(homeStats?.goals?.for?.total?.average?.home || 0);
  const awayGoals = parseFloat(awayStats?.goals?.for?.total?.average?.away || 0);

  const pHome = (homeWins / games) * 0.6 + (homeGoals / (homeGoals + awayGoals + 0.01)) * 0.4;
  const pAway = (awayWins / games) * 0.6 + (awayGoals / (homeGoals + awayGoals + 0.01)) * 0.4;
  const pDraw = Math.max(0, 1 - pHome - pAway);

  return { pHome, pDraw, pAway };
}

// ================== RENDERING ==================
function renderMatches(matches, odds, containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  const minValue = parseFloat(document.getElementById('filter-value').value) || 0;
  const leagueFilter = document.getElementById('league-filter').value;

  if (!matches || matches.length === 0) {
    container.innerHTML = "<p>Keine Spiele gefunden</p>";
    return;
  }

  matches.forEach(match => {
    if (leagueFilter && match.league.id != leagueFilter) return;

    const o = odds.find(x => x.fixture.id === match.fixture.id);
    if (!o || !o.bookmakers || o.bookmakers.length === 0) return;

    const bets = o.bookmakers[0].bets;
    const bet1x2 = bets.find(b => b.name === "Match Winner");
    if (!bet1x2) return;

    const { pHome, pDraw, pAway } = calculateWinProbabilities(match.teams.home, match.teams.away);

    const values = [];
    bet1x2.values.forEach(v => {
      const prob = v.value === "Home" ? pHome : v.value === "Draw" ? pDraw : pAway;
      const val = calculateValue(prob, parseFloat(v.odd));
      values.push({ label: v.value, odd: v.odd, val });
    });

    const maxVal = Math.max(...values.map(v => v.val));
    if (maxVal < minValue) return;

    // 🏟️ Team Logos + 🏆 Liga Logo
    const div = document.createElement("div");
    div.className = "match-card";

    if (maxVal >= 0.1) div.classList.add('card-high');
    else if (maxVal >= 0) div.classList.add('card-mid');
    else div.classList.add('card-low');

    div.innerHTML = `
      <div class="match-teams">
        <div class="team">
          <img src="${match.teams.home.logo}" alt="${match.teams.home.name}">
          <span>${match.teams.home.name}</span>
        </div>
        <div class="team">
          <img src="${match.teams.away.logo}" alt="${match.teams.away.name}">
          <span>${match.teams.away.name}</span>
        </div>
      </div>
      <div class="league-info">
        <img src="${match.league.logo}" alt="${match.league.name}">
        <span>${match.league.name}</span>
      </div>
      <div class="match-info">
        <span>${match.fixture.status.short}</span>
        <span>${match.fixture.date.split("T")[1].slice(0,5)}</span>
      </div>
      <div class="odds-list">
        ${values.map(v => `
          <div class="odds-item">
            <span>${v.label} @ ${v.odd}</span>
            <span class="${v.val>=0.1?'value good':v.val>=0?'value medium':'value low'}">
              ${(v.val*100).toFixed(1)}%
            </span>
          </div>
        `).join('')}
      </div>
    `;

    container.appendChild(div);
  });
}

// ================== BEST COMBO ==================
function buildBestCombo(odds) {
  if (!odds || odds.length === 0) return;

  const combos = [];

  odds.forEach(o => {
    if (!o.bookmakers || o.bookmakers.length === 0) return;
    const bets = o.bookmakers[0].bets;
    bets.forEach(bet => {
      bet.values.forEach(v => {
        const val = calculateValue(1 / parseFloat(v.odd), parseFloat(v.odd));
        combos.push({ match: o.fixture, market: v.value, odd: v.odd, val });
      });
    });
  });

  combos.sort((a, b) => b.val - a.val);
  const best = combos.slice(0, 3);

  let totalOdds = 1;
  let totalVal = 0;
  comboText = "";

  best.forEach(c => {
    totalOdds *= parseFloat(c.odd);
    totalVal += c.val;
    comboText += `${c.match.teams.home.name} vs ${c.match.teams.away.name} | ${c.market} | Quote: ${c.odd} | Value: ${(c.val * 100).toFixed(1)}%\n`;
  });

  document.getElementById('combo-output').textContent = comboText;
  document.getElementById('total-odds').textContent = totalOdds.toFixed(2);
  document.getElementById('total-value').textContent = (totalVal * 100).toFixed(1) + "%";
}

// ================== INITIAL LOAD ==================
window.addEventListener('DOMContentLoaded', () => {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('match-date').value = today;
  loadData();
});
