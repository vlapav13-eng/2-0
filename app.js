const API_KEY = "403e0d7c0f2f236034cf0475570195be";
export const LEAGUES = [
  "England: Premier League",
  "Spain: La Liga",
  "Germany: Bundesliga",
  "Italy: Serie A",
  "France: Ligue 1",
  "Portugal: Primeira Liga",
  "Netherlands: Eredivisie",
  "Belgium: Jupiler Pro League",
  "Turkey: Super Lig",
  "Greece: Super League",
  "Austria: Bundesliga",
  "Switzerland: Super League",
  "Denmark: Superliga",
  "Norway: Eliteserien",
  "Sweden: Allsvenskan",
  "Poland: Ekstraklasa",
  "Czech Republic: First League",
  "Croatia: HNL",
  "Serbia: SuperLiga",
  "Ukraine: Premier League",
  "Russia: Premier League",
  "Scotland: Premiership",
  "Hungary: NB I",
  "Romania: Liga I",
  "Slovakia: Super Liga",
  "Slovenia: PrvaLiga",
  "Bulgaria: First League",
  "Israel: Ligat ha'Al",
  "Cyprus: First Division",
  "USA: MLS",
  "Brazil: Serie A",
  "Argentina: Liga Profesional",
  "Mexico: Liga MX",
  "Chile: Primera División",
  "Uruguay: Primera División",
  "Colombia: Liga BetPlay",
  "Ecuador: Serie A",
  "Peru: Liga 1",
  "Paraguay: Primera División",
  "Japan: J1 League",
  "South Korea: K League 1",
  "China: Super League",
  "Saudi Arabia: Pro League",
  "UAE: Pro League",
  "Qatar: Stars League",
  "Australia: A-League"
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
     
        
  
 
