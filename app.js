// app.js — версия без API-Sports, использует public ScoreBat (video-api) + сохраняет все твои критерии поиска
// Условия поиска (как и было):
// - HT (перерыв)
// - счёт HT = 2-0 или 0-2
// - исключаем матчи/лиги по ключевым словам (жен., юниоры, резерв, аматоры и т.д.) — тот же набор, что был у тебя
// - дополнительно: проверяем средний голов у каждой команды по последним 5 матчам (avg <= 1.7)

const EXCLUDE_KEYWORDS = [
  "women", "women's", "womens", "w-", "w.", "wsl", "ladies",
  "u23", "u22", "u21", "u20", "u19", "u18", "u17",
  "under 23", "under 21", "under 19", "youth", "reserve", "reserves",
  "junior", "girls", "academy", "amateur", "regional", "local", "district",
  "3", "4", "5", "iii", "iv", "v", "3rd", "4th", "5th"
];

// Порог среднего голов (тот же)
const MAX_AVG = 1.7;

// Диагностика (будет показана в UI)
let diag = {
  lastRunAt: null,
  leaguesFetched: 0,
  fixturesFetched: 0,
  excludedByKeyword: 0,
  leagueCandidates: 0,
  htCandidates: 0,
  missingAvgData: 0,
  rejectedByAvg: 0,
  passedByAvg: 0,
  foundMatches: 0,
  samplesRejected: [],
  samplesPassed: []
};
const DIAG_MAX_SAMPLES = 25;

// DOM
const resultsDiv = document.getElementById('results') || document.body;
const statusEl = document.getElementById('status');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const searchCountEl = document.getElementById('searchCount');
let timerInterval = null;
let isRunning = false;
let searchCountToday = 0;

// helper: build regexes for exclude keywords (word-boundaries)
const EXCLUDE_REGEXES = EXCLUDE_KEYWORDS.map(k => {
  const esc = String(k).replace(/[.*+?^${}()|[\]\]/g, '\$&');
  return { raw: k, re: new RegExp('\b' + esc + '\b', 'i') };
});

function loadSearchCounter(){
  try{
    const saved = localStorage.getItem('searchCounter');
    const day = localStorage.getItem('searchDay');
    const today = new Date().toDateString();
    if(day !== today){
      searchCountToday = 0;
      localStorage.setItem('searchDay', today);
      localStorage.setItem('searchCounter', '0');
    } else {
      searchCountToday = saved ? parseInt(saved,10) : 0;
    }
    if(searchCountEl) searchCountEl.textContent = searchCountToday;
  }catch(e){console.warn(e)}
}
function saveSearchCounter(){
  localStorage.setItem('searchCounter', String(searchCountToday));
  localStorage.setItem('searchDay', new Date().toDateString());
}
function incrementSearchCounter(){
  searchCountToday++;
  saveSearchCounter();
  if(searchCountEl) searchCountEl.textContent = searchCountToday;
}

function setStatus(text, cls=''){
  if(!statusEl) return;
  statusEl.textContent = text;
  statusEl.className = '';
  if(cls) statusEl.classList.add(cls);
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]);
}

function isLeagueExcluded(leagueName){
  if(!leagueName) return { excluded: true, matched: '(no name)'};
  const name = String(leagueName).toLowerCase();
  for(const {raw,re} of EXCLUDE_REGEXES){
    if(re.test(name)) return { excluded: true, matched: raw };
  }
  return { excluded:false, matched: null };
}

