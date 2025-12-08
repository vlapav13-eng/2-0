async function runCheck() {
    incrementSearchCounter();

    resultsDiv.innerHTML = "";
    statusEl.textContent = "проверка…";
    statusEl.className = "yellow";

    let matchesFound = [];
    let apiError = false;   // <-- флаг ошибок API

    for (let league of TOP_30_LEAGUES) {

        try {
            const url = `https://v3.football.api-sports.io/fixtures?league=${league}&live=all`;
            const response = await fetch(url, {
                headers: { "x-rapidapi-key": API_KEY }
            });

            // Ошибка соединения / сервер недоступен
            if (!response.ok) {
                apiError = true;
                continue;
            }

            const data = await response.json();

            // Если API вернул пустой ответ
            if (!data.response || !Array.isArray(data.response)) {
                apiError = true;
                continue;
            }

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

        } catch (err) {
            apiError = true;
        }
    }

    // === Вывод результатов ===

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
        resultsDiv.innerHTML += `
            <div class="match-box">
                <b>${m.league}</b><br>
                ${m.home} — ${m.away}<br>
                Средний голов (5 игр): ${m.avgHome.toFixed(2)} / ${m.avgAway.toFixed(2)}
            </div>
        `;
    });
}
