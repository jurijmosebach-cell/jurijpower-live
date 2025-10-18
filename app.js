/***********************************************
 JurijPower — Statistical Value Predictor
 API: API-Football (v3)
 Key: (eingebaut)
***********************************************/

const API_KEY = "c6ad1210c71b17cca24284ab8a9873b4";
const BASE = "https://v3.football.api-sports.io";

const FAVORITE_LEAGUES = [78,79,39,135,140,61]; // optional

// DOM
const liveContainer = document.getElementById("liveContainer");
const preContainer = document.getElementById("preContainer");
const debugEl = document.getElementById("debug");
const comboListEl = document.getElementById("comboList");
const comboOddsEl = document.getElementById("comboOdds");
const comboValueEl = document.getElementById("comboValue");
const lastUpdateEl = document.getElementById("lastUpdate");
const refreshBtn = document.getElementById("refreshBtn");
const filterSelect = document.getElementById("filterSelect");
const copyComboBtn = document.getElementById("copyCombo");

let cachedTeamForm = {}; // teamId -> form summary (cache during one update)
let currentComboText = "";

// fetch helper with header
async function callAPI(path) {
  try {
    const res = await fetch(BASE + path, {
      headers: { "x-apisports-key": API_KEY, "accept": "application/json" }
    });
    const j = await res.json();
    debugLog(`${path} -> status ${res.status}`);
    return j;
  } catch (err) {
    debugLog("Network error: " + err.message);
    return null;
  }
}

function debugLog(msg) {
  const time = new Date().toLocaleTimeString();
  debugEl.textContent = `[${time}] ${msg}\n` + debugEl.textContent;
}

// format helper
function fmtDate(dateStr) {
  try {
    return new Date(dateStr).toLocaleString("de-DE", { dateStyle:"short", timeStyle:"short" });
  } catch { return dateStr; }
}

// ---------------------- Stats / Probability ----------------------
// Calculate simple form / strength from last N fixtures
// We fetch last up to 10 matches for the team and compute:
// wins, draws, losses, goalsFor, goalsAgainst -> strength score in [0,1]
async function getTeamForm(teamId) {
  if (cachedTeamForm[teamId]) return cachedTeamForm[teamId];

  const resp = await callAPI(`/fixtures?team=${teamId}&last=10`);
  if (!resp || !resp.response) {
    cachedTeamForm[teamId] = null;
    return null;
  }
  const fixtures = resp.response;
  if (fixtures.length === 0) {
    cachedTeamForm[teamId] = null;
    return null;
  }

  let wins=0, draws=0, losses=0, gf=0, ga=0;
  fixtures.forEach(f => {
    // For each fixture, determine if teamId was home or away and result
    const isHome = f.teams.home.id === teamId;
    const scored = isHome ? (f.goals.home ?? 0) : (f.goals.away ?? 0);
    const conceded = isHome ? (f.goals.away ?? 0) : (f.goals.home ?? 0);
    gf += (scored || 0);
    ga += (conceded || 0);

    if (f.goals.home == null || f.goals.away == null) {
      // skip if no final score (rare)
      return;
    }
    const homeGoals = f.goals.home;
    const awayGoals = f.goals.away;
    let outcome;
    if (homeGoals > awayGoals) outcome = "home";
    else if (homeGoals < awayGoals) outcome = "away";
    else outcome = "draw";

    if ((isHome && outcome==="home") || (!isHome && outcome==="away")) wins++;
    else if (outcome==="draw") draws++;
    else losses++;
  });

  const games = wins + draws + losses || fixtures.length;
  // simple strength: weighted points per game normalized (0..1)
  const points = wins*3 + draws*1;
  const maxPoints = games * 3;
  const strength = maxPoints > 0 ? (points / maxPoints) : 0.5;

  const avgGF = games>0 ? gf / games : 0;
  const avgGA = games>0 ? ga / games : 0;

  const form = { games, wins, draws, losses, gf, ga, avgGF, avgGA, strength };
  cachedTeamForm[teamId] = form;
  return form;
}