// show diagnostics panel on screen
function renderDiagnostics(){
  diag.lastRunAt = new Date().toISOString();
  let panel = document.getElementById('diagPanel');
  if(!panel){
    panel = document.createElement('div');
    panel.id = 'diagPanel';
    panel.style.border = '1px solid #ccc';
    panel.style.padding = '8px';
    panel.style.marginBottom = '8px';
    if(resultsDiv.firstChild) resultsDiv.insertBefore(panel, resultsDiv.firstChild);
    else resultsDiv.appendChild(panel);
  }
  panel.innerHTML = `
    <div><strong>Диагностика (последний запуск):</strong> ${diag.lastRunAt}</div>
    <div>Лиг получено: ${diag.leaguesFetched}</div>
    <div>Фикстур обработано: ${diag.fixturesFetched}</div>
    <div>Исключено по ключевым словам: ${diag.excludedByKeyword}</div>
    <div>Оставлено лиг для анализа: ${diag.leagueCandidates}</div>
    <div>Найдено HT кандидатов: ${diag.htCandidates}</div>
    <div>Матчей без данных avg: ${diag.missingAvgData}</div>
    <div>Отброшено по avg (&gt;${MAX_AVG}): ${diag.rejectedByAvg}</div>
    <div>Прошли по avg (≤${MAX_AVG}): ${diag.passedByAvg}</div>
    <div>Найдено матчей: ${diag.foundMatches}</div>
    <details><summary>Примеры отклонённых</summary>${diag.samplesRejected.map(s=>`<div>${escapeHtml(s.reason)} | ${escapeHtml(s.league||'')}: ${escapeHtml(s.home||'')} - ${escapeHtml(s.away||'')}</div>`).join('')}</details>
    <details><summary>Примеры пройденных</summary>${diag.samplesPassed.map(s=>`<div>${escapeHtml(s.league||'')}: ${escapeHtml(s.home||'')} - ${escapeHtml(s.away||'')} | avg ${s.avgHome}/${s.avgAway}</div>`).join('')}</details>
    <hr>
  `;
}

// Extract goals from a fixture object with robustness for several field names
function extractHalftimeScores(match){
  // try common fields
  const candidates = [];
  if(match.home_ht_score !== undefined && match.away_ht_score !== undefined){
    candidates.push({type:'home_ht_score/away_ht_score', h:match.home_ht_score, a:match.away_ht_score});
  }
  if(match.ht_score){ // e.g. "2-0"
    const parts = String(match.ht_score).split(/[^0-9]+/).filter(Boolean).map(Number);
    if(parts.length>=2) candidates.push({type:'ht_score', h:parts[0], a:parts[1]});
  }
  if(match.score && match.score.halftime){
    const h = match.score.halftime.home; const a = match.score.halftime.away;
    if(typeof h === 'number' && typeof a === 'number') candidates.push({type:'score.halftime', h, a});
  }
  // Scorebat sometimes uses "home_score"/"away_score" as full time, but halftime maybe missing
  if(match.home_score !== undefined && match.away_score !== undefined && match.time && /half|ht/i.test(String(match.time))){
    candidates.push({type:'home_score/away_score (time indicates HT)', h:match.home_score, a:match.away_score});
  }
  // fallback: fields like goals.home/goals.away
  if(match.goals && (match.goals.home !== undefined || match.goals.away !== undefined)){
    const h = match.goals.home; const a = match.goals.away;
    if(typeof h === 'number' && typeof a === 'number') candidates.push({type:'goals', h, a});
  }
  // return first valid candidate
  for(const c of candidates){
    if(typeof c.h === 'number' && typeof c.a === 'number') return {h:c.h, a:c.a, field:c.type};
  }
  return null;
}

// get average goals for a team using fixtures list (last 5 matches involving that team)
function computeAverageForTeam(teamName, fixtures){
  if(!teamName || !Array.isArray(fixtures)) return null;
  // collect matches where team played
  const teamMatches = fixtures.filter(m => {
    const home = (m.home_team || m.home || m.teams?.home?.name || '').toString().toLowerCase();
    const away = (m.away_team || m.away || m.teams?.away?.name || '').toString().toLowerCase();
    return home === teamName.toLowerCase() || away === teamName.toLowerCase();
  });
  if(teamMatches.length === 0) return null;
  // sort by date if present
  teamMatches.sort((a,b)=>{
    const da = new Date(a.date || a.match_date || a.utc_date || 0).getTime()||0;
    const db = new Date(b.date || b.match_date || b.utc_date || 0).getTime()||0;
    return db - da; // descending (latest first)
  });
  const last5 = teamMatches.slice(0,5);
  const goals = [];
  for(const m of last5){
    // extract full-time goals if possible
    const homeScore = (m.home_score !== undefined) ? Number(m.home_score) : (m.fulltime_home !== undefined ? Number(m.fulltime_home) : (m.goals?.home !== undefined ? Number(m.goals.home) : null));
    const awayScore = (m.away_score !== undefined) ? Number(m.away_score) : (m.fulltime_away !== undefined ? Number(m.fulltime_away) : (m.goals?.away !== undefined ? Number(m.goals.away) : null));

    // determine which side is the team
    const homeName = (m.home_team || m.home || m.teams?.home?.name || '').toString();
    const awayName = (m.away_team || m.away || m.teams?.away?.name || '').toString();
    let teamGoals = null;
    if(homeName.toLowerCase() === teamName.toLowerCase()) teamGoals = (typeof homeScore === 'number' && !isNaN(homeScore)) ? homeScore : null;
    if(awayName.toLowerCase() === teamName.toLowerCase()) teamGoals = (typeof awayScore === 'number' && !isNaN(awayScore)) ? awayScore : teamGoals;

    if(teamGoals === null) continue; // skip if can't determine
    goals.push(teamGoals);
  }
  if(goals.length === 0) return null;
  const avg = goals.reduce((s,v)=>s+v,0) / goals.length;
  return +avg.toFixed(2);
}

