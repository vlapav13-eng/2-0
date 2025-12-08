const API_KEY = "a66f87d6c56c44bbf95cf72c9f8363e7";

const TOP_30_LEAGUES = [
    39, 40, 61, 135, 78, 140, 94, 88, 203, 566, // Европа
    71, 72, 73, // Бразилия
    128, 129, // Аргентина
    253, 254, // США MLS
    302, 303, // Мексика
    197, 198, // Турция
    179, 180, // Греция
    200, 201, // Дания
    262, 263, // Китай
    301, 304, // Япония
    392, 393  // Корея
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

// === Загружаем счётчик с даты ===
loadSearchCounter();

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

function loadSearchCounter() {
    const saved = localStorage.getItem("searchCounter");
    const day = localStorage.getItem("searchDay");

    const today = new Date().toDateString();

    if (day !== today) {
        searchCountToday = 0;
        localStorage.setItem("searchDay", today);
        localStorage.setItem("searchCounter", 0);
    } else {
        searchCountToday = saved ? parseInt(saved) : 0;
    }

    searchCountEl.textContent = searchCountToday;
}

function incrementSearchCounter() {
    searchCountToday++;
    localStorage.setItem("searchCounter", searchCountToday);
    localStorage.setItem("searchDay", new Date().toDateString());
    searchCountEl.textContent = searchCountToday;
}

function startSearch() {
    isRunning = true;
    statusEl.textContent = "запущено…";
    statusEl.className = "green";

    runCheck();
    runTimer();
}

function stopSearch() {
    isRunning = false;
    clearInterval(timerInterval);
    statusEl.textContent = "остановлено";
    statusEl.className = "red";
}

function runTimer() {
    nextCheckTime = 12 * 60;

    timerInterval = setInterval(() => {
        if (!isRunning) return;

        nextCheckTime--;
        document.getElementById("timer").textContent = `${nextCheckTime} сек`;

        if (nextCheckTime <= 0) {
            runCheck();
            nextCheckTime = 12 * 60;
        }
    }, 1000);
}

async function runCheck() {
    incrementSearchCounter();

    resultsDiv.innerHTML = "";
    statusEl.textContent = "проверка…";
    statusEl.className = "yellow";

    let matchesFound = [];

    for (let league of TOP_30_LEAGUES) {
        const url = `https://v3.football.api-sports.io/fixtures?league=${league}&live=all`;
        const response = await fetch(url, {
            headers: { "x-rapidapi-key": API_KEY }
        });

        const data = await response.json();

        for (let m of data.response) {
            if (!m.score.halftime) continue;

            const ht = m.score.halftime.home;
            const at = m.score.halftime.away;

            if (!((ht === 2 && at === 0) || (ht === 0 && at === 2))) continue;

            const avg = await getAverageGoals(m.teams.home.id, m.teams.away.id);
            if (!avg) continue;

            if (avg.home <= 1.5 && avg.away <= 1.5) {
                matchesFound.push({
                    league: m.league.name,
                    home: m.teams.home.name,
                    away: m.teams.away.name,
                    avgHome: avg.home,
                    avgAway: avg.away
                });
            }
        }
    }

    if (matchesFound.length === 0) {
        statusEl.textContent = "совпадений нет";
        statusEl.className = "red";
        return;
    }

    statusEl.textContent = "найдены матчи!";
    statusEl.className = "green";

    playTripleBeep();

    matchesFound.forEach(m => {
        resultsDiv.innerHTML += `
            <div class="match-box">
                <b>${m.league}</b><br>
                ${m.home} — ${m.away}<br>
                Средний голов (5 игр): ${m.avgHome.toFixed(2)} / ${m.avgAway.toFixed(2)}
            </div>
        `;
    });
}

async function getAverageGoals(homeId, awayId) {
    const url = `https://v3.football.api-sports.io/fixtures?last=5&team=`;
    const h = await fetch(url + homeId, { headers: { "x-rapidapi-key": API_KEY } });
    const a = await fetch(url + awayId, { headers: { "x-rapidapi-key": API_KEY } });

    const hd = await h.json();
    const ad = await a.json();

    if (!hd.response.length || !ad.response.length) return null;

    const hAvg = hd.response.reduce((s, m) => s + m.goals.for, 0) / hd.response.length;
    const aAvg = ad.response.reduce((s, m) => s + m.goals.for, 0) / ad.response.length;

    return { home: hAvg, away: aAvg };
}

function playTripleBeep() {
    const audio = new Audio("beep.mp3");
    audio.play();
    setTimeout(() => audio.play(), 400);
    setTimeout(() => audio.play(), 800);
}

/* ====== DIAGNOSTICS SNIPPET (вставь в конец рабочего app.js) ======
   - безопасно: не меняет логику
   - перехватывает fetch, считает запросы и показывает ответы
   - помогает точно увидеть: какие URL вызываются, что вернул API, есть ли массивы матчей
==================================================================== */

(function(){
  if (window.__APP_DIAG_LOADED) return;
  window.__APP_DIAG_LOADED = true;
  console.info("DIAGNOSTICS v1 loaded");

  // Создаём панель вверху страницы
  const diag = {
    requests: [],
    counts: { total:0, ok:0, err:0 },
    lastResponses: []
  };

  function createPanel(){
    const panel = document.createElement('div');
    panel.id = 'diagPanelSmall';
    Object.assign(panel.style, {
      position: 'fixed',
      right: '10px',
      top: '10px',
      width: '360px',
      maxHeight: '60vh',
      overflow: 'auto',
      background: 'rgba(0,0,0,0.85)',
      color: '#fff',
      padding: '10px',
      zIndex: 999999,
      fontSize: '12px',
      borderRadius: '8px',
      boxShadow: '0 6px 18px rgba(0,0,0,0.6)'
    });
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <strong>DIAGNOSTICS</strong>
        <button id="diagToggle" style="background:#222;color:#fff;border:1px solid #555;padding:4px;border-radius:4px;cursor:pointer">Закрыть</button>
      </div>
      <div id="diagSummary" style="line-height:1.4"></div>
      <hr style="border-color:#333"/>
      <div id="diagLog" style="font-family:monospace;white-space:pre-wrap;"></div>
    `;
    document.body.appendChild(panel);
    document.getElementById('diagToggle').addEventListener('click', ()=>{
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
      document.getElementById('diagToggle').textContent = panel.style.display === 'none' ? 'Открыть' : 'Закрыть';
    });
    return panel;
  }

  const panel = createPanel();
  const summaryEl = document.getElementById('diagSummary');
  const logEl = document.getElementById('diagLog');

  function updateSummary(){
    summaryEl.innerHTML = `
      <div>Requests: ${diag.counts.total} (OK ${diag.counts.ok}, ERR ${diag.counts.err})</div>
      <div>Last fetch URL: ${diag.requests.length ? escapeHtml(diag.requests[diag.requests.length-1].url) : '-'}</div>
      <div>Last response status: ${diag.lastResponses.length ? diag.lastResponses[diag.lastResponses.length-1].status : '-'}</div>
      <div>Last response body preview (first 300 chars):</div>
      <div style="background:#000;color:#9f9;padding:6px;margin-top:6px;max-height:120px;overflow:auto">${diag.lastResponses.length ? escapeHtml(String(diag.lastResponses[diag.lastResponses.length-1].preview).slice(0,300)) : '-'}</div>
    `;
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]);
  }

  // перехват fetch (robust)
  const originalFetch = window.fetch.bind(window);
  window.fetch = async function(input, init){
    const url = (typeof input === 'string') ? input : (input && input.url) || '';
    const start = Date.now();
    diag.counts.total++;
    diag.requests.push({url, time: new Date().toISOString()});
    updateSummary();
    try{
      const resp = await originalFetch(input, init);
      const clone = resp.clone();
      // try to read text/json safely
      let preview = '';
      try {
        const ct = clone.headers.get ? clone.headers.get('content-type') || '' : '';
        if (ct.includes('application/json')) {
          const j = await clone.json();
          preview = JSON.stringify(j);
        } else {
          preview = await clone.text();
        }
      } catch(eInner){
        preview = `<<unreadable response body: ${String(eInner)}>>`;
      }
      diag.counts.ok++;
      diag.lastResponses.push({ url, status: resp.status, ok: resp.ok, preview, time: new Date().toISOString(), ms: Date.now()-start });
      // trim arrays to keep panel small
      if (diag.requests.length>40) diag.requests.shift();
      if (diag.lastResponses.length>40) diag.lastResponses.shift();
      // append to log
      logEl.textContent = [
        `→ ${new Date().toLocaleTimeString()} ${url}`,
        `  status: ${resp.status}  (${resp.ok ? 'OK':'ERR'})  time: ${diag.lastResponses[diag.lastResponses.length-1].ms}ms`,
        `  preview: ${escapeHtml(String(preview).slice(0,400))}`,
        '',
        logEl.textContent
      ].join('\\n');
      updateSummary();
      return resp;
    }catch(e){
      diag.counts.err++;
      diag.lastResponses.push({ url, status: 'network-error', ok:false, preview: String(e), time: new Date().toISOString(), ms: Date.now()-start });
      logEl.textContent = [
        `× ${new Date().toLocaleTimeString()} ${url}`,
        `  NETWORK ERROR: ${String(e)}`,
        '',
        logEl.textContent
      ].join('\\n');
      updateSummary();
      throw e; // preserve original behavior: propagate error
    }
  };

  // Доп. диагностические команды, которые ты можешь вызвать из консоли:
  window.__diag = {
    getRequests: ()=>diag.requests.slice(),
    getLastResponses: ()=>diag.lastResponses.slice(),
    clear: ()=>{ diag.requests=[]; diag.lastResponses=[]; diag.counts={total:0,ok:0,err:0}; logEl.textContent=''; updateSummary(); }
  };

  updateSummary();

  // Небольшая подсказка в консоль
  console.info("DIAGNOSTICS panel created. It logs all fetch() calls and shows previews. Use window.__diag.getLastResponses() to inspect.");
})();
