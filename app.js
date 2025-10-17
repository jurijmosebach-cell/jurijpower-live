
const apiKey = "c6ad1210c71b17cca24284ab8a9873b4";
const apiUrl = "https://v3.football.api-sports.io/fixtures";

const matchList = document.getElementById("matchList");
const upcomingMatchList = document.getElementById("upcomingMatchList");
const leagueFilter = document.getElementById("leagueFilter");
const upcomingLeagueFilter = document.getElementById("upcomingLeagueFilter");
const lastUpdate = document.getElementById("lastUpdate");
const debugOutput = document.getElementById("debugOutput");
const goalSound = document.getElementById("goalSound");

let previousScores = {};
let upcomingMatchesCache = [];
let liveMatchesCache = [];
let upcomingTimers = {};

Notification.requestPermission();

async function fetchMatches() {
  try {
    const response = await fetch(`${apiUrl}?live=all`, {
      headers: { "x-apisports-key": apiKey }
    });
    const data = await response.json();
    liveMatchesCache = data.response;
    renderMatches(liveMatchesCache);
    fillLeagueFilter(liveMatchesCache, leagueFilter);
    lastUpdate.textContent = new Date().toLocaleTimeString();
    debugOutput.textContent = `✅ Antwort empfangen: ${liveMatchesCache.length} Spiele`;
  } catch (err) {
    debugOutput.textContent = `❌ API Fehler: ${err.message}`;
  }
}

async function fetchUpcomingMatches() {
  try {
    const from = new Date();
    const to = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const response = await fetch(`${apiUrl}?from=${from.toISOString().split('T')[0]}&to=${to.toISOString().split('T')[0]}`, {
      headers: { "x-apisports-key": apiKey }
    });
    const data = await response.json();
    upcomingMatchesCache = data.response;
    renderUpcomingMatches(upcomingMatchesCache);
    fillLeagueFilter(upcomingMatchesCache, upcomingLeagueFilter);
  } catch (err) {
    console.log("Fehler Upcoming:", err);
  }
}

function fillLeagueFilter(matches, dropdown) {
  const leagues = [...new Set(matches.map(m => m.league.name))];
  dropdown.innerHTML = `<option value="all">Alle Ligen</option>`;
  leagues.forEach(l => {
    const option = document.createElement("option");
    option.value = l;
    option.textContent = l;
    dropdown.appendChild(option);
  });
}

function renderMatches(matches) {
  const selectedLeague = leagueFilter.value;
  const filtered = selectedLeague === "all" ? matches : matches.filter(m => m.league.name === selectedLeague);
  matchList.innerHTML = "";

  filtered.forEach(match => {
    const id = match.fixture.id;
    const home = match.teams.home.name;
    const away = match.teams.away.name;
    const score = `${match.goals.home} : ${match.goals.away}`;
    const league = match.league.name;
    const time = match.fixture.status.elapsed;

    const div = document.createElement("div");
    div.classList.add("match");
    div.setAttribute("data-id", id);

    div.innerHTML = `
      <h2>${home} vs ${away}</h2>
      <p>🏆 ${league} | ⏱️ ${time || 0}' | 🔢 ${score}</p>
      <div class="bet-container">
        <label>💶 Einsatz: <input type="number" id="einsatz-${id}" placeholder="€"></label>
        <label>📈 Quote: <input type="number" step="0.01" id="quote-${id}" placeholder="z.B. 2.50"></label>
        <p>💰 Potenzieller Gewinn: <span id="gewinn-${id}" class="bet-result">0 €</span></p>
      </div>
    `;

    // Toralarm
    const prev = previousScores[id];
    if (prev && prev !== score) {
      div.style.animation = "blink 1s ease-in-out 3";
      goalSound.play().catch(err => console.warn("Ton konnte nicht abgespielt werden", err));
      if (Notification.permission === "granted") {
        new Notification("⚽ TOR!", {
          body: `${home} vs ${away} | Neuer Spielstand: ${score}`,
          icon: "https://cdn-icons-png.flaticon.com/512/51/51767.png"
        });
      }
    }
    previousScores[id] = score;

    matchList.appendChild(div);

    // Value Berechnung
    const einsatzInput = div.querySelector(`#einsatz-${id}`);
    const quoteInput = div.querySelector(`#quote-${id}`);
    const gewinnSpan = div.querySelector(`#gewinn-${id}`);

    function calcGewinn() {
      const einsatz = parseFloat(einsatzInput.value) || 0;
      const quote = parseFloat(quoteInput.value) || 0;
      const gewinn = (einsatz * quote).toFixed(2);
      gewinnSpan.textContent = `${gewinn} €`;
    }

    einsatzInput.addEventListener("input", calcGewinn);
    quoteInput.addEventListener("input", calcGewinn);
  });
}

function renderUpcomingMatches(matches) {
  const selectedLeague = upcomingLeagueFilter.value;
  const filtered = selectedLeague === "all" ? matches : matches.filter(m => m.league.name === selectedLeague);
  upcomingMatchList.innerHTML = "";

  filtered.forEach(match => {
    const id = match.fixture.id;
    const home = match.teams.home.name;
    const away = match.teams.away.name;
    const league = match.league.name;
    const startTime = new Date(match.fixture.date);
    const div = document.createElement("div");
    div.classList.add("match");
    div.setAttribute("data-id", id);

    const countdownSpan = document.createElement("span");
    countdownSpan.style.color = "#0f0";
    countdownSpan.style.fontWeight = "bold";

    div.innerHTML = `
      <h2>${home} vs ${away}</h2>
      <p>🏆 ${league} | 🕒 <span id="time-${id}">${startTime.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}</span></p>
    `;

    div.querySelector(`#time-${id}`).replaceWith(countdownSpan);
    upcomingMatchList.appendChild(div);

    if (upcomingTimers[id]) clearInterval(upcomingTimers[id]);

    upcomingTimers[id] = setInterval(() => {
      const now = new Date();
      const diff = startTime - now;

      if (diff <= 0) {
        countdownSpan.textContent = "läuft jetzt!";
        countdownSpan.style.color = "#ff4500";
        moveToLive(id);
        clearInterval(upcomingTimers[id]);
        return;
      }

      const minutes = Math.floor(diff / 1000 / 60);
      const seconds = Math.floor((diff / 1000) % 60);
      countdownSpan.textContent = `${minutes} Min ${seconds < 10 ? '0' : ''}${seconds} Sek`;

      if (minutes === 5 && seconds === 0) {
        triggerPreMatchAlarm(home, away, league, startTime);
      }
    }, 1000);
  });
}

function triggerPreMatchAlarm(home, away, league, startTime) {
  goalSound.play().catch(() => {});
  if (Notification.permission === "granted") {
    new Notification("⏳ Spiel startet bald!", {
      body: `${home} vs ${away} (${league})\nAnpfiff um ${startTime.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}`,
      icon: "https://cdn-icons-png.flaticon.com/512/51/51767.png"
    });
  }
}

function moveToLive(matchId) {
  const match = upcomingMatchesCache.find(m => m.fixture.id === matchId);
  if (!match) return;
  upcomingMatchesCache = upcomingMatchesCache.filter(m => m.fixture.id !== matchId);
  liveMatchesCache.push(match);
  renderUpcomingMatches(upcomingMatchesCache);
  renderMatches(liveMatchesCache);
}

fetchMatches();
fetchUpcomingMatches();
setInterval(fetchMatches, 60000);
setInterval(fetchUpcomingMatches, 120000);