// From two team strengths compute probabilities for Home / Draw / Away
// This uses a simple model: transform strengths to odds with home advantage
function computeProbabilities(homeForm, awayForm) {
  // fallback to neutral strengths if missing
  const h = homeForm?.strength ?? 0.5;
  const a = awayForm?.strength ?? 0.5;

  // home advantage factor (empirical)
  const homeAdv = 0.06; // +6% base home edge
  const rawHome = h + homeAdv;
  const rawAway = a;

  // normalize to get probabilities for win/no-win; estimate draw as residual
  const sum = rawHome + rawAway;
  let pHome = rawHome / sum;
  let pAway = rawAway / sum;

  // estimate draw probability based on both teams' defensive/offensive similarity and average draws
  const drawBase = 0.22; // baseline draw chance
  // adjust draw up if teams are similar
  const similarity = 1 - Math.abs(h - a); // closer to 1 means similar
  const pDraw = Math.min(0.38, drawBase + similarity * 0.18);

  // re-normalize to keep pHome + pAway + pDraw = 1, preserving relative home/away ratio
  const remaining = 1 - pDraw;
  const ratio = pHome / (pHome + pAway);
  pHome = remaining * ratio;
  pAway = remaining * (1 - ratio);

  return {
    home: Number((pHome).toFixed(4)),
    draw: Number((pDraw).toFixed(4)),
    away: Number((pAway).toFixed(4))
  };
}

// Value calculation: Value = prob * quote - 1
function computeValue(prob, quote) {
  // prob in [0..1], quote decimal
  if (!quote || quote <= 0) return -1;
  return Number((prob * quote - 1).toFixed(4));
}

// ---------------------- Rendering ----------------------
function createMatchCard(fixture, oddsObj, probs, values, isLive=false) {
  const card = document.createElement("div");
  card.className = "card" + (isLive ? " blink" : "");

  const title = document.createElement("div");
  title.className = "matchTitle";
  title.innerText = `${fixture.teams.home.name}  —  ${fixture.teams.away.name}`;
  card.appendChild(title);

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.innerHTML = `<span class="tag">${fmtDate(fixture.fixture.date)}</span>
                    <span class="tag">${fixture.league.name}</span>
                    <span class="tag">Spiel-ID: ${fixture.fixture.id}</span>`;
  card.appendChild(meta);

  // odds row
  const oddsRow = document.createElement("div");
  oddsRow.className = "oddsRow";

  // for outcomes create boxes: Home / Draw / Away
  const outcomes = [
    { key: "home", label: fixture.teams.home.name },
    { key: "draw", label: "X" },
    { key: "away", label: fixture.teams.away.name }
  ];

  outcomes.forEach(o => {
    const box = document.createElement("div");
    box.className = "outcome";
    const quote = oddsObj ? (oddsObj[o.key] || null) : null;
    const prob = probs ? probs[o.key] : null;
    const val = (prob !== null && quote !== null) ? computeValue(prob, quote) : null;

    const probPerc = prob !== null ? Math.round(prob * 100) + "%" : "-";
    const valueStr = val !== null ? (val > 0 ? `+${(val*100).toFixed(1)}%` : `${(val*100).toFixed(1)}%`) : "-";

    box.innerHTML = `<div style="font-size:0.85rem;color:var(--muted)">${o.label}</div>
                     <div style="font-weight:700">${quote ? quote.toFixed(2) : "-"}</div>
                     <div class="prob">${probPerc}</div>
                     <div class="${val>0 ? 'valuePositive' : 'valueNegative'}">${valueStr}</div>`;
    oddsRow.appendChild(box);
  });

  card.appendChild(oddsRow);
  return card;
}

