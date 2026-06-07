const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const questions = require("./questions");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ["websocket", "polling"]
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const rooms = {};

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = "";
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms[code]);
  return code;
}

function getImpostorCount(playerCount) {
  if (playerCount <= 5) return 1;
  if (playerCount <= 8) return 2;
  return 3;
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function startTimer(roomCode, duration, callback) {
  const room = rooms[roomCode];
  if (!room) return;
  if (room.timer) clearTimeout(room.timer);
  room.timer = setTimeout(() => {
    callback(roomCode);
  }, duration * 1000);
}

function cleanupRoom(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  if (room.timer) clearTimeout(room.timer);
  delete rooms[roomCode];
}

function broadcastPlayers(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  const players = room.players.map(p => ({
    id: p.id,
    name: p.name,
    isHost: p.isHost,
    isConnected: p.isConnected
  }));
  io.to(roomCode).emit("player_list", players);
}

function addPlayerToRoom(roomCode, socket, playerName) {
  const room = rooms[roomCode];
  if (!room) return null;
  if (room.state !== "waiting") return null;
  if (room.players.length >= 10) return null;
  if (room.players.find(p => p.name === playerName)) return null;

  const player = {
    id: socket.id,
    name: playerName,
    isHost: room.players.length === 0,
    isConnected: true,
    questionType: null,
    question: null,
    topic: null,
    vote: null,
    isImpostor: false,
    score: 0,
    questionReady: false
  };

  room.players.push(player);
  socket.join(roomCode);
  broadcastPlayers(roomCode);
  return player;
}

function startNewRound(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  if (room.currentRound >= room.maxRounds) {
    io.to(roomCode).emit("game_over", { finalScores: room.players.map(p => ({ id: p.id, name: p.name, score: p.score })) });
    room.state = "waiting";
    return;
  }

  room.currentRound++;
  room.state = "showing_question";

  const q = questions[Math.floor(Math.random() * questions.length)];
  room.currentQuestion = q;

  const connected = room.players.filter(p => p.isConnected);
  const impostorCount = getImpostorCount(connected.length);
  const shuffled = shuffleArray(connected);

  shuffled.forEach((p, i) => {
    p.isImpostor = i < impostorCount;
    p.questionType = i < impostorCount ? "B" : "A";
    p.question = i < impostorCount ? q.questionB : q.questionA;
    p.topic = q.topic;
    p.vote = null;
    p.questionReady = false;
  });

  room.players.forEach(p => {
    const socket = getSocketById(p.id);
    if (socket && p.question) {
      socket.emit("your_question", {
        questionType: p.questionType,
        question: p.question,
        topic: p.topic,
        isImpostor: p.isImpostor,
        round: room.currentRound,
        maxRounds: room.maxRounds
      });
    }
  });

  io.to(roomCode).emit("phase_changed", { phase: "showing_question", timer: 20, round: room.currentRound, maxRounds: room.maxRounds });
  startTimer(roomCode, 20, () => startDiscussion(roomCode));
}

function startDiscussion(roomCode) {
  const room = rooms[roomCode];
  if (!room || room.state !== "showing_question") return;
  room.state = "discussion";
  io.to(roomCode).emit("phase_changed", { phase: "discussion", timer: 120 });
  startTimer(roomCode, 120, () => startVoting(roomCode));
}

function startVoting(roomCode) {
  const room = rooms[roomCode];
  if (!room || room.state !== "discussion") return;
  room.state = "voting";
  room.players.forEach(p => { p.vote = null; });
  io.to(roomCode).emit("phase_changed", { phase: "voting", timer: 30 });
  startTimer(roomCode, 30, () => calculateResults(roomCode));
}

function calculateResults(roomCode) {
  const room = rooms[roomCode];
  if (!room || room.state !== "voting") return;
  room.state = "reveal";

  const connected = room.players.filter(p => p.isConnected);
  const impostors = room.players.filter(p => p.isImpostor);
  const innocents = room.players.filter(p => !p.isImpostor);

  const votesFor = {};
  room.players.forEach(p => { votesFor[p.id] = 0; });
  room.players.forEach(p => {
    if (p.vote && votesFor[p.vote] !== undefined) {
      votesFor[p.vote]++;
    }
  });

  const mostVotedId = Object.keys(votesFor).reduce((a, b) => votesFor[a] > votesFor[b] ? a : b);
  const mostVotedPlayer = room.players.find(p => p.id === mostVotedId);
  const caughtImpostor = mostVotedPlayer && mostVotedPlayer.isImpostor;

  const impostorCaught = caughtImpostor;

  if (impostorCaught) {
    innocents.forEach(p => { p.score += 1; });
  } else {
    impostors.forEach(p => { p.score += 3; });
  }

  const result = {
    impostorIds: impostors.map(p => p.id),
    impostorNames: impostors.map(p => p.name),
    votes: room.players.map(p => ({ voter: p.name, voterId: p.id, target: p.vote })),
    scores: room.players.map(p => ({ id: p.id, name: p.name, score: p.score })),
    impostorCaught,
    mostVotedId,
    mostVotedName: mostVotedPlayer ? mostVotedPlayer.name : "",
    round: room.currentRound,
    maxRounds: room.maxRounds,
    questionA: room.currentQuestion?.questionA || "",
    questionB: room.currentQuestion?.questionB || "",
    topic: room.currentQuestion?.topic || ""
  };

  io.to(roomCode).emit("round_result", result);
  startTimer(roomCode, 25, () => startNewRound(roomCode));
}

function getSocketById(socketId) {
  return io.sockets.sockets.get(socketId);
}

io.on("connection", (socket) => {
  let currentRoom = null;

  socket.on("create_room", (data, callback) => {
    const playerName = sanitize(data?.playerName);
    if (!playerName || playerName.length < 1) {
      return callback?.({ error: "الرجاء إدخال اسم صحيح" });
    }

    const roomCode = generateCode();
    rooms[roomCode] = {
      players: [],
      state: "waiting",
      currentRound: 0,
      maxRounds: 5,
      currentQuestion: null,
      timer: null,
      createdAt: Date.now()
    };

    currentRoom = roomCode;
    const player = addPlayerToRoom(roomCode, socket, playerName);
    if (!player) {
      delete rooms[roomCode];
      return callback?.({ error: "حدث خطأ في إنشاء الغرفة" });
    }

    callback?.({ roomCode, players: room.players.map(p => ({ id: p.id, name: p.name, isHost: p.isHost })) });
  });

  socket.on("join_room", (data, callback) => {
    const playerName = sanitize(data?.playerName);
    const roomCode = data?.roomCode?.trim().toUpperCase();

    if (!playerName || playerName.length < 1) {
      return callback?.({ error: "الرجاء إدخال اسم صحيح" });
    }
    if (!roomCode || roomCode.length !== 4) {
      return callback?.({ error: "كود الغرفة غير صحيح" });
    }

    const room = rooms[roomCode];
    if (!room) {
      return callback?.({ error: "الغرفة غير موجودة" });
    }
    if (room.state !== "waiting") {
      return callback?.({ error: "اللعبة قد بدأت بالفعل" });
    }
    if (room.players.length >= 10) {
      return callback?.({ error: "الغرفة ممتلئة" });
    }
    if (room.players.find(p => p.name === playerName)) {
      return callback?.({ error: "هذا الاسم مستخدم بالفعل في الغرفة" });
    }

    currentRoom = roomCode;
    const player = addPlayerToRoom(roomCode, socket, playerName);
    if (!player) {
      return callback?.({ error: "حدث خطأ في الانضمام" });
    }

    callback?.({ roomCode, players: room.players.map(p => ({ id: p.id, name: p.name, isHost: p.isHost })) });
  });

  socket.on("start_game", (data, callback) => {
    const roomCode = data?.roomCode;
    const room = rooms[roomCode];
    if (!room) return callback?.({ error: "الغرفة غير موجودة" });

    const player = room.players.find(p => p.id === socket.id);
    if (!player?.isHost) return callback?.({ error: "فقط صاحب الغرفة يمكنه بدء اللعبة" });
    if (room.state !== "waiting") return callback?.({ error: "اللعبة قيد التشغيل" });

    const connected = room.players.filter(p => p.isConnected);
    if (connected.length < 3) {
      return callback?.({ error: "يجب أن يكون هناك على الأقل 3 لاعبين للبدء" });
    }

    if (data?.maxRounds) {
      room.maxRounds = Math.max(1, Math.min(10, data.maxRounds));
    }

    io.to(roomCode).emit("game_starting");
    startNewRound(roomCode);
    callback?.({ success: true });
  });

  socket.on("question_ready", (data) => {
    const roomCode = data?.roomCode;
    const room = rooms[roomCode];
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    player.questionReady = true;
    const allReady = room.players.filter(p => p.isConnected).every(p => p.questionReady);

    if (allReady) {
      if (room.state === "showing_question") {
        startDiscussion(roomCode);
      }
    }
  });

  socket.on("send_message", (data) => {
    const roomCode = data?.roomCode;
    const message = sanitize(data?.message);
    if (!message) return;

    const room = rooms[roomCode];
    if (!room) return;
    if (room.state !== "discussion") return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    io.to(roomCode).emit("chat_message", {
      playerId: socket.id,
      playerName: player.name,
      message,
      time: Date.now()
    });
  });

  socket.on("cast_vote", (data) => {
    const roomCode = data?.roomCode;
    const targetId = data?.targetId;

    const room = rooms[roomCode];
    if (!room) return;
    if (room.state !== "voting") return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.isImpostor || player.vote !== null) return;

    const target = room.players.find(p => p.id === targetId);
    if (!target) return;
    if (target.id === socket.id) return;

    player.vote = targetId;

    const connected = room.players.filter(p => p.isConnected);
    const voters = room.players.filter(p => p.isConnected && !p.isImpostor);
    const voted = voters.filter(p => p.vote !== null);

    io.to(roomCode).emit("vote_update", { votedCount: voted.length, totalVoters: voters.length });

    if (voted.length >= voters.length) {
      if (room.timer) clearTimeout(room.timer);
      calculateResults(roomCode);
    }
  });

  socket.on("next_round", (data) => {
    const roomCode = data?.roomCode;
    const room = rooms[roomCode];
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player?.isHost) return;
    if (room.state !== "reveal") return;

    if (room.timer) clearTimeout(room.timer);
    startNewRound(roomCode);
  });

  socket.on("leave_room", () => {
    if (!currentRoom) return;
    handleDisconnect(socket, currentRoom);
    currentRoom = null;
  });

  socket.on("disconnect", () => {
    if (!currentRoom) return;
    handleDisconnect(socket, currentRoom);
    currentRoom = null;
  });
});

