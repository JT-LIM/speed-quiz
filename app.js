// ===================== 상태 관리 =====================
const STORAGE_KEY = "speedquiz_state_v4";
const TEAM_COLORS = ["#e63946", "#f3722c", "#f9c74f", "#90be6d", "#43aa8b", "#577590", "#9c6ade", "#4d908e", "#f8961e", "#277da1"];

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 전체 단어를 랜덤으로 섞은 뒤 팀 수만큼 고르게(라운드로빈) 나눠 배분
function assignWordsToTeams(teamCount) {
  const shuffled = shuffle(ALL_WORDS);
  const buckets = Array.from({ length: teamCount }, () => []);
  shuffled.forEach((word, idx) => buckets[idx % teamCount].push(word));
  return buckets;
}

// 팀별로 배정된 단어(original)는 전체 초기화 전까지 절대 바뀌지 않음 -> 팀 간 중복 없이 끝까지 진행 가능
function freshState(teamCount, timerSeconds) {
  const buckets = assignWordsToTeams(teamCount);
  const teams = {};
  for (let i = 1; i <= teamCount; i++) {
    const bucket = buckets[i - 1];
    teams[i] = { original: bucket.slice(), remaining: bucket.slice(), total: bucket.length, score: 0 };
  }
  return { timerSeconds: timerSeconds || 60, teamCount, teams };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshState(5, 60);
    const parsed = JSON.parse(raw);
    if (!parsed.teamCount || !parsed.teams) return freshState(5, 60);
    return parsed;
  } catch (e) {
    return freshState(5, 60);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = loadState();

// ===================== 화면 전환 =====================
const screens = {
  dashboard: document.getElementById("screen-dashboard"),
  play: document.getElementById("screen-play"),
  result: document.getElementById("screen-result")
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.add("hidden"));
  screens[name].classList.remove("hidden");
}

// ===================== 대시보드 =====================
const teamGrid = document.getElementById("team-grid");
const timerInput = document.getElementById("timer-input");
const teamCountInput = document.getElementById("team-count-input");

timerInput.value = state.timerSeconds;
teamCountInput.value = state.teamCount;

timerInput.addEventListener("change", () => {
  let v = parseInt(timerInput.value, 10);
  if (isNaN(v) || v < 10) v = 10;
  if (v > 600) v = 600;
  timerInput.value = v;
  state.timerSeconds = v;
  saveState();
});

teamCountInput.addEventListener("change", () => {
  let v = parseInt(teamCountInput.value, 10);
  if (isNaN(v) || v < 1) v = 1;
  if (v > 10) v = 10;
  teamCountInput.value = v;
  if (v === state.teamCount) return;
  if (!confirm(`조 개수를 ${v}개로 바꾸면 지금까지의 점수와 단어 배분이 모두 초기화됩니다. 계속할까요?`)) {
    teamCountInput.value = state.teamCount;
    return;
  }
  state = freshState(v, state.timerSeconds);
  saveState();
  renderDashboard();
});

function renderDashboard() {
  teamGrid.innerHTML = "";
  for (let i = 1; i <= state.teamCount; i++) {
    const ts = state.teams[i];
    const done = ts.remaining.length === 0;
    const playedAny = ts.remaining.length < ts.total;
    const color = TEAM_COLORS[(i - 1) % TEAM_COLORS.length];

    let btnLabel = "시작";
    if (done) btnLabel = "🔁 다시하기";
    else if (playedAny) btnLabel = "이어하기";

    const card = document.createElement("div");
    card.className = "team-card";
    card.style.setProperty("--card-color", color);
    card.innerHTML = `
      <div class="team-name">${i}조</div>
      <div class="team-score">${ts.score}<span> 점</span></div>
      <button class="btn ${done ? "btn-ghost" : "btn-primary"}" data-team="${i}" data-action="${done ? "restart" : "play"}">${btnLabel}</button>
    `;
    teamGrid.appendChild(card);
  }
}

teamGrid.addEventListener("click", e => {
  const btn = e.target.closest("button[data-team]");
  if (!btn) return;
  const teamId = parseInt(btn.dataset.team, 10);
  if (btn.dataset.action === "restart") {
    if (!confirm(`${teamId}조의 점수를 초기화하고 원래 배정된 단어를 다시 섞어서 시작할까요?`)) return;
    // 그 조에게 처음 배정된 단어(original)만 다시 섞음 -> 다른 조와 절대 겹치지 않음
    const ts = state.teams[teamId];
    ts.remaining = shuffle(ts.original);
    ts.score = 0;
    saveState();
    renderDashboard();
    return;
  }
  openPlay(teamId);
});

document.getElementById("btn-reset-all").addEventListener("click", () => {
  if (!confirm("모든 조의 점수와 단어 배분을 초기화할까요?")) return;
  state = freshState(state.teamCount, state.timerSeconds);
  saveState();
  renderDashboard();
});

document.getElementById("btn-show-result").addEventListener("click", () => {
  renderResult();
  showScreen("result");
});

document.getElementById("btn-result-back").addEventListener("click", () => {
  renderDashboard();
  showScreen("dashboard");
});

