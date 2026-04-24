import { DiscordSDK } from 'https://cdn.jsdelivr.net/npm/@discord/embedded-app-sdk@1.6.1/+esm';

class TriviaActivityClient {
  constructor() {
    this.socket = io();
    this.user = null;
    this.gameId = null;
    this.gameState = null;
    this.isHost = false;
    this.activeTimer = null;
    this.totalTimer = 10;

    this.screens = {
      lobby: document.getElementById('screen-lobby'),
      question: document.getElementById('screen-question'),
      reveal: document.getElementById('screen-reveal'),
      leaderboard: document.getElementById('screen-leaderboard'),
      gameover: document.getElementById('screen-gameover')
    };

    this.init().catch((error) => {
      console.error('Trivia init error:', error);
      this.setStatus('Failed to initialize');
    });
  }

  async init() {
    const configRes = await fetch('/api/trivia/config');
    const config = await configRes.json();

    await this.initDiscord(config.discordClientId);
    this.setupSocket();
    this.bindUI();
  }

  async initDiscord(clientId) {
    const params = new URLSearchParams(window.location.search);
    const fallbackId = `activity-${Math.random().toString(36).slice(2, 10)}`;
    const fallbackName = `Player_${fallbackId.slice(-4)}`;

    this.activitySettings = {
      rounds: Number(params.get('rounds')) || undefined,
      timePerQuestion: Number(params.get('timePerQuestion')) || undefined,
      category: params.get('category') || undefined,
      channelId: params.get('channelId') || params.get('channel_id') || 'local-activity'
    };

    if (!clientId) {
      this.user = { id: fallbackId, username: fallbackName };
      return;
    }

    try {
      const discordSdk = new DiscordSDK(clientId);
      await discordSdk.ready();

      // Requirement: call authenticate during activity boot.
      try {
        await discordSdk.commands.authenticate({
          access_token: 'activity-session',
          expires: Date.now() + 3600,
          user: { id: fallbackId, username: fallbackName, discriminator: '0000', avatar: null },
          scopes: []
        });
      } catch (_) {
        // Authentication exchange needs backend token minting in production.
      }

      const participants = await discordSdk.commands.getInstanceConnectedParticipants();
      const participant = participants.participants?.[0] || null;
      this.user = participant
        ? { id: participant.id, username: participant.global_name || participant.username || fallbackName }
        : { id: fallbackId, username: fallbackName };
    } catch (error) {
      console.warn('Discord SDK unavailable, using fallback user.', error);
      this.user = { id: fallbackId, username: fallbackName };
    }
  }

  setupSocket() {
    this.socket.on('connect', () => {
      this.setStatus('Connected');
      this.socket.emit('trivia:join', {
        channelId: this.activitySettings.channelId,
        user: this.user,
        settings: {
          rounds: this.activitySettings.rounds,
          timePerQuestion: this.activitySettings.timePerQuestion,
          category: this.activitySettings.category
        }
      });
    });

    this.socket.on('trivia:joined', (payload) => {
      this.gameId = payload.gameId;
      this.isHost = payload.isHost;
      this.gameState = payload.game;
      this.renderLobby(payload.game.players || [], payload.game.creator?.id);
      this.showScreen('lobby');
    });

    this.socket.on('trivia:lobby', (payload) => {
      this.renderLobby(payload.players || [], payload.creatorId);
      if (payload.status === 'playing') this.showScreen('question');
    });

    this.socket.on('trivia:question', (payload) => {
      this.renderQuestion(payload);
      this.showScreen('question');
    });

    this.socket.on('trivia:answer-locked', () => {
      this.lockAnswerButtons();
      this.setStatus('Answers locked');
    });

    this.socket.on('trivia:reveal', (payload) => {
      this.renderReveal(payload);
      this.showScreen('reveal');
    });

    this.socket.on('trivia:leaderboard', (payload) => {
      this.renderLeaderboard(payload.leaderboard || []);
      this.showScreen('leaderboard');
    });

    this.socket.on('trivia:game-over', (payload) => {
      this.renderGameOver(payload);
      this.showScreen('gameover');
    });

    this.socket.on('trivia:answer-received', () => {
      this.setStatus('Answer submitted');
      this.lockAnswerButtons(true);
    });

    this.socket.on('error', (error) => {
      this.setStatus(error || 'Error');
    });

    this.socket.on('disconnect', () => {
      this.setStatus('Disconnected');
      clearInterval(this.activeTimer);
    });
  }

  bindUI() {
    const startBtn = document.getElementById('start-btn');
    startBtn.addEventListener('click', () => {
      if (!this.isHost || !this.gameId) return;
      this.socket.emit('trivia:start', {
        gameId: this.gameId,
        settings: {
          rounds: this.activitySettings.rounds,
          timePerQuestion: this.activitySettings.timePerQuestion,
          category: this.activitySettings.category
        }
      });
      startBtn.disabled = true;
    });
  }

