/**
 * Trivia Game - Live elimination trivia (HQ-style)
 *
 * Copyright (c) 2024 Degens Against Decency
 * Licensed under the MIT License
 * See LICENSE file in the project root for full license information.
 */

const BaseGame = require('./BaseGame');
const questionBank = require('../trivia-questions.json');

class TriviaGame extends BaseGame {
  constructor(id, creator, isPrivate, maxPlayers, options = {}) {
    super(id, creator, isPrivate, maxPlayers);
    this.type = 'trivia';

    this.category = options.category || 'general';
    this.maxRounds = this.sanitizeInt(options.rounds, parseInt(process.env.TRIVIA_MAX_ROUNDS || '10', 10), 5, 20);
    this.timePerQuestion = this.sanitizeInt(options.timePerQuestion, parseInt(process.env.TRIVIA_TIME_PER_QUESTION || '10', 10), 5, 30);

    this.phase = 'lobby';
    this.questionPool = [];
    this.currentQuestion = null;
    this.roundAnswers = new Map();
    this.activePlayers = new Set();
    this.eliminatedPlayers = new Set();
    this.playerStreaks = new Map();
    this.lastRoundResults = [];
    this.winners = [];

    this.roundTimer = null;
    this.revealTimer = null;
    this.leaderboardTimer = null;

    this.questionStartTs = null;
    this.eventHandler = null;
  }

