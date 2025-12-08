const API_KEY = "a66f87d6c56c44bbf95cf72c9f8363e7";

/* === ЗАГРУЗКА ВСЕХ МУЖСКИХ ЛИГ (ID) === */
let ALL_MALE_LEAGUES = [];
let leaguesLoaded = false; // <<< защита от зависания

async function loadAllMaleLeagues() {
    try {
        const res = await fetch("https://v3.football.api-sports.io/leagues", {
            headers: { "x-rapidapi-key": API_KEY }
        });

        const data = await res.json();

        ALL_MALE_LEAGUES = data.response
            .filter(l =>
                l.type === "League" &&           // убираем кубки
                l.gender !== "Women" &&          // убираем женские
                l.league.id                      // только валидные ID
            )
            .map(l => l.league.id);

        console.log("Загружено мужских лиг:", ALL_MALE_LEAGUES.length);

        leaguesLoaded = true; // <<< флаг загружено
    } catch (e) {
        console.error("Ошибка загрузки лиг:", e);
        alert("Ошибка загрузки лиг. Проверь интернет.");
    }
}

loadAllMaleLeagues();

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

/* ==== СЧЁТЧИК ==== */
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

/* ==== СТАРТ ==== */
function startSearch() {

    // <<< Новый рабочий вариант — больше нет зависания
    if (!leaguesLoaded || ALL_MALE_LEAGUES.length === 0) {
        alert("Лиги ещё загружаются, подожди 2–3 секунды.");
        return;
    }

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

/* ==== ГЛАВНАЯ ПРОВЕРКА ==== */
async function runCheck() {
    incrementSearchCounter();

    resultsDiv.innerHTML = "";
    statusEl.textContent = "проверка…";
    statusEl.className = "yellow";

    let matchesFound = [];

    for (let league of ALL_MALE_LEAGUES) {
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

/* ==== СРЕДНИЕ ГОЛЫ ==== */
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
