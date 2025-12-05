const API_KEY = "403e0d7c0f2f236034cf0475570195be";

let timerInterval = null;
let scanInterval = null;
let nextScan = 12 * 60;
let running = false;

// Лиги (без женских)
const leagues = [
    39, 40, 41, 42, 61, 78, 135, 140,
    2, 3, 4, 5, 566, 556, 302
];

document.getElementById("startBtn").onclick = () => startScanning();
document.getElementById("stopBtn").onclick = () => stopScanning();

function startScanning() {
    if (running) return;

    running = true;
    document.getElementById("startBtn").classList.add("active");
    document.getElementById("status").textContent = "Проверка включена…";

    runScan();
    startTimer();
}

function stopScanning() {
    running = false;
    clearInterval(timerInterval);
    clearInterval(scanInterval);

    document.getElementById("startBtn").classList.remove("active");
    document.getElementById("timer").textContent = "—:—";
    document.getElementById("status").textContent = "Остановлено";
}

function startTimer() {
    nextScan = 12 * 60;

    timerInterval = setInterval(() => {
        if (!running) return;

        let min = Math.floor(nextScan / 60);
        let sec = nextScan % 60;

        document.getElementById("timer").textContent =
            `${min}:${sec < 10 ? "0" : ""}${sec}`;

        nextScan--;

        if (nextScan < 0) {
            nextScan = 12 * 60;
            runScan();
        }
    }, 1000);
}

async function runScan() {
    if (!running) return;

    document.getElementById("status").textContent = "Идет поиск…";

    let matchesFound = [];

    for (let league of leagues) {
        const live = await fetch(
            `https://v3.football.api-sports.io/fixtures?live=all&league=${league}`,
            { headers: { "x-apisports-key": API_KEY } }
        );
        const json = await live.json();

        const games = json.response;

        for (let g of games) {
            const ht = g.score.halftime;

            if (ht.home === 2 && ht.away === 0 || ht.home === 0 && ht.away === 2) {

                let odds = await getTotals(g.fixture.id);

                matchesFound.push({
                    league: g.league.name,
                    home: g.teams.home.name,
                    away: g.teams.away.name,
                    ht: `${ht.home}-${ht.away}`,
                    odd35: odds.o35,
                    odd40: odds.o40
                });
            }
        }
    }

    showMatches(matchesFound);
}

async function getTotals(fixtureId) {
    try {
        const res = await fetch(
            `https://v3.football.api-sports.io/odds?fixture=${fixtureId}`,
            { headers: { "x-apisports-key": API_KEY } }
        );

        const json = await res.json();
        if (!json.response.length) return { o35: "—", o40: "—" };

        const bookmakers = json.response[0].bookmakers;
        if (!bookmakers.length) return { o35: "—", o40: "—" };

        let odd35 = "—";
        let odd40 = "—";

        for (let book of bookmakers) {
            for (let bet of book.bets) {
                if (bet.name === "Totals") {
                    for (let v of bet.values) {
                        if (v.value === "3.5") odd35 = v.odd;
                        if (v.value === "4.0") odd40 = v.odd;
                    }
                }
            }
        }

        return { o35: odd35, o40: odd40 };

    } catch {
        return { o35: "—", o40: "—" };
    }
}

function showMatches(arr) {
    const box = document.getElementById("matches");
    box.innerHTML = "";

    if (arr.length === 0) {
        document.getElementById("status").textContent = "Совпадений нет";
        document.getElementById("status").className = "status red";
        return;
    }

    document.getElementById("status").textContent = "Матчи найдены!";
    document.getElementById("status").className = "status green";

    playTripleBeep();

    arr.forEach(m => {
        box.innerHTML += `
            <div class="match-card">
                <b>${m.home} — ${m.away}</b><br>
                Лига: ${m.league}<br>
                HT: ${m.ht}<br>
                ТМ 3.5: <b>${m.odd35}</b><br>
                ТМ 4.0: <b>${m.odd40}</b>
            </div>
        `;
    });
}

function playTripleBeep() {
    const sound = new Audio("data:audio/wav;base64,UklGRrQAAABXQVZFZm10IBAAAAABAAEA..."); 
    sound.play();
    setTimeout(() => sound.play(), 400);
    setTimeout(() => sound.play(), 800);
}

      
  
 
