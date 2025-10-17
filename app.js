const apiKey = "c6ad1210c71b17cca24284ab8a9873b4";
const matchList = document.getElementById("matchList");
const refreshBtn = document.getElementById("refreshBtn");
const leagueFilter = document.getElementById("leagueFilter");

async function fetchMatches() {
  matchList.innerHTML = "⏳ Lade Live-Daten...";
  try {
    const res = await fetch("https://v3.football.api-sports.io/fixtures?live=all", {
      headers: { "x-apisports-key": apiKey }
    });
    const data = await res.json();
    const matches = data.response;

    if (!matches || matches.length === 0) {
      matchList.innerHTML = "⚽ Keine Live-Spiele aktuell.";
      return;
    }

    // Liste der Ligen füllen
    const leagues = [...new Set(matches.map(m => m.league.name))];
    leagueFilter.innerHTML = `<option value="all">Alle Ligen</option>`;
    leagues.forEach(league => {
      const opt = document.createElement("option");
      opt.value = league;
      opt.textContent = league;
      leagueFilter.appendChild(opt);
    });

    renderMatches(matches);
  } catch (error) {
    matchList.innerHTML = "❌ Fehler beim Laden der Daten.";
    console.error(error);
  }
}

function renderMatches(matches) {
  const selectedLeague = leagueFilter.value;
  const filtered = selectedLeague === "all" 
    ? matches 
    : matches.filter(m => m.league.name === selectedLeague);

  matchList.innerHTML = "";

  filtered.forEach(match => {
    const home = match.teams.home.name;
    const away = match.teams.away.name;
    const score = `${match.goals.home} : ${match.goals.away}`;
    const league = match.league.name;
    const time = match.fixture.status.elapsed;

    const div = document.createElement("div");
    div.classList.add("match");
    div.innerHTML = `
      <h2>${home} vs ${away}</h2>
      <p>🏆 ${league} | ⏱️ ${time || 0}' | 🔢 ${score}</p>
    `;
    matchList.appendChild(div);
  });
}

refreshBtn.addEventListener("click", fetchMatches);
leagueFilter.addEventListener("change", fetchMatches);

// automatische Aktualisierung alle 30 Sek.
setInterval(fetchMatches, 30000);

// Start beim Laden
fetchMatches();
