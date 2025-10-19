// ================== CONFIG & STATE ==================
const CONFIG = { API_KEY: "c6ad1210c71b17cca24284ab8a9873b4", BASE_URL: "https://v3.football.api-sports.io", CACHE_DURATION: 5*60*1000, MAX_RETRIES: 2, RETRY_DELAY: 2000 };
let state = { comboText: "", pinnedMatches: new Set(), quickFilterMode: "all", lastUpdate: null, cachedData: {}, cachedCombos: null, understat: {} };

// ================== UTILS ==================
const debounce = (func, delay) => { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => func(...args), delay); }; };
const cacheData = (k, d) => (state.cachedData[k] = { data: d, timestamp: Date.now() }, localStorage.setItem(k, JSON.stringify(state.cachedData[k])));
const getCachedData = (k) => { const c = JSON.parse(localStorage.getItem(k)) || {}; return (Date.now() - (c.timestamp || 0)) < CONFIG.CACHE_DURATION ? c.data : null; };

// ================== UNDERSTAT ==================
const fetchUnderstatTeamData = async (l, s) => {
  const k = `understat_${l}_${s}`, c = getCachedData(k);
  if (c) return c;
  const r = await fetch(`https://understat.com/league/${l}/${s}`);
  if (!r.ok) throw new Error(`HTTP-Fehler: ${r.status}`);
  const t = await r.text(), m = t.match(/var teamsData\s*=\s*JSON.parse\('(.*?)'\)/);
  const d = m ? JSON.parse(decodeURIComponent(JSON.parse(`"${m[1]}"`))) : {};
  cacheData(k, d);
  return d;
};

// ================== API ==================
const fetchAPI = async (e, r = CONFIG.MAX_RETRIES) => {
  const k = `api_${e.replace(/[/?=]/g, '_')}`, c = getCachedData(k);
  if (c) return c;
  const res = await fetch(`${CONFIG.BASE_URL}${e}`, { method: "GET", headers: { "x-apisports-key": CONFIG.API_KEY, "accept": "application/json" } });
  if (!res.ok) { if (res.status === 429 && r > 0) { await new Promise(r => setTimeout(r, CONFIG.RETRY_DELAY)); return fetchAPI(e, r-1); } throw new Error(`HTTP-Fehler: ${res.status}`); }
  const j = await res.json();
  if (!j.response) throw new Error("Ungültige API-Antwort");
  cacheData(k, j);
  return j;
};

// ================== LOAD DATA ==================
const loadData = async () => {
  state.lastUpdate = new Date().toLocaleTimeString();
  document.getElementById('last-update').textContent = state.lastUpdate;
  const d = document.getElementById('match-date').value || new Date().toISOString().split('T')[0];
  
  const u = await Promise.all(['Bundesliga', 'EPL', 'La_Liga', 'Serie_A', 'Ligue_1'].map(l => fetchUnderstatTeamData(l, '2024')));
  state.understat = Object.assign({}, ...['Bundesliga', 'EPL', 'La_Liga', 'Serie_A', 'Ligue_1'].map((l, i) => ({ [l]: u[i] })));
  
  const [liveF, oddsL] = await Promise.all([fetchAPI("/fixtures?live=all"), fetchAPI("/odds?live=all")]);
  const [upF, oddsU] = d !== new Date().toISOString().split('T')[0] ? await Promise.all([fetchAPI(`/fixtures?date=${d}`), fetchAPI(`/odds?date=${d}`)]) : [{ response: [] }, { response: [] }];
  
  renderMatches(liveF.response, oddsL.response, "live-matches");
  renderMatches(upF.response, oddsU.response, "upcoming-matches");
  buildBestCombo([...oddsL.response, ...oddsU.response]);
  fillLeagueDropdown([...liveF.response, ...upF.response]);
  console.log(`LoadData Dauer: ${performance.now() - start}ms`);
};

// ================== LEAGUE DROPDOWN ==================
const fillLeagueDropdown = (m) => {
  const d = document.getElementById('league-filter');
  d.innerHTML = '<option value="">Alle Ligen</option>';
  [...new Set(m.map(m => `${m.league.id}|${m.league.name}`))].forEach(l => {
    const [id, n] = l.split("|");
    d.add(new Option(n, id));
  });
};

