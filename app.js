// === ⚽ JurijPower Live Tool – SoccerData API Version ===
const API_KEY = "4edc0535a5304abcfd3999fad3e6293d0b02e1a0";
const BASE_URL = "https://api.soccerdataapi.com";

// === Favoritenligen (IDs nach Bedarf) ===
const FAVORITE_LEAGUES = [78, 79, 39, 135, 140, 61];

// === HTML Elemente ===
const liveContainer = document.getElementById("live-matches");
const upcomingContainer = document.getElementById("upcoming-matches");
const lastUpdate = document.getElementById("lastUpdate");
const refreshButton = document.getElementById("refreshButton");
const filterSelect = document.getElementById("filterSelect");
const totalOddsSpan = document.getElementById("total-odds");
const comboValueSpan = document.getElementById("combo-value");
const copyComboBtn = document.getElementById("copy-combo");

// === Browser Notifications aktivieren ===
if ("Notification" in window && Notification.permission !== "granted") {
  Notification.requestPermission();
}

// === Hilfsfunktionen ===
function calcGoalProbability(match) {
  const homeGoals = match.home_score;
  const awayGoals = match.away_score;
  const totalGoals = homeGoals + awayGoals;
  const minute = match.minute || 0;
  return Math.min(100, Math.round((totalGoals * 20) + (minute / 2)));
}

function calcValue(prob, odds) {
  const fairProb = odds > 0 ? (1 / odds) * 100 : 0;
  return prob - fairProb;
}

function sendNotification(teamA, teamB, prob) {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("🔥 Hohe Torwahrscheinlichkeit!", {
      body: `${teamA} vs ${teamB}\nTorwahrscheinlichkeit: ${prob}%`,
      icon: "https://cdn-icons-png.flaticon.com/512/51/51767.png"
    });
  }
}

// === Datenabruf ===
async function fetchMatches(type = "live") {
  const url = `${BASE_URL}/${type === "live" ? "livescores" : "fixtures"}/?auth_token=${API_KEY}`;
  const res = await fetch(url, {
    headers: { "Accept-Encoding": "gzip" }
  });
  const data = await res.json();
  return data.data || [];
}

async function fetchOdds(fixtureId) {
  const url = `${BASE_URL}/odds/?fixture_id=${fixtureId}&auth_token=${API_KEY}`;
  const res = await fetch(url, {
    headers: { "Accept-Encoding": "gzip" }
  });
  const data = await res.json();
  if (data.data && data.data.length > 0) {
    return data.data[0].odds.home_win; // Beispiel: 1X2 Home-Quote
  }
  return 1.0;
}

// === Darstellung ===
async function displayMatches(container, matches, isLive = false) {
  container.innerHTML = "";

  if (matches.length === 0) {
    container.innerHTML = `<p class="no-matches">❌ Keine Spiele aktuell.</p>`;
    return;
  }

  for (const match of matches) {
    const odds = await fetchOdds(match.id);
    const prob = calcGoalProbability(match);
    const value = calcValue(prob, odds);
    const isHigh = prob >= 70;

    const div = document.createElement("div");
    div.classList.add("match-card");
    if (isHigh && isLive) div.classList.add("blink");

    div.innerHTML = `
      <div><strong>${match.home_team}</strong> vs <strong>${match.away_team}</strong></div>
      <div>⏱️ ${match.minute || match.starting_at.slice(11, 16)}</div>
      <div>💰 Quote: ${odds.toFixed(2)}</div>
      <div>📊 Tor-Wahrsch.: <span class="high-prob">${prob}%</span></div>
      <div>🧮 Value: ${value.toFixed(2)}%</div>
    `;
    container.appendChild(div);

    if (isHigh && isLive) {
      sendNotification(match.home_team, match.away_team, prob);
    }
  }
}

// === Kombi berechnen ===
async function calculateBestCombo(matches) {
  // Wähle Top 3 Spiele mit höchstem Value
  const withValues = await Promise.all(
    matches.map(async m => {
      const odds = await fetchOdds(m.id);
      const prob = calcGoalProbability(m);
      const val = calcValue(prob, odds);
      return { match: m, odds, value: val };
    })
  );

  const top = withValues.sort((a, b) => b.value - a.value).slice(0, 3);

  const totalOdds = top.reduce((acc, x) => acc * x.odds, 1);
  const avgValue = top.reduce((acc, x) => acc + x.value, 0) / top.length;

  totalOddsSpan.textContent = totalOdds.toFixed(2);
  comboValueSpan.textContent = avgValue.toFixed(2);

  copyComboBtn.onclick = () => {
    const text = top.map(x => `${x.match.home_team} vs ${x.match.away_team} (${x.odds.toFixed(2)})`).join("\n");
    navigator.clipboard.writeText(text);
  };
}

// === Aktualisieren ===
async function updateData() {
  const filter = filterSelect.value;

  const liveMatches = await fetchMatches("live");
  const upcomingMatches = await fetchMatches("fixtures");

  const filteredLive = filter === "favorites"
    ? liveMatches.filter(m => FAVORITE_LEAGUES.includes(m.league_id))
    : liveMatches;

  const filteredUpcoming = filter === "favorites"
    ? upcomingMatches.filter(m => FAVORITE_LEAGUES.includes(m.league_id))
    : upcomingMatches;

  await displayMatches(liveContainer, filteredLive, true);
  await displayMatches(upcomingContainer, filteredUpcoming, false);

  // Kombi nur aus kommenden Spielen
  await calculateBestCombo(filteredUpcoming);

  lastUpdate.textContent = new Date().toLocaleTimeString();
}

// === Events ===
refreshButton.addEventListener("click", updateData);
filterSelect.addEventListener("change", updateData);

// === Initial ===
updateData();
setInterval(updateData, 60000);
