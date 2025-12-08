// app.js (исправленная версия)
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

// Весь код ждёт загрузки DOM — это решает проблему с "кнопка не нажимается"
document.addEventListener("DOMContentLoaded", () => {
    const resultsDiv = document.getElementById("results");
    const statusEl = document.getElementById("status");
    const searchCountEl = document.getElementById("searchCount");
    const startBtn = document.getElementById("startBtn");
    const stopBtn = document.getElementById("stopBtn");
    const timerEl = document.getElementById("timer");

    if (!resultsDiv || !statusEl || !searchCountEl || !startBtn || !stopBtn) {
        console.error("Не найдены элементы DOM. Проверьте HTML: results, status, searchCount, startBtn, stopBtn должны существовать.");
        return;
    }

    // === Загружаем счётчик с даты ===
    loadSearchCounter();

    startBtn.addEventListener("click", () => {
        if (!isRunning) {
            startSearch();
            startBtn.classList.add("active");
        }
    });

    stopBtn.addEventListener("click", () => {
        stopSearch();
        startBtn.classList.remove("active");
    });

    function loadSearchCounter() {
        const saved = localStorage.getItem("searchCounter");
        const day = localStorage.getItem("searchDay");

        const today = new Date().toDateString();

        if (day !== today) {
            searchCountToday = 0;
            localStorage.setItem("searchDay", today);
            localStorage.setItem("searchCounter", 0);
        } else {
            searchCountToday = saved ? parseInt(saved, 10) : 0;
        }

        searchCountEl.textContent = searchCountToday;
    }

    function incrementSearchCounter() {
        searchCountToday = (searchCountToday || 0) + 1;
        localStorage.setItem("searchCounter", searchCountToday);
        localStorage.setItem("searchDay", new Date().toDateString());
        searchCountEl.textContent = searchCountToday;
    }

    function startSearch() {
        if (isRunning) return;
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
            timerInterval = null;
        }
        statusEl.textContent = "остановлено";
        statusEl.className = "red";
        if (timerEl) timerEl.textContent = "";
    }

    function runTimer() {
        // 12 минут = 720 секунд; если нужен другой интервал, поменяй число
        nextCheckTime = 12 * 60;

        // защитно очищаем старый интервал, чтобы не было дублей
        if (timerInterval) clearInterval(timerInterval);

        timerInterval = setInterval(() => {
            if (!isRunning) return;

            nextCheckTime--;
            if (timerEl) timerEl.textContent = `${nextCheckTime} сек`;

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
        let apiError = false;

        for (let league of TOP_30_LEAGUES) {
            try {
                const url = `https://v3.football.api-sports.io/fixtures?league=${league}&live=all`;
                const response = await fetch(url, {
                    headers: { "x-rapidapi-key": API_KEY }
                });

                if (!response.ok) {
                    apiError = true;
                    console.warn(`API ответ не ок для лиги ${league}: ${response.status}`);
                    continue;
                }

                const data = await response.json();

                if (!data.response || !Array.isArray(data.response)) {
                    apiError = true;
                    console.warn(`Неправильный формат ответа для лиги ${league}`);
                    continue;
                }

                for (let m of data.response) {
                    // Защита: если структура ответа другая — пропускаем
                    if (!m.score || !m.score.halftime) continue;

                    const ht = m.score.halftime.home;
                    const at = m.score.halftime.away;

                    if (!((ht === 2 && at === 0) || (ht === 0 && at === 2))) continue;

                    const avg = await getAverageGoals(m.teams.home.id, m.teams.away.id);
                    if (!avg) continue;

                    if (avg.home <= 1.7 && avg.away <= 1.7) {
                        matchesFound.push({
                            league: m.league ? m.league.name : "—",
                            home: m.teams.home ? m.teams.home.name : "Home",
                            away: m.teams.away ? m.teams.away.name : "Away",
                            avgHome: avg.home,
                            avgAway: avg.away
                        });
                    }
                }

            } catch (err) {
                apiError = true;
                console.error("Ошибка при запросе API для лиги", league, err);
            }
        }

        // === Вывод результата ===

        if (apiError && matchesFound.length === 0) {
            statusEl.textContent = "Проверка закончилась, проверить не удалось (ошибка API).";
            statusEl.className = "red";
            return;
        }

        if (matchesFound.length === 0) {
            statusEl.textContent = "Проверка закончилась: совпадений нет.";
            statusEl.className = "red";
            return;
        }

        statusEl.textContent = "Найдены матчи!";
        statusEl.className = "green";

        playTripleBeep();

        matchesFound.forEach(m => {
            const node = document.createElement("div");
            node.className = "match-box";
            node.innerHTML = `
                <b>${escapeHtml(m.league)}</b><br>
                ${escapeHtml(m.home)} — ${escapeHtml(m.away)}<br>
                Средний голов (5 игр): ${Number(m.avgHome).toFixed(2)} / ${Number(m.avgAway).toFixed(2)}
            `;
            resultsDiv.appendChild(node);
        });
    }

    async function getAverageGoals(homeId, awayId) {
        try {
            if (!homeId || !awayId) return null;
            const url = `https://v3.football.api-sports.io/fixtures?last=5&team=`;
            const [hResp, aResp] = await Promise.all([
                fetch(url + homeId, { headers: { "x-rapidapi-key": API_KEY } }),
                fetch(url + awayId, { headers: { "x-rapidapi-key": API_KEY } })
            ]);

            if (!hResp.ok || !aResp.ok) {
                console.warn("Ошибка при получении последних матчей для команды", homeId, awayId);
                return null;
            }

            const hd = await hResp.json();
            const ad = await aResp.json();

            if (!hd.response || !Array.isArray(hd.response) || hd.response.length === 0) return null;
            if (!ad.response || !Array.isArray(ad.response) || ad.response.length === 0) return null;

            const hAvg = hd.response.reduce((s, m) => {
                const val = (m.goals && typeof m.goals.for === "number") ? m.goals.for : 0;
                return s + val;
            }, 0) / hd.response.length;

            const aAvg = ad.response.reduce((s, m) => {
                const val = (m.goals && typeof m.goals.for === "number") ? m.goals.for : 0;
                return s + val;
            }, 0) / ad.response.length;

            return { home: hAvg, away: aAvg };
        } catch (err) {
            console.error("getAverageGoals error:", err);
            return null;
        }
    }

    function playTripleBeep() {
        try {
            const audio = new Audio("beep.mp3");
            audio.play().catch(e => console.warn("Не удалось проиграть звук:", e));
            setTimeout(() => audio.play().catch(() => {}), 400);
            setTimeout(() => audio.play().catch(() => {}), 800);
        } catch (e) {
            console.warn("Ошибка воспроизведения звука", e);
        }
    }

    // Простая защита от XSS при вставке текста
    function escapeHtml(text) {
        if (!text && text !== 0) return "";
        return String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
});
