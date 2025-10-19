// ================== CONFIG ==================
const CONFIG = {
  API_KEY: "c6ad1210c71b17cca24284ab8a9873b4",
  BASE_URL: "https://v3.football.api-sports.io",
  CACHE_DURATION: 5 * 60 * 1000, // 5 Minuten Cache
  MAX_RETRIES: 2,
  RETRY_DELAY: 2000 // 2 Sekunden
};

let state = {
  comboText: "",
  pinnedMatches: new Set(),
  quickFilterMode: "all",
  lastUpdate: null,
  cachedData: {}
};

// ================== UTILS ==================
const debounce = (func, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(null, args), delay);
  };
};

const cacheData = (key, data) => {
  state.cachedData[key] = { data, timestamp: Date.now() };
  localStorage.setItem(key, JSON.stringify(state.cachedData[key]));
};

const getCachedData = (key) => {
  const cached = JSON.parse(localStorage.getItem(key));
  return cached && (Date.now() - cached.timestamp) < CONFIG.CACHE_DURATION ? cached.data : null;
};

// ================== API ==================
const fetchAPI = async (endpoint, retries = CONFIG.MAX_RETRIES) => {
  const cacheKey = `api_${endpoint.replace(/[/?=]/g, '_')}`;
  const cached = getCachedData(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetch(`${CONFIG.BASE_URL}${endpoint}`, {
      method: "GET",
      headers: {
        "x-apisports-key": CONFIG.API_KEY,
        "accept": "application/json"
      }
    });
    if (!response.ok) {
      if (response.status === 429 && retries > 0) {
        await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY));
        return fetchAPI(endpoint, retries - 1);
      }
      throw new Error(`HTTP-Fehler: ${response.status}`);
    }
    const json = await response.json();
    if (!json.response) throw new Error("Ungültige API-Antwort");
    cacheData(cacheKey, json);
    return json;
  } catch (e) {
    console.error("❌ API Fehler:", e.message);
    if (e.message.includes('429')) {
      document.getElementById('status-message').textContent = '⚠️ API-Limit erreicht! Warte oder upgrade deinen Plan.';
    } else {
      document.getElementById('status-message').textContent = `❌ API-Fehler: ${e.message}`;
    }
    setTimeout(() => document.getElementById('status-message').textContent = '', 8000);
    return { response: [] };
  }
};

// ================== LOAD DATA ==================
const loadData = async () => {
  state.lastUpdate = new Date().toLocaleTimeString();
  document.getElementById('last-update').textContent = state.lastUpdate;

  const selectedDate = document.getElementById('match-date').value || new Date().toISOString().split('T')[0];

  const [liveFixtures, upcomingFixtures, oddsLive, oddsUpcoming] = await Promise.all([
    fetchAPI("/fixtures?live=all"),
    fetchAPI(`/fixtures?date=${selectedDate}`),
    fetchAPI("/odds?live=all"),
    fetchAPI(`/odds?date=${selectedDate}`)
  ]);

  renderMatches(liveFixtures.response, oddsLive.response, "live-matches");
  renderMatches(upcomingFixtures.response, oddsUpcoming.response, "upcoming-matches");
  buildBestCombo([...oddsLive.response, ...oddsUpcoming.response]);
  fillLeagueDropdown([...liveFixtures.response, ...upcomingFixtures.response]);
};

// ================== LEAGUE DROPDOWN ==================
const fillLeagueDropdown = (matches) => {
  const dropdown = document.getElementById('league-filter');
  const leagues = [...new Set(matches.map(m => `${m.league.id}|${m.league.name}`))];
  dropdown.innerHTML = '<option value="">Alle Ligen</option>';
  leagues.forEach(l => {
    const [id, name] = l.split("|");
    const option = new Option(name, id);
    dropdown.add(option);
  });
};

// ================== VALUE CALC ==================
const calculateValue = (prob, odd) => (!odd || odd <= 0) ? 0 : prob * odd - 1;

