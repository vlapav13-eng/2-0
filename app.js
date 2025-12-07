// =====================
//     НАСТРОЙКИ
// =====================

// Твой ключ API-Sports
const API_KEY = "a66f87d6c56c44bbf95cf72c9f8363e7";

// Список источников (теперь уже после API_KEY!)
const API_SOURCES = [
  {
    name: "API-Football",
    urlFixtures: (leagueId) =>
      `https://v3.football.api-sports.io/fixtures?league=${leagueId}&season=2024`,
    urlLastMatches: (teamId) =>
      `https://v3.football.api-sports.io/fixtures?team=${teamId}&last=5`,
    headers: { "x-apisports-key": API_KEY }
  }
];

// Список лиг
const LEAGUES = [
  { id: 39, name: "Premier League" },
  { id: 61, name: "Ligue 1" }
];

// Слова для исключения
const EXCLUDE_KEYWORDS = ["u19", "u21", "reserve", "women", "friendly"];

// Создаём RegExp
const EXCLUDE_REGEXES = EXCLUDE_KEYWORDS.map(k => {
  const esc = String(k).replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
  return { raw: k, re: new RegExp("\\b" + esc + "\\b", "i") };
});

// =====================
//     ЛОГИКА
// =====================

function log(msg) {
  const logBox = document.getElementById("log");
  logBox.value += msg + "\n";
  logBox.scrollTop = logBox.scrollHeight;
}

function isExcluded(name) {
  return EXCLUDE_REGEXES.some(k => k.re.test(name));
}

async function fetchJSON(url, headers) {
  const res = await fetch(url, { headers });
  const data = await res.json();
  return data.response || [];
}

async function getLastMatches(source, teamId) {
  const url = source.urlLastMatches(teamId);
  return await fetchJSON(url, source.headers);
}

function calcAvgGoals(matches) {
  if (!matches || matches.length === 0) return 0;

  let total = 0;
  for (const m of matches) {
    total += (m.goals?.home ?? 0) + (m.goals?.away ?? 0);
  }
  return total / matches.length;
}

async function startSearch() {
  log("СТАРТ ПОИСКА...");
  const found = [];

  for (const league of LEAGUES) {
    log(`\nЛига: ${league.name}`);

    for (const src of API_SOURCES) {
      log(`Источник: ${src.name}`);

      // Загружаем будущие матчи
      const fixtures = await fetchJSON(src.urlFixtures(league.id), src.headers);
      log(`Получено матчей: ${fixtures.length}`);

      for (const f of fixtures) {
        const home = f.teams.home;
        const away = f.teams.away;

        if (!home?.name || !away?.name) continue;

        // Фильтр по ключевым словам
        if (isExcluded(home.name) || isExcluded(away.name)) {
          log(`– Исключено: ${home.name} vs ${away.name}`);
          continue;
        }

        // Берём последние 5 матчей обеих команд
        const lastHome = await getLastMatches(src, home.id);
        const lastAway = await getLastMatches(src, away.id);

        const avgHome = calcAvgGoals(lastHome);
        const avgAway = calcAvgGoals(lastAway);

        const avgTotal = ((avgHome + avgAway) / 2).toFixed(2);

        log(
          `Матч: ${home.name} — ${away.name} | Ср. тотал = ${avgTotal}`
        );

        found.push({
          match: `${home.name} vs ${away.name}`,
          avg: avgTotal
        });
      }
    }
  }

  log("\n=== ГОТОВО ===");
  console.log(found);
}

// Привязка кнопки
window.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("startButton");
  if (btn) btn.addEventListener("click", startSearch);
});
