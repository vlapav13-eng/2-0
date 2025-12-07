// app.js — проверка ВСЕХ мужских live-матчей (HT) с фильтрацией женских/юношеских/резервных
const API_KEY = "403e0d7c0f2f236034cf0475570195be";

/* ==== Чёрный список — ключевые слова, указывающие на нежелательные лиги:
       женские, юношеские, резервные, U-.., Youth, Ladies, Women, WSL, W-, W., Reserves и т.п.
       (при необходимости дополним) ==== */
const EXCLUDE_KEYWORDS = [
  "women", "women's", "womens", "w-", "w.", "wsf", "wsl", "ladies",
  "u21", "u20", "u19", "u18", "u17", "u23", "u-23", "u-21", "u-19",
  "under 21", "under 23", "under 19", "youth", "reserve", "reserves",
  "junior", "girls", "girls'", "academy", "colts"
];

let timerInterval = null;
let nextCheckTime = 0;
let isRunning = false;
let searchCountToday = 0;

const resultsDiv = document.getElementById("results");
const statusEl = document.getElementById("status");
const searchCountEl = document.getElementById("searchCount");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");

// Инициализация счётчика
loadSearchCounter();

// Кнопки
startBtn.onclick = () => {
  if (!isRunning) {
    startSearch();
    startBtn.classList.add("active");
  }
};
stopBtn.onclick = () => {
  stopSearch();
  startBtn.classList.remove("active");
};

// Считчик сегодня
function loadSearchCounter() {
  const saved = localStorage.getItem("searchCounter");
  const day = localStorage.getItem("searchDay");
  const today = new Date().toDateString();

  if (day !== today) {
    searchCountToday = 0;
    localStorage.setItem("searchDay", today);
    localStorage.setItem("searchCounter", "0");
  } else {
    searchCountToday = saved ? parseInt(saved, 10) : 0;
  }

  if (searchCountEl) searchCountEl.textContent = searchCountToday;
}
function saveSearchCounter() {
  localStorage.setItem("searchCounter", String(searchCountToday));
  localStorage.setItem("searchDay", new Date().toDateString());
}
function incrementSearchCounter() {
  searchCountToday++;
  saveSearchCounter();
  if (searchCountEl) searchCountEl.textContent = searchCountToday;
}

// UI helpers
function setStatus(text, cls = "") {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.className = "";
  if (cls) statusEl.classList.add(cls);
}

// Старт / стоп
function startSearch() {
  isRunning = true;
  setStatus("запущено…", "green");
  runCheck();
  runTimer();
}
function stopSearch() {
  isRunning = false;
  clearInterval(timerInterval);
  setStatus("остановлено", "red");
}

// Таймер 12 минут с обратным отсчётом в секундах
function runTimer() {
  nextCheckTime = 12 * 60;
  if (document.getElementById("timer")) document.getElementById("timer").textContent = `${nextCheckTime} сек`;
  timerInterval = setInterval(() => {
    if (!isRunning) return;
    nextCheckTime--;
    if (document.getElementById("timer")) document.getElementById("timer").textContent = `${nextCheckTime} сек`;
    if (nextCheckTime <= 0) {
      runCheck();
      nextCheckTime = 12 * 60;
    }
  }, 1000);
}

