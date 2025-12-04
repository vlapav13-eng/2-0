// app.js — текстовые сообщения и кнопки на русском
const API_KEY = "403e0d7c0f2f236034cf0475570195be";
const API_BASE = "https://v3.football.api-sports.io/";
let timer = null;

const logEl = document.getElementById('log');
const statusEl = document.getElementById('status');
const beep = document.getElementById('beep');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const installBtn = document.getElementById('installBtn');

function log(msg) {
  const t = new Date().toLocaleString();
  logEl.textContent = `[${t}] ${msg}\n` + logEl.textContent;
}

async function checkOnce() {
  try {
    statusEl.textContent = "Статус: проверка...";
    const url = API_BASE + "fixtures?live=all&timezone=Europe/Kyiv";
    const resp = await fetch(url, { headers: { "x-apisports-key": API_KEY } });
    if (!resp.ok) {
      log("Ошибка API: HTTP " + resp.status);
      statusEl.textContent = "Статус: ошибка API " + resp.status;
      return;
    }
    const data = await resp.json();
    if (!data.response) {
      log("Ответ API не содержит response.");
      statusEl.textContent = "Статус: нет данных";
      return;
    }

    log("Найдено live-матчей: " + data.response.length);
    const found = [];

    for (const m of data.response) {
      const ht = m.score && m.score.halftime;
      if (!ht) continue;
      const h = ht.home, a = ht.away;
      if (!((h === 2 && a === 0) || (h === 0 && a === 2))) continue;
      found.push(m);
    }

    if (found.length === 0) {
      log("Подходящих матчей не найдено.");
      statusEl.textContent = "Статус: проверено, совпадений нет";
      return;
    }

    log("Найдены подходящие матчи: " + found.length);

    for (const m of found) {
      const homeId = m.teams.home.id;
      const awayId = m.teams.away.id;
      const league = m.league && m.league.name ? m.league.name : "Лига";
      const scoreStr = (m.score && m.score.halftime) ? (m.score.halftime.home + "-" + m.score.halftime.away) : "HT";
      try {
        const hResp = await fetch(API_BASE + "fixtures?team=" + homeId + "&last=7", { headers: { "x-apisports-key": API_KEY } });
        const aResp = await fetch(API_BASE + "fixtures?team=" + awayId + "&last=7", { headers: { "x-apisports-key": API_KEY } });
        const hData = await hResp.json();
        const aData = await aResp.json();
        const hAvg = calcAvgGoals(homeId, hData.response || []);
        const aAvg = calcAvgGoals(awayId, aData.response || []);
        const oddsResp = await fetch(API_BASE + "odds?fixture=" + m.fixture.id, { headers: { "x-apisports-key": API_KEY } });
        const oddsData = await oddsResp.json();
        const oddsVal = parseOdds(oddsData);
        const meets = (hAvg <= 1.5 && aAvg <= 1.5) && oddsVal.found;
        const line = `${league} | ${m.teams.home.name} ${scoreStr} ${m.teams.away.name} — Avg: ${hAvg} | ${aAvg} — Odds: ${oddsVal.value || "N/A"} — Подходит: ${meets}`;
        log(line);
        if (meets) {
          try { beep.currentTime = 0; await beep.play(); } catch(e) { /* autoplay может быть заблокирован */ }
          if (Notification && Notification.permission === "granted") {
            navigator.serviceWorker.getRegistration().then(reg => {
              if (reg) reg.showNotification("Halftime Checker", { body: line, icon: "icons/icon-192.svg" });
            });
          }
        }
      } catch (e) {
        log("Ошибка при доп. запросах: " + e);
      }
    }

    statusEl.textContent = "Статус: проверка завершена";
  } catch (e) {
    log("Ошибка в checkOnce: " + e);
    statusEl.textContent = "Статус: ошибка";
  }
}

function calcAvgGoals(teamId, fixtures) {
  let scored = 0, played = 0;
  for (const f of fixtures) {
    const isHome = (f.teams && f.teams.home && f.teams.home.id === teamId);
    const goals = isHome ? (f.goals && f.goals.home) : (f.goals && f.goals.away);
    if (typeof goals === 'number') { scored += goals; played++; }
  }
  if (played === 0) return 999;
  return Math.round((scored / played) * 100) / 100;
}

function parseOdds(oddsData) {
  try {
    if (!oddsData || !oddsData.response) return {found:false, value:null};
    for (const it of oddsData.response) {
      const bookies = it.bookies || it.bookmakers || [];
      for (const b of bookies) {
        const markets = b.markets || [];
        for (const m of markets) {
          const key = (m.key || "").toLowerCase();
          if (key.includes("tot") || key.includes("total")) {
            for (const bet of (m.bets || [])) {
              const name = bet.name || "";
              if (name.includes("Under") && (name.includes("3.5") || name.includes("4"))) {
                return {found:true, value: bet.value};
              }
            }
          }
        }
      }
    }
  } catch(e) {}
  return {found:false, value:null};
}

// Управление кнопками (русские подписи)
startBtn.addEventListener('click', async () => {
  if (timer) return;
  if (Notification && Notification.permission !== "granted") {
    try { await Notification.requestPermission(); } catch(e) {}
  }
  timer = setInterval(checkOnce, 15 * 60 * 1000);
  log("Проверки включены (каждые 15 минут).");
  checkOnce();
});

stopBtn.addEventListener('click', () => {
  if (timer) { clearInterval(timer); timer = null; log("Проверки остановлены."); statusEl.textContent = "Статус: остановлено"; }
});

// Регистрация service worker и обработка приглашения на установку
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js').then(reg => {
    console.log('SW зарегистрирован', reg);
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      // Покажем русскую кнопку установки
      installBtn.style.display = 'inline-block';
      installBtn.textContent = 'Установить';
      installBtn.addEventListener('click', () => { e.prompt(); });
    });
  }).catch(err => {
    log('SW регистрация не удалась: ' + err);
  });
} else {
  log('Service worker не поддерживается на этом устройстве.');
}
