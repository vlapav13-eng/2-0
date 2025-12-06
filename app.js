const API_KEY = "403e0d7c0f2f236034cf0475570195be";

/* === 46 ЛУЧШИХ МУЖСКИХ ЛИГ (ID) === */
export const LEAGUES = [
  39, 140, 78, 135, 61, 94, 88, 144, 203, 197,
  218, 207, 176, 103, 113, 106, 317, 352, 331, 332,
  235, 179, 205, 283, 337, 340, 157, 267, 203, 253,
  71, 128, 262, 265, 276, 239, 275, 281, 287, 98,
  292, 169, 307, 341, 312, 195
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

loadSearchCounter();

/* ==== КНОПКИ ==== */
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

/* ==== СЧЁТЧИК ПОИСКОВ ==== */
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

/* ==== СТАРТ / СТОП ==== */
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

/* ==== ТАЙМЕР ==== */
function runTimer() {
    nextCheckTime = 12 * 60; // 12 минут

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

/* ==== ГЛАВНАЯ ПРОВЕРКА ==== */
async function runCheck() {
    incrementSearchCounter();

    resultsDiv.innerHTML = "";
    statusEl.textContent = "проверка…";
    statusEl.className = "yellow";

    let matchesFound = [];

    for (let league of LEAGUES) {
        const url = `https://v3.football.api-sports.io/fixtures?league=${league}&live=all`;
        const response = await fetch(url, {
            headers: { "x-rapidapi-key": API_KEY }
        });

        const data = await response.json();

        for (let m of data.response) {
            if (!m.score.halftime) continue;

            const ht = m.score.halftime.home;
            const at = m.score.halftime.away;

            // строго 2-0 или 0-2
            if (!((ht === 2 && at === 0) || (ht === 0 && at === 2))) continue;

            // средний показатель за 5 матчей
            const avg = await getAverageGoals(m.teams.home.id, m.teams.away.id);
            if (!avg) continue;

            if (avg.home <= 1.7 && avg.away <= 1.7) {
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

    /* ==== НЕТ СОВПАДЕНИЙ ==== */
    if (matchesFound.length === 0) {
        statusEl.textContent = "совпадений нет";
        statusEl.className = "red";
        return;
    }

    /* ==== НАЙДЕНЫ МАТЧИ ==== */
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

/* ==== СРЕДНИЕ ГОЛЫ ЗА 5 МАТЧЕЙ ==== */
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

/* ==== ТРОЙНОЙ СИГНАЛ ==== */
function playTripleBeep() {
    const audio = new Audio("beep.mp3");
    audio.play();
    setTimeout(() => audio.play(), 400);
    setTimeout(() => audio.play(), 800);
}