// ---------------------- Main pipeline ----------------------
async function loadAndRender() {
  debugEl.textContent = ""; // clear debug
  cachedTeamForm = {}; // reset cache per update

  const filter = filterSelect?.value ?? "all";

  lastUpdateEl.textContent = "Letztes Update: " + new Date().toLocaleTimeString();

  // 1) Live fixtures
  const liveResp = await callAPI("/fixtures?live=all");
  const liveFixtures = (liveResp && liveResp.response) ? liveResp.response : [];

  // 2) Today's pre-match fixtures (from midnight -> next 24h)
  const today = new Date();
  const from = today.toISOString().split("T")[0];
  const to = new Date(today.getTime() + 24*60*60*1000).toISOString().split("T")[0];
  const preResp = await callAPI(`/fixtures?from=${from}&to=${to}`);
  const preFixtures = (preResp && preResp.response) ? preResp.response : [];

  // Optionally filter leagues
  const liveFiltered = filter === "favorites" ? liveFixtures.filter(f => FAVORITE_LEAGUES.includes(f.league.id)) : liveFixtures;
  const preFiltered = filter === "favorites" ? preFixtures.filter(f => FAVORITE_LEAGUES.includes(f.league.id)) : preFixtures;

  // render live
  liveContainer.innerHTML = "";
  if (liveFiltered.length === 0) {
    liveContainer.innerHTML = `<div class="card"><div class="matchTitle">Keine Live Spiele</div></div>`;
  } else {
    // For each, fetch odds and team forms, then render
    for (const f of liveFiltered) {
      const oddsObj = await fetchOddsForFixture(f.fixture.id);
      const homeForm = await getTeamForm(f.teams.home.id);
      const awayForm = await getTeamForm(f.teams.away.id);
      const probs = computeProbabilities(homeForm, awayForm);
      const values = {
        home: computeValue(probs.home, oddsObj?.home || 0),
        draw: computeValue(probs.draw, oddsObj?.draw || 0),
        away: computeValue(probs.away, oddsObj?.away || 0)
      };
      const card = createMatchCard(f, oddsObj, probs, values, true);
      liveContainer.appendChild(card);
    }
  }

  // render pre-match
  preContainer.innerHTML = "";
  if (preFiltered.length === 0) {
    preContainer.innerHTML = `<div class="card"><div class="matchTitle">Keine Pre-Match Spiele (24h)</div></div>`;
  } else {
    // collect games info (and odds) for combo generation later
    const preGamesWithOdds = [];
    for (const f of preFiltered) {
      const oddsObj = await fetchOddsForFixture(f.fixture.id);
      const homeForm = await getTeamForm(f.teams.home.id);
      const awayForm = await getTeamForm(f.teams.away.id);
      const probs = computeProbabilities(homeForm, awayForm);
      const values = {
        home: computeValue(probs.home, oddsObj?.home || 0),
        draw: computeValue(probs.draw, oddsObj?.draw || 0),
        away: computeValue(probs.away, oddsObj?.away || 0)
      };
      const card = createMatchCard(f, oddsObj, probs, values, false);
      preContainer.appendChild(card);

      if (oddsObj) {
        // store best single outcome for combo candidate
        const bestOutcome = ["home","draw","away"].map(k => ({k, value: values[k], odd: oddsObj[k]}))
                                 .sort((a,b)=> b.value - a.value)[0];
        preGamesWithOdds.push({
          fixture: f,
          pick: bestOutcome.k,
          value: bestOutcome.value,
          odd: bestOutcome.odd,
          teams: `${f.teams.home.name} vs ${f.teams.away.name}`
        });
      }
    }

    // generate combo using preGamesWithOdds + also allow including live games if desired
    generateCombo(preGamesWithOdds);
  }

  debugLog(`Live: ${liveFiltered.length}  |  Pre: ${preFiltered.length}`);
}

