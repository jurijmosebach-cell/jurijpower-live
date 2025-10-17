// === ⚽ JurijPower Live Tool ===
// API KEY
const API_KEY = "c6ad1210c71b17cca24284ab8a9873b4";
const BASE_URL = "https://v3.football.api-sports.io";

const liveContainer = document.getElementById("live-matches");
const upcomingContainer = document.getElementById("upcoming-matches");
const comboContainer = document.getElementById("combo-container");
const lastUpdate = document.getElementById("lastUpdate");

let comboQuotes = [];

// === LIVE SPIELE HOLEN ===
async function fetchMatches() {
  const headers = { "x-apisports-key": API_KEY };
  const url = `${BASE_URL}/fixtures?live=all`;
  const res = await fetch(url, { headers });
  const data = await res.json();
  return data.response;
}

// === SPIELE NÄCHSTE 24H HOLEN ===
async function fetchUpcoming() {
  const headers = { "x-apisports-key": API_KEY };
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const todayStr = now.toISOString().split("T")[0];
  const tomorrowStr = tomorrow.toISOString().split("T")[0];

  const url = `${BASE_URL}/fixtures?from=${todayStr}&to=${tomorrowStr}`;
  const res = await fetch(url, { headers });
  const data = await res.json();
  return data.response;
}

// === SPIELE DARSTELLEN ===
function renderMatches(matches, container) {
  container.innerHTML = "";
  matches.forEach((match, index) => {
    const home = match.teams.home.name;
    const away = match.teams.away.name;
    const league = match.league.name;
    const goalsHome = match.goals.home ?? 0;
    const goalsAway = match.goals.away ?? 0;
    const status = match.fixture.status.short;
    const time = new Date(match.fixture.date).toLocaleString();

    const card = document.createElement("div");
    card.className = "match-card";
    card.innerHTML = `
      <h3>${home} vs ${away}</h3>
      <p>🏆 ${league}<br>🕒 ${status} | ${time}<br>⚽ ${goalsHome} : ${goalsAway}</p>
      <div class="inputs">
        💶 Einsatz: <input type="number" class="einsatz" placeholder="€" />
        📈 Quote: <input type="number" class="quote" placeholder="z.B. 2.50" step="0.01" />
        📊 Value %: <input type="number" class="value" placeholder="z.B. 55" step="0.1" />
      </div>
      <div>
        🪙 Gewinn: <span class="gewinn">0 €</span><br>
        <button class="add-combo">+ Kombi</button>
      </div>
    `;
    container.appendChild(card);

    const einsatz = card.querySelector(".einsatz");
    const quote = card.querySelector(".quote");
    const value = card.querySelector(".value");
    const gewinn = card.querySelector(".gewinn");
    const addCombo = card.querySelector(".add-combo");

    // Einzelgewinn
    const calc = () => {
      const e = parseFloat(einsatz.value) || 0;
      const q = parseFloat(quote.value) || 0;
      const val = parseFloat(value.value) || 0;
      const g = e * q;
      gewinn.textContent = g.toFixed(2) + " €";

      if (val > 0 && q > 0) {
        // Value % Berechnung (vereinfacht)
        const fairQuote = 100 / val;
        if (q > fairQuote) {
          card.style.border = "2px solid limegreen"; // Value Bet ✅
        } else {
          card.style.border = "2px solid red"; // kein Value ❌
        }
      } else {
        card.style.border = "1px solid #444";
      }
    };

    einsatz.addEventListener("input", calc);
    quote.addEventListener("input", calc);
    value.addEventListener("input", calc);

    // Kombi hinzufügen
    addCombo.addEventListener("click", () => {
      const q = parseFloat(quote.value);
      if (!q || comboQuotes.length >= 10) return;
      comboQuotes.push(q);
      renderCombo();
    });
  });
}

// === KOMBIWETTE ===
function renderCombo() {
  comboContainer.innerHTML = "";
  if (comboQuotes.length === 0) return;

  const totalQuote = comboQuotes.reduce((acc, q) => acc * q, 1);
  const einsatzInput = document.createElement("input");
  einsatzInput.type = "number";
  einsatzInput.placeholder = "Einsatz (€)";

  const resultText = document.createElement("div");
  resultText.textContent = `Gesamtquote: ${totalQuote.toFixed(2)}`;

  einsatzInput.addEventListener("input", () => {
    const einsatz = parseFloat(einsatzInput.value) || 0;
    const gewinn = einsatz * totalQuote;
    resultText.textContent = `Gesamtquote: ${totalQuote.toFixed(2)} | Gewinn: ${gewinn.toFixed(2)} €`;
  });

  const clearBtn = document.createElement("button");
  clearBtn.textContent = "🧹 Kombi löschen";
  clearBtn.addEventListener("click", () => {
    comboQuotes = [];
    renderCombo();
  });

  comboContainer.appendChild(einsatzInput);
  comboContainer.appendChild(resultText);
  comboContainer.appendChild(clearBtn);
}

// === PUSH-NOTIFICATION ===
function sendGoalNotification(home, away, score) {
  if (Notification.permission === "granted" && navigator.serviceWorker) {
    navigator.serviceWorker.getRegistration().then(reg => {
      if (reg) {
        reg.showNotification("⚽ TOR!", {
          body: `${home} vs ${away}\nSpielstand: ${score}`,
          icon: "icon.png"
        });
      }
    });
  }
}

// === DATEN AKTUALISIEREN ===
async function updateData() {
  try {
    const liveMatches = await fetchMatches();
    const upcomingMatches = await fetchUpcoming();
    renderMatches(liveMatches, liveContainer);
    renderMatches(upcomingMatches, upcomingContainer);
    lastUpdate.textContent = new Date().toLocaleTimeString();
  } catch (err) {
    console.error("API Fehler:", err);
  }
}

document.getElementById("refreshButton").addEventListener("click", updateData);

// === SERVICE WORKER REGISTRIEREN ===
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js");
}

if (Notification.permission !== "granted") {
  Notification.requestPermission();
}

updateData();
setInterval(updateData, 60 * 1000);
