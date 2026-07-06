// ===================== 상태 관리 =====================
const STORAGE_KEY = "speedquiz_state_v1";

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function freshState() {
  const teams = {};
  TEAMS.forEach(t => {
    teams[t.id] = {
      remaining: shuffle(t.words),
      total: t.words.length,
      score: 0
    };
  });
  return { timerSeconds: 60, teams };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshState();
    const parsed = JSON.parse(raw);
    // 팀 구성이 바뀐 경우(단어 목록 수정 등) 대비 병합
    const fresh = freshState();
    TEAMS.forEach(t => {
      if (!parsed.teams[t.id]) parsed.teams[t.id] = fresh.teams[t.id];
    });
    if (!parsed.timerSeconds) parsed.timerSeconds = 60;
    return parsed;
  } catch (e) {
    return freshState();
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

timerInput.value = state.timerSeconds;
timerInput.addEventListener("change", () => {
  let v = parseInt(timerInput.value, 10);
  if (isNaN(v) || v < 10) v = 10;
  if (v > 600) v = 600;
  timerInput.value = v;
  state.timerSeconds = v;
  saveState();
});

function renderDashboard() {
  teamGrid.innerHTML = "";
  TEAMS.forEach(t => {
    const ts = state.teams[t.id];
    const done = ts.remaining.length === 0;
    const card = document.createElement("div");
    card.className = "team-card";
    card.style.setProperty("--card-color", t.color);

    const playedAny = ts.remaining.length < ts.total;
    let btnLabel = "시작";
    if (done) btnLabel = "🔁 다시하기";
    else if (playedAny) btnLabel = "이어하기";

    card.innerHTML = `
      <div class="team-name">${t.name}</div>
      <div class="team-score">${ts.score}<span> 점</span></div>
      <div class="team-progress">남은 단어 ${ts.remaining.length} / ${ts.total}${done ? " · 모두 완료!" : ""}</div>
      <button class="btn ${done ? "btn-ghost" : "btn-primary"}" data-team="${t.id}" data-action="${done ? "restart" : "play"}">${btnLabel}</button>
    `;
    teamGrid.appendChild(card);
  });
}

teamGrid.addEventListener("click", e => {
  const btn = e.target.closest("button[data-team]");
  if (!btn) return;
  const teamId = parseInt(btn.dataset.team, 10);
  if (btn.dataset.action === "restart") {
    if (!confirm(`${TEAMS.find(t => t.id === teamId).name}의 점수와 단어 목록을 초기화하고 다시 시작할까요?`)) return;
    const fresh = freshState();
    state.teams[teamId] = fresh.teams[teamId];
    saveState();
    renderDashboard();
    return;
  }
  openPlay(teamId);
});

document.getElementById("btn-reset-all").addEventListener("click", () => {
  if (!confirm("모든 팀의 점수와 진행 상황을 초기화할까요?")) return;
  state = freshState();
  timerInput.value = state.timerSeconds;
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
  const sorted = TEAMS.map(t => ({ ...t, score: state.teams[t.id].score }))
    .sort((a, b) => b.score - a.score);

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
const statRemaining = document.getElementById("stat-remaining");
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
  const t = TEAMS.find(x => x.id === teamId);
  const ts = state.teams[teamId];

  playTeamBadge.textContent = t.name;
  playTeamBadge.style.setProperty("--badge-color", t.color);
  timerDisplay.classList.remove("warn");
  timerDisplay.textContent = state.timerSeconds;
  roundCorrect = 0;
  statCorrect.textContent = "0";
  statRemaining.textContent = ts.remaining.length;
  wordCard.textContent = ts.remaining[0] || "🎉 완료!";

  document.getElementById("start-overlay-title").textContent = `${t.name} 준비!`;
  document.getElementById("start-overlay-desc").textContent =
    `남은 단어 ${ts.remaining.length}개 · 제한시간 ${state.timerSeconds}초`;

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
  roundQueue = ts.remaining.slice();
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
  statRemaining.textContent = roundQueue.length;
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
    `${message} · 누적 점수 ${state.teams[currentTeamId].score}점`;
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
