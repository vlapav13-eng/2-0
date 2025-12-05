let interval = null;
let countdown = 12 * 60;
let timerInterval = null;

const sound = document.getElementById("alertSound");

function setStatus(text, type = "") {
    const st = document.getElementById("status");
    st.textContent = text;
    st.className = "status";
    if (type === "good") st.classList.add("good");
    if (type === "bad") st.classList.add("bad");
}

function logMessage(msg) {
    const box = document.getElementById("log");
    const time = new Date().toLocaleString("ru-RU");
    box.innerHTML =
        `<div class="logItem">[${time}] ${msg}</div>` + box.innerHTML;
}

function updateStats() {
    const statsBox = document.getElementById("stats");
    let data = JSON.parse(localStorage.getItem("stats5days") || "[]");

    // очищаем от старых записей (старше 5 дней)
    const limit = Date.now() - 5 * 24 * 60 * 60 * 1000;
    data = data.filter(x => x.time > limit);

    localStorage.setItem("stats5days", JSON.stringify(data));

    if (data.length === 0) {
        statsBox.textContent = "За последние 5 дней нет результатов.";
        return;
    }

    statsBox.innerHTML = data
        .map(x => `<div>${new Date(x.time).toLocaleString()} — найдено матчей: ${x.count}</div>`)
        .join("");
}

function saveStat(count) {
    let data = JSON.parse(localStorage.getItem("stats5days") || "[]");
    data.push({ time: Date.now(), count });
    localStorage.setItem("stats5days", JSON.stringify(data));
}

function updateTimer() {
    const m = String(Math.floor(countdown / 60)).padStart(2, "0");
    const s = String(countdown % 60).padStart(2, "0");

    document.getElementById("timer").textContent = `${m}:${s}`;

    if (countdown > 0) countdown--;
    else countdown = 12 * 60;
}

function startChecks() {
    if (interval) return;

    countdown = 12 * 60;

    document.getElementById("startButton").classList.add("btn-green");

    timerInterval = setInterval(updateTimer, 1000);

    interval = setInterval(checkMatches, 12 * 60 * 1000);

    logMessage("Проверки включены (каждые 12 минут).");

    checkMatches();
}

function stopChecks() {
    clearInterval(interval);
    clearInterval(timerInterval);

    interval = null;

    document.getElementById("startButton").classList.remove("btn-green");

    setStatus("Остановлено", "bad");
    logMessage("Проверки остановлены.");
}

document.getElementById("startButton").onclick = startChecks;
document.getElementById("stopButton").onclick = stopChecks;

async function checkMatches() {
    // ЭТО МЕСТО, где будет твой реальный API
    // Сейчас — имитация данных:

    const matchesFound = Math.random() < 0.25 ? Math.floor(Math.random() * 3 + 1) : 0;

    if (matchesFound > 0) {
        setStatus(`НАЙДЕНО МАТЧЕЙ: ${matchesFound}`, "good");
        logMessage(`Найдено ${matchesFound} подходящих матчей!`);

        sound.play();
        setTimeout(() => sound.play(), 500);
        setTimeout(() => sound.play(), 1000);

        saveStat(matchesFound);
        updateStats();
    } else {
        setStatus("Совпадений нет", "bad");
        logMessage("Подходящих матчей не найдено.");
        saveStat(0);
        updateStats();
    }
}

updateStats();