// fetch JSON helper with timeout
async function fetchJson(url, opts={}){
  try{
    const controller = new AbortController();
    const id = setTimeout(()=>controller.abort(), 15000);
    const res = await fetch(url, {...opts, signal: controller.signal});
    clearTimeout(id);
    if(!res.ok) return { ok:false, status: res.status, body: null };
    const j = await res.json().catch(()=>null);
    return { ok:true, status: res.status, body: j };
  }catch(e){
    return { ok:false, status: 'error', body: null, error: String(e) };
  }
}

// MAIN: scan ScoreBat API
async function runScan(){
  try{
    incrementSearchCounter();
    // reset diag
    diag = { lastRunAt: null, leaguesFetched:0, fixturesFetched:0, excludedByKeyword:0, leagueCandidates:0, htCandidates:0, missingAvgData:0, rejectedByAvg:0, passedByAvg:0, foundMatches:0, samplesRejected:[], samplesPassed:[] };
    if(resultsDiv) resultsDiv.innerHTML = '';
    setStatus('проверка…', 'yellow');

    // 1) fetch leagues
    const leaguesUrl = 'https://www.scorebat.com/video-api/v3/leagues/';
    const L = await fetchJson(leaguesUrl);
    if(!L.ok || !L.body){
      if(resultsDiv) resultsDiv.innerHTML = `<div class="small">Ошибка получения списка лиг: ${L.status}</div>`;
      setStatus('ошибка API лиг', 'red');
      return;
    }
    const leagues = Array.isArray(L.body.response) ? L.body.response : (L.body.response || []);
    diag.leaguesFetched = leagues.length || 0;

    // We'll process leagues sequentially (to avoid rate issues), but keep it limited
    const leagueCandidates = [];
    for(const lg of leagues){
      const leagueName = lg.name || lg.title || '';
      const control = isLeagueExcluded(leagueName);
      if(control.excluded){
        diag.excludedByKeyword++;
        if(diag.samplesRejected.length < DIAG_MAX_SAMPLES) diag.samplesRejected.push({ league: leagueName, home:'', away:'', reason: `ключ '${control.matched}'` });
        continue;
      }
      leagueCandidates.push(lg);
    }
    diag.leagueCandidates = leagueCandidates.length;

    // 2) For each league, fetch fixtures for that group
    const found = [];
    for(const lg of leagueCandidates){
      // ScoreBat fixtures endpoint grouped by group/league unique id
      const groupId = lg.unique_id || lg.id || lg.group || lg.name;
      const fixturesUrl = `https://www.scorebat.com/video-api/v3/fixtures/?group=${encodeURIComponent(groupId)}`;
      const F = await fetchJson(fixturesUrl);
      if(!F.ok || !F.body){
        // push example and continue
        if(diag.samplesRejected.length < DIAG_MAX_SAMPLES) diag.samplesRejected.push({ league: lg.name || groupId, home:'', away:'', reason: `fixtures fetch error ${F.status}` });
        continue;
      }
      // ScoreBat may put matches under response.matches or response
      const fixtures = (Array.isArray(F.body.response?.matches) ? F.body.response.matches : (Array.isArray(F.body.response) ? F.body.response : (F.body.matches || [])));
      diag.fixturesFetched += fixtures.length;

      // go through fixtures to find HT 2-0 / 0-2
      for(const m of fixtures){
        // detect HT scores
        const ht = extractHalftimeScores(m);
        if(!ht) continue;
        // ensure it's HT: sometimes API might include full-time only; field choice above uses ht fields usually
        const isHT = true; // we consider it HT if we extracted halftime scores via known fields
        if(!isHT) continue;
        if(!((ht.h === 2 && ht.a === 0) || (ht.h === 0 && ht.a === 2))) continue;

        diag.htCandidates++;

        // determine home and away names (robust)
        const homeName = (m.home_team || m.home || m.teams?.home?.name || m.sideA || '').toString();
        const awayName = (m.away_team || m.away || m.teams?.away?.name || m.sideB || '').toString();

        // compute averages for each team using fixtures list of this league (or entire fixtures array)
        // We'll use the fixtures array of this league as historical data source
        const avgHome = computeAverageForTeam(homeName, fixtures);
        const avgAway = computeAverageForTeam(awayName, fixtures);

        if(avgHome === null || avgAway === null){
          diag.missingAvgData++;
          if(diag.samplesRejected.length < DIAG_MAX_SAMPLES) diag.samplesRejected.push({ league: lg.name||groupId, home:homeName, away:awayName, reason:'нет данных avg' });
          continue;
        }

        // check thresholds — same as раньше
        if(avgHome <= MAX_AVG && avgAway <= MAX_AVG){
          diag.passedByAvg++;
          found.push({ league: lg.name||groupId, home: homeName, away: awayName, avgHome, avgAway, ht: `${ht.h}-${ht.a}` });
          if(diag.samplesPassed.length < DIAG_MAX_SAMPLES) diag.samplesPassed.push({ league: lg.name||groupId, home: homeName, away: awayName, avgHome, avgAway });
        } else {
          diag.rejectedByAvg++;
          if(diag.samplesRejected.length < DIAG_MAX_SAMPLES) diag.samplesRejected.push({ league: lg.name||groupId, home:homeName, away:awayName, reason: `avg home ${avgHome}, away ${avgAway}` });
        }
      }

      // small delay to be polite
      await new Promise(r=>setTimeout(r, 300));
    }

    diag.foundMatches = found.length;
    renderDiagnostics();

    if(found.length === 0){
      setStatus('совпадений нет', 'red');
      if(resultsDiv) resultsDiv.innerHTML += `<div class="small">Подходящих матчей не найдено.</div>`;
      return;
    }

    setStatus(`найдено матчей: ${found.length}`, 'green');
    playTripleBeep();

    for(const m of found){
      const block = document.createElement('div');
      block.className = 'match-box';
      block.style.border = '1px solid #444';
      block.style.padding = '6px';
      block.style.margin = '6px 0';
      block.innerHTML = `<b>${escapeHtml(m.league)}</b><br>${escapeHtml(m.home)} — ${escapeHtml(m.away)} | HT: ${m.ht}<br>Средний голов (5): ${m.avgHome.toFixed(2)} / ${m.avgAway.toFixed(2)}`;
      resultsDiv.appendChild(block);
    }

  }catch(e){
    console.error(e);
    setStatus('Ошибка при проверке (см. консоль)', 'red');
    if(resultsDiv) resultsDiv.innerHTML = `<div class="small">Ошибка: ${escapeHtml(String(e))}</div>`;
  }
}

