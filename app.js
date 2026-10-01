// Adresa tvého Cloudflare Workeru (po nasazení ji sem doplň).
const API_URL = "https://odjezdy-183.sebastian-jozef-sevc.workers.dev/";

const SHOW = 5;              // kolik odjezdů zobrazit
const FETCH_EVERY = 45_000;  // obnova dat z API
const TICK_EVERY = 15_000;   // přepočet "za X min"
const STALE_AFTER = 3 * 60_000; // po jaké době data označit jako stará
const STORE_KEY = "odjezdy-183";

const listEl = document.getElementById("list");
const emptyEl = document.getElementById("empty");
const statusEl = document.getElementById("status");

let data = loadStored(); // { updated: ISO, departures: [{ t: ISO, delay }] }
let lastError = null;

function loadStored() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || null; } catch { return null; }
}

function store(d) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(d)); } catch {}
}

// Ukázková data pro náhled bez Workeru: otevři stránku s ?demo
function demoData() {
  const now = Date.now();
  return {
    updated: new Date(now).toISOString(),
    departures: [0.5, 5, 15, 28, 41, 55].map((m) => ({
      t: new Date(now + m * 60_000).toISOString(),
      delay: 0,
    })),
  };
}

async function refresh() {
  try {
    if (new URLSearchParams(location.search).has("demo")) {
      data = demoData();
    } else {
      const res = await fetch(API_URL, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "HTTP " + res.status);
      data = json;
      store(data);
    }
    lastError = null;
  } catch (err) {
    lastError = err;
  }
  render();
}

function render() {
  const now = Date.now();

  // odjezdy, které už proběhly (s malou tolerancí), zahodíme
  const upcoming = (data?.departures || [])
    .map((d) => Date.parse(d.t))
    .filter((t) => t - now > -30_000)
    .slice(0, SHOW);

  listEl.innerHTML = upcoming
    .map((t) => {
      const min = Math.floor((t - now) / 60_000);
      return min < 1
        ? `<li class="now"><span class="num">teď</span></li>`
        : `<li><span class="pre">za</span><span class="num">${min}</span><span class="unit">min</span></li>`;
    })
    .join("");

  if (upcoming.length === 0) {
    emptyEl.hidden = false;
    emptyEl.textContent = data ? "V příštích hodinách nic nejede" : "";
  } else {
    emptyEl.hidden = true;
  }

  renderStatus(now);
}

function renderStatus(now) {
  const age = data ? now - Date.parse(data.updated) : Infinity;
  const stale = age > STALE_AFTER;

  if (!data && lastError) {
    statusEl.textContent = "Nepodařilo se načíst data";
  } else if (!data) {
    statusEl.textContent = "Načítám…";
  } else if (stale || lastError) {
    statusEl.textContent = `Stará data (${formatAge(age)}) – zkouším znovu`;
  } else {
    statusEl.textContent = "Živá data";
  }
  statusEl.classList.toggle("warn", Boolean(lastError) || stale);
}

function formatAge(ms) {
  const min = Math.round(ms / 60_000);
  if (min < 1) return "před chvílí";
  if (min < 60) return `před ${min} min`;
  return `před ${Math.round(min / 60)} h`;
}

// Časovače. iOS je při uspání aplikace pozastaví, proto po návratu
// do popředí hned přepočítáme a stáhneme čerstvá data.
let fetchTimer, tickTimer;

function start() {
  stop();
  render();
  refresh();
  fetchTimer = setInterval(refresh, FETCH_EVERY);
  tickTimer = setInterval(render, TICK_EVERY);
}

function stop() {
  clearInterval(fetchTimer);
  clearInterval(tickTimer);
}

document.addEventListener("visibilitychange", () => {
  document.hidden ? stop() : start();
});
window.addEventListener("pageshow", (e) => { if (e.persisted) start(); });

start();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
