/**
 * Game Manager - Central game management system
 * 
 * Copyright (c) 2024 Degens Against Decency
 * Licensed under the MIT License
 * See LICENSE file in the project root for full license information.
 */

const { v4: uuidv4 } = require('uuid');
const DegensAgainstDecencyGame = require('./games/DegensAgainstDecencyGame');
const TwoTruthsAndALieGame = require('./games/TwoTruthsAndALieGame');
const PokerGame = require('./games/PokerGame');
const TriviaGame = require('./games/TriviaGame');

class GameManager {
  constructor(io) {
    this.io = io;
    this.games = new Map();
    this.discordBot = null; // Will be set by server.js
    this.gameTypes = {
      'degens-against-decency': DegensAgainstDecencyGame,
      '2-truths-and-a-lie': TwoTruthsAndALieGame,
      'poker': PokerGame,
      'trivia': TriviaGame
    };
  }

  setDiscordBot(discordBot) {
    this.discordBot = discordBot;
  }

  setIntegrationManager(integrationManager) {
    this.integrationManager = integrationManager;
  }

  createGame(gameType, creator, isPrivate = false, maxPlayers = 7, options = {}) {
    if (!this.gameTypes[gameType]) {
      throw new Error('Invalid game type');
    }

    // Enforce player limits: 3-7 players
    maxPlayers = Math.max(3, Math.min(maxPlayers, 7));

    const gameId = uuidv4();
    let game;
    switch (gameType) {
      case 'degens-against-decency':
        game = new DegensAgainstDecencyGame(gameId, creator, isPrivate, maxPlayers, options);
        break;
      case '2-truths-and-a-lie':
        game = new TwoTruthsAndALieGame(gameId, creator, isPrivate, maxPlayers, options);
        break;
      case 'poker':
        game = new PokerGame(gameId, creator, isPrivate, maxPlayers, options);
        break;
      case 'trivia':
        game = new TriviaGame(gameId, creator, isPrivate, maxPlayers, options);
        break;
      default:
        throw new Error('Invalid game class configuration');
    }
    
    this.games.set(gameId, game);
    
    // Notify lobby of new public game
    if (!isPrivate) {
      this.io.to('lobby').emit('lobby-games', this.getPublicGames());
    }

    return {
      id: gameId,
      type: gameType,
      creator: creator.username,
      isPrivate,
      maxPlayers,
      currentPlayers: 1,
      status: 'waiting',
      inviteLink: isPrivate ? `${process.env.BASE_URL || 'http://localhost:3000'}/game/${gameId}?invite=true` : null
    };
  }

  getGame(gameId) {
    return this.games.get(gameId);
  }

  getPublicGames() {
    const publicGames = [];
    for (const [id, game] of this.games) {
      if (!game.isPrivate && game.status !== 'finished') {
        publicGames.push({
          id,
          type: game.type,
          creator: game.creator.username,
          currentPlayers: game.players.length,
          maxPlayers: game.maxPlayers,
          status: game.status,
          startTime: game.startTime,
          spectatorCount: game.spectators ? game.spectators.length : 0
        });
      }
    }
    return publicGames;
  }

  spectateGame(gameId, userId, socket) {
    const game = this.games.get(gameId);
    if (!game) {
      return { success: false, error: 'Game not found' };
    }

    // Only allow spectating games that are in progress
    if (game.status !== 'playing') {
      return { success: false, error: 'Can only spectate games in progress' };
    }

    const result = game.addSpectator(userId, socket);
    if (result.success) {
      // Update lobby with current games
      this.io.to('lobby').emit('lobby-games', this.getPublicGames());
      
      return { success: true, game: game.getGameState(), isSpectator: true };
    }

    return result;
  }

  leaveSpectator(gameId, userId) {
    const game = this.games.get(gameId);
    if (!game) return;

    game.removeSpectator(userId);
    
    // Update lobby
    this.io.to('lobby').emit('lobby-games', this.getPublicGames());
  }

  joinGame(gameId, userId, socket) {
    const game = this.games.get(gameId);
    if (!game) {
      return { success: false, error: 'Game not found' };
    }

    const result = game.addPlayer(userId, socket);
    if (result.success) {
      // Update lobby with current games
      this.io.to('lobby').emit('lobby-games', this.getPublicGames());
      
      // Notify integration manager
      if (this.integrationManager) {
        this.integrationManager.onPlayerJoinGame(
          { id: userId },
          { gameId, gameType: game.gameType }
        );
      }
      
      return { success: true, game: game.getGameState() };
    }

    return result;
  }

  leaveGame(gameId, userId) {
    const game = this.games.get(gameId);
    if (!game) return;

    game.removePlayer(userId);
    
    // Notify integration manager
    if (this.integrationManager) {
      this.integrationManager.onPlayerLeaveGame(userId);
    }
    
    // If game is empty, remove it
    if (game.players.length === 0) {
      this.games.delete(gameId);
    }

    // Update lobby
    this.io.to('lobby').emit('lobby-games', this.getPublicGames());
  }

  handleGameAction(gameId, userId, action) {
    const game = this.games.get(gameId);
    if (!game) {
      return { success: false, error: 'Game not found' };
    }

    const result = game.handleAction(userId, action);
    
    // Notify integration manager of game actions
    if (this.integrationManager && result.success) {
      this.integrationManager.onGameAction(userId, {
        type: action.type,
        gameType: game.gameType,
        ...action
      });
    }
    
    // Send Discord notifications for game events
    if (result.success && this.discordBot) {
      if (action.type === 'start-game') {
        this.discordBot.notifyGameStart(gameId, game);
      } else if (result.gameEnded) {
        // Find winner based on game type
        let winner = null;
        if (game.scores && game.scores.size > 0) {
          const maxScore = Math.max(...game.scores.values());
          for (const [playerId, score] of game.scores) {
            if (score === maxScore) {
              winner = game.players.find(p => p.id === playerId);
              break;
            }
          }
        }
        this.discordBot.notifyGameEnd(gameId, game, winner);
      }
    }
    
    if (result.success) {
      return { success: true, game: game.getGameState() };
    }

    return result;
  }
}

module.exports = GameManager;
