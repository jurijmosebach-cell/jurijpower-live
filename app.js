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
  cachedData: {},
  cachedCombos: null // Neu: Cache für Combo-Berechnungen
};

// ================== UTILS ==================
const debounce = (func, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
};

const cacheData = (key, data) => {
  state.cachedData[key] = { data, timestamp: Date.now() };
  localStorage.setItem(key, JSON.stringify(state.cachedData[key]));
};

const getCachedData = (key) => {
  const cached = JSON.parse(localStorage.getItem(key)) || {};
  return (Date.now() - (cached.timestamp || 0)) < CONFIG.CACHE_DURATION ? cached.data : null;
};

// ================== API ==================
const fetchAPI = async (endpoint, retries = CONFIG.MAX_RETRIES) => {
  const cacheKey = `api_${endpoint.replace(/[/?=]/g, '_')}`;
  let cached = getCachedData(cacheKey);
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
    cached = json;
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
  const start = performance.now();
  state.lastUpdate = new Date().toLocaleTimeString();
  document.getElementById('last-update').textContent = state.lastUpdate;

  const selectedDate = document.getElementById('match-date').value || new Date().toISOString().split('T')[0];

  const [liveFixtures, oddsLive] = await Promise.all([
    fetchAPI("/fixtures?live=all"),
    fetchAPI("/odds?live=all")
  ]);

  // Lazy-Load für Upcoming (nur bei Bedarf laden)
  let upcomingFixtures = { response: [] }, oddsUpcoming = { response: [] };
  if (selectedDate !== new Date().toISOString().split('T')[0]) { // Nur laden, wenn Datum != heute
    [upcomingFixtures, oddsUpcoming] = await Promise.all([
      fetchAPI(`/fixtures?date=${selectedDate}`),
      fetchAPI(`/odds?date=${selectedDate}`)
    ]);
  }

  renderMatches(liveFixtures.response, oddsLive.response, "live-matches");
  renderMatches(upcomingFixtures.response, oddsUpcoming.response, "upcoming-matches");

  const allOdds = [...oddsLive.response, ...oddsUpcoming.response];
  buildBestCombo(allOdds);
  fillLeagueDropdown([...liveFixtures.response, ...upcomingFixtures.response]);

  console.log(`LoadData Dauer: ${performance.now() - start}ms`);
};

// ================== LEAGUE DROPDOWN ==================
const fillLeagueDropdown = (matches) => {
  const dropdown = document.getElementById('league-filter');
  const leaguesSet = new Set(matches.map(m => `${m.league.id}|${m.league.name}`));
  dropdown.innerHTML = '<option value="">Alle Ligen</option>';
  [...leaguesSet].forEach(l => {
    const [id, name] = l.split("|");
    dropdown.add(new Option(name, id));
  });
};

// ================== VALUE CALC ==================
const calculateValue = (prob, odd) => (odd > 0 ? prob * odd - 1 : 0);

