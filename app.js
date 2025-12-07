// app.js — исправленный с полной диагностикой
const API_KEY = "403e0d7c0f2f236034cf0475570195be";

/* ==== Чёрный список ключевых слов (исключаем женские/юношеские/резервные/аматорские) ==== */
// Сохранил те же ключевые слова, что и у тебя — но добавил корректное сопоставление (word-boundary, регэкспы)
const EXCLUDE_KEYWORDS = [
  "women", "women's", "womens", "w-", "w.", "wsl", "ladies",
  "u23", "u22", "u21", "u20", "u19", "u18", "u17",
  "under 23", "under 21", "under 19", "youth", "reserve", "reserves",
  "junior", "girls", "academy", "amateur", "regional", "local", "district",
  "3", "4", "5", "iii", "iv", "v", "3rd", "4th", "5th"
];

// Предкомпилируем шаблоны исключений — каждое ключевое слово превращаем в регэксп с границами слова
const EXCLUDE_REGEXES = EXCLUDE_KEYWORDS.map(k => {
  const kw = String(k).trim();
  // экранируем специальные символы
  const esc = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // используем границы слова для большинства случаев — это уменьшит ложные срабатывания внутри чисел/строк
  return { raw: kw, re: new RegExp("\\b" + esc + "\\b", "i") };
});

let timerInterval = null;
let nextCheckTime = 0;
let isRunning = false;
let searchCountToday = 0;

// --- DIAGNOSTICS ---
let diag = {
  lastRunAt: null,
  totalFixturesFetched: 0,
  excludedByKeyword: 0,
  maleCandidates: 0,
  goalCandidates: 0,           // HT matches (all with any goals) before avg check
  missingAvgData: 0,
  rejectedByAvg: 0,
  passedByAvg: 0,
  foundMatches: 0,
  samplesRejected: [],         // up to 20 sample objects {league, home, away, reason}
  samplesPassed: []            // up to 20 sample objects
};
const DIAG_MAX_SAMPLES = 20;

// DOM элементы
const resultsDiv = document.getElementById("results");
const statusEl = document.getElementById("status");
const searchCountEl = document.getElementById("searchCount");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");

// init counter
loadSearchCounter();

// UI: кнопки
startBtn && (startBtn.onclick = () => {
  if (!isRunning) {
    startSearch();
    startBtn.classList.add("active");
  }
});
stopBtn && (stopBtn.onclick = () => {
  stopSearch();
  startBtn && startBtn.classList.remove("active");
});

// счётчик
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

// status helper
function setStatus(text, cls = "") {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.className = "";
  if (cls) statusEl.classList.add(cls);
}

// start/stop
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

