/**
 * Discord Bot - Discord integration for game management
 * 
 * Copyright (c) 2024 Degens Against Decency
 * Licensed under the MIT License
 * See LICENSE file in the project root for full license information.
 */

const {
  Client,
  GatewayIntentBits,
  Collection,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { serializeGameForSpectator, buildChannelGamesMap } = require('./spectator');
const { initOps, postError, postGuildInstall, postGameStarted } = require('./ops');

class DiscordBot {
  constructor(gameManager, io, options = {}) {
    this.gameManager = gameManager;
    this.io = io;
    this.broadcastToChannel = options.broadcastToChannel || null;
    this.client = null;
    this.commands = new Collection();
    this.discordGames = new Map(); // Store Discord-native games
    this.isReady = false;
    
    // Initialize bot if token is provided
    if (process.env.DISCORD_BOT_TOKEN) {
      this.initialize();
    } else {
      console.log('⚠️  Discord Bot token not configured - bot functionality disabled');
    }
  }

  initialize() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
      ]
    });

    this.setupCommands();
    this.setupEventHandlers();
    this.login();
  }

  setupCommands() {
    // Create Game Command
    const createGameCommand = new SlashCommandBuilder()
      .setName('create-game')
      .setDescription('Create a new Discord game')
      .addStringOption(option =>
        option.setName('type')
          .setDescription('Game type')
          .setRequired(true)
          .addChoices(
            { name: 'Degens Against Decency', value: 'degens-against-decency' },
            { name: '2 Truths and a Lie', value: '2-truths-and-a-lie' },
            { name: 'Poker', value: 'poker' }
          )
      )
      .addIntegerOption(option =>
        option.setName('max-players')
          .setDescription('Maximum number of players (3-7)')
          .setMinValue(3)
          .setMaxValue(7)
      )
      .addBooleanOption(option =>
        option.setName('private')
          .setDescription('Make game private (default: false)')
      );

    // List Games Command
    const listGamesCommand = new SlashCommandBuilder()
      .setName('list-games')
      .setDescription('List available public Discord games');

    // Join Game Command
    const joinGameCommand = new SlashCommandBuilder()
      .setName('join-game')
      .setDescription('Join a game by ID')
      .addStringOption(option =>
        option.setName('game-id')
          .setDescription('Game ID to join')
          .setRequired(true)
      );

    // Start Game Command
    const startGameCommand = new SlashCommandBuilder()
      .setName('start-game')
      .setDescription('Start a game')
      .addStringOption(option =>
        option.setName('game-id')
          .setDescription('Game ID to start')
          .setRequired(true)
      );

    // Game Status Command
    const gameStatusCommand = new SlashCommandBuilder()
      .setName('game-status')
      .setDescription('Check your current game status');

    this.commands.set('create-game', {
      data: createGameCommand,
      execute: this.handleCreateGame.bind(this)
    });

    this.commands.set('list-games', {
      data: listGamesCommand,
      execute: this.handleListGames.bind(this)
    });

    this.commands.set('join-game', {
      data: joinGameCommand,
      execute: this.handleJoinGame.bind(this)
    });

    this.commands.set('start-game', {
      data: startGameCommand,
      execute: this.handleStartGame.bind(this)
    });

    this.commands.set('game-status', {
      data: gameStatusCommand,
      execute: this.handleGameStatus.bind(this)
    });
  }

  setupEventHandlers() {
    this.client.once('ready', () => {
      console.log(`🎮 Discord Bot ready! Logged in as ${this.client.user.tag}`);
      this.isReady = true;
      initOps(this.client, { botId: 'degens-against-decency' });
      console.log('Slash commands are managed by: npm run deploy-commands');
    });

    this.client.on('guildCreate', (guild) => {
      postGuildInstall(guild);
    });

    this.client.on('interactionCreate', async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      const command = this.commands.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction);
      } catch (error) {
        console.error('Error executing command:', error);
        postError({
          context: `interaction:${interaction.commandName}`,
          message: error.message || String(error),
          stack: error.stack,
        });
        const reply = { content: 'There was an error executing this command!', ephemeral: true };
        
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(reply).catch(() => {});
        } else {
          await interaction.reply(reply).catch(() => {});
        }
      }
    });

    // Handle reactions for joining Discord games
    this.client.on('messageReactionAdd', async (reaction, user) => {
      if (user.bot) return;
      
      if (reaction.emoji.name === '🎮') {
        await this.handleGameJoinReaction(reaction, user);
      }
    });

    // Handle messages for Discord game interactions
    this.client.on('messageCreate', async (message) => {
      if (message.author.bot) return;
      await this.handleDiscordGameMessage(message);
    });

    this.client.on('error', (error) => {
      console.error('Discord bot error:', error);
      postError({
        context: 'discord_client',
        message: error.message || String(error),
        stack: error.stack,
      });
    });
  }

  async login() {
    try {
      await this.client.login(process.env.DISCORD_BOT_TOKEN);
    } catch (error) {
      console.error('Failed to login Discord bot:', error);
    }
  }

  activityUrl(channelId) {
    const base = (process.env.ACTIVITY_URL || 'https://symphonious-marzipan-cd1f3d.netlify.app').replace(/\/$/, '');
    return `${base}/?channelId=${channelId}`;
  }

  emitSpectator(channelId, type, game, extra = {}) {
    if (!this.broadcastToChannel || !channelId || !game) return;
    const feedLine = extra.feedLine || null;
    this.broadcastToChannel(channelId, {
      type,
      gameState: serializeGameForSpectator(game),
      ...(feedLine ? { feedLine, feedType: extra.feedType || 'passive' } : {}),
    });
  }

  getChannelGamesMap() {
    return buildChannelGamesMap(this.discordGames);
  }

  // Command Handlers
  async handleCreateGame(interaction) {
    const gameType = interaction.options.getString('type');
    const maxPlayers = interaction.options.getInteger('max-players') || 7;
    const isPrivate = interaction.options.getBoolean('private') || false;

    // Create Discord user object
    const discordUser = {
      id: interaction.user.id,
      username: interaction.user.username,
      discriminator: interaction.user.discriminator || '0000',
      avatar: interaction.user.avatar,
      isDiscordBot: true
    };

    try {
      // Create Discord-native game only
      return await this.createDiscordGame(interaction, gameType, discordUser, maxPlayers, isPrivate);
    } catch (error) {
      await interaction.reply({ 
        content: `❌ Failed to create game: ${error.message}`, 
        ephemeral: true 
      });
    }
  }

  async createDiscordGame(interaction, gameType, discordUser, maxPlayers, isPrivate) {
    // Create a Discord-native game session
    const gameId = require('uuid').v4().substring(0, 8); // Shorter ID for Discord
    
    // Store Discord game session
    if (!this.discordGames) {
      this.discordGames = new Map();
    }

    const discordGame = {
      id: gameId,
      type: gameType,
      creator: discordUser,
      players: [discordUser],
      maxPlayers,
      isPrivate,
      channelId: interaction.channelId,
      guildId: interaction.guildId,
      status: 'waiting',
      createdAt: new Date()
    };

    this.discordGames.set(gameId, discordGame);

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🎮 Game Created!')
      .setDescription(`${this.formatGameType(gameType)} game is ready to play!`)
      .addFields(
        { name: 'Game ID', value: gameId, inline: true },
        { name: 'Players', value: `1/${maxPlayers}`, inline: true },
        { name: 'Status', value: '⏳ Waiting for players', inline: true }
      )
      .setFooter({ text: 'Other players can join with /join-game' })
      .setTimestamp();

    const activityRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('🖥️ Open Retro View')
        .setStyle(ButtonStyle.Link)
        .setURL(this.activityUrl(interaction.channelId)),
    );

    await interaction.reply({ embeds: [embed], components: [activityRow] });

    // Send follow-up instructions
    const instructionsEmbed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('🎯 How to Join')
      .setDescription('Players can join this game using:')
      .addFields(
        { name: 'Command', value: `/join-game ${gameId}`, inline: false },
        { name: 'Or React', value: 'React with 🎮 to join!', inline: false }
      );

    const followUp = await interaction.followUp({ embeds: [instructionsEmbed] });
    
    // Add reaction for easy joining
    try {
      await followUp.react('🎮');
    } catch (error) {
      console.error('Failed to add reaction:', error);
    }

    // Store message ID for reaction handling
    discordGame.joinMessageId = followUp.id;
    this.emitSpectator(interaction.channelId, 'snapshot', discordGame);
  }

  async handleListGames(interaction) {
    const discordGames = this.discordGames ? Array.from(this.discordGames.values()).filter(g => !g.isPrivate && g.status !== 'finished') : [];
    
    if (discordGames.length === 0) {
      await interaction.reply({ 
        content: '📭 No public games available. Create one with `/create-game`!',
        ephemeral: true
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle('🎮 Available Public Games')
      .setTimestamp();

    // Add Discord games
    embed.addFields({
      name: '🎮 Games',
      value: discordGames.slice(0, 10).map(game => 
        `**${this.formatGameType(game.type)}**\nID: ${game.id}\nPlayers: ${game.players.length}/${game.maxPlayers}\nStatus: ${this.formatStatus(game.status)}\nCreator: ${game.creator.username}`
      ).join('\n\n'),
      inline: false
    });

    if (discordGames.length > 10) {
      embed.setFooter({ text: `Showing first 10 of ${discordGames.length} games` });
    }

    await interaction.reply({ embeds: [embed] });
  }

  async handleJoinGame(interaction) {
    const gameId = interaction.options.getString('game-id');
    
    if (!this.discordGames || !this.discordGames.has(gameId)) {
      await interaction.reply({ 
        content: '❌ Game not found! Use `/list-games` to see available games.',
        ephemeral: true 
      });
      return;
    }

    const game = this.discordGames.get(gameId);
    const userId = interaction.user.id;

    // Check if user is already in the game
    if (game.players.some(p => p.id === userId)) {
      await interaction.reply({ 
        content: '⚠️ You are already in this game!',
        ephemeral: true 
      });
      return;
    }

    // Check if game is full
    if (game.players.length >= game.maxPlayers) {
      await interaction.reply({ 
        content: '❌ This game is full!',
        ephemeral: true 
      });
      return;
    }

    // Check if game has started
    if (game.status !== 'waiting') {
      await interaction.reply({ 
        content: '❌ This game has already started!',
        ephemeral: true 
      });
      return;
    }

    // Add player to game
    const discordUser = {
      id: interaction.user.id,
      username: interaction.user.username,
      discriminator: interaction.user.discriminator || '0000',
      avatar: interaction.user.avatar,
      isDiscordBot: true
    };

    game.players.push(discordUser);

    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('✅ Joined Game!')
      .setDescription(`You've joined the ${this.formatGameType(game.type)} game!`)
      .addFields(
        { name: 'Game ID', value: gameId, inline: true },
        { name: 'Players', value: `${game.players.length}/${game.maxPlayers}`, inline: true },
        { name: 'Status', value: this.formatStatus(game.status), inline: true }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

    // Update the original game message if possible
    try {
      const channel = await this.client.channels.fetch(game.channelId);
      if (channel && game.joinMessageId) {
        const message = await channel.messages.fetch(game.joinMessageId);
        const updatedEmbed = new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('🎯 How to Join')
          .setDescription('Players can join this game using:')
          .addFields(
            { name: 'Command', value: `/join-game ${gameId}`, inline: false },
            { name: 'Current Players', value: `${game.players.length}/${game.maxPlayers}`, inline: false },
            { name: 'Players', value: game.players.map(p => `• ${p.username}`).join('\n'), inline: false }
          );

        await message.edit({ embeds: [updatedEmbed] });
      }
    } catch (error) {
      console.error('Failed to update join message:', error);
    }

    // Check if game is ready to start
    if (game.players.length >= 3) { // Minimum players
      const startEmbed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle('🚀 Ready to Start!')
        .setDescription(`The game has enough players to begin! Creator <@${game.creator.id}> can start the game.`)
        .addFields(
          { name: 'Start Command', value: `/start-game ${gameId}`, inline: false }
        );

      const channel = await this.client.channels.fetch(game.channelId);
      await channel.send({ embeds: [startEmbed] });
    }

    this.emitSpectator(game.channelId, 'lobby_update', game);
  }

  async handleStartGame(interaction) {
    const gameId = interaction.options.getString('game-id');
    
    if (!this.discordGames || !this.discordGames.has(gameId)) {
      await interaction.reply({ 
        content: '❌ Game not found!',
        ephemeral: true 
      });
      return;
    }

    const game = this.discordGames.get(gameId);

    // Check if user is the creator
    if (game.creator.id !== interaction.user.id) {
      await interaction.reply({ 
        content: '❌ Only the game creator can start the game!',
        ephemeral: true 
      });
      return;
    }

    // Check if enough players
    if (game.players.length < 3) {
      await interaction.reply({ 
        content: '❌ Need at least 3 players to start the game!',
        ephemeral: true 
      });
      return;
    }

    // Check if game already started
    if (game.status !== 'waiting') {
      await interaction.reply({ 
        content: '⚠️ Game has already started!',
        ephemeral: true 
      });
      return;
    }

    // Start the game
    game.status = 'playing';
    game.currentRound = 1;

    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('🚀 Game Started!')
      .setDescription(`${this.formatGameType(game.type)} is now beginning!`)
      .addFields(
        { name: 'Players', value: game.players.map(p => `• ${p.username}`).join('\n'), inline: false },
        { name: 'Game Mode', value: 'Discord Server', inline: true },
        { name: 'Round', value: '1', inline: true }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
    this.emitSpectator(game.channelId, 'game_start', game);
    postGameStarted({
      guildId: interaction.guildId,
      channelId: game.channelId,
      gameType: game.type,
      players: game.players.length,
    });

    // Start game-specific logic
    switch (game.type) {
      case '2-truths-and-a-lie':
        await this.start2TruthsDiscordGame(game);
        break;
      case 'degens-against-decency':
        await this.startDegensDiscordGame(game);
        break;
      case 'poker':
        await this.startPokerDiscordGame(game);
        break;
    }
  }

  async start2TruthsDiscordGame(game) {
    const channel = await this.client.channels.fetch(game.channelId);
    
    // Initialize game state
    game.currentPlayerIndex = 0;
    game.scores = new Map(game.players.map(p => [p.id, 0]));
    game.maxRounds = game.players.length * 2; // 2 rounds per player
    game.currentRound = 1;

    const currentPlayer = game.players[game.currentPlayerIndex];
    
    const gameEmbed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🎭 2 Truths and a Lie - Round 1')
      .setDescription(`**${currentPlayer.username}**'s turn!`)
      .addFields(
        { 
          name: '📝 Your Task', 
          value: 'Please provide 3 statements about yourself:\n• 2 should be TRUE\n• 1 should be a LIE\n\nType them in chat, numbered 1, 2, 3', 
          inline: false 
        },
        { name: '⏰ Time Limit', value: '2 minutes', inline: true },
        { name: '👥 Other Players', value: 'Get ready to guess which one is the lie!', inline: true }
      )
      .setFooter({ text: `Round ${game.currentRound} of ${game.maxRounds}` });

    await channel.send({ embeds: [gameEmbed] });
    await channel.send(`<@${currentPlayer.id}>, it's your turn! Please share your 3 statements.`);

    // Store game state for message handling
    game.waitingFor = 'statements';
    game.statementTimeout = setTimeout(() => {
      this.handleDiscordGameTimeout(game);
    }, 120000); // 2 minute timeout
  }

  async startDegensDiscordGame(game) {
    const channel = await this.client.channels.fetch(game.channelId);
    
    // Initialize game state
    const AICardGenerator = require('./AICardGenerator');
    const aiCardGenerator = new AICardGenerator();
    
    try {
      // Generate cards
      const cards = await aiCardGenerator.generateDegensCards(50);
      game.questionCards = cards.filter(card => card.type === 'question');
      game.answerCards = cards.filter(card => card.type === 'answer');
      
      // Use fallback cards if not enough
      if (game.questionCards.length < 10) {
        const fallbackCards = aiCardGenerator.getFallbackDegensCards();
        game.questionCards.push(...fallbackCards.filter(card => card.type === 'question'));
        game.answerCards.push(...fallbackCards.filter(card => card.type === 'answer'));
      }
    } catch (error) {
      console.error('Error generating cards:', error);
      const fallbackCards = aiCardGenerator.getFallbackDegensCards();
      game.questionCards = fallbackCards.filter(card => card.type === 'question');
      game.answerCards = fallbackCards.filter(card => card.type === 'answer');
    }
    
    // Shuffle cards
    game.answerCards = game.answerCards.sort(() => Math.random() - 0.5);
    game.questionCards = game.questionCards.sort(() => Math.random() - 0.5);
    
    // Deal hands via DM (7 cards per player)
    game.playerHands = new Map();
    game.submissions = new Map();
    game.scores = new Map(game.players.map((p) => [p.id, 0]));
    game.cardsPerHand = 7;
    game.maxRounds = 10;
    game.currentRound = 1;
    
    for (const player of game.players) {
      const hand = [];
      for (let i = 0; i < game.cardsPerHand; i++) {
        if (game.answerCards.length > 0) {
          hand.push(game.answerCards.pop());
        }
      }
      game.playerHands.set(player.id, hand);
      
      // Send hand to player via DM
      try {
        const user = await this.client.users.fetch(player.id);
        const handEmbed = new EmbedBuilder()
          .setColor(0xFF6B6B)
          .setTitle('🎴 Your Hand')
          .setDescription('Here are your answer cards. Keep them secret!')
          .addFields(
            hand.map((card, idx) => ({
              name: `Card ${idx + 1}`,
              value: card.text || `Card ID: ${card.id}`,
              inline: false
            }))
          );
        
        await user.send({ embeds: [handEmbed] });
      } catch (error) {
        console.error(`Failed to send hand to player ${player.id}:`, error);
      }
    }
    
    // Select Card Czar (first player)
    game.cardCzarIndex = 0;
    game.cardCzar = game.players[game.cardCzarIndex];
    
    // Draw first question
    game.currentQuestion = game.questionCards.pop();
    
    // Announce game start in channel
    const gameEmbed = new EmbedBuilder()
      .setColor(0xFF6B6B)
      .setTitle('🔥 Degens Against Decency - Round 1')
      .setDescription(`**Card Czar:** ${game.cardCzar.username}`)
      .addFields(
        { name: '❓ Question', value: game.currentQuestion.text || 'Loading...', inline: false },
        { name: '📋 Instructions', value: 'Players: Check your DMs for your hand. Reply to this message with the number of the card you want to play (1-7).\n\nCard Czar: Wait for submissions, then pick the best answer!', inline: false },
        { name: '⏰ Time Limit', value: '2 minutes to submit', inline: true },
        { name: '🎯 Round', value: `${game.currentRound} of ${game.maxRounds}`, inline: true }
      );
    
    await channel.send({ embeds: [gameEmbed] });
    
    // Store game state
    game.waitingFor = 'submissions';
    game.submissionTimeout = setTimeout(() => {
      this.handleDegensTimeout(game);
    }, 120000); // 2 minute timeout
    this.emitSpectator(game.channelId, 'round_update', game);
  }

  async startPokerDiscordGame(game) {
    const channel = await this.client.channels.fetch(game.channelId);
    
    // Initialize poker game
    game.deck = this.createPokerDeck();
    game.deck = game.deck.sort(() => Math.random() - 0.5); // Shuffle
    game.playerHands = new Map();
    game.playerBets = new Map();
    game.currentBet = 0;
    game.pot = 0;
    game.dealerIndex = 0;
    game.bettingRound = 1;
    game.maxBettingRounds = 4;
    game.smallBlind = 5;
    game.bigBlind = 10;
    game.foldedPlayers = new Set();
    
    // Post blinds
    if (game.players.length >= 2) {
      const smallBlindIndex = (game.dealerIndex + 1) % game.players.length;
      const bigBlindIndex = (game.dealerIndex + 2) % game.players.length;
      
      game.playerBets.set(game.players[smallBlindIndex].id, game.smallBlind);
      game.playerBets.set(game.players[bigBlindIndex].id, game.bigBlind);
      game.currentBet = game.bigBlind;
      game.pot = game.smallBlind + game.bigBlind;
    }
    
    // Deal initial 2 cards to each player via DM
    for (const player of game.players) {
      const hand = [];
      for (let i = 0; i < 2; i++) {
        if (game.deck.length > 0) {
          hand.push(game.deck.pop());
        }
      }
      game.playerHands.set(player.id, hand);
      
      // Send hand to player via DM
      try {
        const user = await this.client.users.fetch(player.id);
        const handEmbed = new EmbedBuilder()
          .setColor(0xFFD700)
          .setTitle('🃏 Your Poker Hand')
          .setDescription('Keep these cards secret!')
          .addFields(
            hand.map(card => ({
              name: `${this.getCardEmoji(card.suit)} ${card.rank}`,
              value: `${card.suit} ${card.rank}`,
              inline: true
            }))
          );
        
        await user.send({ embeds: [handEmbed] });
      } catch (error) {
        console.error(`Failed to send hand to player ${player.id}:`, error);
      }
    }
    
    // Set current player (after big blind)
    const startIndex = (game.dealerIndex + 3) % game.players.length;
    game.currentPlayerIndex = startIndex;
    game.currentPlayer = game.players[startIndex];
    
    // Announce game start in channel
    const gameEmbed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle('♠️ Poker - 5-Card Stud')
      .setDescription('Game has started! Check your DMs for your cards.')
      .addFields(
        { name: '💰 Pot', value: `${game.pot} chips`, inline: true },
        { name: '📊 Current Bet', value: `${game.currentBet} chips`, inline: true },
        { name: '🎲 Betting Round', value: `${game.bettingRound} of ${game.maxBettingRounds}`, inline: true },
        { name: '👤 Current Player', value: `<@${game.currentPlayer.id}>'s turn`, inline: false },
        { name: '🎯 Actions', value: 'Reply with: `fold`, `call`, `check`, or `raise <amount>`', inline: false }
      );
    
    await channel.send({ embeds: [gameEmbed] });
    await channel.send(`<@${game.currentPlayer.id}>, it's your turn!`);
    
    game.waitingFor = 'poker-action';
  }

  createPokerDeck() {
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const deck = [];
    
    for (const suit of suits) {
      for (const rank of ranks) {
        deck.push({ 
          suit, 
          rank, 
          value: this.getPokerCardValue(rank),
          id: `${rank}-${suit}`
        });
      }
    }
    
    return deck;
  }

  getPokerCardValue(rank) {
    // Use same mapping as PokerGame for consistency
    const values = {
      '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
      '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
    };
    return values[rank] || 0;
  }

  getCardEmoji(suit) {
    const emojis = { 'hearts': '♥️', 'diamonds': '♦️', 'clubs': '♣️', 'spades': '♠️' };
    return emojis[suit] || '🃏';
  }

  async handleDiscordGameTimeout(game) {
    const channel = await this.client.channels.fetch(game.channelId);
    
    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('⏰ Game Timeout')
      .setDescription('The current player took too long to respond. Moving to next player...');

    await channel.send({ embeds: [embed] });
    
    // Move to next player or end game
    this.nextDiscordGameTurn(game);
  }

  async nextDiscordGameTurn(game) {
    game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
    game.currentRound++;

    if (game.currentRound > game.maxRounds) {
      return this.endDiscordGame(game);
    }

    // Continue game based on type
    if (game.type === '2-truths-and-a-lie') {
      await this.start2TruthsDiscordGame(game);
    }
  }

  async endDiscordGame(game) {
    const channel = await this.client.channels.fetch(game.channelId);
    
    // Calculate final scores
    const sortedScores = Array.from(game.scores.entries())
      .sort(([,a], [,b]) => b - a);

    const winner = game.players.find(p => p.id === sortedScores[0][0]);
    
    const embed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle('🏆 Game Complete!')
      .setDescription(`Congratulations ${winner.username}!`)
      .addFields(
        { 
          name: '📊 Final Scores', 
          value: sortedScores.map(([playerId, score], index) => {
            const player = game.players.find(p => p.id === playerId);
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '👤';
            return `${medal} ${player.username}: ${score} points`;
          }).join('\n'),
          inline: false 
        }
      )
      .setTimestamp();

    await channel.send({ embeds: [embed] });
    
    // Clean up
    game.status = 'finished';
    setTimeout(() => {
      this.discordGames.delete(game.id);
    }, 300000); // Clean up after 5 minutes
  }

  async handleDiscordGameMessage(message) {
    if (!this.discordGames) return;

    // Find active games in this channel
    const channelGames = Array.from(this.discordGames.values())
      .filter(game => game.channelId === message.channelId && game.status === 'playing');

    if (channelGames.length === 0) return;

    const game = channelGames[0]; // Handle first active game in channel
    const userId = message.author.id;

    // Handle game-specific interactions
    if (game.type === '2-truths-and-a-lie') {
      await this.handle2TruthsMessage(game, message, userId);
    } else if (game.type === 'degens-against-decency') {
      await this.handleDegensMessage(game, message, userId);
    } else if (game.type === 'poker') {
      await this.handlePokerMessage(game, message, userId);
    }
  }

  async handle2TruthsMessage(game, message, userId) {
    const currentPlayer = game.players[game.currentPlayerIndex];

    if (game.waitingFor === 'statements' && userId === currentPlayer.id) {
      // Parse statements from message
      const content = message.content.trim();
      const lines = content.split('\n').filter(line => line.trim());
      
      // Look for numbered statements
      const statements = [];
      for (let i = 1; i <= 3; i++) {
        const statement = lines.find(line => line.trim().startsWith(`${i}.`) || line.trim().startsWith(`${i}:`));
        if (statement) {
          statements.push(statement.replace(/^\d+[.:]?\s*/, '').trim());
        }
      }

      if (statements.length !== 3) {
        const helpEmbed = new EmbedBuilder()
          .setColor(0xFFAA00)
          .setTitle('❓ Invalid Format')
          .setDescription('Please provide exactly 3 numbered statements:\n\n1. First statement\n2. Second statement\n3. Third statement');
        
        await message.reply({ embeds: [helpEmbed] });
        return;
      }

      // Clear timeout
      if (game.statementTimeout) {
        clearTimeout(game.statementTimeout);
        delete game.statementTimeout;
      }

      // Store statements and start voting
      game.currentStatements = statements;
      game.waitingFor = 'votes';
      game.votes = new Map();

      const voteEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🗳️ Time to Vote!')
        .setDescription(`**${currentPlayer.username}** has shared their statements:`)
        .addFields(
          { name: '1️⃣ Statement 1', value: statements[0], inline: false },
          { name: '2️⃣ Statement 2', value: statements[1], inline: false },
          { name: '3️⃣ Statement 3', value: statements[2], inline: false },
          { name: '🎯 Vote Instructions', value: 'React with 1️⃣, 2️⃣, or 3️⃣ to vote for which statement is the LIE!', inline: false }
        )
        .setFooter({ text: 'All other players must vote! 60 seconds remaining.' });

      const votingMessage = await message.channel.send({ embeds: [voteEmbed] });
      
      // Add voting reactions
      await votingMessage.react('1️⃣');
      await votingMessage.react('2️⃣');
      await votingMessage.react('3️⃣');

      game.votingMessageId = votingMessage.id;

      // Set voting timeout
      game.voteTimeout = setTimeout(() => {
        this.handleVotingTimeout(game);
      }, 60000); // 1 minute for voting

    } else if (game.waitingFor === 'reveal' && userId === currentPlayer.id) {
      // Handle reveal
      const content = message.content.trim();
      const lieNumber = parseInt(content);

      if (lieNumber >= 1 && lieNumber <= 3) {
        // Clear timeout
        if (game.revealTimeout) {
          clearTimeout(game.revealTimeout);
          delete game.revealTimeout;
        }

        // Calculate scores
        let correctGuesses = 0;
        const voteResults = [];

        for (const [voterId, vote] of game.votes) {
          const voter = game.players.find(p => p.id === voterId);
          const isCorrect = vote === lieNumber;
          if (isCorrect) {
            correctGuesses++;
            const currentScore = game.scores.get(voterId) || 0;
            game.scores.set(voterId, currentScore + 1);
          }
          voteResults.push(`${voter.username}: ${vote === lieNumber ? '✅' : '❌'} (voted ${vote})`);
        }

        // Award points to current player if they fooled people
        const fooledCount = game.votes.size - correctGuesses;
        if (fooledCount > 0) {
          const currentScore = game.scores.get(currentPlayer.id) || 0;
          game.scores.set(currentPlayer.id, currentScore + fooledCount);
        }

        const resultsEmbed = new EmbedBuilder()
          .setColor(0x00FF00)
          .setTitle('🎉 Results!')
          .setDescription(`The lie was: **"${game.currentStatements[lieNumber - 1]}"**`)
          .addFields(
            { name: '📊 Voting Results', value: voteResults.join('\n') || 'No votes cast', inline: false },
            { name: '🏆 Points Awarded', value: `${currentPlayer.username}: +${fooledCount} (fooled ${fooledCount} players)\nCorrect guessers: +1 each`, inline: false }
          );

        await message.channel.send({ embeds: [resultsEmbed] });

        // Move to next turn
        setTimeout(() => {
          this.nextDiscordGameTurn(game);
        }, 3000);
      } else {
        const helpEmbed = new EmbedBuilder()
          .setColor(0xFFAA00)
          .setTitle('❓ Invalid Response')
          .setDescription('Please reply with "1", "2", or "3" to indicate which statement was the lie.');
        
        await message.reply({ embeds: [helpEmbed] });
      }
    }
  }

  async handleDegensMessage(game, message, userId) {
    const content = message.content.trim().toLowerCase();
    
    if (game.waitingFor === 'submissions') {
      // Check if player is card czar
      if (userId === game.cardCzar.id) {
        await message.reply('You are the Card Czar! Wait for others to submit their cards.');
        return;
      }
      
      // Check if already submitted
      if (game.submissions.has(userId)) {
        await message.reply('You have already submitted a card this round!');
        return;
      }
      
      // Parse card number (1-7)
      const cardNum = parseInt(content);
      if (isNaN(cardNum) || cardNum < 1 || cardNum > game.cardsPerHand) {
        await message.reply(`Please reply with a number between 1 and ${game.cardsPerHand} to select your card.`);
        return;
      }
      
      // Get player's hand
      const playerHand = game.playerHands.get(userId);
      if (!playerHand || cardNum > playerHand.length) {
        await message.reply('Invalid card selection!');
        return;
      }
      
      // Submit the card
      const cardIndex = cardNum - 1;
      const submittedCard = playerHand.splice(cardIndex, 1)[0];
      game.submissions.set(userId, submittedCard);
      
      await message.react('✅');
      
      // Draw a new card
      if (game.answerCards.length > 0) {
        const newCard = game.answerCards.pop();
        playerHand.push(newCard);
        
        // Update player's hand via DM
        try {
          const user = await this.client.users.fetch(userId);
          await user.send(`**New card:** ${newCard.text || `Card ID: ${newCard.id}`}`);
        } catch (error) {
          console.error('Failed to send new card:', error);
        }
      }
      
      // Check if all players submitted
      const nonCzarPlayers = game.players.filter(p => p.id !== game.cardCzar.id);
      if (game.submissions.size === nonCzarPlayers.length) {
        clearTimeout(game.submissionTimeout);
        await this.showDegensSubmissions(game);
      }
    } else if (game.waitingFor === 'judging') {
      // Only card czar can judge
      if (userId !== game.cardCzar.id) {
        return;
      }
      
      const choice = parseInt(content);
      if (isNaN(choice) || choice < 1 || choice > game.submissions.size) {
        await message.reply(`Please choose a number between 1 and ${game.submissions.size}`);
        return;
      }
      
      // Get the winner
      const submissions = Array.from(game.submissions.entries());
      const [winnerId, winningCard] = submissions[choice - 1];
      
      // Award point
      if (!game.scores) {
        game.scores = new Map();
        game.players.forEach(p => game.scores.set(p.id, 0));
      }
      const currentScore = game.scores.get(winnerId) || 0;
      game.scores.set(winnerId, currentScore + 1);
      
      const winner = game.players.find(p => p.id === winnerId);
      
      const resultsEmbed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('🏆 Round Winner!')
        .setDescription(`**${winner.username}** wins this round!`)
        .addFields(
          { name: 'Winning Card', value: winningCard.text || 'Card', inline: false }
        );
      
      await message.channel.send({ embeds: [resultsEmbed] });
      
      this.emitSpectator(game.channelId, 'round_update', game, {
        feedLine: `🏆 ${winner.username} wins the round!`,
        feedType: 'success',
      });

      // Move to next round
      await this.nextDegensRound(game);
    }
  }

  async showDegensSubmissions(game) {
    const channel = await this.client.channels.fetch(game.channelId);
    
    // Shuffle submissions for anonymity
    const submissions = Array.from(game.submissions.entries());
    const shuffled = submissions.sort(() => Math.random() - 0.5);
    
    const submissionsEmbed = new EmbedBuilder()
      .setColor(0xFF6B6B)
      .setTitle('📬 All Submissions In!')
      .setDescription(`**Question:** ${game.currentQuestion.text}\n\n**Card Czar ${game.cardCzar.username}**, pick the best answer by replying with the number!`)
      .addFields(
        shuffled.map((entry, idx) => ({
          name: `${idx + 1}. `,
          value: entry[1].text || `Card ${entry[1].id}`,
          inline: false
        }))
      );
    
    await channel.send({ embeds: [submissionsEmbed] });
    game.waitingFor = 'judging';
    this.emitSpectator(game.channelId, 'round_update', game);
  }

  async handleDegensTimeout(game) {
    const channel = await this.client.channels.fetch(game.channelId);
    
    if (game.submissions.size === 0) {
      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('⏰ Round Timeout')
        .setDescription('No submissions received. Moving to next round...');
      
      await channel.send({ embeds: [embed] });
      await this.nextDegensRound(game);
    } else {
      // Show submissions even if not everyone submitted
      await this.showDegensSubmissions(game);
    }
  }

  async nextDegensRound(game) {
    game.currentRound++;
    
    if (game.currentRound > game.maxRounds) {
      return this.endDegensGame(game);
    }
    
    // Select next card czar
    game.cardCzarIndex = (game.cardCzarIndex + 1) % game.players.length;
    game.cardCzar = game.players[game.cardCzarIndex];
    
    // Draw new question
    if (game.questionCards.length > 0) {
      game.currentQuestion = game.questionCards.pop();
    }
    
    // Clear submissions
    game.submissions.clear();
    
    // Announce new round
    const channel = await this.client.channels.fetch(game.channelId);
    const roundEmbed = new EmbedBuilder()
      .setColor(0xFF6B6B)
      .setTitle(`🔥 Round ${game.currentRound}`)
      .setDescription(`**Card Czar:** ${game.cardCzar.username}`)
      .addFields(
        { name: '❓ Question', value: game.currentQuestion.text || 'Loading...', inline: false },
        { name: '📋 Instructions', value: 'Reply with your card number (1-7)', inline: false }
      );
    
    await channel.send({ embeds: [roundEmbed] });
    
    game.waitingFor = 'submissions';
    game.submissionTimeout = setTimeout(() => {
      this.handleDegensTimeout(game);
    }, 120000);
    this.emitSpectator(game.channelId, 'round_update', game);
  }

  async endDegensGame(game) {
    const channel = await this.client.channels.fetch(game.channelId);

    if (!game.scores) {
      game.scores = new Map(game.players.map((p) => [p.id, 0]));
    }

    // Calculate final scores
    const sortedScores = Array.from(game.scores.entries())
      .sort(([, a], [, b]) => b - a);

    const winner = game.players.find((p) => p.id === sortedScores[0]?.[0]);
    
    const embed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle('🏆 Game Complete!')
      .setDescription(winner ? `Congratulations ${winner.username}!` : 'Game over!')
      .addFields({
        name: '📊 Final Scores',
        value: sortedScores.map(([playerId, score], index) => {
          const player = game.players.find(p => p.id === playerId);
          const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '👤';
          return `${medal} ${player?.username || 'Unknown'}: ${score} points`;
        }).join('\n'),
        inline: false
      });
    
    await channel.send({ embeds: [embed] });
    
    game.status = 'finished';
    this.emitSpectator(game.channelId, 'game_end', game);
    setTimeout(() => {
      this.discordGames.delete(game.id);
    }, 300000);
  }

  async handlePokerMessage(game, message, userId) {
    const content = message.content.trim().toLowerCase();
    
    if (game.waitingFor !== 'poker-action') return;
    
    // Check if it's current player's turn
    if (userId !== game.currentPlayer.id) {
      return;
    }
    
    const channel = await this.client.channels.fetch(game.channelId);
    
    // Parse action
    if (content === 'fold') {
      game.foldedPlayers.add(userId);
      await message.react('🚫');
      
      // Check if only one player remains
      const activePlayers = game.players.filter(p => !game.foldedPlayers.has(p.id));
      if (activePlayers.length === 1) {
        return this.endPokerHand(game, activePlayers[0].id);
      }
      
      this.nextPokerPlayer(game);
    } else if (content === 'call') {
      const currentPlayerBet = game.playerBets.get(userId) || 0;
      const callAmount = game.currentBet - currentPlayerBet;
      
      game.playerBets.set(userId, game.currentBet);
      game.pot += callAmount;
      
      await message.react('💰');
      await channel.send(`${game.currentPlayer.username} calls ${callAmount} chips. Pot: ${game.pot}`);
      
      this.nextPokerPlayer(game);
    } else if (content === 'check') {
      const currentPlayerBet = game.playerBets.get(userId) || 0;
      if (currentPlayerBet < game.currentBet) {
        await message.reply('Cannot check! You must call or fold.');
        return;
      }
      
      await message.react('✅');
      this.nextPokerPlayer(game);
    } else if (content.startsWith('raise ')) {
      const raiseAmount = parseInt(content.split(' ')[1]);
      if (isNaN(raiseAmount) || raiseAmount <= 0) {
        await message.reply('Invalid raise amount! Use: `raise <amount>`');
        return;
      }
      
      const currentPlayerBet = game.playerBets.get(userId) || 0;
      const totalAmount = game.currentBet + raiseAmount;
      const actualRaise = totalAmount - currentPlayerBet;
      
      game.playerBets.set(userId, totalAmount);
      game.pot += actualRaise;
      game.currentBet = totalAmount;
      
      await message.react('📈');
      await channel.send(`${game.currentPlayer.username} raises to ${totalAmount} chips! Pot: ${game.pot}`);
      
      this.nextPokerPlayer(game);
    } else {
      await message.reply('Valid actions: `fold`, `call`, `check`, or `raise <amount>`');
    }
  }

  nextPokerPlayer(game) {
    // Find next active player
    let nextIndex = (game.currentPlayerIndex + 1) % game.players.length;
    
    while (game.foldedPlayers.has(game.players[nextIndex].id)) {
      nextIndex = (nextIndex + 1) % game.players.length;
    }
    
    game.currentPlayerIndex = nextIndex;
    game.currentPlayer = game.players[nextIndex];
    
    // Check if betting round is complete
    if (this.isPokerBettingRoundComplete(game)) {
      this.nextPokerBettingRound(game);
    } else {
      this.announcePokerTurn(game);
    }
  }

  isPokerBettingRoundComplete(game) {
    const activePlayers = game.players.filter(p => !game.foldedPlayers.has(p.id));
    return activePlayers.every(player => {
      const playerBet = game.playerBets.get(player.id) || 0;
      return playerBet === game.currentBet;
    });
  }

  async nextPokerBettingRound(game) {
    game.bettingRound++;
    
    if (game.bettingRound > game.maxBettingRounds) {
      return this.pokerShowdown(game);
    }
    
    // Deal additional cards
    if (game.bettingRound <= 4) {
      for (const player of game.players) {
        if (!game.foldedPlayers.has(player.id) && game.deck.length > 0) {
          const hand = game.playerHands.get(player.id);
          const newCard = game.deck.pop();
          hand.push(newCard);
          
          // Send card to player via DM
          try {
            const user = await this.client.users.fetch(player.id);
            await user.send(`**New card:** ${this.getCardEmoji(newCard.suit)} ${newCard.rank}`);
          } catch (error) {
            console.error('Failed to send card:', error);
          }
        }
      }
    }
    
    // Reset for next betting round
    game.currentBet = 0;
    game.playerBets.clear();
    
    // Set current player to first after dealer
    let index = (game.dealerIndex + 1) % game.players.length;
    while (game.foldedPlayers.has(game.players[index].id)) {
      index = (index + 1) % game.players.length;
    }
    game.currentPlayerIndex = index;
    game.currentPlayer = game.players[index];
    
    const channel = await this.client.channels.fetch(game.channelId);
    const roundEmbed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle(`♠️ Betting Round ${game.bettingRound}`)
      .setDescription('New cards dealt! Check your DMs.')
      .addFields(
        { name: '💰 Pot', value: `${game.pot} chips`, inline: true }
      );
    
    await channel.send({ embeds: [roundEmbed] });
    this.announcePokerTurn(game);
  }

  async announcePokerTurn(game) {
    const channel = await this.client.channels.fetch(game.channelId);
    await channel.send(`<@${game.currentPlayer.id}>, it's your turn! (fold/call/check/raise <amount>)`);
  }

  async pokerShowdown(game) {
    const channel = await this.client.channels.fetch(game.channelId);
    const activePlayers = game.players.filter(p => !game.foldedPlayers.has(p.id));
    
    // Evaluate hands
    const handRankings = activePlayers.map(player => {
      const hand = game.playerHands.get(player.id);
      return {
        playerId: player.id,
        player: player,
        hand: hand,
        ranking: this.evaluatePokerHand(hand)
      };
    });
    
    // Sort by ranking
    handRankings.sort((a, b) => b.ranking.value - a.ranking.value);
    const winner = handRankings[0];
    
    // Show all hands
    const handsEmbed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle('🃏 Showdown!')
      .setDescription('All hands revealed!')
      .addFields(
        handRankings.map(ranking => ({
          name: `${ranking.player.username}`,
          value: `${ranking.hand.map(c => `${this.getCardEmoji(c.suit)}${c.rank}`).join(' ')}\n**${ranking.ranking.description}**`,
          inline: false
        }))
      );
    
    await channel.send({ embeds: [handsEmbed] });
    
    await this.endPokerHand(game, winner.playerId, handRankings);
  }

  evaluatePokerHand(cards) {
    // Use static method from PokerGame to avoid unnecessary instantiation
    const PokerGame = require('./games/PokerGame');
    return PokerGame.evaluateHandStatic(cards);
  }

  async endPokerHand(game, winnerId, handRankings = null) {
    const channel = await this.client.channels.fetch(game.channelId);
    const winner = game.players.find(p => p.id === winnerId);
    
    if (!game.scores) {
      game.scores = new Map();
      game.players.forEach(p => game.scores.set(p.id, 0));
    }
    
    const currentScore = game.scores.get(winnerId) || 0;
    game.scores.set(winnerId, currentScore + game.pot);
    
    const winEmbed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('🏆 Hand Winner!')
      .setDescription(`**${winner.username}** wins the pot!`)
      .addFields(
        { name: '💰 Pot Won', value: `${game.pot} chips`, inline: true }
      );
    
    await channel.send({ embeds: [winEmbed] });
    
    game.status = 'finished';
    setTimeout(() => {
      this.discordGames.delete(game.id);
    }, 300000);
  }

  async handleVotingTimeout(game) {
    const channel = await this.client.channels.fetch(game.channelId);
    
    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('⏰ Voting Timeout')
      .setDescription('Voting time has ended! Proceeding with current votes...');

    await channel.send({ embeds: [embed] });
    await this.processVotingResults(game);
  }

  async processVotingResults(game) {
    const channel = await this.client.channels.fetch(game.channelId);
    
    // Get voting message and process reactions
    if (game.votingMessageId) {
      try {
        const votingMessage = await channel.messages.fetch(game.votingMessageId);
        const reactions = ['1️⃣', '2️⃣', '3️⃣'];
        
        for (let i = 0; i < reactions.length; i++) {
          const reaction = votingMessage.reactions.cache.get(reactions[i]);
          if (reaction) {
            const users = await reaction.users.fetch();
            users.forEach(user => {
              if (!user.bot && user.id !== game.players[game.currentPlayerIndex].id) {
                game.votes.set(user.id, i + 1);
              }
            });
          }
        }
      } catch (error) {
        console.error('Error processing votes:', error);
      }
    }

    // For demo purposes, ask current player to reveal which was the lie
    const currentPlayer = game.players[game.currentPlayerIndex];
    
    const revealEmbed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle('🎭 Time to Reveal!')
      .setDescription(`<@${currentPlayer.id}>, which statement was the **LIE**?`)
      .addFields(
        { name: 'Reply with:', value: 'Type "1", "2", or "3" to reveal which statement was false!', inline: false },
        { name: 'Votes received:', value: `${game.votes.size} players voted`, inline: true }
      );

    await channel.send({ embeds: [revealEmbed] });
    
    game.waitingFor = 'reveal';
    game.revealTimeout = setTimeout(() => {
      this.handleRevealTimeout(game);
    }, 60000);
  }

  async handleRevealTimeout(game) {
    const channel = await this.client.channels.fetch(game.channelId);
    
    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('⏰ Reveal Timeout')
      .setDescription('Moving to next turn...');

    await channel.send({ embeds: [embed] });
    await this.nextDiscordGameTurn(game);
  }

  async handleGameJoinReaction(reaction, user) {
    if (!this.discordGames) return;

    // Find the game associated with this message
    let targetGame = null;
    let targetGameId = null;

    for (const [gameId, game] of this.discordGames) {
      if (game.joinMessageId === reaction.message.id) {
        targetGame = game;
        targetGameId = gameId;
        break;
      }
    }

    if (!targetGame) return;

    // Check if user is already in the game
    if (targetGame.players.some(p => p.id === user.id)) {
      return; // Silently ignore if already in game
    }

    // Check if game is full or started
    if (targetGame.players.length >= targetGame.maxPlayers || targetGame.status !== 'waiting') {
      return;
    }

    // Add player to game
    const discordUser = {
      id: user.id,
      username: user.username,
      discriminator: user.discriminator || '0000',
      avatar: user.avatar,
      isDiscordBot: true
    };

    targetGame.players.push(discordUser);

    // Send confirmation DM to user
    try {
      const dmEmbed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('✅ Joined Discord Game!')
        .setDescription(`You've joined the ${this.formatGameType(targetGame.type)} game via reaction!`)
        .addFields(
          { name: 'Game ID', value: targetGameId, inline: true },
          { name: 'Players', value: `${targetGame.players.length}/${targetGame.maxPlayers}`, inline: true }
        );

      await user.send({ embeds: [dmEmbed] });
    } catch (error) {
      console.error('Failed to send DM:', error);
    }

    // Update the join message
    try {
      const updatedEmbed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('🎯 How to Join')
        .setDescription('Players can join this Discord game using:')
        .addFields(
          { name: 'Command', value: `/join-discord-game ${targetGameId}`, inline: false },
          { name: 'Current Players', value: `${targetGame.players.length}/${targetGame.maxPlayers}`, inline: false },
          { name: 'Players', value: targetGame.players.map(p => `• ${p.username}`).join('\n'), inline: false }
        );

      await reaction.message.edit({ embeds: [updatedEmbed] });
    } catch (error) {
      console.error('Failed to update join message:', error);
    }

    this.emitSpectator(targetGame.channelId, 'lobby_update', targetGame);
  }

  async handleGameStatus(interaction) {
    const userId = interaction.user.id;
    const discordUserGames = [];
    
    // Check Discord games
    if (this.discordGames) {
      for (const [gameId, game] of this.discordGames) {
        if (game.players.some(player => player.id === userId)) {
          discordUserGames.push({ id: gameId, game });
        }
      }
    }

    if (discordUserGames.length === 0) {
      await interaction.reply({ 
        content: '📭 You are not in any active games. Use `/create-game` or `/join-game` to start playing!',
        ephemeral: true 
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle('🎮 Your Game Status')
      .setTimestamp();

    // Add Discord games
    discordUserGames.forEach(({ id, game }) => {
      embed.addFields({
        name: `🎮 ${this.formatGameType(game.type)}`,
        value: `**ID:** ${id}\n**Players:** ${game.players.length}/${game.maxPlayers}\n**Status:** ${this.formatStatus(game.status)}\n**Round:** ${game.currentRound || 0}`,
        inline: true
      });
    });

    await interaction.reply({ embeds: [embed] });
  }

  // Notification methods for game events
  async notifyGameStart(gameId, game) {
    if (!this.isReady) return;

    const embed = new EmbedBuilder()
      .setColor(0x00AE86)
      .setTitle('🚀 Game Started!')
      .setDescription(`${this.formatGameType(game.type)} game has begun!`)
      .addFields(
        { name: 'Game ID', value: gameId, inline: true },
        { name: 'Players', value: game.players.length.toString(), inline: true }
      )
      .setTimestamp();

    // Send notification to Discord users in the game
    for (const player of game.players) {
      if (player.isDiscordBot) {
        try {
          const user = await this.client.users.fetch(player.id);
          await user.send({ embeds: [embed] });
        } catch (error) {
          console.error(`Failed to notify Discord user ${player.id}:`, error);
        }
      }
    }
  }

  async notifyGameEnd(gameId, game, winner) {
    if (!this.isReady) return;

    const embed = new EmbedBuilder()
      .setColor(0xFF6B6B)
      .setTitle('🏆 Game Finished!')
      .setDescription(`${this.formatGameType(game.type)} game has ended!`)
      .addFields(
        { name: 'Game ID', value: gameId, inline: true },
        { name: 'Winner', value: winner ? winner.username : 'No winner', inline: true }
      )
      .setTimestamp();

    // Send notification to Discord users in the game
    for (const player of game.players) {
      if (player.isDiscordBot) {
        try {
          const user = await this.client.users.fetch(player.id);
          await user.send({ embeds: [embed] });
        } catch (error) {
          console.error(`Failed to notify Discord user ${player.id}:`, error);
        }
      }
    }
  }

  // Utility methods
  formatGameType(type) {
    const types = {
      'degens-against-decency': 'Degens Against Decency',
      '2-truths-and-a-lie': '2 Truths and a Lie',
      'poker': 'Poker'
    };
    return types[type] || type;
  }

  formatStatus(status) {
    const statuses = {
      'waiting': '⏳ Waiting for players',
      'playing': '🎮 In progress',
      'finished': '✅ Finished'
    };
    return statuses[status] || status;
  }

  // Clean shutdown
  destroy() {
    if (this.client) {
      this.client.destroy();
    }
  }
}

module.exports = DiscordBot;