// ================== VALUE CALC ==================
const calculateValue = (p, o) => o > 0 ? p * o - 1 : 0;

// ================== RENDER ==================
const renderMatches = (m, o, c) => {
  const s = performance.now(), cont = document.getElementById(c);
  if (!m?.length) { cont.innerHTML = "<p>Keine Spiele gefunden</p>"; return; }
  
  const f = m.filter(m => {
    const l = document.getElementById('league-filter').value, t = document.getElementById('team-search').value.toLowerCase(), v = parseFloat(document.getElementById('filter-value').value) || 0;
    return (!l || m.league.id == l) && (!t || m.teams.home.name.toLowerCase().includes(t) || m.teams.away.name.toLowerCase().includes(t)) && 
           (state.quickFilterMode !== "top" || isTopLeague(m.league.id));
  });

  const frag = document.createDocumentFragment();
  f.sort((a, b) => (state.pinnedMatches.has(b.fixture.id) ? 1 : 0) - (state.pinnedMatches.has(a.fixture.id) ? 1 : 0))
   .forEach(m => {
    const od = o.find(x => x?.fixture?.id === m.fixture.id), div = document.createElement("div");
    div.className = "match-card" + (state.pinnedMatches.has(m.fixture.id) ? " pinned" : "");
    
    const p = document.createElement("button");
    p.className = "pin-btn";
    p.textContent = state.pinnedMatches.has(m.fixture.id) ? "📍" : "📌";
    p.addEventListener('click', () => (state.pinnedMatches.has(m.fixture.id) ? state.pinnedMatches.delete(m.fixture.id) : state.pinnedMatches.add(m.fixture.id), renderMatches(m, o, c)));

    const l = m.league.name.includes('England') ? 'EPL' : m.league.name.includes('Germany') ? 'Bundesliga' : m.league.name.includes('Spain') ? 'La_Liga' : m.league.name.includes('Italy') ? 'Serie_A' : m.league.name.includes('France') ? 'Ligue_1' : null;
    const h = m.teams.home.name, a = m.teams.away.name;
    const hXG = l && state.understat[l]?.[h]?.xG ? state.understat[l][h].xG.toFixed(2) : 'N/A';
    const aXG = l && state.understat[l]?.[a]?.xG ? state.understat[l][a].xG.toFixed(2) : 'N/A';
    const xG = `xG: ${hXG} (H) | ${aXG} (A)`;

    if (!od?.bookmakers?.length || !od.bookmakers[0]?.bets) {
      div.append(document.createElement("div").append(document.createElement("div").innerHTML = `<img src="${m.teams.home.logo||''}" loading="lazy"> ${h} <span>vs</span> ${a} <img src="${m.teams.away.logo||''}" loading="lazy">`, p),
                 document.createElement("div").innerHTML = '<div class="odds-item no-odds">❌ Quoten nicht verfügbar</div><div class="odds-item xg-info">' + xG + '</div>');
    } else {
      const b = od.bookmakers[0].bets.find(b => b.name === "Match Winner");
      if (!b?.values?.length) {
        div.append(document.createElement("div").append(document.createElement("div").innerHTML = `<img src="${m.teams.home.logo||''}" loading="lazy"> ${h} <span>vs</span> ${a} <img src="${m.teams.away.logo||''}" loading="lazy">`, p),
                   document.createElement("div").innerHTML = '<div class="odds-item no-odds">❌ Kein Match Winner-Bet</div><div class="odds-item xg-info">' + xG + '</div>');
      } else {
        const oA = b.values.map(v => parseFloat(v.odd) || 0), iP = oA.map(o => o > 0 ? 1/o : 0), sP = iP.reduce((a, b) => a + b, 1),
              nP = iP.map(p => p/sP), mV = Math.max(...oA.map((o, i) => calculateValue(nP[i], o)));
        if (state.quickFilterMode === "value10" && mV < 0.1 || mV < (document.getElementById('filter-value').value || 0)) return;

        const h = document.createElement("div"), t = document.createElement("div");
        t.innerHTML = `<img src="${m.teams.home.logo||''}" loading="lazy"> ${h} <span>vs</span> ${a} <img src="${m.teams.away.logo||''}" loading="lazy">`;
        h.append(t, p);

        const oL = document.createElement("div");
        b.values.forEach((v, i) => {
          const o = parseFloat(v.odd) || 0, val = calculateValue(nP[i], o), c = val >= 0.1 ? 'value-high glow' : val >= 0 ? 'value-mid' : 'value-low';
          oL.appendChild(Object.assign(document.createElement("div"), { className: "odds-item", innerHTML: `<span>${v.value} @ ${v.odd}</span><span class="${c}">${(val*100).toFixed(1)}%</span>` }));
        });
        oL.appendChild(Object.assign(document.createElement("div"), { className: "odds-item xg-info", innerHTML: xG }));
        div.append(h, oL);
      }
    }
    frag.appendChild(div);
  });

  cont.innerHTML = ""; cont.appendChild(frag);
  console.log(`RenderMatches Dauer (${c}): ${performance.now() - s}ms`);
};

