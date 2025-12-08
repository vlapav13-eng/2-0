// =========================
// CONFIG
// =========================
const API_KEY = "a66f87d6c56c44bbf95cf72c9f8363e7";

const TOP_30_LEAGUES = [
    39,40,61,135,78,140,94,88,203,566,
    71,72,73,
    128,129,
    253,254,
    302,303,
    197,198,
    179,180,
    200,201,
    262,263,
    301,304,
    392,393
];

// =========================
// GLOBAL STATE
// =========================
let timerInterval = null;
let nextCheckTime = 0;
let isRunning = false;
let searchCountToday = 0;

// =========================
// WAIT FOR DOM
// =========================
document.addEventListener("DOMContentLoaded", () => {
    const resultsDiv = document.getElementById("results");
    const statusEl = document.getElementById("status");
    const searchCountEl = document.getElementById("searchCount");
    const startBtn = document.getElementById("startBtn");
    const stopBtn = document.getElementById("stopBtn");
    const timerEl = document.getElementById("timer");

    if (!resultsDiv || !statusEl || !searchCountEl || !startBtn || !stopBtn) {
        console.error("Не найдены элементы HTML!");
        return;
    }

    loadSearchCounter();

    startBtn.onclick = () => {
        if (!isRunning) {
            startSearch();
        }
    };

    stopBtn.onclick = stopSearch;

    // =========================
    // COUNTER
    // =========================
    function loadSearchCounter() {
        const saved = localStorage.getItem("searchCounter");
        const day = localStorage.getItem("searchDay");

        const today = new Date().toDateString();

        if (day !== today) {
            searchCountToday = 0;
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

    // =========================
    // START / STOP
    // =========================
    function startSearch() {
        isRunning = true;
        statusEl.textContent = "запущено…";
        statusEl.className = "green";

        runCheck();
        runTimer();
    }

    function stopSearch() {
        isRunning = false;

        if (timerInterval) {
            clearInterval(timerInterval);
        }

        statusEl.textContent = "остановлено";
        statusEl.className = "red";
        timerEl.textContent = "";
    }

    // =========================
    // TIMER
    // =========================
    function runTimer() {
        nextCheckTime = 12 * 60;

        if (timerInterval) clearInterval(timerInterval);

        timerInterval = setInterval(() => {
            if (!isRunning) return;

            nextCheckTime--;
            timerEl.textContent = `${nextCheckTime} сек`;

            if (nextCheckTime <= 0) {
                runCheck();
                nextCheckTime = 12 * 60;
            }
        }, 1000);
    }

    // =========================
    // CHECK
    // =========================
    async function runCheck() {
        incrementSearchCounter();
        resultsDiv.innerHTML = "";
        statusEl.textContent = "проверка…";
        statusEl.className = "yellow";

        let matchesFound = [];

        for (let league of TOP_30_LEAGUES) {
            const response = await queryLeague(league);

            // критическая ошибка → прекращаем всё
            if (response.stop) {
                showError(response.msg, response.data);
                return;
            }

            // нормальный ответ
            if (!response.data || !response.data.response) continue;

            for (let m of response.data.response) {
                if (!m.score || !m.score.halftime) continue;

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
            showError("Проверка закончилась: совпадений нет.", null, false);
            return;
        }

        statusEl.textContent = "Найдены матчи!";
        statusEl.className = "green";

        playTripleBeep();

        matchesFound.forEach(m => {
            resultsDiv.innerHTML += `
                <div class="match-box">
                    <b>${m.league}</b><br>
                    ${m.home} — ${m.away}<br>
                    Средний голов: ${m.avgHome.toFixed(2)} / ${m.avgAway.toFixed(2)}
                </div>
            `;
        });
    }

    // =========================
    // API QUERY + ERROR HANDLING
    // =========================
    async function queryLeague(league) {
        try {
            const url = `https://v3.football.api-sports.io/fixtures?league=${league}&live=all`;

            const r = await fetch(url, {
                headers: {"x-rapidapi-key": API_KEY}
            });

            const data = await r.json();

            // === 1) API возвращает ошибки
            if (data.errors && Object.keys(data.errors).length > 0) {
                return {
                    stop: true,
                    msg: "Ошибка API: " + JSON.stringify(data.errors),
                    data
                };
            }

            // === 2) лимит исчерпан
            if (data.message && data.message.toLowerCase().includes("rate")) {
                return {
                    stop: true,
                    msg: "Ошибка: исчерпан дневной лимит API.",
                    data
                };
            }

            // === 3) ключ заблокирован
            if (data.message && data.message.toLowerCase().includes("key")) {
                return {
                    stop: true,
                    msg: "Ошибка: ключ API неверен или заблокирован.",
                    data
                };
            }

            return { stop: false, data };

        } catch (err) {
            return {
                stop: true,
                msg: "Ошибка сети / API не отвечает.",
                data: err
            };
        }
    }

    function showError(msg, data, critical = true) {
        statusEl.textContent = msg;
        statusEl.className = "red";

        console.error("API ERROR:", data);

        if (critical) {
            stopSearch();
        }
    }

    // =========================
    // AVERAGE GOALS
    // =========================
    async function getAverageGoals(homeId, awayId) {
        try {
            const url = `https://v3.football.api-sports.io/fixtures?last=5&team=`;

            const [h,a] = await Promise.all([
                fetch(url + homeId, { headers:{ "x-rapidapi-key": API_KEY }}),
                fetch(url + awayId, { headers:{ "x-rapidapi-key": API_KEY }})
            ]);

            const hd = await h.json();
            const ad = await a.json();

            if (!hd.response || !ad.response) return null;

            const hAvg = hd.response.reduce((s,m)=>s + (m.goals?.for || 0),0)/hd.response.length;
            const aAvg = ad.response.reduce((s,m)=>s + (m.goals?.for || 0),0)/ad.response.length;

            return { home:hAvg, away:aAvg };

        } catch {
            return null;
        }
    }

    // =========================
    // BEEP
    // =========================
    function playTripleBeep() {
        try {
            const audio = new Audio("beep.mp3");
            audio.play().catch(()=>{});
            setTimeout(()=>audio.play().catch(()=>{}),400);
            setTimeout(()=>audio.play().catch(()=>{}),800);
        } catch {}
    }
});