// timer
function runTimer() {
  nextCheckTime = 12 * 60; // секунды
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

// очистка диагностики
function resetDiagnostics() {
  diag.lastRunAt = new Date().toISOString();
  diag.totalFixturesFetched = 0;
  diag.excludedByKeyword = 0;
  diag.maleCandidates = 0;
  diag.goalCandidates = 0;
  diag.missingAvgData = 0;
  diag.rejectedByAvg = 0;
  diag.passedByAvg = 0;
  diag.foundMatches = 0;
  diag.samplesRejected = [];
  diag.samplesPassed = [];
}

// рендер диагностики в top результатов
function renderDiagnosticsPanel() {
  if (!resultsDiv) return;
  // создаём/обновляем панель в resultsDiv сверху
  let panel = document.getElementById("diagPanel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "diagPanel";
    panel.className = "diag-panel";
    resultsDiv.prepend(panel);
  }
  panel.innerHTML = `
    <div><strong>Диагностика (последний запуск):</strong> ${diag.lastRunAt || "-"}</div>
    <div>Всего fixtures получено: ${diag.totalFixturesFetched}</div>
    <div>Исключено по ключевым словам (жен./юниоры/резерв/низш. уровни): ${diag.excludedByKeyword}</div>
    <div>Оставлено (мужские кандидаты): ${diag.maleCandidates}</div>
    <div>HT матчи с нужным счётом (2-0 / 0-2): ${diag.goalCandidates}</div>
    <div>Матчей с неполными данными для avg: ${diag.missingAvgData}</div>
    <div>Отброшено по avg (&gt;1.7): ${diag.rejectedByAvg}</div>
    <div>Прошли по avg (≤1.7 у обеих): ${diag.passedByAvg}</div>
    <div>Найдено матчей (выведено): ${diag.foundMatches}</div>
    <details>
      <summary>Примеры отфильтрованных матчей (до ${DIAG_MAX_SAMPLES})</summary>
      ${diag.samplesRejected.map(s => `<div class="diag-sample">[${escapeHtml(s.reason)}] ${escapeHtml(s.league)}: ${escapeHtml(s.home)} — ${escapeHtml(s.away)}</div>`).join("")}
    </details>
    <details>
      <summary>Примеры найденных матчей (до ${DIAG_MAX_SAMPLES})</summary>
      ${diag.samplesPassed.map(s => `<div class="diag-sample"> ${escapeHtml(s.league)}: ${escapeHtml(s.home)} — ${escapeHtml(s.away)} | avg ${s.avgHome}/${s.avgAway}</div>`).join("")}
    </details>
    <hr>
  `;
}

// helper: проверяет, нужно ли исключить лигу. Возвращает { excluded: bool, matched: string|null }
function isLeagueExcluded(rawLeagueName) {
  if (!rawLeagueName) return { excluded: true, matched: "(no name)" };
  const name = String(rawLeagueName).toLowerCase();
  for (const { raw, re } of EXCLUDE_REGEXES) {
    if (re.test(name)) return { excluded: true, matched: raw };
  }
  return { excluded: false, matched: null };
}

// main check with detailed diagnostics
async function runCheck() {
  try {
    incrementSearchCounter();
    resetDiagnostics();

    // clear results (we keep diagnostics panel at top, so clear all and then renderPanel)
    if (resultsDiv) resultsDiv.innerHTML = "";
    setStatus("проверка…", "yellow");

    // 1) fetch all fixtures with status=HT
    const fixturesUrl = `https://v3.football.api-sports.io/fixtures?status=HT`;
    console.debug("Fetching fixtures from:", fixturesUrl);
    const resp = await fetch(fixturesUrl, {
      headers: { "x-apisports-key": API_KEY }
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`Ошибка API fixtures: ${resp.status} ${text}`);
    }
    const json = await resp.json();
    const all = Array.isArray(json.response) ? json.response : [];
    diag.totalFixturesFetched = all.length;
    console.debug(`Fixtures fetched: ${all.length}`);

    // 2) filter by keyword to exclude women/u*/reserve/academy/3-5/regionals/amateur
    const maleCandidates = [];
    let excludedCount = 0;
    for (const f of all) {
      const leagueNameRaw = (f.league && (f.league.name || ""));
      const leagueName = (leagueNameRaw || "").toString();
      const check = isLeagueExcluded(leagueName);
      if (check.excluded) {
        excludedCount++;
        if (diag.samplesRejected.length < DIAG_MAX_SAMPLES) {
          diag.samplesRejected.push({ league: leagueName || "(no name)", home: f.teams?.home?.name || "", away: f.teams?.away?.name || "", reason: `ключ '${check.matched}'` });
        }
        continue;
      }
      maleCandidates.push(f);
    }
    diag.excludedByKeyword = excludedCount;
    diag.maleCandidates = maleCandidates.length;

    // 3) filter maleCandidates by score 2-0 / 0-2
    const goalCandidates = maleCandidates.filter(f => {
      const goals = f.goals || {};
      if (typeof goals.home !== "number" || typeof goals.away !== "number") return false;
      return (goals.home === 2 && goals.away === 0) || (goals.home === 0 && goals.away === 2);
    });
    diag.goalCandidates = goalCandidates.length;

    console.debug(`After keyword filter: ${maleCandidates.length}, goalCandidates: ${goalCandidates.length}`);

    if (goalCandidates.length === 0) {
      // render diagnostics and exit
      renderDiagnosticsPanel();
      setStatus("совпадений нет", "red");
      if (resultsDiv) resultsDiv.innerHTML += `<div class="small">Подходящих HT матчей (2-0 / 0-2) не найдено.</div>`;
      return;
    }

    // 4) for each goalCandidate compute avg and apply avg filter; collect diagnostics
    const found = [];
    for (const f of goalCandidates) {
      const homeId = f.teams?.home?.id;
      const awayId = f.teams?.away?.id;
      const leagueName = f.league?.name || "League";
      const homeName = f.teams?.home?.name || "Home";
      const awayName = f.teams?.away?.name || "Away";

      if (!homeId || !awayId) {
        diag.missingAvgData++;
        if (diag.samplesRejected.length < DIAG_MAX_SAMPLES) diag.samplesRejected.push({ league: leagueName, home: homeName, away: awayName, reason: "нет id команды" });
        continue;
      }

      const avg = await getAverageGoals(homeId, awayId);
      if (!avg) {
        diag.missingAvgData++;
        if (diag.samplesRejected.length < DIAG_MAX_SAMPLES) diag.samplesRejected.push({ league: leagueName, home: homeName, away: awayName, reason: "нет данных avg" });
        continue;
      }

      // avg exists, check thresholds
      if (avg.home <= 1.7 && avg.away <= 1.7) {
        diag.passedByAvg++;
        found.push({ league: leagueName, home: homeName, away: awayName, avgHome: avg.home, avgAway: avg.away, ht: `${f.goals.home}-${f.goals.away}` });
        if (diag.samplesPassed.length < DIAG_MAX_SAMPLES) diag.samplesPassed.push({ league: leagueName, home: homeName, away: awayName, avgHome: avg.home, avgAway: avg.away });
      } else {
        diag.rejectedByAvg++;
        const reasonParts = [];
        if (avg.home > 1.7) reasonParts.push(`home avg ${avg.home}`);
        if (avg.away > 1.7) reasonParts.push(`away avg ${avg.away}`);
        const reason = reasonParts.join("; ");
        if (diag.samplesRejected.length < DIAG_MAX_SAMPLES) diag.samplesRejected.push({ league: leagueName, home: homeName, away: awayName, reason: reason });
      }
    }

    diag.foundMatches = found.length;

    // render diagnostics panel
    renderDiagnosticsPanel();

    if (found.length === 0) {
      setStatus("совпадений нет", "red");
      if (resultsDiv) resultsDiv.innerHTML += `<div class="small">Подходящих матчей после проверки avg не найдено.</div>`;
      return;
    }

    // show found matches
    setStatus(`найдено матчей: ${found.length}`, "green");
    playTripleBeep();
    for (const m of found) {
      const block = document.createElement("div");
      block.className = "match-box";
      block.innerHTML = `<b>${escapeHtml(m.league)}</b><br>
                         ${escapeHtml(m.home)} — ${escapeHtml(m.away)} | HT: ${m.ht}<br>
                         Средний голов (5): ${m.avgHome.toFixed(2)} / ${m.avgAway.toFixed(2)}`;
      resultsDiv && resultsDiv.appendChild(block);
    }

  } catch (err) {
    console.error("runCheck error:", err);
    setStatus("Ошибка при проверке (см. консоль)", "red");
    if (resultsDiv) resultsDiv.innerHTML = `<div class="small">Ошибка при обращении к API — проверь ключ и доступность сервиса.</div>`;
  }
}

// getAverageGoals as before, adapted for diagnostics and made a bit more robust
async function getAverageGoals(homeId, awayId) {
  try {
    const base = `https://v3.football.api-sports.io/fixtures?last=5&team=`;
    console.debug(`Fetching last5 for teams ${homeId} and ${awayId}`);
    const [rh, ra] = await Promise.all([
      fetch(base + encodeURIComponent(homeId), { headers: { "x-apisports-key": API_KEY } }),
      fetch(base + encodeURIComponent(awayId), { headers: { "x-apisports-key": API_KEY } })
    ]);
    if (!rh.ok || !ra.ok) {
      console.warn("getAverageGoals: one of responses not ok", rh.status, ra.status);
      return null;
    }
    const [hd, ad] = await Promise.all([rh.json(), ra.json()]);

    const hResp = Array.isArray(hd.response) ? hd.response : [];
    const aResp = Array.isArray(ad.response) ? ad.response : [];

    const hArr = hResp.map(m => {
      if (!m.goals) return null;
      // определяем, была ли команда home в этом матче
      const isHome = (m.teams?.home?.id == homeId);
      if (isHome && typeof m.goals.home === 'number') return m.goals.home;
      if (!isHome && typeof m.goals.away === 'number') return m.goals.away;
      return null;
    }).filter(v => typeof v === "number");

    const aArr = aResp.map(m => {
      if (!m.goals) return null;
      const isHome = (m.teams?.home?.id == awayId);
      if (isHome && typeof m.goals.home === 'number') return m.goals.home;
      if (!isHome && typeof m.goals.away === 'number') return m.goals.away;
      return null;
    }).filter(v => typeof v === "number");

    console.debug(`avg arrays lengths for ${homeId}/${awayId}:`, hArr.length, aArr.length);

    if (hArr.length === 0 || aArr.length === 0) return null;
    const hAvg = +(hArr.reduce((s, v) => s + v, 0) / hArr.length).toFixed(2);
    const aAvg = +(aArr.reduce((s, v) => s + v, 0) / aArr.length).toFixed(2);
    return { home: hAvg, away: aAvg };
  } catch (e) {
    console.warn("getAverageGoals error", e);
    return null;
  }
}

// beep
function playTripleBeep() {
  try {
    const audio = new Audio("beep.mp3");
    audio.play().catch(()=>{});
    setTimeout(()=>{ audio.currentTime = 0; audio.play().catch(()=>{}); }, 400);
    setTimeout(()=>{ audio.currentTime = 0; audio.play().catch(()=>{}); }, 800);
  } catch(e){ console.warn("beep error", e); }
}

// escape html
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]);
}

// --- Доп. отладочная команда (можно вызвать из консоли для быстрой проверки)
window.__DEBUG_APP = {
  EXCLUDE_KEYWORDS,
  EXCLUDE_REGEXES,
  isLeagueExcluded
};

console.info('app.js (исправленный) загружен — доступны diagnostics и __DEBUG_APP в консоли.');
