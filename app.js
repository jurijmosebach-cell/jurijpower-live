const apiKey = "c6ad1210c71b17cca24284ab8a9873b4";

const matchList = document.getElementById("matchList");
const refreshBtn = document.getElementById("refreshBtn");
const leagueFilter = document.getElementById("leagueFilter");
const upcomingMatchList = document.getElementById("upcomingMatchList");
const upcomingLeagueFilter = document.getElementById("upcomingLeagueFilter");

// 🧪 Debug-Anzeige
const debugDiv = document.createElement("div");
debugDiv.style.padding = "10px";
debugDiv.style.fontSize = "12px";
debugDiv.style.color = "#0f0";
debugDiv.style.backgroundColor = "#111";
debugDiv.innerText = "🧪 Debug aktiv – warte auf Antwort…";
document.body.appendChild(debugDiv);

// 🕒 Letztes Update
const updateDiv = document.createElement("div");
updateDiv.style.padding = "10px";
updateDiv.style.fontSize = "12px";
updateDiv.style.color = "#bbb";
updateDiv.style.backgroundColor = "#000";
updateDiv.style.textAlign = "center";
updateDiv.innerText = "Letztes Update: –";
document.body.appendChild(updateDiv);

// 🔔 Toralarm
const goalSound = new Audio("https://actions.google.com/sounds/v1/alarms/beep_short.ogg");
if ("Notification" in window) {
  Notification.requestPermission().then(permission => {
    console.log("Push Berechtigung:", permission);
  });
}

// 🧠 Speicher
let previousScores = {};
let upcomingTimers = {};
let upcomingMatchesCache = [];
let liveMatchesCache = [];

// ===================== LIVE =====================

async function fetchMatches() {
  matchList.innerHTML = "⏳ Lade Live-Daten...";
  debugDiv.innerText = "⏳ Anfrage an API gesendet...";
  try {
    const res = await fetch("https://v3.football.api-sports.io/fixtures?live=all", {
      headers: { "x-apisports-key": apiKey }
    });
    const data = await res.json();
    console.log("Live Daten:", data);
    liveMatchesCache = data.response;

    debugDiv.innerText = `✅ Antwort empfangen: ${liveMatchesCache?.length || 0} Spiele`;
    updateDiv.innerText = `Letztes Update: ${new Date().toLocaleTimeString()}`;

    if (!liveMatchesCache || liveMatchesCache.length === 0) {
      matchList.innerHTML = "⚽ Keine Live-Spiele aktuell.";
      return;
    }

    const leagues = [...new Set(liveMatchesCache.map(m => m.league.name))];
    leagueFilter.innerHTML = `<option value="all">Alle Ligen</option>`;
    leagues.forEach(league => {
      const opt = document.createElement("option");
      opt.value = league;
      opt.textContent = league;
      leagueFilter.appendChild(opt);
    });

    renderMatches(liveMatchesCache);
  } catch (error) {
    matchList.innerHTML = "❌ Fehler beim Laden.";
    debugDiv.innerText = "❌ API-Fehler — siehe Konsole!";
    console.error(error);
  }
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
    `;

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
  });
}

// ===================== KOMMENDE SPIELE =====================

async function fetchUpcomingMatches() {
  upcomingMatchList.innerHTML = "⏳ Lade kommende Spiele...";
  try {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const from = now.toISOString().split("T")[0];
    const to = tomorrow.toISOString().split("T")[0];

    const res = await fetch(`https://v3.football.api-sports.io/fixtures?from=${from}&to=${to}`, {
      headers: { "x-apisports-key": apiKey }
    });
    const data = await res.json();
    upcomingMatchesCache = data.response;

    console.log("Kommende Spiele:", upcomingMatchesCache);

    if (!upcomingMatchesCache || upcomingMatchesCache.length === 0) {
      upcomingMatchList.innerHTML = "📭 Keine Spiele in den nächsten 24 Stunden.";
      return;
    }

    const leagues = [...new Set(upcomingMatchesCache.map(m => m.league.name))];
    upcomingLeagueFilter.innerHTML = `<option value="all">Alle Ligen</option>`;
    leagues.forEach(league => {
      const opt = document.createElement("option");
      opt.value = league;
      opt.textContent = league;
      upcomingLeagueFilter.appendChild(opt);
    });

    renderUpcomingMatches(upcomingMatchesCache);
  } catch (error) {
    upcomingMatchList.innerHTML = "❌ Fehler beim Laden.";
    console.error(error);
  }
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

// ===================== ALARM =====================

function triggerPreMatchAlarm(home, away, league, startTime) {
  const matchInfo = `${home} vs ${away} (${league})`;
  goalSound.play().catch(err => console.warn("Ton konnte nicht abgespielt werden", err));
  if (Notification.permission === "granted") {
    new Notification("⏳ Spiel startet bald!", {
      body: `${matchInfo}\nAnpfiff um ${startTime.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}`,
      icon: "https://cdn-icons-png.flaticon.com/512/51/51767.png"
    });
  }
  console.log("⏳ Alarm 5 Minuten vor Spielbeginn für:", matchInfo);
}

// ===================== AUTOMATISCH IN LIVE VERSCHIEBEN =====================

function moveToLive(matchId) {
  const match = upcomingMatchesCache.find(m => m.fixture.id === matchId);
  if (!match) return;

  upcomingMatchesCache = upcomingMatchesCache.filter(m => m.fixture.id !== matchId);
  liveMatchesCache.push(match);

  console.log(`📡 ${match.teams.home.name} vs ${match.teams.away.name} ist jetzt LIVE`);

  renderUpcomingMatches(upcomingMatchesCache);
  renderMatches(liveMatchesCache);
}

// ===================== START =====================

refreshBtn.addEventListener("click", fetchMatches);
leagueFilter.addEventListener("change", () => renderMatches(liveMatchesCache));
upcomingLeagueFilter.addEventListener("change", () => renderUpcomingMatches(upcomingMatchesCache));

fetchMatches();
fetchUpcomingMatches();

setInterval(fetchMatches, 30000); // Live alle 30 Sek
setInterval(fetchUpcomingMatches, 120000); // Upcoming alle 2 Min
