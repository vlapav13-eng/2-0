// Полный исправленный app.js

// === НАСТРОЙКИ ===
const API_SOURCES = [
  {
    name: "API-Football",
    url: (leagueId) => `https://v3.football.api-sports.io/fixtures?league=${leagueId}&season=2024`,
    headers: { "x-apisports-key": API_KEY }
  }
];

// Ключ API — вставь свой
const API_KEY = "YOUR_API_KEY_HERE";

// Список лиг
const LEAGUES = [
  { id: 39, name: "Premier League" },
  { id: 61, name: "Ligue 1" }
];

// Ключевые слова которые нужно исключать
const EXCLUDE_KEYWORDS = ["u19", "u21", "reserve", "women", "friendly"];

// Исправленный блок регулярных выражений
const EXCLUDE_REGEXES = EXCLUDE_KEYWORDS.map(k => {
  const esc = String(k).replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
  return { raw: k, re: new RegExp("\\b" + esc + "\\b", "i") };
});

// === ЛОГИКА ===

async function fetchFromSource(source, leagueId) {
  const response = await fetch(source.url(leagueId), { headers: source.headers });
  const data = await response.json();
  return data.response || [];
}

function isExcluded(teamName) {
  return EXCLUDE_REGEXES.some(r => r.re.test(teamName));
}

function calculateAvgGoals(last5) {
  if (!last5 || last5.length === 0) return 0;
  let total = 0;
  last5.forEach(m => {
    const h = m.goals?.home ?? 0;
    const a = m.goals?.away ?? 0;
    total += h + a;
  });
  return total / last5.length;
}

function log(msg) {
  const logBox = document.getElementById('log');
  logBox.value += msg + "\n";
  logBox.scrollTop = logBox.scrollHeight;
}

async function startSearch() {
  log("Старт поиска...");

  const results = [];

  for (const league of LEAGUES) {
    log(`\n▶ Лига: ${league.name}`);

    for (const src of API_SOURCES) {
      log(`Источник: ${src.name}`);
      try {
        const fixtures = await fetchFromSource(src, league.id);
        log("Получено матчей: " + fixtures.length);

        for (const f of fixtures) {
          const home = f.teams.home.name;
          const away = f.teams.away.name;

          if (isExcluded(home) || isExcluded(away)) {
            log(`— Исключено: ${home} vs ${away}`);
            continue;
          }

          const avg = calculateAvgGoals(f.last_5_matches || []);
          results.push({ match: `${home} vs ${away}`, avg });
          log(`Матч: ${home} — ${away}, средний тотал: ${avg}`);
        }
      } catch (e) {
        log("Ошибка источника: " + e.message);
      }
    }
  }

  log("\n=== ГОТОВО ===");
  console.log(results);
}

// Привязка кнопки
window.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("startButton");
  if (btn) {
    btn.addEventListener("click", startSearch);
  }
});