// fetch odds for fixture (best bookmaker first). Returns {home, draw, away, bookmaker}
async function fetchOddsForFixture(fixtureId) {
  const resp = await callAPI(`/odds?fixture=${fixtureId}`);
  if (!resp || !resp.response || resp.response.length === 0) return null;
  // choose bookmaker with most markets (often first) — you can change preference
  const bookmakers = resp.response[0].bookmakers;
  if (!bookmakers || bookmakers.length === 0) return null;
  // choose first bookmaker that has "Match Winner" (name = "Match Winner" or bets[0].name)
  let chosen = null;
  for (const b of bookmakers) {
    const bets = b.bets || [];
    const mw = bets.find(x => x.name === "Match Winner" || x.name === "Match Odds" || x.name.toLowerCase().includes("match"));
    if (mw) { chosen = {bookmaker: b, bet: mw}; break; }
  }
  if (!chosen) {
    // fallback first bookmaker
    chosen = {bookmaker: bookmakers[0], bet: bookmakers[0].bets && bookmakers[0].bets[0]};
    if (!chosen.bet) return null;
  }

  const values = chosen.bet.values || [];
  // values contain objects with {value: "Home"/"Draw"/"Away", odd: "1.23"}
  const map = {};
  values.forEach(v => {
    const k = v.value.toLowerCase();
    // normalize keys: may be "Home"/"Draw"/"Away" or "1"/"X"/"2" depending on source
    if (k.includes("home") || k === "1") map.home = parseFloat(v.odd);
    else if (k.includes("draw") || k === "x") map.draw = parseFloat(v.odd);
    else if (k.includes("away") || k === "2") map.away = parseFloat(v.odd);
  });
  // ensure keys exist
  map.home = map.home || null;
  map.draw = map.draw || null;
  map.away = map.away || null;
  map.bookmaker = chosen.bookmaker?.name || "bookie";
  return map;
}

// Combo generation: choose top N picks by value (value>0 preferred), avoid same fixture multiple picks
function generateCombo(candidates, topN=3) {
  if (!candidates || candidates.length === 0) {
    comboListEl.innerHTML = "<div class='tag'>Keine Kandidaten für Kombi</div>";
    comboOddsEl.innerText = "-";
    comboValueEl.innerText = "-";
    currentComboText = "";
    return;
  }

  // sort by value desc
  const sorted = candidates.sort((a,b)=> b.value - a.value);

  // take topN with positive value first; if not enough positive, include next best
  const positives = sorted.filter(s => s.value > 0);
  let picks = positives.slice(0, topN);
  if (picks.length < topN) {
    // fill with best remaining (distinct fixture)
    const usedIds = new Set(picks.map(p => p.fixture.fixture.id));
    for (const s of sorted) {
      if (picks.length >= topN) break;
      if (usedIds.has(s.fixture.fixture.id)) continue;
      picks.push(s);
      usedIds.add(s.fixture.fixture.id);
    }
  }

  // render combo
  comboListEl.innerHTML = "";
  let totalOdds = 1;
  let combinedValue = 1; // product of (prob*odd)?? We'll present expected multiplier: product(prob*odd)
  // We'll also produce a readable combo text for clipboard
  const lines = [];
  picks.forEach(p => {
    const name = `${p.teams}`;
    const pickLabel = p.pick === "home" ? "1" : (p.pick === "away" ? "2" : "X");
    const line = `${name} — Pick: ${pickLabel} — Quote: ${p.odd?.toFixed(2) || "-"} — Value: ${p.value !== null ? (p.value>0? "+" : "") + (p.value*100).toFixed(1) + "%" : "-"}`;
    const el = document.createElement("div");
    el.className = "tag";
    el.style.marginBottom = "6px";
    el.innerText = line;
    comboListEl.appendChild(el);
    lines.push(line);

    totalOdds *= (p.odd || 1);
    // For kombi value, a simple approach: multiply (probability * odd) components
    // We don't have stored probability here, but value = prob*odd -1. To aggregate, we show product(prob*odd)
    // However in our candidate we stored value and odd only. For display we will use (1 + value) as proxy for prob*odd.
    combinedValue *= Math.max(0.0001, 1 + (p.value || 0)); // 1+value = prob*odd
  });

  comboOddsEl.innerText = totalOdds.toFixed(2);
  // combinedValue is product(prob*odd) — convert to percentage expectation relative to stake
  comboValueEl.innerText = (combinedValue > 0 ? (combinedValue - 1).toFixed(4) : "-");

  currentComboText = lines.join("\n");
}

// copy combo
copyComboBtn.addEventListener("click", () => {
  if (!currentComboText) {
    alert("Keine Kombi zum Kopieren");
    return;
  }
  navigator.clipboard.writeText(currentComboText);
  alert("Kombi kopiert ✅");
});

// --------- Events & start ----------
refreshBtn.addEventListener("click", () => {
  loadAndRender();
});

filterSelect.addEventListener("change", () => {
  loadAndRender();
});

// initial
loadAndRender();
setInterval(loadAndRender, 60 * 1000);
