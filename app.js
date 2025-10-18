const API_KEY = "c6ad1210c71b17cca24284ab8a9873b4";
const BASE_URL = "https://v3.football.api-sports.io";

async function fetchAPI(endpoint) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    headers: { "x-apisports-key": API_KEY }
  });
  return response.json();
}

function formatDateTime(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

async function loadLiveGames() {
  const data = await fetchAPI("/fixtures?live=all");
  const container = document.getElementById("liveGames");
  container.innerHTML = "";

  if (!data.response || data.response.length === 0) {
    container.innerHTML = "<p>Keine Live Spiele 📭</p>";
    return;
  }

  data.response.forEach(game => {
    const card = document.createElement("div");
    card.className = "game-card";
    card.innerHTML = `
      <strong>${game.teams.home.name}</strong> vs <strong>${game.teams.away.name}</strong><br>
      🕒 ${formatDateTime(game.fixture.date)}
    `;
    container.appendChild(card);
  });
}

async function loadUpcomingGames() {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const from = now.toISOString().split("T")[0];
  const to = tomorrow.toISOString().split("T")[0];

  const data = await fetchAPI(`/fixtures?from=${from}&to=${to}`);
  const container = document.getElementById("upcomingGames");
  container.innerHTML = "";

  if (!data.response || data.response.length === 0) {
    container.innerHTML = "<p>Keine Spiele in den nächsten 24h 📭</p>";
    return;
  }

  data.response.forEach(game => {
    const card = document.createElement("div");
    card.className = "game-card";
    card.innerHTML = `
      <strong>${game.teams.home.name}</strong> vs <strong>${game.teams.away.name}</strong><br>
      🕒 ${formatDateTime(game.fixture.date)}
    `;
    container.appendChild(card);
  });

  const odds = await loadOddsForGames(data.response);
  generateBestCombo(odds);
}

async function loadOddsForGames(games) {
  const gameData = [];
  for (const g of games) {
    const oddsData = await fetchAPI(`/odds?fixture=${g.fixture.id}`);
    if (oddsData.response && oddsData.response.length > 0) {
      const bookmaker = oddsData.response[0].bookmakers[0];
      const bets = bookmaker.bets.find(b => b.name === "Match Winner");

      if (bets) {
        const homeOdd = parseFloat(bets.values.find(v => v.value === "Home")?.odd || 1);
        const drawOdd = parseFloat(bets.values.find(v => v.value === "Draw")?.odd || 1);
        const awayOdd = parseFloat(bets.values.find(v => v.value === "Away")?.odd || 1);

        gameData.push({
          match: `${g.teams.home.name} vs ${g.teams.away.name}`,
          fixtureId: g.fixture.id,
          odds: {
            home: homeOdd,
            draw: drawOdd,
            away: awayOdd
          }
        });
      }
    }
  }
  return gameData;
}

function calculateValue(odd) {
  // Dummy Value Formel → später kannst du hier deine eigene Strategie einbauen
  return odd * 0.95; // z.B. 5% Margin abgezogen
}

function generateBestCombo(games) {
  let allBets = [];
  games.forEach(g => {
    allBets.push({ match: g.match, type: "Home", odd: g.odds.home, value: calculateValue(g.odds.home) });
    allBets.push({ match: g.match, type: "Draw", odd: g.odds.draw, value: calculateValue(g.odds.draw) });
    allBets.push({ match: g.match, type: "Away", odd: g.odds.away, value: calculateValue(g.odds.away) });
  });

  allBets.sort((a, b) => b.value - a.value);
  const bestCombo = allBets.slice(0, 3);

  const totalOdds = bestCombo.reduce((acc, cur) => acc * cur.odd, 1).toFixed(2);
  const totalValue = bestCombo.reduce((acc, cur) => acc * cur.value, 1).toFixed(2);

  document.getElementById("totalOdds").innerText = `Gesamtquote: ${totalOdds}`;
  document.getElementById("totalValue").innerText = `Kombi-Value: ${totalValue}`;

  document.getElementById("copyCombo").onclick = () => {
    const text = bestCombo.map(b => `${b.match} - ${b.type} (${b.odd})`).join("\n");
    navigator.clipboard.writeText(text);
    alert("Kombi kopiert ✅");
  };
}

function updateTime() {
  document.getElementById("lastUpdate").innerText =
    "Letztes Update: " + new Date().toLocaleString("de-DE");
}

document.getElementById("refreshBtn").addEventListener("click", () => {
  loadLiveGames();
  loadUpcomingGames();
  updateTime();
});

loadLiveGames();
loadUpcomingGames();
updateTime();
