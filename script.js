// ВНИМАНИЕ: в этом файле используется ваш RapidAPI ключ, вставленный ниже.
// Если будешь выкладывать публично — будь осторожен (ключ доступен в клиентском коде).
const RAPIDAPI_KEY = "403e0d7c0f2f236034cf0475570195be";
const RAPIDAPI_HOST = "api-football-v1.p.rapidapi.com"; // для RapidAPI wrapper v3

// Интервал проверки (12 минут)
const CHECK_INTERVAL_MS = 12 * 60 * 1000;
let countdown = 12 * 60;
let timerInterval = null;
let checkIntervalId = null;

 const LEAGUES = [
  "England: Premier League",
  "Spain: La Liga",
  "Germany: Bundesliga",
  "Italy: Serie A",
  "France: Ligue 1",
  "Portugal: Primeira Liga",
  "Netherlands: Eredivisie",
  "Belgium: Jupiler Pro League",
  "Turkey: Super Lig",
  "Greece: Super League",
  "Austria: Bundesliga",
  "Switzerland: Super League",
  "Denmark: Superliga",
  "Norway: Eliteserien",
  "Sweden: Allsvenskan",
  "Poland: Ekstraklasa",
  "Czech Republic: First League",
  "Croatia: HNL",
  "Serbia: SuperLiga",
  "Ukraine: Premier League",
  "Russia: Premier League",
  "Scotland: Premiership",
  "Hungary: NB I",
  "Romania: Liga I",
  "Slovakia: Super Liga",
  "Slovenia: PrvaLiga",
  "Bulgaria: First League",
  "Israel: Ligat ha'Al",
  "Cyprus: First Division",
  "USA: MLS",
  "Brazil: Serie A",
  "Argentina: Liga Profesional",
  "Mexico: Liga MX",
  "Chile: Primera División",
  "Uruguay: Primera División",
  "Colombia: Liga BetPlay",
  "Ecuador: Serie A",
  "Peru: Liga 1",
  "Paraguay: Primera División",
  "Japan: J1 League",
  "South Korea: K League 1",
  "China: Super League",
  "Saudi Arabia: Pro League",
  "UAE: Pro League",
  "Qatar: Stars League",
  "Australia: A-League"
];
];

// Элементы DOM
const startBtn = document.getElementById("startButton");
const stopBtn = document.getElementById("stopButton");
const timerEl = document.getElementById("timer");
const statusEl = document.getElementById("status");
const matchesEl = document.getElementById("matches");
const logEl = document.getElementById("log");
const statsEl = document.getElementById("stats");
const alertSound = document.getElementById("alertSound");

// --- Простые UI функции ---
function setStatus(text, type = "info") {
  statusEl.textContent = text;
  statusEl.className = "status";
  if (type === "good") statusEl.classList.add("good");
  else if (type === "bad") statusEl.classList.add("bad");
  else statusEl.classList.add("info");
}

function logMessage(text) {
  const time = new Date().toLocaleString();
  const node = document.createElement("div");
  node.className = "logItem";
  node.textContent = `[${time}] ${text}`;
  logEl.prepend(node);
}

// --- Статистика только за 1 день (сегодня) ---
function getTodayKey() {
  const d = new Date();
  return d.toISOString().slice(0,10); // YYYY-MM-DD
}
function loadTodayStat() {
  const raw = localStorage.getItem("statSingleDay");
  if (!raw) return { date: getTodayKey(), count: 0 };
  try {
    const obj = JSON.parse(raw);
    if (obj.date !== getTodayKey()) return { date: getTodayKey(), count: 0 };
    return obj;
  } catch { return { date: getTodayKey(), count: 0 }; }
}
function saveTodayStat(obj) {
  localStorage.setItem("statSingleDay", JSON.stringify(obj));
}
function incTodayCount(n) {
  const s = loadTodayStat();
  s.count = (s.count || 0) + (n||0);
  s.date = getTodayKey();
  saveTodayStat(s);
  renderTodayStat();
}
function renderTodayStat() {
  const s = loadTodayStat();
  statsEl.textContent = `${s.date}: найдено матчей сегодня — ${s.count}`;
}

