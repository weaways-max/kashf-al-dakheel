const socket = io();

let currentRoom = null;
let myId = null;
let isHost = false;
let isImpostor = false;
let players = [];

const screens = {
  login: document.getElementById("screen-login"),
  lobby: document.getElementById("screen-lobby"),
  question: document.getElementById("screen-question"),
  discussion: document.getElementById("screen-discussion"),
  voting: document.getElementById("screen-voting"),
  reveal: document.getElementById("screen-reveal"),
  gameover: document.getElementById("screen-gameover"),
  error: document.getElementById("screen-error")
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove("active"));
  const screen = screens[name];
  if (screen) screen.classList.add("active");
}

function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 3000);
}

function formatTime(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function renderPlayers(list, container, showHost) {
  container.innerHTML = "";
  list.forEach(p => {
    const div = document.createElement("div");
    div.className = "player-tag" + (p.isHost ? " host-tag" : "") + (p.isConnected === false ? " disconnected" : "");
    div.textContent = (p.isHost && showHost ? "👑 " : "") + p.name;
    container.appendChild(div);
  });
}

// --- Login ---
document.getElementById("btn-create").addEventListener("click", () => {
  const name = document.getElementById("player-name").value.trim();
  if (!name) { showError("الرجاء إدخال اسم"); return; }
  hideError();
  document.getElementById("btn-create").disabled = true;
  socket.emit("create_room", { playerName: name }, (res) => {
    document.getElementById("btn-create").disabled = false;
    if (res.error) { showError(res.error); return; }
    currentRoom = res.roomCode;
    myId = socket.id;
    isHost = true;
    players = res.players;
    enterLobby();
  });
});

document.getElementById("btn-join").addEventListener("click", () => {
  const el = document.getElementById("join-input");
  el.classList.toggle("hidden");
  if (!el.classList.contains("hidden")) {
    document.getElementById("room-code").focus();
  }
});

document.getElementById("btn-join-submit").addEventListener("click", () => {
  const name = document.getElementById("player-name").value.trim();
  const code = document.getElementById("room-code").value.trim().toUpperCase();
  if (!name) { showError("الرجاء إدخال اسم"); return; }
  if (!code || code.length !== 4) { showError("كود الغرفة يجب أن يكون 4 أحرف"); return; }
  hideError();
  document.getElementById("btn-join-submit").disabled = true;
  socket.emit("join_room", { playerName: name, roomCode: code }, (res) => {
    document.getElementById("btn-join-submit").disabled = false;
    if (res.error) { showError(res.error); return; }
    currentRoom = res.roomCode;
    myId = socket.id;
    isHost = false;
    players = res.players;
    enterLobby();
  });
});

function showError(msg) {
  const el = document.getElementById("login-error");
  el.textContent = msg;
  el.classList.remove("hidden");
}

function hideError() {
  document.getElementById("login-error").classList.add("hidden");
}

// --- Socket events ---
socket.on("player_list", (updatedPlayers) => {
  players = updatedPlayers;
  updateLobbyPlayers();
});

socket.on("you_are_host", () => {
  isHost = true;
  updateLobbyHostControls();
  showToast("أنت الآن صاحب الغرفة");
});

socket.on("game_starting", () => {
  // brief transition
});

socket.on("your_question", (data) => {
  isImpostor = data.isImpostor;
  document.getElementById("question-round").textContent = data.round;
  document.getElementById("question-max").textContent = data.maxRounds;
  document.getElementById("question-topic").textContent = `الموضوع: ${data.topic}`;
  document.getElementById("question-text").textContent = data.question;

  if (isImpostor) {
    document.getElementById("impostor-badge").classList.remove("hidden");
    document.getElementById("innocent-badge").classList.add("hidden");
  } else {
    document.getElementById("innocent-badge").classList.remove("hidden");
    document.getElementById("impostor-badge").classList.add("hidden");
  }

  document.getElementById("btn-question-ready").disabled = false;
  showScreen("question");
});

socket.on("phase_changed", (data) => {
  if (data.phase === "discussion") {
    enterDiscussion(data);
  } else if (data.phase === "voting") {
    enterVoting(data);
  } else if (data.phase === "showing_question") {
    // Already handled by your_question
  }
});

let timerInterval = null;

function startTimer(elementId, seconds, onEnd) {
  if (timerInterval) clearInterval(timerInterval);
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = formatTime(seconds);

  timerInterval = setInterval(() => {
    seconds--;
    if (seconds <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      el.textContent = "0:00";
      el.classList.add("warning");
      if (onEnd) onEnd();
    } else {
      el.textContent = formatTime(seconds);
      if (seconds <= 10) el.classList.add("warning");
    }
  }, 1000);
}

function clearTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function enterDiscussion(data) {
  showScreen("discussion");
  document.getElementById("discussion-round").textContent = currentRound || "";
  document.getElementById("chat-messages").innerHTML = "";
  document.getElementById("chat-input").disabled = false;
  document.getElementById("btn-send").disabled = false;
  document.getElementById("chat-input").focus();

  const timer = data.timer || 120;
  document.getElementById("discussion-timer").classList.remove("warning");
  startTimer("discussion-timer", timer);
}

function enterVoting(data) {
  showScreen("voting");
  document.getElementById("voting-round").textContent = currentRound || "";
  document.getElementById("vote-status").classList.remove("hidden");
  document.getElementById("impostor-vote-block").classList.add("hidden");

  if (isImpostor) {
    document.getElementById("vote-status").classList.add("hidden");
    document.getElementById("impostor-vote-block").classList.remove("hidden");
  }

  const timer = data.timer || 30;
  document.getElementById("voting-timer").classList.remove("warning");
  startTimer("voting-timer", timer, () => {
    // timer ended, waiting for server
  });

  renderVotingPlayers();
}

let currentRound = 0;

socket.on("chat_message", (data) => {
  const container = document.getElementById("chat-messages");
  const div = document.createElement("div");
  div.className = "chat-msg" + (data.playerId === myId ? " own" : "");
  div.innerHTML = `<div class="msg-name">${data.playerName}</div><div class="msg-text">${escapeHtml(data.message)}</div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
});

socket.on("vote_update", (data) => {
  document.getElementById("voted-count").textContent = data.votedCount;
  document.getElementById("total-voters").textContent = data.totalVoters;
});

socket.on("round_result", (data) => {
  clearTimer();
  showScreen("reveal");
  currentRound = data.round;

  const impostorNames = data.impostorNames.map(n => `🔴 ${n}`).join("، ");
  const caught = data.impostorCaught;

  document.getElementById("reveal-title").textContent = caught
    ? "🎉 تم كشف الدخيل!"
    : "😈 الدخيل لم يتم كشفه!";

  document.getElementById("reveal-impostor-name").textContent = impostorNames;

  const me = players.find(p => p.id === myId);
  const myQ = me ? (isImpostor ? "السؤال B (الدخيل)" : "السؤال A (الأصلي)") : "";

  document.getElementById("reveal-topic-text").textContent = `الموضوع: ${data.topic}`;

  document.getElementById("reveal-impostor-question").innerHTML =
    `<strong>السؤال B (الدخيل):</strong><br>${escapeHtml(data.questionB)}`;

  document.getElementById("reveal-innocent-question").innerHTML =
    `<strong>السؤال A (الأصلي):</strong><br>${escapeHtml(data.questionA)}`;

  // Votes
  const votesContainer = document.getElementById("reveal-votes");
  votesContainer.innerHTML = "";
  data.votes.forEach(v => {
    if (v.voterId === v.target) return;
    const div = document.createElement("div");
    div.className = "reveal-vote-item";
    const targetPlayer = players.find(p => p.id === v.target);
    const targetName = targetPlayer ? targetPlayer.name : "لم يصوت";
    div.innerHTML = `<span>${v.voter}</span><span class="vote-target">← ${targetName}</span>`;
    votesContainer.appendChild(div);
  });

  // Scores
  const scoresContainer = document.getElementById("reveal-scores");
  scoresContainer.innerHTML = "";
  data.scores.sort((a, b) => b.score - a.score).forEach(s => {
    const div = document.createElement("div");
    div.className = "score-item";
    const isMe = s.id === myId;
    div.innerHTML = `<span${isMe ? ' style="color:#6c63ff;font-weight:700"' : ''}>${s.name}${isMe ? ' (أنت)' : ''}</span><span class="score-value">${s.score}</span>`;
    scoresContainer.appendChild(div);
  });

  // Next round button
  const isLastRound = data.round >= data.maxRounds;
  const nextBtn = document.getElementById("btn-next-round");
  const autoBtn = document.getElementById("btn-next-auto");

  if (isLastRound) {
    nextBtn.classList.add("hidden");
    autoBtn.classList.remove("hidden");
    autoBtn.textContent = "جاري عرض النتائج النهائية...";
    setTimeout(() => {
      socket.emit("next_round", { roomCode: currentRoom });
    }, 3000);
  } else {
    nextBtn.classList.remove("hidden");
    autoBtn.classList.add("hidden");
    if (isHost) {
      nextBtn.disabled = false;
      nextBtn.textContent = `الجولة التالية (${data.round + 1}/${data.maxRounds})`;
    } else {
      nextBtn.disabled = true;
      nextBtn.textContent = "انتظار صاحب الغرفة...";
    }
  }
});

socket.on("game_over", (data) => {
  clearTimer();
  showScreen("gameover");
  const container = document.getElementById("final-scores");
  container.innerHTML = "";
  data.finalScores.sort((a, b) => b.score - a.score).forEach((s, i) => {
    const div = document.createElement("div");
    div.className = "final-score-item";
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "";
    const isMe = s.id === myId;
    div.innerHTML = `<span>${medal} ${s.name}${isMe ? ' (أنت)' : ''}</span><span class="score-value">${s.score}</span>`;
    container.appendChild(div);
  });
});

socket.on("game_ended", (data) => {
  clearTimer();
  showErrorScreen(data.reason || "انتهت اللعبة");
});

socket.on("error", (data) => {
  showToast(data.message || "حدث خطأ");
});

// --- Lobby ---
function enterLobby() {
  showScreen("lobby");
  document.getElementById("lobby-room-code").textContent = currentRoom;
  updateLobbyPlayers();
  updateLobbyHostControls();
}

function updateLobbyPlayers() {
  document.getElementById("player-count").textContent = players.length;
  const container = document.getElementById("lobby-players");
  renderPlayers(players, container, true);
}

function updateLobbyHostControls() {
  const settings = document.getElementById("host-settings");
  const startBtn = document.getElementById("btn-start");
  const hint = document.getElementById("start-hint");

  if (isHost) {
    settings.classList.remove("hidden");
    const connected = players.filter(p => p.isConnected !== false);
    if (connected.length >= 3) {
      startBtn.classList.remove("hidden");
      startBtn.disabled = false;
      hint.classList.add("hidden");
    } else {
      startBtn.classList.add("hidden");
      hint.classList.remove("hidden");
      hint.textContent = "يلزم 3 لاعبين على الأقل للبدء";
    }
  } else {
    settings.classList.add("hidden");
    startBtn.classList.add("hidden");
    hint.classList.remove("hidden");
    hint.textContent = "انتظار صاحب الغرفة لبدء اللعبة...";
  }
}

document.getElementById("btn-copy-code").addEventListener("click", () => {
  navigator.clipboard.writeText(currentRoom).then(() => {
    showToast("تم نسخ الكود!");
  }).catch(() => {
    showToast("الكود: " + currentRoom);
  });
});

document.getElementById("btn-start").addEventListener("click", () => {
  const rounds = parseInt(document.getElementById("rounds-select").value);
  document.getElementById("btn-start").disabled = true;
  socket.emit("start_game", { roomCode: currentRoom, maxRounds: rounds }, (res) => {
    document.getElementById("btn-start").disabled = false;
    if (res?.error) {
      showToast(res.error);
      updateLobbyHostControls();
    }
  });
});

// --- Question ---
document.getElementById("btn-question-ready").addEventListener("click", () => {
  document.getElementById("btn-question-ready").disabled = true;
  socket.emit("question_ready", { roomCode: currentRoom });
});

// --- Discussion ---
document.getElementById("btn-send").addEventListener("click", sendMessage);
document.getElementById("chat-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});

function sendMessage() {
  const input = document.getElementById("chat-input");
  const msg = input.value.trim();
  if (!msg) return;
  input.value = "";
  socket.emit("send_message", { roomCode: currentRoom, message: msg });
}

// --- Voting ---
function renderVotingPlayers() {
  const container = document.getElementById("voting-players");
  container.innerHTML = "";

  players.forEach(p => {
    if (p.id === myId && !isImpostor) {
      // Don't show yourself
    }
    if (p.isConnected === false) return;

    const btn = document.createElement("button");
    btn.className = "vote-player-btn";
    btn.textContent = p.name + (p.isHost ? " 👑" : "");
    btn.dataset.id = p.id;

    if (isImpostor || p.id === myId) {
      btn.disabled = true;
      btn.style.opacity = "0.3";
    } else {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".vote-player-btn").forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
        socket.emit("cast_vote", { roomCode: currentRoom, targetId: p.id });
        btn.disabled = true;
      });
    }

    container.appendChild(btn);
  });
}

// --- Reveal ---
document.getElementById("btn-next-round").addEventListener("click", () => {
  if (isHost) {
    document.getElementById("btn-next-round").disabled = true;
    socket.emit("next_round", { roomCode: currentRoom });
  }
});

// --- Game Over ---
document.getElementById("btn-play-again").addEventListener("click", () => {
  window.location.reload();
});

// --- Error ---
function showErrorScreen(msg) {
  document.getElementById("error-message").textContent = msg;
  showScreen("error");
}

document.getElementById("btn-error-back").addEventListener("click", () => {
  window.location.reload();
});

// --- Utility ---
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// --- Enter key for login ---
document.getElementById("player-name").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    if (document.getElementById("join-input").classList.contains("hidden")) {
      document.getElementById("btn-create").click();
    } else {
      document.getElementById("btn-join-submit").click();
    }
  }
});

document.getElementById("room-code").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    document.getElementById("btn-join-submit").click();
  }
});

// --- Prevent zoom on double tap ---
let lastTouchEnd = 0;
document.addEventListener("touchend", (e) => {
  const now = Date.now();
  if (now - lastTouchEnd <= 300) e.preventDefault();
  lastTouchEnd = now;
}, false);