// ================== TOP LEAGUES ==================
const isTopLeague = (id) => [39, 140, 135, 78, 61, 2].includes(Number(id));

// ================== COMBO ==================
const buildBestCombo = (o) => {
  if (state.cachedCombos && JSON.stringify(state.cachedCombos.odds) === JSON.stringify(o)) {
    document.getElementById('combo-output').textContent = state.comboText || "Keine Value-Kombis verfügbar";
    document.getElementById('total-odds').textContent = state.cachedCombos.totalOdds.toFixed(2);
    document.getElementById('total-value').textContent = (state.cachedCombos.totalVal*100).toFixed(1) + "%";
    return;
  }
  if (!o?.length) {
    document.getElementById('combo-output').textContent = "Keine Quoten verfügbar";
    document.getElementById('total-odds').textContent = "0.00";
    document.getElementById('total-value').textContent = "0%";
    return;
  }

  const c = o.flatMap(o => o.bookmakers?.length ? o.bookmakers[0].bets.filter(b => b.name === "Match Winner").flatMap(b => b.values.map((v, i) => {
    const odd = parseFloat(v.odd) || 0, oA = b.values.map(v => parseFloat(v.odd) || 0), iP = oA.map(o => o > 0 ? 1/o : 0),
          sP = iP.reduce((a, b) => a + b, 1), nP = iP.map(p => p/sP);
    return { match: o.fixture, market: v.value, odd, val: calculateValue(nP[i], odd) };
  })) : []).sort((a, b) => b.val - a.val).slice(0, 3);

  state.comboText = c.map(c => `${c.match.teams.home.name} vs ${c.match.teams.away.name} | ${c.market} | Quote: ${c.odd.toFixed(2)} | Value: ${(c.val*100).toFixed(1)}%`).join('\n');
  const tO = c.reduce((p, c) => p * c.odd, 1) || 0, tV = c.reduce((s, c) => s + c.val, 0) || 0;

  document.getElementById('combo-output').textContent = state.comboText || "Keine Value-Kombis verfügbar";
  document.getElementById('total-odds').textContent = tO.toFixed(2);
  document.getElementById('total-value').textContent = (tV*100).toFixed(1) + "%";
  state.cachedCombos = { odds: o, totalOdds: tO, totalVal: tV };
  console.log(`BuildBestCombo Dauer: ${performance.now() - start}ms`);
};

// ================== EVENT LISTENERS ==================
const initEventListeners = () => {
  ['refresh', 'copy-combo'].forEach(id => document.getElementById(id).addEventListener(id === 'refresh' ? 'click' : 'click', id === 'refresh' ? loadData : () => (navigator.clipboard.writeText(state.comboText), alert("Kombi kopiert ✅"))));
  ['filter-value', 'league-filter', 'match-date', 'team-search'].forEach(id => document.getElementById(id).addEventListener(id.includes('search') ? 'input' : 'change', debounce(loadData, id === 'team-search' ? 500 : 300)));
  document.querySelectorAll('.quick-btn').forEach(b => b.addEventListener('click', () => (state.quickFilterMode = b.dataset.type, loadData())));
};

// ================== INIT ==================
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('match-date').value = new Date().toISOString().split('T')[0];
  initEventListeners();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(err => console.error('❌ SW Fehler:', err));
  loadData();
});