// --- Timer UI ---
function updateTimerUI() {
  const m = String(Math.floor(countdown/60)).padStart(2,'0');
  const s = String(countdown%60).padStart(2,'0');
  timerEl.textContent = `${m}:${s}`;
  if (countdown>0) countdown--;
  else countdown = 12*60;
}

// --- Audio triple play ---
function playTriple() {
  if (!alertSound) return;
  try {
    alertSound.currentTime = 0;
    alertSound.play().catch(()=>{});
    setTimeout(()=>{ alertSound.currentTime = 0; alertSound.play().catch(()=>{}); }, 500);
    setTimeout(()=>{ alertSound.currentTime = 0; alertSound.play().catch(()=>{}); }, 1000);
  } catch(e){ console.warn("sound play error", e); }
}

// --- API helpers ---
// wrapper fetch to API-Football via RapidAPI
async function apiFetch(path, params = {}) {
  const url = new URL(`https://${RAPIDAPI_HOST}/v3/${path}`);
  Object.keys(params).forEach(k => url.searchParams.append(k, params[k]));
  const resp = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "x-rapidapi-key": RAPIDAPI_KEY,
      "x-rapidapi-host": RAPIDAPI_HOST
    }
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`API error ${resp.status}: ${text}`);
  }
  const json = await resp.json();
  return json;
}

// --- Core check logic ---
// 1) Получаем все live fixtures с HT (statusShort === "HT").
// 2) Фильтруем те, у которых счёт 2-0 или 0-2.
// 3) Для каждого такого матча запрашиваем последние 5 матчей каждой команды,
//    считаем средний голов за 5 матчей (если мало матчей — по тому, что есть).
// 4) Выводим все данные на страницу: лига, команды, счет HT, avgGoalsHome, avgGoalsAway, projectedTotal,
//    отметка Under 3.5 / Under 4.0.
// 5) Если найден хотя бы один — тройной сигнал и сохранение в статистику.