// ================== RENDER ==================
const renderMatches = (matches, odds, containerId) => {
  const container = document.getElementById(containerId);
  if (!matches?.length) {
    container.innerHTML = "<p>Keine Spiele gefunden</p>";
    return;
  }

  const minValue = parseFloat(document.getElementById('filter-value').value) || 0;
  const leagueFilter = document.getElementById('league-filter').value;
  const teamSearch = document.getElementById('team-search').value.toLowerCase();

  const filteredMatches = matches.filter(match => {
    if (leagueFilter && match.league.id != leagueFilter) return false;
    if (teamSearch && !match.teams.home.name.toLowerCase().includes(teamSearch) && !match.teams.away.name.toLowerCase().includes(teamSearch)) return false;
    if (quickFilterMode === "top" && !isTopLeague(match.league.id)) return false;
    return true;
  });

  container.innerHTML = "";
  filteredMatches.sort((a, b) => (state.pinnedMatches.has(b.fixture.id) ? 1 : 0) - (state.pinnedMatches.has(a.fixture.id) ? 1 : 0)).forEach(match => {
    const o = odds.find(x => x.fixture.id === match.fixture.id);
    const div = document.createElement("div");
    div.className = "match-card" + (state.pinnedMatches.has(match.fixture.id) ? " pinned" : "");

    if (!o?.bookmakers?.length || !o.bookmakers[0].bets) {
      div.innerHTML = `
        <div class="match-header">
          <div><img src="${match.teams.home.logo || ''}"> ${match.teams.home.name} <span>vs</span> ${match.teams.away.name} <img src="${match.teams.away.logo || ''}"></div>
          <button class="pin-btn">${state.pinnedMatches.has(match.fixture.id) ? "📍" : "📌"}</button>
        </div>
        <div class="odds-list"><div class="odds-item no-odds">❌ Quoten nicht verfügbar</div></div>
      `;
    } else {
      const bet1x2 = o.bookmakers[0].bets.find(b => b.name === "Match Winner");
      if (!bet1x2?.values?.length) {
        div.innerHTML = `
          <div class="match-header">
            <div><img src="${match.teams.home.logo || ''}"> ${match.teams.home.name} <span>vs</span> ${match.teams.away.name} <img src="${match.teams.away.logo || ''}"></div>
            <button class="pin-btn">${state.pinnedMatches.has(match.fixture.id) ? "📍" : "📌"}</button>
          </div>
          <div class="odds-list"><div class="odds-item no-odds">❌ Kein Match Winner-Bet</div></div>
        `;
      } else {
        const oddsArray = bet1x2.values.map(v => parseFloat(v.odd) || 0);
        const impliedProbs = oddsArray.map(o => o ? 1 / o : 0);
        const sumProbs = impliedProbs.reduce((a, b) => a + b, 1);
        const normalizedProbs = impliedProbs.map(p => p / sumProbs);
        const maxVal = Math.max(...oddsArray.map((odd, i) => calculateValue(normalizedProbs[i], odd)));

        if (quickFilterMode === "value10" && maxVal < 0.1) return;
        if (maxVal < minValue) return;

        div.innerHTML = `
          <div class="match-header">
            <div><img src="${match.teams.home.logo || ''}"> ${match.teams.home.name} <span>vs</span> ${match.teams.away.name} <img src="${match.teams.away.logo || ''}"></div>
            <button class="pin-btn">${state.pinnedMatches.has(match.fixture.id) ? "📍" : "📌"}</button>
          </div>
          <div class="odds-list">
            ${bet1x2.values.map((v, i) => {
              const odd = parseFloat(v.odd) || 0;
              const val = calculateValue(normalizedProbs[i], odd);
              const cls = val >= 0.1 ? 'value-high glow' : val >= 0 ? 'value-mid' : 'value-low';
              return `<div class="odds-item"><span>${v.value} @ ${v.odd}</span><span class="${cls}">${(val * 100).toFixed(1)}%</span></div>`;
            }).join('')}
          </div>
        `;
      }
    }

    div.querySelector(".pin-btn").addEventListener('click', () => {
      state.pinnedMatches.has(match.fixture.id) ? state.pinnedMatches.delete(match.fixture.id) : state.pinnedMatches.add(match.fixture.id);
      renderMatches(matches, odds, containerId);
    });
    container.appendChild(div);
  });
};

// ================== TOP LEAGUES ==================
const isTopLeague = (id) => [39, 140, 135, 78, 61, 2].includes(Number(id));

// ================== COMBO ==================
const buildBestCombo = (odds) => {
  if (!odds?.length) {
    document.getElementById('combo-output').textContent = "Keine Quoten verfügbar";
    document.getElementById('total-odds').textContent = "0.00";
    document.getElementById('total-value').textContent = "0%";
    return;
  }

  const combos = odds.flatMap(o => {
    if (!o.bookmakers?.length) return [];
    return o.bookmakers[0].bets
      .filter(bet => bet.name === "Match Winner")
      .flatMap(bet => bet.values.map((v, i) => {
        const odd = parseFloat(v.odd) || 0;
        const oddsArray = bet.values.map(v => parseFloat(v.odd) || 0);
        const impliedProbs = oddsArray.map(o => o ? 1 / o : 0);
        const sumProbs = impliedProbs.reduce((a, b) => a + b, 1);
        const normalizedProbs = impliedProbs.map(p => p / sumProbs);
        return { match: o.fixture, market: v.value, odd, val: calculateValue(normalizedProbs[i], odd) };
      }));
  });

  combos.sort((a, b) => b.val - a.val);
  const best = combos.slice(0, 3);

  state.comboText = best.reduce((text, c) => {
    const totalOdds = best.reduce((prod, c) => prod * c.odd, 1);
    const totalVal = best.reduce((sum, c) => sum + c.val, 0);
    return text + `${c.match.teams.home.name} vs ${c.match.teams.away.name} | ${c.market} | Quote: ${c.odd.toFixed(2)} | Value: ${(c.val * 100).toFixed(1)}%\n`;
  }, "");
  document.getElementById('combo-output').textContent = state.comboText || "Keine Value-Kombis verfügbar";
  document.getElementById('total-odds').textContent = (best.reduce((prod, c) => prod * c.odd, 1) || 0).toFixed(2);
  document.getElementById('total-value').textContent = (best.reduce((sum, c) => sum + c.val, 0) * 100 || 0).toFixed(1) + "%";
};

// ================== EVENT LISTENERS (OPTIMIZED) ==================
const initEventListeners = () => {
  document.getElementById('refresh').addEventListener('click', loadData);
  document.getElementById('copy-combo').addEventListener('click', () => {
    navigator.clipboard.writeText(state.comboText);
    alert("Kombi kopiert ✅");
  });
  document.getElementById('filter-value').addEventListener('change', debounce(loadData, 300));
  document.getElementById('league-filter').addEventListener('change', debounce(loadData, 300));
  document.getElementById('match-date').addEventListener('change', debounce(loadData, 300));
  document.getElementById('team-search').addEventListener('input', debounce(loadData, 500));
  document.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.quickFilterMode = btn.dataset.type;
      loadData();
    });
  });
};

// ================== INIT ==================
window.addEventListener('DOMContentLoaded', () => {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('match-date').value = today;
  initEventListeners();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(err => console.error('❌ SW Fehler:', err));
  }
  loadData();
});
