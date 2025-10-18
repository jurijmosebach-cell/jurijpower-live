const API_KEY = "c6ad1210c71b17cca24284ab8a9873b4";
const BASE_URL = "https://v3.football.api-sports.io";

let comboText = "";

document.getElementById('refresh').addEventListener('click', loadData);
document.getElementById('copy-combo').addEventListener('click', () => {
  navigator.clipboard.writeText(comboText);
  alert("Kombi kopiert ✅");
});

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

async function loadData() {
  document.getElementById('last-update').textContent = new Date().toLocaleTimeString();

  const today = new Date().toISOString().split('T')[0];
  const liveFixtures = await fetchAPI("/fixtures?live=all");
  const upcomingFixtures = await fetchAPI(`/fixtures?date=${today}`);

  const oddsLive = await fetchAPI("/odds?live=all");
  const oddsUpcoming = await fetchAPI(`/odds?date=${today}`);

  renderMatches(liveFixtures.response, oddsLive.response, "live-matches");
  renderMatches(upcomingFixtures.response, oddsUpcoming.response, "upcoming-matches");

  buildBestCombo([...oddsLive.response, ...oddsUpcoming.response]);
}

function calculateWinProbabilities(homeStats, awayStats) {
  const homeWinRate = homeStats?.form?.split("").filter(l => l === "W").length / (homeStats?.form?.length || 1);
  const awayWinRate = awayStats?.form?.split("").filter(l => l === "W").length / (awayStats?.form?.length || 1);
  const pHome = (homeWinRate + (1 - awayWinRate)) / 2;
  const pAway = (awayWinRate + (1 - homeWinRate)) / 2;
  const pDraw = 1 - (pHome + pAway);
  return { pHome, pDraw, pAway };
}

function calculateOverUnderProbabilities(homeStats, awayStats) {
  const homeGoals = homeStats.goals.for.total.average.home;
  const awayGoals = awayStats.goals.for.total.average.away;
  const expectedGoals = parseFloat(homeGoals) + parseFloat(awayGoals);
  const pOver = Math.min(0.95, expectedGoals / 4);
  const pUnder = 1 - pOver;
  return { pOver, pUnder };
}

function calculateValue(prob, odd) {
  if (!odd || odd <= 0) return -1;
  return prob * odd - 1;
}

function valueColor(value) {
  if (value >= 0.05) return "value-high";       // grün
  if (value >= -0.05) return "value-mid";       // gelb
  return "value-low";                          // rot
}

function renderMatches(matches, odds, containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  if (!matches || matches.length === 0) {
    container.innerHTML = "<p>Keine Spiele gefunden</p>";
    return;
  }

  let allMatches = [];

  matches.forEach(match => {
    const o = odds.find(x => x.fixture.id === match.fixture.id);
    if (!o || o.bookmakers.length === 0) return;

    const bets = o.bookmakers[0].bets;
    const bet1x2 = bets.find(b => b.name === "Match Winner");
    const betOU = bets.find(b => b.name.includes("Over/Under"));

    const homeOdd = bet1x2?.values?.find(v => v.value === "Home")?.odd;
    const drawOdd = bet1x2?.values?.find(v => v.value === "Draw")?.odd;
    const awayOdd = bet1x2?.values?.find(v => v.value === "Away")?.odd;

    const overOdd = betOU?.values?.find(v => v.value === "Over 2.5")?.odd;
    const underOdd = betOU?.values?.find(v => v.value === "Under 2.5")?.odd;

    const { pHome, pDraw, pAway } = calculateWinProbabilities(match.teams.home, match.teams.away);
    const { pOver, pUnder } = calculateOverUnderProbabilities(match.teams.home, match.teams.away);

    const valHome = calculateValue(pHome, homeOdd);
    const valDraw = calculateValue(pDraw, drawOdd);
    const valAway = calculateValue(pAway, awayOdd);
    const valOver = calculateValue(pOver, overOdd);
    const valUnder = calculateValue(pUnder, underOdd);

    const bestValue = Math.max(valHome, valDraw, valAway, valOver, valUnder);

    allMatches.push({
      match,
      odds: { homeOdd, drawOdd, awayOdd, overOdd, underOdd },
      values: { valHome, valDraw, valAway, valOver, valUnder },
      bestValue
    });
  });

  // Sortieren nach höchstem Value
  allMatches.sort((a, b) => b.bestValue - a.bestValue);

  allMatches.forEach(({ match, odds, values }) => {
    const div = document.createElement("div");
    div.className = "match-card";
    div.innerHTML = `
      <div class="match-header">
        <span>${match.teams.home.name} vs ${match.teams.away.name}</span>
        <span>${match.fixture.status.short}</span>
      </div>
      <div class="odds-line">
        <span>1: ${odds.homeOdd || "-"} | <span class="${valueColor(values.valHome)}">${(values.valHome*100).toFixed(1)}%</span></span>
        <span>X: ${odds.drawOdd || "-"} | <span class="${valueColor(values.valDraw)}">${(values.valDraw*100).toFixed(1)}%</span></span>
        <span>2: ${odds.awayOdd || "-"} | <span class="${valueColor(values.valAway)}">${(values.valAway*100).toFixed(1)}%</span></span>
      </div>
      <div class="odds-line">
        <span>Over 2.5: ${odds.overOdd || "-"} | <span class="${valueColor(values.valOver)}">${(values.valOver*100).toFixed(1)}%</span></span>
        <span>Under 2.5: ${odds.underOdd || "-"} | <span class="${valueColor(values.valUnder)}">${(values.valUnder*100).toFixed(1)}%</span></span>
      </div>
    `;
    container.appendChild(div);
  });
}

function buildBestCombo(odds) {
  if (!odds || odds.length === 0) return;

  const combos = [];

  odds.forEach(o => {
    const bet1x2 = o.bookmakers[0].bets.find(b => b.name === "Match Winner");
    const betOU = o.bookmakers[0].bets.find(b => b.name.includes("Over/Under"));
    if (bet1x2) {
      bet1x2.values.forEach(v => {
        const val = calculateValue(1/parseFloat(v.odd), parseFloat(v.odd));
        combos.push({ match: o.fixture, market: v.value, odd: v.odd, val });
      });
    }
    if (betOU) {
      betOU.values.forEach(v => {
        const val = calculateValue(1/parseFloat(v.odd), parseFloat(v.odd));
        combos.push({ match: o.fixture, market: v.value, odd: v.odd, val });
      });
    }
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

loadData();