async function checkMatchesReal() {
  try {
    setStatus("Проверяем live-матчи (HT)...", "info");
    logMessage("Запрос live-матчей (HT) к API...");

    // Получаем текущие live матчи; можно использовать status=HT или live=all и фильтровать.
    // Используем status=HT для точности.
    const fixturesResp = await apiFetch("fixtures", { status: "HT" });
    const list = fixturesResp.response || [];

    // Фильтр по счёту 2-0 или 0-2
    const matchesHT = list.filter(f => {
      const g = f.goals || {};
      if (typeof g.home !== "number" || typeof g.away !== "number") return false;
      return (g.home === 2 && g.away === 0) || (g.home === 0 && g.away === 2);
    });

    if (matchesHT.length === 0) {
      setStatus("Совпадений нет", "bad");
      matchesEl.innerHTML = "<div class='small'>Подходящих матчей не найдено.</div>";
      logMessage("Подходящих матчей не найдено.");
      incTodayCount(0); // сохраняем 0
      return;
    }

    // Для каждого матча получаем дополнительные данные: последние 5 матчей каждой команды
    const detailed = [];
    for (const f of matchesHT) {
      const fixtureId = f.fixture && f.fixture.id;
      const leagueName = f.league && f.league.name;
      const leagueCountry = f.league && f.league.country;
      const teams = f.teams || {};
      const goals = f.goals || {};
      const home = teams.home;
      const away = teams.away;

      // helper to fetch last 5 fixtures for team
      async function getLastMatchesGoals(teamId) {
        try {
          // last=5
          const resp = await apiFetch("fixtures", { team: teamId, last: 5 });
          const arr = resp.response || [];
          // compute goals FOR this team in each match
          const goalsFor = arr
            .map(m => {
              // m.teams.home.id vs m.teams.away.id
              if (!m.goals) return null;
              if (m.teams && m.teams.home && m.teams.away) {
                if (m.teams.home.id === teamId) return m.goals.home;
                if (m.teams.away.id === teamId) return m.goals.away;
              }
              return null;
            })
            .filter(v => typeof v === "number");
          if (goalsFor.length === 0) return { avg: 0, sample: 0 };
          const sum = goalsFor.reduce((a,b)=>a+b,0);
          return { avg: +(sum / goalsFor.length).toFixed(2), sample: goalsFor.length };
        } catch (e) {
          console.warn("Ошибка получения последних матчей команды", teamId, e);
          return { avg: 0, sample: 0 };
        }
      }

      // Запрос последних матчей для домашней и гостевой команды параллельно
      const [homeStats, awayStats] = await Promise.all([
        getLastMatchesGoals(home.id),
        getLastMatchesGoals(away.id)
      ]);

      const projectedTotal = +(homeStats.avg + awayStats.avg).toFixed(2);
      const under35 = projectedTotal < 3.5;
      const under40 = projectedTotal < 4.0;

      detailed.push({
        fixtureId,
        leagueName,
        leagueCountry,
        homeName: home.name,
        awayName: away.name,
        scoreHome: goals.home,
        scoreAway: goals.away,
        homeAvgLast7: homeStats.avg,
        awayAvgLast7: awayStats.avg,
        projectedTotal,
        under35,
        under40
      });
    }

    // Выводим все найденные матчи
    matchesEl.innerHTML = "";
    for (const d of detailed) {
      const div = document.createElement("div");
      div.className = "match-item";
      div.innerHTML = `
        <div class="match-top">
          <div>${d.homeName} — ${d.awayName}</div>
          <div class="small">${d.leagueName} (${d.leagueCountry || ""})</div>
        </div>
        <div class="match-meta">
          Счёт в перерыве: <strong>${d.scoreHome} : ${d.scoreAway}</strong> |
          Средний голов (посл.5): ${d.homeAvgLast5} / ${d.awayAvgLast5} |
          Проектируемый тотал: <strong>${d.projectedTotal}</strong>
        </div>
        <div class="small">
          Рекомендация: 
          ${d.under35 ? "<strong>Under 3.5</strong>" : "Not Under 3.5"} · 
          ${d.under40 ? "<strong>Under 4.0</strong>" : "Not Under 4.0"}
        </div>
      `;
      matchesEl.appendChild(div);
    }

    // Сигнал и статистика
    playTriple();
    incTodayCount(detailed.length);
    setStatus(`НАЙДЕНО матчей: ${detailed.length}`, "good");
    logMessage(`Найдено ${detailed.length} подходящих матча(ов).`);
  } catch (err) {
    console.error(err);
    setStatus("Ошибка при запросе API", "bad");
    logMessage("Ошибка API: " + (err.message || err));
  }
}

// --- Управление проверками ---
function startChecks() {
  if (checkIntervalId) return;
  // Сброс таймера
  countdown = 12*60;
  updateTimerUI();
  timerInterval = setInterval(updateTimerUI, 1000);
  // Первый запуск сразу
  checkMatchesReal();
  checkIntervalId = setInterval(checkMatchesReal, CHECK_INTERVAL_MS);

  startBtn.classList.add("btn-green");
  setStatus("Проверки включены (каждые 12 минут)", "info");
  logMessage("Проверки включены (каждые 12 минут).");
}

function stopChecks() {
  if (timerInterval) clearInterval(timerInterval);
  if (checkIntervalId) clearInterval(checkIntervalId);
  timerInterval = null;
  checkIntervalId = null;

  startBtn.classList.remove("btn-green");
  setStatus("Остановлено", "bad");
  logMessage("Проверки остановлены.");
}

// события
startBtn.addEventListener("click", startChecks);
stopBtn.addEventListener("click", stopChecks);

// init
renderTodayStat();
setStatus("Готово. Нажмите ПУСК для запуска.", "info");



    

  
