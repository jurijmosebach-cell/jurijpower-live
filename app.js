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
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: "GET",
      headers: {
        "x-apisports-key": API_KEY,
        "accept": "application/json"
      }
    });
    if (!response.ok) throw new Error(`HTTP-Fehler: ${response.status}`);
    const json = await response.json();
    if (!json.response) throw new Error("Ungültige API-Antwort");
    return json;
  } catch (e) {
    console.error("❌ API Fehler:", e.message);
    document.getElementById('status-message').textContent = `❌ API-Fehler: ${e.message}`;
    setTimeout(() => document.getElementById('status-message').textContent = '', 5000);
    return { response: [] };
  }
}

// ================== LOAD DATA ==================
async function loadData() {
  document.getElementById('last-update').textContent = new Date().toLocaleTimeString();

  const selectedDate = document.getElementById('match-date').value || new Date().toISOString().split('T')[0];

  const [liveFixtures, upcomingFixtures, oddsLive, oddsUpcoming] = await Promise.all([
    fetchAPI("/fixtures?live=all"),
    fetchAPI(`/fixtures?date=${selectedDate}`),
    fetchAPI("/odds?live=all"),
    fetchAPI(`/odds?date=${selectedDate}`)
  ]);

  console.log("📅 Datum:", selectedDate);
  console.log("🎯 Fixtures Live:", liveFixtures);
  console.log("🎯 Fixtures Upcoming:", upcomingFixtures);
  console.log("💰 Odds Live:", oddsLive);
  console.log("💰 Odds Upcoming:", oddsUpcoming);

  // Selektives Rendern nur bei Änderungen (vereinfacht hier)
  renderMatches(liveFixtures.response, oddsLive.response, "live-matches");
  renderMatches(upcomingFixtures.response, oddsUpcoming.response, "upcoming-matches");

  buildBestCombo([...oddsLive.response, ...oddsUpcoming.response]);
  fillLeagueDropdown([...liveFixtures.response, ...upcomingFixtures.response]);
}

// ================== LEAGUE DROPDOWN ==================
function fillLeagueDropdown(matches) {
  const dropdown = document.getElementById('league-filter');
  const leagues = [...new Set(matches.map(m => `${m.league.id}|${m.league.name}`))];
  dropdown.innerHTML = '<option value="">Alle Ligen</option>';
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
    if (teamSearch &&
      !match.teams.home.name.toLowerCase().includes(teamSearch) &&
      !match.teams.away.name.toLowerCase().includes(teamSearch)
    ) return;

    if (quickFilterMode === "top" && !isTopLeague(match.league.id)) return;

    const o = odds.find(x => x.fixture.id === match.fixture.id);

    const div = document.createElement("div");
    div.className = "match-card";
    if (pinnedMatches.has(match.fixture.id)) div.classList.add("pinned");

    // 🟡 Wenn KEINE Quoten vorhanden sind → trotzdem Match anzeigen
    if (!o || !o.bookmakers || o.bookmakers.length === 0) {
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
          <div class="odds-item no-odds">❌ Quoten noch nicht verfügbar</div>
        </div>
      `;
      div.querySelector(".pin-btn").addEventListener('click', () => {
        if (pinnedMatches.has(match.fixture.id)) pinnedMatches.delete(match.fixture.id);
        else pinnedMatches.add(match.fixture.id);
        loadData();
      });
      container.appendChild(div);
      return;
    }

    // ✅ Quoten vorhanden → normal rendern
    const bets = o.bookmakers[0]?.bets || [];
    const bet1x2 = bets.find(b => b.name === "Match Winner");
    if (!bet1x2) return;

    const oddsArray = bet1x2.values.map(v => parseFloat(v.odd) || 0);
    const impliedProbs = oddsArray.map(o => o ? 1 / o : 0);
    const sumProbs = impliedProbs.reduce((a, b) => a + b, 0) || 1;
    const normalizedProbs = impliedProbs.map(p => p / sumProbs);

    const maxVal = Math.max(...oddsArray.map((odd, i) => calculateValue(normalizedProbs[i], odd)));
    if (quickFilterMode === "value10" && maxVal < 0.1) return;
    if (maxVal < minValue) return;

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
          const odd = parseFloat(v.odd) || 0;
          const val = calculateValue(normalizedProbs[i], odd);
          let cls = val >= 0.1 ? 'value-high' : val >= 0 ? 'value-mid' : 'value-low';
          if (val >= 0.1) cls += ' glow';
          return `
            <div class="odds-item">
              <span>${v.value} @ ${v.odd}</span>
              <span class="${cls}">${(val * 100).toFixed(1)}%</span>
            </div>
          `;
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

// ================== TOP LEAGUES ==================
function isTopLeague(id) {
  const top = [39, 140, 135, 78, 61, 2];
  return top.includes(Number(id));
}

// ================== COMBO ==================
function buildBestCombo(odds) {
  if (!odds || odds.length === 0) {
    document.getElementById('combo-output').textContent = "Keine Quoten verfügbar";
    document.getElementById('total-odds').textContent = "0.00";
    document.getElementById('total-value').textContent = "0%";
    return;
  }

  const combos = [];

  odds.forEach(o => {
    if (!o.bookmakers || o.bookmakers.length === 0) return;
    const bets = o.bookmakers[0]?.bets || [];
    const match = o.fixture;

    bets.forEach(bet => {
      if (bet.name !== "Match Winner") return;
      const oddsArray = bet.values.map(v => parseFloat(v.odd) || 0);
      const impliedProbs = oddsArray.map(o => o ? 1 / o : 0);
      const sumProbs = impliedProbs.reduce((a, b) => a + b, 0) || 1;
      const normalizedProbs = impliedProbs.map(p => p / sumProbs);

      bet.values.forEach((v, i) => {
        const odd = parseFloat(v.odd) || 0;
        const val = calculateValue(normalizedProbs[i], odd);
        combos.push({ match, market: v.value, odd, val });
      });
    });
  });

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

  document.getElementById('combo-output').textContent = comboText || "Keine Value-Kombis verfügbar";
  document.getElementById('total-odds').textContent = totalOdds.toFixed(2);
  document.getElementById('total-value').textContent = (totalVal * 100).toFixed(1) + "%";
}

// ================== INIT ==================
window.addEventListener('DOMContentLoaded', () => {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('match-date').value = today;
  loadData();
});
