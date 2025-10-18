// ================== CONFIG ==================
const API_KEY = "c6ad1210c71b17cca24284ab8a9873b4";
const BASE_URL = "https://v3.football.api-sports.io";
const AUTO_REFRESH_INTERVAL = 60000; // 60 Sek.

let comboText = "";
let autoRefreshTimer = null;

// ================== EVENT LISTENERS ==================
document.getElementById('refresh').addEventListener('click', loadData);
document.getElementById('copy-combo').addEventListener('click', () => {
  navigator.clipboard.writeText(comboText);
  alert("Kombi kopiert ✅");
});

document.getElementById('filter-value').addEventListener('change', loadData);
document.getElementById('league-filter').addEventListener('change', loadData);
document.getElementById('match-date').addEventListener('change', loadData);
document.getElementById('time-filter').addEventListener('change', loadData);

document.getElementById('fav-league').addEventListener('click', () => {
  const leagueId = document.getElementById('league-filter').value;
  if (leagueId) {
    localStorage.setItem('favLeague', leagueId);
    alert('Favoriten-Liga gespeichert ✅');
  }
});

// ================== API FETCH ==================
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

// ================== MAIN ==================
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
}

// ================== VALUE BERECHNUNG ==================
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

function calculateOverUnderProbabilities(homeStats, awayStats) {
  const homeGoals = parseFloat(homeStats?.goals?.for?.total?.average?.home || 0);
  const awayGoals = parseFloat(awayStats?.goals?.for?.total?.average?.away || 0);
  const expectedGoals = homeGoals + awayGoals;

  const probs = {
    "Over 1.5": Math.min(0.99, expectedGoals / 2.5),
    "Over 2.5": Math.min(0.99, expectedGoals / 4),
    "Over 3.5": Math.min(0.99, expectedGoals / 5.5)
  };

  const underProbs = {};
  for (let key in probs) {
    underProbs[key.replace("Over", "Under")] = 1 - probs[key];
  }

  return { ...probs, ...underProbs };
}

function calculateBTTSProbability(homeStats, awayStats) {
  const homeScoring = parseFloat(homeStats?.goals?.for?.total?.average?.home || 0);
  const awayScoring = parseFloat(awayStats?.goals?.for?.total?.average?.away || 0);
  const pYes = Math.min(0.95, (homeScoring + awayScoring) / 3);
  const pNo = 1 - pYes;
  return { pYes, pNo };
}

function calculateValue(prob, odd) {
  if (!odd || odd <= 0) return 0;
  return prob * odd - 1;
}

// ================== RENDERING ==================
function renderMatches(matches, odds, containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  const minValue = parseFloat(document.getElementById('filter-value').value) || 0;
  const leagueFilter = document.getElementById('league-filter').value;
  const timeFilter = document.getElementById('time-filter').value;

  if (!matches || matches.length === 0) {
    container.innerHTML = "<p>Keine Spiele gefunden</p>";
    return;
  }

  matches.forEach(match => {
    // Filter: Liga
    if (leagueFilter && match.league.id != leagueFilter) return;

    // Filter: Uhrzeit
    if (timeFilter) {
      const matchTime = new Date(match.fixture.date).getHours();
      const filterHour = parseInt(timeFilter);
      if (matchTime < filterHour) return;
    }

    const o = odds.find(x => x.fixture.id === match.fixture.id);
    if (!o || o.bookmakers.length === 0) return;

    const bets = o.bookmakers[0].bets;

    const bet1x2 = bets.find(b => b.name === "Match Winner");
    const betOU = bets.filter(b => b.name.includes("Over/Under"));
    const betBTTS = bets.find(b => b.name === "Both Teams Score");

    const { pHome, pDraw, pAway } = calculateWinProbabilities(match.teams.home, match.teams.away);
    const ouProbs = calculateOverUnderProbabilities(match.teams.home, match.teams.away);
    const bttsProbs = calculateBTTSProbability(match.teams.home, match.teams.away);

    const values = [];

    if (bet1x2) {
      bet1x2.values.forEach(v => {
        const prob = v.value === "Home" ? pHome : v.value === "Draw" ? pDraw : pAway;
        const val = calculateValue(prob, parseFloat(v.odd));
        values.push({ label: v.value, odd: v.odd, val });
      });
    }

    betOU.forEach(bet => {
      bet.values.forEach(v => {
        const val = calculateValue(ouProbs[v.value], parseFloat(v.odd));
        values.push({ label: v.value, odd: v.odd, val });
      });
    });

    if (betBTTS) {
      betBTTS.values.forEach(v => {
        const prob = v.value === "Yes" ? bttsProbs.pYes : bttsProbs.pNo;
        const val = calculateValue(prob, parseFloat(v.odd));
        values.push({ label: `BTTS ${v.value}`, odd: v.odd, val });
      });
    }

    const maxVal = Math.max(...values.map(v => v.val));
    if (maxVal < minValue) return;

    const div = document.createElement("div");
    div.className = "match-card";
    if (maxVal >= 0.1) div.classList.add('card-high');
    else if (maxVal >= 0) div.classList.add('card-mid');
    else div.classList.add('card-low');

    div.innerHTML = `
      <div class="match-header">
        <div>
          <img src="${match.teams.home.logo}" alt="${match.teams.home.name}"> 
          ${match.teams.home.name}
          <span>vs</span>
          ${match.teams.away.name}
          <img src="${match.teams.away.logo}" alt="${match.teams.away.name}">
        </div>
        <span>${match.fixture.status.short}</span>
      </div>
      <div class="odds-list">
        ${values.map(v => `
          <div class="odds-item">
            <span>${v.label} @ ${v.odd}</span>
            <span class="${v.val>=0.1?'value-high':v.val>=0?'value-mid':'value-low'}">${(v.val*100).toFixed(1)}%</span>
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
    const bets = o.bookmakers[0].bets;
    bets.forEach(bet => {
      bet.values.forEach(v => {
        const val = calculateValue(1 / parseFloat(v.odd), parseFloat(v.odd));
        combos.push({ match: o.fixture, market: v.value, odd: v.odd, val });
      });
    });
  });

  combos.sort((a,b) => b.val - a.val);
  const best = combos.slice(0,3);

  let totalOdds = 1;
  let totalVal = 0;
  comboText = "";

  best.forEach(c => {
    totalOdds *= parseFloat(c.odd);
    totalVal += c.val;
    comboText += `${c.match.teams.home.name} vs ${c.match.teams.away.name} | ${c.market} | Quote: ${c.odd} | Value: ${(c.val*100).toFixed(1)}%\n`;
  });

  document.getElementById('combo-output').textContent = comboText;
  document.getElementById('total-odds').textContent = totalOdds.toFixed(2);
  document.getElementById('total-value').textContent = (totalVal*100).toFixed(1) + "%";
}

// ================== AUTO REFRESH ==================
function startAutoRefresh() {
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  autoRefreshTimer = setInterval(loadData, AUTO_REFRESH_INTERVAL);
}

// ================== INITIAL LOAD ==================
window.addEventListener('DOMContentLoaded', () => {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('match-date').value = today;

  const favLeague = localStorage.getItem('favLeague');
  if (favLeague) document.getElementById('league-filter').value = favLeague;

  loadData();
  startAutoRefresh();
});
