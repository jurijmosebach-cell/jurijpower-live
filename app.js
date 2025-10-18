const API_KEY = "c6ad1210c71b17cca24284ab8a9873b4";  // ⬅️ Deinen API-Key einsetzen
const BASE_URL = "https://v3.football.api-sports.io";

document.getElementById('refresh').addEventListener('click', () => {
    loadData();
});

document.getElementById('copy-combo').addEventListener('click', () => {
    navigator.clipboard.writeText(comboText);
    alert("Kombi kopiert ✅");
});

let comboText = "";

// Standard Funktion zum Abrufen von API-Daten
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

// Hauptladefunktion
async function loadData() {
    document.getElementById('last-update').textContent = new Date().toLocaleTimeString();

    // Live Spiele
    const live = await fetchAPI("/fixtures?live=all");

    // Pre-Match: heutige Spiele
    const today = new Date().toISOString().split('T')[0];
    const upcoming = await fetchAPI(`/fixtures?date=${today}`);

    // Quoten für beide Arten (Live & Pre)
    const oddsLive = await fetchAPI("/odds?live=all");
    const oddsPre = await fetchAPI(`/odds?date=${today}`);

    renderMatches(live.response, "live-matches", "LIVE");
    renderMatches(upcoming.response, "upcoming-matches", "PREMATCH");

    calculateBestCombo([...oddsLive.response, ...oddsPre.response]);
}

// Spiele rendern
function renderMatches(matches, containerId, type) {
    const container = document.getElementById(containerId);
    container.innerHTML = "";
    if (!matches || matches.length === 0) {
        container.innerHTML = "<p>Keine Spiele gefunden</p>";
        return;
    }

    matches.forEach(m => {
        const div = document.createElement("div");
        div.className = "match";
        div.textContent = `${m.teams.home.name} vs ${m.teams.away.name} (${type})`;
        container.appendChild(div);
    });
}

// Kombi berechnen – beste Quoten finden
function calculateBestCombo(odds) {
    if (!odds || odds.length === 0) {
        document.getElementById('total-odds').textContent = "1.00";
        document.getElementById('total-value').textContent = "1.00";
        return;
    }

    // Sortiere nach höchster Quote (einfachste Value-Strategie)
    const best = odds.sort((a, b) => {
        const oddA = parseFloat(a.bookmakers[0]?.bets[0]?.values[0]?.odd || 1);
        const oddB = parseFloat(b.bookmakers[0]?.bets[0]?.values[0]?.odd || 1);
        return oddB - oddA;
    }).slice(0, 3); // Top 3 Kombi

    let totalOdds = 1;
    comboText = "";

    best.forEach(o => {
        const home = o.fixture.teams.home.name;
        const away = o.fixture.teams.away.name;
        const odd = parseFloat(o.bookmakers[0].bets[0].values[0].odd);
        totalOdds *= odd;
        comboText += `${home} vs ${away} — Quote ${odd}\n`;
    });

    document.getElementById('total-odds').textContent = totalOdds.toFixed(2);
    document.getElementById('total-value').textContent = (totalOdds * 1.0).toFixed(2);
}

loadData();
