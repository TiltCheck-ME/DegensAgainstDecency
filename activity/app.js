/**
 * Degens Against Decency — CRT channel spectator (bot-driven)
 */

const CFG = window.APP_CONFIG || {};

const Synth = {
  ctx: null,
  enabled: true,

  init() {
    if (this.ctx) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx();
    } catch (_) {}
  },

  beep(freq = 800, duration = 0.05, type = 'triangle') {
    if (!this.enabled || !this.ctx) return;
    this.init();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  },

  boot() {
    this.beep(440, 0.1, 'square');
    setTimeout(() => this.beep(880, 0.15, 'square'), 120);
  },

  round() {
    this.beep(620, 0.08, 'sawtooth');
  },

  win() {
    [523, 659, 784].forEach((f, i) => setTimeout(() => this.beep(f, 0.15), i * 90));
  },
};

const Spectator = {
  channelId: null,
  socket: null,
  state: null,
  lastPhase: null,
  lastRound: 0,
  reconnectTimer: null,
  phase: 'connecting',

  els: {},

  async init() {
    if (typeof window.discordSdk !== 'undefined' || window.self !== window.top) {
      document.body.classList.add('discord-activity');
    }

    this.cacheElements();
    this.bindThemeControls();
    await this.runBios();
    await this.resolveChannelId();
    await this.tryDiscordAuth();
    this.connect();
  },

  cacheElements() {
    [
      'biosScreen', 'waitingScreen', 'errorScreen', 'lobbyScreen', 'gameScreen', 'endScreen',
      'biosText', 'waitingMessage', 'errorMessage', 'lobbyStatus', 'lobbyRoster',
      'terminalLog', 'rosterList', 'hudRound', 'hudCzar', 'hudPhase', 'hudPlayers', 'hudSubs',
      'blackCardText', 'endContent',
    ].forEach((id) => { this.els[id] = document.getElementById(id); });
  },

  bindThemeControls() {
    ['Green', 'Amber', 'Cyber', 'Vga'].forEach((t) => {
      document.getElementById(`btnTheme${t}`)?.addEventListener('click', (e) => {
        const screen = document.getElementById('crtScreen');
        screen.className = 'crt-screen';
        screen.classList.add(`theme-${t.toLowerCase()}`);
        document.querySelectorAll('.bezel-theme-toggles .theme-btn').forEach((b) => b.classList.remove('active'));
        e.target.classList.add('active');
        Synth.beep(900, 0.04, 'square');
      });
    });

    document.getElementById('powerBtn')?.addEventListener('click', () => {
      const screen = document.getElementById('crtScreen');
      const led = document.getElementById('powerLed');
      if (screen.classList.contains('power-off')) {
        screen.classList.remove('power-off');
        screen.classList.add('power-on');
        led.classList.add('LED-on');
        Synth.boot();
        this.connect();
      } else {
        screen.classList.remove('power-on');
        screen.classList.add('power-off');
        led.classList.remove('LED-on');
        this.disconnect();
        Synth.beep(150, 0.3, 'sawtooth');
      }
    });
  },

  async runBios() {
    const lines = [
      'DEGENS AGAINST DECENCY SPECTATOR V1.0',
      'Copyright (C) 2026 — Parody party game',
      '--------------------------------------------',
      'Not affiliated with Cards Against Humanity®',
      'Initializing channel telemetry receiver...',
      'Linking Discord channel context...',
    ];
    const el = this.els.biosText;
    for (const line of lines) {
      el.textContent += `${line}\n`;
      Synth.beep(800 + Math.random() * 200, 0.01);
      await new Promise((r) => setTimeout(r, 100));
    }
    Synth.boot();
    await new Promise((r) => setTimeout(r, 350));
  },

  async resolveChannelId() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('channelId')) {
      this.channelId = params.get('channelId');
      return;
    }

    if (typeof window.discordSdk !== 'undefined' && CFG.DISCORD_CLIENT_ID) {
      try {
        const sdk = new window.discordSdk.DiscordSDK(CFG.DISCORD_CLIENT_ID);
        await sdk.ready();
        const channelId = await sdk.commands.getChannelId();
        if (channelId) this.channelId = String(channelId);
      } catch (e) {
        console.warn('Discord channel context unavailable:', e);
      }
    }
  },

  async tryDiscordAuth() {
    if (typeof window.discordSdk === 'undefined' || !CFG.API_URL || !CFG.DISCORD_CLIENT_ID) return;
    try {
      const sdk = new window.discordSdk.DiscordSDK(CFG.DISCORD_CLIENT_ID);
      await sdk.ready();
      const { code } = await sdk.commands.authorize({
        client_id: CFG.DISCORD_CLIENT_ID,
        response_type: 'code',
        state: '',
        prompt: 'none',
        scope: ['identify'],
      });
      const res = await fetch(`${CFG.API_URL}/api/discord-activity/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (res.ok) {
        const { user } = await res.json();
        this.log(`Spectator linked: ${user.username}`, 'info');
      }
    } catch (e) {
      console.warn('Discord auth skipped:', e);
    }
  },

  connect() {
    if (!this.channelId) {
      this.showError('No channel ID. Open via "🖥️ Open Retro View" in Discord or add ?channelId= to the URL.');
      return;
    }

    const wsUrl = CFG.WS_URL || 'ws://localhost:3000';
    this.disconnect();

    try {
      this.socket = new WebSocket(wsUrl);
    } catch (e) {
      this.showError(`WebSocket failed: ${e.message}`);
      return;
    }

    this.socket.onopen = () => {
      this.socket.send(JSON.stringify({ type: 'subscribe', channelId: this.channelId }));
      this.log('Connected to bot relay.', 'info');
    };

    this.socket.onmessage = (ev) => {
      let data;
      try { data = JSON.parse(ev.data); } catch { return; }
      this.handleMessage(data);
    };

    this.socket.onclose = () => {
      if (this.phase !== 'ended') {
        this.showScreen('waiting');
        this.els.waitingMessage.innerHTML = '<p>Lost signal — reconnecting…</p>';
        this.scheduleReconnect();
      }
    };

    this.socket.onerror = () => {
      this.showError(`Cannot reach ${wsUrl}. Redeploy Netlify so config.js points to Fly, and ensure the bot is online.`);
    };
  },

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.close();
      this.socket = null;
    }
  },

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 5000);
  },

  handleMessage(data) {
    if (data.feedLine) {
      this.log(data.feedLine, data.feedType || 'passive');
    }

    switch (data.type) {
      case 'waiting':
        this.phase = 'waiting';
        this.showScreen('waiting');
        if (data.message) {
          this.els.waitingMessage.innerHTML = `<p>${data.message}</p><p>Start with <span class="highlight">/create-game</span>.</p>`;
        }
        break;
      case 'error':
        this.showError(data.message || 'Unknown error');
        break;
      case 'snapshot':
      case 'lobby_update':
        this.applyState(data.gameState, data.type);
        break;
      case 'game_start':
        this.applyState(data.gameState, data.type);
        this.log('🚀 Game started! Cards dealt via DM.', 'day');
        Synth.boot();
        break;
      case 'round_update':
        this.applyState(data.gameState, data.type);
        break;
      case 'game_end':
        this.applyEnd(data.gameState);
        break;
      default:
        break;
    }
  },

  applyState(gs, msgType) {
    if (!gs) return;

    const prev = this.state;
    this.state = gs;

    if (gs.status === 'waiting') {
      this.phase = 'lobby';
      this.showScreen('lobby');
      this.els.lobbyStatus.textContent = `${gs.playerCount}/${gs.maxPlayers} players — waiting to start`;
      this.els.lobbyRoster.innerHTML = (gs.players || [])
        .map((p) => `<li>${p.username}</li>`)
        .join('') || '<li><em>No players yet</em></li>';
      if (msgType === 'lobby_update' && prev && gs.playerCount > prev.playerCount) {
        this.log(`Player joined (${gs.playerCount}/${gs.maxPlayers}).`, 'info');
      }
      return;
    }

    if (gs.status === 'playing') {
      this.phase = 'running';
      this.showScreen('game');
      this.updateHud(gs);
      this.renderRoster(gs.players || []);

      if (gs.blackCard) {
        this.els.blackCardText.textContent = gs.blackCard;
      }

      if (msgType === 'round_update' || msgType === 'game_start') {
        if (gs.round !== this.lastRound) {
          this.log(`Round ${gs.round}${gs.maxRounds ? ` of ${gs.maxRounds}` : ''} — Card Czar: ${gs.cardCzar || '?'}`, 'day');
          this.lastRound = gs.round;
          Synth.round();
        }
        if (gs.phase !== this.lastPhase) {
          if (gs.phase === 'submissions') {
            this.log('Players submitting answer cards…', 'passive');
          } else if (gs.phase === 'judging') {
            this.log(`Card Czar ${gs.cardCzar || '?'} is judging ${gs.submissionCount || 0} submissions.`, 'warning');
          }
          this.lastPhase = gs.phase;
        }
      }
      return;
    }

    if (gs.status === 'finished') {
      this.applyEnd(gs);
    }
  },

  applyEnd(gs) {
    this.phase = 'ended';
    this.disconnect();
    this.showScreen('end');
    const winner = [...(gs?.players || [])].sort((a, b) => (b.score || 0) - (a.score || 0))[0];
    this.els.endContent.innerHTML = winner
      ? `<p class="highlight">🏆 ${winner.username} wins with ${winner.score || 0} points!</p>`
      : '<p class="highlight">Game complete.</p>';
    Synth.win();
  },

  updateHud(gs) {
    this.els.hudRound.textContent = gs.maxRounds ? `${gs.round}/${gs.maxRounds}` : String(gs.round || 0);
    this.els.hudCzar.textContent = gs.cardCzar || '—';
    this.els.hudPhase.textContent = this.formatPhase(gs.phase);
    this.els.hudPlayers.textContent = `${gs.playerCount}/${gs.maxPlayers}`;
    this.els.hudSubs.textContent = String(gs.submissionCount ?? 0);
  },

  formatPhase(phase) {
    const map = {
      waiting: 'LOBBY',
      playing: 'LIVE',
      submissions: 'SUBMIT',
      judging: 'JUDGE',
      finished: 'DONE',
    };
    return map[phase] || (phase || '—').toUpperCase();
  },

  renderRoster(players) {
    const sorted = [...players].sort((a, b) => (b.score || 0) - (a.score || 0));
    this.els.rosterList.innerHTML = '';
    sorted.forEach((p, i) => {
      const card = document.createElement('div');
      card.className = 'traveler-card';
      const medal = i === 0 && p.score > 0 ? '🥇 ' : '';
      card.innerHTML = `
        <div class="traveler-info">
          <span class="traveler-name">${medal}${p.username}</span>
          <span class="traveler-stats">${p.score || 0} pts</span>
        </div>
        <div class="health-container health-good">
          <div class="health-bar" style="width:${Math.min(100, (p.score || 0) * 10 + 10)}%"></div>
        </div>`;
      this.els.rosterList.appendChild(card);
    });
  },

  showScreen(name) {
    ['bios', 'waiting', 'error', 'lobby', 'game', 'end'].forEach((s) => {
      const el = this.els[`${s}Screen`];
      if (el) el.classList.toggle('hidden', s !== name);
    });
  },

  showError(msg) {
    this.els.errorMessage.textContent = msg;
    this.showScreen('error');
  },

  log(msg, type = 'passive') {
    const entry = document.createElement('p');
    entry.className = `log-entry log-${type}`;
    const round = this.state?.round;
    const prefix = type !== 'day' && round ? `<span class="log-day">[R${round}]</span> ` : '';
    entry.innerHTML = `${prefix}${msg}`;
    this.els.terminalLog?.appendChild(entry);
    if (this.els.terminalLog) {
      this.els.terminalLog.scrollTop = this.els.terminalLog.scrollHeight;
    }
  },
};

window.addEventListener('DOMContentLoaded', () => Spectator.init());