// ===================== 결과 화면 =====================
function renderResult() {
  const list = document.getElementById("result-list");
  const sorted = [];
  for (let i = 1; i <= state.teamCount; i++) sorted.push({ name: `${i}조`, score: state.teams[i].score });
  sorted.sort((a, b) => b.score - a.score);

  const medals = ["🥇", "🥈", "🥉"];
  list.innerHTML = sorted.map((t, i) => `
    <div class="result-row ${i < 3 ? "rank-" + (i + 1) : ""}">
      <div class="rank">${medals[i] || (i + 1)}</div>
      <div class="name">${t.name}</div>
      <div class="score">${t.score}점</div>
    </div>
  `).join("");
}

// ===================== 플레이 화면 =====================
const playTeamBadge = document.getElementById("play-team-badge");
const statCorrect = document.getElementById("stat-correct");
const timerDisplay = document.getElementById("timer-display");
const wordCard = document.getElementById("word-card");
const startOverlay = document.getElementById("start-overlay");
const endOverlay = document.getElementById("end-overlay");
const btnCorrect = document.getElementById("btn-correct");
const btnPass = document.getElementById("btn-pass");

let currentTeamId = null;
let roundQueue = [];
let roundCorrect = 0;
let timeLeft = 0;
let timerHandle = null;
let roundRunning = false;

function openPlay(teamId) {
  currentTeamId = teamId;
  const color = TEAM_COLORS[(teamId - 1) % TEAM_COLORS.length];
  const ts = state.teams[teamId];

  playTeamBadge.textContent = `${teamId}조`;
  playTeamBadge.style.setProperty("--badge-color", color);
  timerDisplay.classList.remove("warn");
  timerDisplay.textContent = state.timerSeconds;
  roundCorrect = 0;
  statCorrect.textContent = "0";
  wordCard.textContent = ts.remaining[0] || "🎉 완료!";

  document.getElementById("start-overlay-title").textContent = `${teamId}조 준비!`;
  document.getElementById("start-overlay-desc").textContent = `제한시간 ${state.timerSeconds}초`;

  endOverlay.classList.add("hidden");
  startOverlay.classList.remove("hidden");
  roundRunning = false;

  showScreen("play");
}

document.getElementById("btn-back").addEventListener("click", () => {
  stopTimer();
  renderDashboard();
  showScreen("dashboard");
});

document.getElementById("btn-start-round").addEventListener("click", startRound);

function startRound() {
  const ts = state.teams[currentTeamId];
  if (ts.remaining.length === 0) {
    endRound("모든 단어를 이미 맞췄어요! 대시보드에서 다시하기를 눌러주세요.");
    return;
  }
  roundQueue = shuffle(ts.remaining);
  roundCorrect = 0;
  statCorrect.textContent = "0";
  timeLeft = state.timerSeconds;
  timerDisplay.textContent = timeLeft;
  timerDisplay.classList.remove("warn");
  updateWordCard();
  startOverlay.classList.add("hidden");
  roundRunning = true;

  timerHandle = setInterval(() => {
    timeLeft--;
    timerDisplay.textContent = timeLeft;
    if (timeLeft <= 10) timerDisplay.classList.add("warn");
    if (timeLeft <= 0) {
      endRound(`시간 종료! 이번 라운드 정답: ${roundCorrect}개`);
    }
  }, 1000);
}

function updateWordCard() {
  wordCard.textContent = roundQueue[0] || "🎉 완료!";
}

function stopTimer() {
  if (timerHandle) clearInterval(timerHandle);
  timerHandle = null;
  roundRunning = false;
}

function markCorrect() {
  if (!roundRunning || roundQueue.length === 0) return;
  const word = roundQueue.shift();
  const ts = state.teams[currentTeamId];
  const idx = ts.remaining.indexOf(word);
  if (idx !== -1) ts.remaining.splice(idx, 1);
  ts.score += 1;
  roundCorrect += 1;
  statCorrect.textContent = roundCorrect;
  saveState();

  if (roundQueue.length === 0) {
    stopTimer();
    endRound(`🎉 남은 단어를 모두 맞췄습니다! 이번 라운드 정답: ${roundCorrect}개`);
    return;
  }
  updateWordCard();
}

function markPass() {
  if (!roundRunning || roundQueue.length <= 1) return;
  const word = roundQueue.shift();
  roundQueue.push(word);
  updateWordCard();
}

btnCorrect.addEventListener("click", markCorrect);
btnPass.addEventListener("click", markPass);

function endRound(message) {
  stopTimer();
  document.getElementById("end-overlay-desc").textContent =
    `${message} · ${currentTeamId}조 누적 점수 ${state.teams[currentTeamId].score}점`;
  endOverlay.classList.remove("hidden");
  saveState();
}

document.getElementById("btn-end-confirm").addEventListener("click", () => {
  endOverlay.classList.add("hidden");
  renderDashboard();
  showScreen("dashboard");
});

// ===================== 키보드 단축키 =====================
document.addEventListener("keydown", e => {
  if (screens.play.classList.contains("hidden")) return;
  if (!roundRunning) return;
  if (e.code === "Space" || e.code === "Enter") {
    e.preventDefault();
    markCorrect();
  } else if (e.key.toLowerCase() === "p" || e.code === "ArrowLeft") {
    e.preventDefault();
    markPass();
  }
});

// ===================== 초기화 =====================
renderDashboard();
showScreen("dashboard");