function handleDisconnect(socket, roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  const player = room.players.find(p => p.id === socket.id);
  if (!player) return;

  player.isConnected = false;
  socket.leave(roomCode);

  const connected = room.players.filter(p => p.isConnected);

  if (connected.length === 0) {
    cleanupRoom(roomCode);
    return;
  }

  if (player.isHost && connected.length > 0) {
    connected[0].isHost = true;
    const hostSocket = getSocketById(connected[0].id);
    if (hostSocket) {
      hostSocket.emit("you_are_host");
    }
  }

  broadcastPlayers(roomCode);

  if (room.state !== "waiting") {
    const remaining = connected.length;
    if (remaining < 3) {
      if (room.timer) clearTimeout(room.timer);
      room.state = "waiting";
      io.to(roomCode).emit("game_ended", { reason: "انسحب عدد كبير من اللاعبين" });
      return;
    }

    if (room.state === "voting") {
      const voters = room.players.filter(p => p.isConnected && !p.isImpostor);
      const voted = voters.filter(p => p.vote !== null);
      io.to(roomCode).emit("vote_update", { votedCount: voted.length, totalVoters: voters.length });
      if (voted.length >= voters.length) {
        if (room.timer) clearTimeout(room.timer);
        calculateResults(roomCode);
      }
    }
  }
}

function sanitize(str) {
  if (typeof str !== "string") return "";
  return str.replace(/[<>&"']/g, "").trim().slice(0, 200);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`الخادم يعمل على المنفذ ${PORT}`);
});