// ================== RENDER ==================
const renderMatches = (matches, odds, containerId) => {
  const start = performance.now();
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
    if (state.quickFilterMode === "top" && !isTopLeague(match.league.id)) return false;
    return true;
  });

  const fragment = document.createDocumentFragment(); // Batch DOM-Updates
  filteredMatches.sort((a, b) => (state.pinnedMatches.has(b.fixture.id) ? 1 : 0) - (state.pinnedMatches.has(a.fixture.id) ? 1 : 0))
    .forEach(match => {
      const o = odds.find(x => x?.fixture?.id === match.fixture.id);
      const div = document.createElement("div");
      div.className = "match-card" + (state.pinnedMatches.has(match.fixture.id) ? " pinned" : "");

      const pinBtn = document.createElement("button");
      pinBtn.className = "pin-btn";
      pinBtn.textContent = state.pinnedMatches.has(match.fixture.id) ? "📍" : "📌";
      pinBtn.addEventListener('click', () => {
        state.pinnedMatches.has(match.fixture.id) ? state.pinnedMatches.delete(match.fixture.id) : state.pinnedMatches.add(match.fixture.id);
        renderMatches(matches, odds, containerId); // Re-Render nur bei Pin-Änderung
      });

      if (!o?.bookmakers?.length || !o.bookmakers[0]?.bets) {
        const header = document.createElement("div");
        header.className = "match-header";
        const teamsDiv = document.createElement("div");
        teamsDiv.innerHTML = `<img src="${match.teams.home.logo || ''}" loading="lazy"> ${match.teams.home.name} <span>vs</span> ${match.teams.away.name} <img src="${match.teams.away.logo || ''}" loading="lazy">`;
        header.append(teamsDiv, pinBtn);

        const oddsList = document.createElement("div");
        oddsList.className = "odds-list";
        oddsList.innerHTML = '<div class="odds-item no-odds">❌ Quoten nicht verfügbar</div>';

        div.append(header, oddsList);
      } else {
        const bet1x2 = o.bookmakers[0].bets.find(b => b.name === "Match Winner");
        if (!bet1x2?.values?.length) {
          const header = document.createElement("div");
          header.className = "match-header";
          const teamsDiv = document.createElement("div");
          teamsDiv.innerHTML = `<img src="${match.teams.home.logo || ''}" loading="lazy"> ${match.teams.home.name} <span>vs</span> ${match.teams.away.name} <img src="${match.teams.away.logo || ''}" loading="lazy">`;
          header.append(teamsDiv, pinBtn);

          const oddsList = document.createElement("div");
          oddsList.className = "odds-list";
          oddsList.innerHTML = '<div class="odds-item no-odds">❌ Kein Match Winner-Bet</div>';

          div.append(header, oddsList);
        } else {
          const oddsArray = bet1x2.values.map(v => parseFloat(v.odd) || 0);
          const impliedProbs = oddsArray.map(o => (o > 0 ? 1 / o : 0));
          const sumProbs = impliedProbs.reduce((a, b) => a + b, 1);
          const normalizedProbs = impliedProbs.map(p => p / sumProbs);
          const maxVal = Math.max(...oddsArray.map((odd, i) => calculateValue(normalizedProbs[i], odd)));

          if (state.quickFilterMode === "value10" && maxVal < 0.1) return;
          if (maxVal < minValue) return;

          const header = document.createElement("div");
          header.className = "match-header";
          const teamsDiv = document.createElement("div");
          teamsDiv.innerHTML = `<img src="${match.teams.home.logo || ''}" loading="lazy"> ${match.teams.home.name} <span>vs</span> ${match.teams.away.name} <img src="${match.teams.away.logo || ''}" loading="lazy">`;
          header.append(teamsDiv, pinBtn);

          const oddsList = document.createElement("div");
          oddsList.className = "odds-list";
          bet1x2.values.forEach((v, i) => {
            const odd = parseFloat(v.odd) || 0;
            const val = calculateValue(normalizedProbs[i], odd);
            const cls = val >= 0.1 ? 'value-high glow' : val >= 0 ? 'value-mid' : 'value-low';
            const item = document.createElement("div");
            item.className = "odds-item";
            item.innerHTML = `<span>${v.value} @ ${v.odd}</span><span class="${cls}">${(val * 100).toFixed(1)}%</span>`;
            oddsList.appendChild(item);
          });

          div.append(header, oddsList);
        }
      }
      fragment.appendChild(div);
    });

  container.innerHTML = ""; // Vorher clearen
  container.appendChild(fragment);
  console.log(`RenderMatches Dauer (${containerId}): ${performance.now() - start}ms`);
};

// ================== TOP LEAGUES ==================
const isTopLeague = (id) => [39, 140, 135, 78, 61, 2].includes(Number(id));

// ================== COMBO ==================
const buildBestCombo = (odds) => {
  const start = performance.now();
  if (state.cachedCombos && JSON.stringify(state.cachedCombos.odds) === JSON.stringify(odds)) {
    // Verwende Cached Combo, wenn Odds gleich
    document.getElementById('combo-output').textContent = state.comboText || "Keine Value-Kombis verfügbar";
    document.getElementById('total-odds').textContent = state.cachedCombos.totalOdds.toFixed(2);
    document.getElementById('total-value').textContent = (state.cachedCombos.totalVal * 100).toFixed(1) + "%";
    return;
  }

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
        const impliedProbs = oddsArray.map(o => (o > 0 ? 1 / o : 0));
        const sumProbs = impliedProbs.reduce((a, b) => a + b, 1);
        const normalizedProbs = impliedProbs.map(p => p / sumProbs);
        return { match: o.fixture, market: v.value, odd, val: calculateValue(normalizedProbs[i], odd) };
      }));
  });

  combos.sort((a, b) => b.val - a.val);
  const best = combos.slice(0, 3);

  state.comboText = best.map(c => `${c.match.teams.home.name} vs ${c.match.teams.away.name} | ${c.market} | Quote: ${c.odd.toFixed(2)} | Value: ${(c.val * 100).toFixed(1)}%\n`).join('');
  const totalOdds = best.reduce((prod, c) => prod * c.odd, 1) || 0;
  const totalVal = best.reduce((sum, c) => sum + c.val, 0) || 0;

  document.getElementById('combo-output').textContent = state.comboText || "Keine Value-Kombis verfügbar";
  document.getElementById('total-odds').textContent = totalOdds.toFixed(2);
  document.getElementById('total-value').textContent = (totalVal * 100).toFixed(1) + "%";

  state.cachedCombos = { odds, totalOdds, totalVal }; // Cache speichern
  console.log(`BuildBestCombo Dauer: ${performance.now() - start}ms`);
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