// Проверка: получаем ВСЕ live/HT матчи и фильтруем
async function runCheck() {
  try {
    incrementSearchCounter();

    resultsDiv.innerHTML = "";
    setStatus("проверка…", "yellow");

    // 1) Получаем все матчи со статусом HT (в перерыве)
    const fixturesUrl = `https://v3.football.api-sports.io/fixtures?status=HT`;
    const resp = await fetch(fixturesUrl, {
      headers: { "x-apisports-key": API_KEY }
    });
    if (!resp.ok) {
      const text = await resp.text().catch(()=>"");
      throw new Error(`Ошибка API fixtures: ${resp.status} ${text}`);
    }
    const json = await resp.json();
    const all = Array.isArray(json.response) ? json.response : [];

    // 2) Фильтруем походя по названию лиги — исключаем женские / юношеские / резервные
    const matchesHT = all.filter(f => {
      // безопасные проверки
      const leagueName = (f.league && (f.league.name || "")).toString().toLowerCase();
      if (!leagueName) return false;
      // исключаем по ключевым словам
      for (const k of EXCLUDE_KEYWORDS) {
        if (leagueName.includes(k)) return false;
      }
      // проверяем сами голы: 2-0 или 0-2
      const goals = f.goals || {};
      if (typeof goals.home !== "number" || typeof goals.away !== "number") return false;
      return (goals.home === 2 && goals.away === 0) || (goals.home === 0 && goals.away === 2);
    });

    if (matchesHT.length === 0) {
      setStatus("совпадений нет", "red");
      // оставляем пустой resultsDiv или пишем сообщение
      resultsDiv.innerHTML = `<div class="small">Подходящих матчей не найдено.</div>`;
      return;
    }

    // 3) Для каждого такого матча получаем avg по последним 5 матчам команд и фильтруем по 1.7
    const found = [];
    for (const f of matchesHT) {
      try {
        const homeId = f.teams?.home?.id;
        const awayId = f.teams?.away?.id;
        if (!homeId || !awayId) continue;

        const avg = await getAverageGoals(homeId, awayId);
        if (!avg) continue;

        if (avg.home <= 1.7 && avg.away <= 1.7) {
          found.push({
            league: f.league?.name || "League",
            home: f.teams.home?.name || "Home",
            away: f.teams.away?.name || "Away",
            avgHome: avg.home,
            avgAway: avg.away,
            ht: `${f.goals.home}-${f.goals.away}`
          });
        }
      } catch(e) {
        // не прерываем цикл из-за одной ошибки
        console.warn("Ошибка обработки матча:", e);
        continue;
      }
    }

    if (found.length === 0) {
      setStatus("совпадений нет", "red");
      resultsDiv.innerHTML = `<div class="small">Подходящих матчей не найдено после проверки средних.</div>`;
      return;
    }

    // 4) Вывод результатов
    setStatus(`найдено матчей: ${found.length}`, "green");
    playTripleBeep();
    for (const m of found) {
      const block = document.createElement("div");
      block.className = "match-box";
      block.innerHTML = `<b>${escapeHtml(m.league)}</b><br>
                         ${escapeHtml(m.home)} — ${escapeHtml(m.away)} | HT: ${m.ht}<br>
                         Средний голов (5): ${m.avgHome.toFixed(2)} / ${m.avgAway.toFixed(2)}`;
      resultsDiv.appendChild(block);
    }

  } catch (err) {
    console.error(err);
    setStatus("Ошибка при проверке (см. консоль)", "red");
    resultsDiv.innerHTML = `<div class="small">Ошибка при обращении к API — проверь ключ и доступность сервиса.</div>`;
  }
}

// Возвращает средние голов по последним 5 матчам для каждой команды
async function getAverageGoals(homeId, awayId) {
  try {
    const base = `https://v3.football.api-sports.io/fixtures?last=5&team=`;
    const [rh, ra] = await Promise.all([
      fetch(base + homeId, { headers: { "x-apisports-key": API_KEY } }),
      fetch(base + awayId, { headers: { "x-apisports-key": API_KEY } })
    ]);
    if (!rh.ok || !ra.ok) return null;
    const [hd, ad] = await Promise.all([rh.json(), ra.json()]);
    const hArr = (hd.response || []).map(m => {
      if (!m.goals) return null;
      return (m.teams?.home?.id === homeId) ? m.goals.home : m.goals.away;
    }).filter(v => typeof v === "number");
    const aArr = (ad.response || []).map(m => {
      if (!m.goals) return null;
      return (m.teams?.home?.id === awayId) ? m.goals.home : m.goals.away;
    }).filter(v => typeof v === "number");
    if (hArr.length === 0 || aArr.length === 0) return null;
    const hAvg = +(hArr.reduce((s, v) => s + v, 0) / hArr.length).toFixed(2);
    const aAvg = +(aArr.reduce((s, v) => s + v, 0) / aArr.length).toFixed(2);
    return { home: hAvg, away: aAvg };
  } catch (e) {
    console.warn("getAverageGoals error", e);
    return null;
  }
}

// Тройной сигнал
function playTripleBeep() {
  try {
    const audio = new Audio("beep.mp3");
    audio.play().catch(()=>{});
    setTimeout(()=>{ audio.currentTime = 0; audio.play().catch(()=>{}); }, 400);
    setTimeout(()=>{ audio.currentTime = 0; audio.play().catch(()=>{}); }, 800);
  } catch(e){ console.warn("beep error", e); }
}

// защита вывода HTML
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]);
}
    
    
   
 