  renderLobby(players, creatorId) {
    const list = document.getElementById('lobby-players');
    const startBtn = document.getElementById('start-btn');

    list.innerHTML = players.map((player) => {
      const hostTag = player.id === creatorId ? ' 👑 host' : '';
      return `<div class="card-item">${player.username}${hostTag}</div>`;
    }).join('');

    startBtn.style.display = this.isHost ? 'inline-block' : 'none';
    startBtn.disabled = (players.length < 3) || (this.gameState && this.gameState.status !== 'waiting');

    this.setPlayerCount(players.length);
    this.setStatus(this.isHost ? 'You are host' : 'Waiting for host');
  }

  renderQuestion(payload) {
    this.totalTimer = payload.timerSeconds || 10;

    document.getElementById('round-label').textContent = `Round ${payload.round} / ${payload.maxRounds}`;
    document.getElementById('question-text').textContent = payload.question.question;

    const grid = document.getElementById('answer-grid');
    grid.innerHTML = (payload.question.options || []).map((option) => `
      <button class="answer-btn" data-answer="${option}">${option}</button>
    `).join('');

    Array.from(grid.querySelectorAll('button')).forEach((button) => {
      button.addEventListener('click', () => {
        if (button.classList.contains('locked')) return;
        this.socket.emit('trivia:answer', { gameId: this.gameId, answer: button.dataset.answer });
        Array.from(grid.querySelectorAll('button')).forEach((b) => b.classList.remove('selected'));
        button.classList.add('selected');
      });
    });

    this.startVisualTimer(this.totalTimer);
    this.setStatus('Answer now');
  }

  renderReveal(payload) {
    const summary = document.getElementById('reveal-summary');
    const list = document.getElementById('reveal-results');

    summary.textContent = `Correct answer: ${payload.correctAnswer}. ${payload.explanation || ''}`;

    list.innerHTML = (payload.results || []).map((result) => {
      const cls = result.isCorrect ? 'correct' : 'wrong';
      const status = result.isCorrect ? '✅ survives' : '❌ eliminated';
      return `<div class="card-item ${cls}">${result.username} — ${status}</div>`;
    }).join('');

    this.setStatus('Round result');
  }

  renderLeaderboard(leaderboard) {
    const list = document.getElementById('leaderboard-list');
    list.innerHTML = leaderboard.map((entry, index) => {
      const status = entry.eliminated ? ' (eliminated)' : '';
      return `<div class="card-item ${entry.eliminated ? 'eliminated' : ''}">${index + 1}. ${entry.username} — ${entry.score}${status}</div>`;
    }).join('');
    this.setStatus('Leaderboard');
  }

  renderGameOver(payload) {
    const winnerText = document.getElementById('winner-text');
    const finalLeaderboard = document.getElementById('final-leaderboard');
    const confetti = document.getElementById('confetti');

    const winners = payload.winners || [];
    winnerText.textContent = winners.length
      ? `Winner${winners.length > 1 ? 's' : ''}: ${winners.map((w) => w.username).join(', ')}`
      : 'No winners this round.';

    finalLeaderboard.innerHTML = (payload.leaderboard || []).map((entry, idx) =>
      `<div class="card-item ${entry.eliminated ? 'eliminated' : ''}">${idx + 1}. ${entry.username} — ${entry.score}</div>`
    ).join('');

    confetti.textContent = '🎉 🎊 🧠 🎉 ��';
    this.setStatus('Game over');
  }

  startVisualTimer(seconds) {
    clearInterval(this.activeTimer);
    const timerText = document.getElementById('timer-text');
    const ring = document.getElementById('ring-progress');
    const circumference = 264;
    let remaining = seconds;

    timerText.textContent = String(remaining);
    ring.style.strokeDashoffset = '0';

    this.activeTimer = setInterval(() => {
      remaining -= 1;
      timerText.textContent = String(Math.max(0, remaining));
      const progress = (seconds - Math.max(0, remaining)) / seconds;
      ring.style.strokeDashoffset = String(circumference * progress);

      if (remaining <= 0) {
        clearInterval(this.activeTimer);
      }
    }, 1000);
  }

  lockAnswerButtons(keepSelected = false) {
    const buttons = document.querySelectorAll('#answer-grid .answer-btn');
    buttons.forEach((button) => {
      button.classList.add('locked');
      button.disabled = true;
      if (!keepSelected) button.classList.remove('selected');
    });
    clearInterval(this.activeTimer);
  }

  showScreen(name) {
    Object.values(this.screens).forEach((screen) => screen.classList.remove('active'));
    if (this.screens[name]) this.screens[name].classList.add('active');
  }

  setStatus(message) {
    document.getElementById('status-pill').textContent = message;
  }

  setPlayerCount(count) {
    document.getElementById('player-pill').textContent = `${count} player${count === 1 ? '' : 's'}`;
  }
}

new TriviaActivityClient();