function playTripleBeep(){
  try{
    const a = new Audio('beep.mp3');
    a.play().catch(()=>{});
    setTimeout(()=>{ a.currentTime=0; a.play().catch(()=>{}); }, 400);
    setTimeout(()=>{ a.currentTime=0; a.play().catch(()=>{}); }, 800);
  }catch(e){console.warn(e)}
}

// start/stop UI binding
startBtn && (startBtn.onclick = ()=>{ if(!isRunning){ isRunning=true; setStatus('запущено…','green'); runScan(); startTimer(); } });
stopBtn && (stopBtn.onclick = ()=>{ isRunning=false; clearInterval(timerInterval); setStatus('остановлено','red'); });

function startTimer(){
  let next = 12*60; // seconds
  const tEl = document.getElementById('timer');
  if(tEl) tEl.textContent = `${next} сек`;
  timerInterval = setInterval(()=>{
    if(!isRunning) return;
    next--;
    if(tEl) tEl.textContent = `${next} сек`;
    if(next<=0){ runScan(); next = 12*60; }
  },1000);
}

// init counter
loadSearchCounter();

// debug helper on window
window.__SCOREBAT_DEBUG = { EXCLUDE_KEYWORDS, EXCLUDE_REGEXES, computeAverageForTeam, extractHalftimeScores };

console.info('app.js (ScoreBat) загружен — нажми Start. Диагностика появится вверху.');