  sanitizeInt(value, fallback, min, max) {
    const parsed = parseInt(value, 10);
    if (!Number.isInteger(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
  }

  setEventHandler(handler) {
    this.eventHandler = handler;
  }

  emitTriviaEvent(eventName, payload = {}) {
    if (typeof this.eventHandler === 'function') {
      this.eventHandler(eventName, payload);
    }
  }

  handleAction(userId, action) {
    switch (action.type) {
      case 'start-game':
        return this.startTrivia(userId, action.settings || {});
      case 'submit-answer':
        return this.submitAnswer(userId, action.answer);
      default:
        return { success: false, error: 'Unknown action' };
    }
  }

  initializeGame() {
    this.questionPool = this.buildQuestionPool();
    this.phase = 'question-countdown';
    this.currentRound = 1;

    this.players.forEach((player) => {
      if (!this.scores.has(player.id)) {
        this.scores.set(player.id, 0);
      }
      this.activePlayers.add(player.id);
      this.playerStreaks.set(player.id, 0);
    });
  }

  startTrivia(userId, settings = {}) {
    if (this.creator.id !== userId) {
      return { success: false, error: 'Only the host can start trivia' };
    }

    if (settings.rounds) {
      this.maxRounds = this.sanitizeInt(settings.rounds, this.maxRounds, 5, 20);
    }
    if (settings.timePerQuestion) {
      this.timePerQuestion = this.sanitizeInt(settings.timePerQuestion, this.timePerQuestion, 5, 30);
    }
    if (settings.category) {
      this.category = settings.category;
    }

    const startResult = super.startGame();
    if (!startResult.success) {
      return startResult;
    }

    this.questionPool = this.buildQuestionPool();
    if (this.questionPool.length === 0) {
      this.status = 'finished';
      return { success: false, error: 'No trivia questions available for selected category' };
    }

    this.startRound();
    return { success: true };
  }

  buildQuestionPool() {
    const normalizedCategory = (this.category || 'general').toLowerCase();
    const available = questionBank.filter((q) => normalizedCategory === 'all' || q.category === normalizedCategory);
    const source = available.length > 0 ? available : questionBank;
    return [...source].sort(() => Math.random() - 0.5).slice(0, this.maxRounds);
  }

  getActivePlayerList() {
    return this.players.filter((p) => this.activePlayers.has(p.id));
  }

  startRound() {
    this.clearTimers();

    const activePlayers = this.getActivePlayerList();
    if (activePlayers.length <= 1 || this.currentRound > this.maxRounds || this.questionPool.length === 0) {
      this.endGame();
      return;
    }

    this.phase = 'answering';
    this.currentQuestion = this.questionPool.shift();
    this.roundAnswers.clear();
    this.lastRoundResults = [];
    this.questionStartTs = Date.now();

    this.emitTriviaEvent('trivia:question', {
      gameId: this.id,
      round: this.currentRound,
      maxRounds: this.maxRounds,
      phase: this.phase,
      question: {
        id: this.currentQuestion.id,
        category: this.currentQuestion.category,
        difficulty: this.currentQuestion.difficulty,
        question: this.currentQuestion.question,
        options: this.currentQuestion.options
      },
      timerSeconds: this.timePerQuestion,
      activePlayers: activePlayers.map((p) => ({ id: p.id, username: p.username })),
      playerCount: activePlayers.length
    });

    this.roundTimer = setTimeout(() => {
      this.lockAnswersAndReveal();
    }, this.timePerQuestion * 1000);
  }

  submitAnswer(userId, answer) {
    if (this.status !== 'playing') {
      return { success: false, error: 'Trivia is not active' };
    }

    if (this.phase !== 'answering') {
      return { success: false, error: 'Answer window is closed' };
    }

    if (!this.activePlayers.has(userId)) {
      return { success: false, error: 'You are eliminated from this game' };
    }

    if (this.roundAnswers.has(userId)) {
      return { success: false, error: 'Answer already submitted' };
    }

    if (!this.currentQuestion || !this.currentQuestion.options.includes(answer)) {
      return { success: false, error: 'Invalid answer option' };
    }

    const responseTimeMs = Math.max(0, Date.now() - this.questionStartTs);
    this.roundAnswers.set(userId, {
      answer,
      responseTimeMs,
      submittedAt: new Date().toISOString()
    });

    return { success: true };
  }

  lockAnswersAndReveal() {
    if (this.status !== 'playing') return;

    this.phase = 'revealing';
    this.roundTimer = null;

    this.emitTriviaEvent('trivia:answer-locked', {
      gameId: this.id,
      round: this.currentRound,
      phase: this.phase
    });

    const correctAnswer = this.currentQuestion.answer;
    const roundResults = [];

    this.getActivePlayerList().forEach((player) => {
      const submitted = this.roundAnswers.get(player.id);
      const isCorrect = !!submitted && submitted.answer === correctAnswer;

      if (!isCorrect) {
        this.activePlayers.delete(player.id);
        this.eliminatedPlayers.add(player.id);
        this.playerStreaks.set(player.id, 0);
      } else {
        const currentStreak = (this.playerStreaks.get(player.id) || 0) + 1;
        this.playerStreaks.set(player.id, currentStreak);

        const maxBonus = 120;
        const speedRatio = Math.max(0, 1 - ((submitted.responseTimeMs || 0) / (this.timePerQuestion * 1000)));
        const speedBonus = Math.round(speedRatio * maxBonus);
        const streakBonus = Math.min(80, (currentStreak - 1) * 20);
        const points = 100 + speedBonus + streakBonus;

        this.scores.set(player.id, (this.scores.get(player.id) || 0) + points);
      }

      roundResults.push({
        playerId: player.id,
        username: player.username,
        answer: submitted ? submitted.answer : null,
        isCorrect,
        eliminated: !isCorrect,
        responseTimeMs: submitted ? submitted.responseTimeMs : null,
        score: this.scores.get(player.id) || 0
      });
    });

    this.lastRoundResults = roundResults;

    this.emitTriviaEvent('trivia:reveal', {
      gameId: this.id,
      round: this.currentRound,
      phase: this.phase,
      correctAnswer,
      explanation: this.currentQuestion.explanation,
      results: roundResults,
      eliminated: roundResults.filter((r) => r.eliminated).map((r) => r.playerId)
    });

    this.revealTimer = setTimeout(() => {
      this.publishLeaderboard();
    }, 3500);
  }

  publishLeaderboard() {
    if (this.status !== 'playing') return;

    this.phase = 'leaderboard';
    this.revealTimer = null;

    const leaderboard = this.players
      .map((player) => ({
        playerId: player.id,
        username: player.username,
        score: this.scores.get(player.id) || 0,
        eliminated: this.eliminatedPlayers.has(player.id),
        streak: this.playerStreaks.get(player.id) || 0
      }))
      .sort((a, b) => b.score - a.score);

    this.emitTriviaEvent('trivia:leaderboard', {
      gameId: this.id,
      round: this.currentRound,
      phase: this.phase,
      leaderboard,
      activeCount: this.activePlayers.size
    });

    if (this.activePlayers.size <= 1 || this.currentRound >= this.maxRounds || this.questionPool.length === 0) {
      this.leaderboardTimer = setTimeout(() => this.endGame(), 2500);
      return;
    }

    this.currentRound += 1;
    this.leaderboardTimer = setTimeout(() => this.startRound(), 2500);
  }

  endGame() {
    this.clearTimers();
    this.status = 'finished';
    this.phase = 'game-over';

    const leaderboard = this.players
      .map((player) => ({
        playerId: player.id,
        username: player.username,
        score: this.scores.get(player.id) || 0,
        eliminated: this.eliminatedPlayers.has(player.id)
      }))
      .sort((a, b) => b.score - a.score);

    const topScore = leaderboard.length ? leaderboard[0].score : 0;
    this.winners = leaderboard.filter((entry) => entry.score === topScore).map((entry) => entry.playerId);

    this.emitTriviaEvent('trivia:game-over', {
      gameId: this.id,
      phase: this.phase,
      winners: leaderboard.filter((entry) => this.winners.includes(entry.playerId)),
      leaderboard
    });
  }

  clearTimers() {
    if (this.roundTimer) {
      clearTimeout(this.roundTimer);
      this.roundTimer = null;
    }
    if (this.revealTimer) {
      clearTimeout(this.revealTimer);
      this.revealTimer = null;
    }
    if (this.leaderboardTimer) {
      clearTimeout(this.leaderboardTimer);
      this.leaderboardTimer = null;
    }
  }

  removePlayer(userId) {
    super.removePlayer(userId);
    this.activePlayers.delete(userId);
    this.eliminatedPlayers.delete(userId);
    this.playerStreaks.delete(userId);

    if (this.status === 'playing' && this.activePlayers.size <= 1) {
      this.endGame();
    }
  }

  getGameState() {
    const baseState = super.getGameState();
    return {
      ...baseState,
      category: this.category,
      phase: this.phase,
      timePerQuestion: this.timePerQuestion,
      maxRounds: this.maxRounds,
      currentQuestion: this.phase === 'answering' && this.currentQuestion ? {
        id: this.currentQuestion.id,
        category: this.currentQuestion.category,
        difficulty: this.currentQuestion.difficulty,
        question: this.currentQuestion.question,
        options: this.currentQuestion.options
      } : null,
      activePlayers: Array.from(this.activePlayers),
      eliminatedPlayers: Array.from(this.eliminatedPlayers),
      lastRoundResults: this.lastRoundResults,
      winners: this.winners
    };
  }
}

module.exports = TriviaGame;
