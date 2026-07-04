/**
 * Degens Against Decency - Game Arena Server
 * 
 * Copyright (c) 2024 Degens Against Decency
 * Licensed under the MIT License
 * See LICENSE file in the project root for full license information.
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const { createWsHandler } = require('./src/ws-handler');

// Import Supabase client
const supabase = require('./src/supabase');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = process.env.PORT || 3000;

// Import game modules
const GameManager = require('./src/GameManager');
const AICardGenerator = require('./src/AICardGenerator');
const DiscordBot = require('./src/DiscordBot');
const IntegrationManager = require('./src/integrations/IntegrationManager');

// Initialize Supabase
const supabaseEnabled = supabase.initSupabase();

// Initialize game systems
const gameManager = new GameManager(io);
const aiCardGenerator = new AICardGenerator();

const channelBroadcast = { fn: () => {} };
const discordBot = new DiscordBot(gameManager, io, {
  broadcastToChannel: (channelId, payload) => channelBroadcast.fn(channelId, payload),
});
const integrationManager = new IntegrationManager();

const wsHandler = createWsHandler({
  getActiveGames: () => discordBot.getChannelGamesMap(),
});
channelBroadcast.fn = wsHandler.broadcastToChannel;
wsHandler.attach(server);

// Connect bots to game manager
gameManager.setDiscordBot(discordBot);
gameManager.setIntegrationManager(integrationManager);

// In-memory storage for user profiles and onboarding status (fallback when Supabase is not configured)
const userProfiles = new Map();
const onboardingStatus = new Map();

// Helper function to extract username from Supabase user metadata
function extractUsername(user) {
  const metadata = user.user_metadata || {};
  return metadata.full_name || metadata.name || (user.email ? user.email.split('@')[0] : 'User');
}

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback_secret_key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // Set to true in production with HTTPS
}));

// Passport configuration - only if Discord credentials are provided
if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) {
  passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: process.env.DISCORD_CALLBACK_URL,
    scope: ['identify', 'email']
  }, async (accessToken, refreshToken, profile, done) => {
    const user = {
      id: profile.id,
      username: profile.username,
      discriminator: profile.discriminator,
      avatar: profile.avatar,
      email: profile.email
    };
    return done(null, user);
  }));
} else {
  console.log('⚠️  Discord OAuth not configured - running in development mode with guest users');
}

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

app.use(passport.initialize());
app.use(passport.session());
app.use(express.json());

const allowedOrigins = [
  process.env.ACTIVITY_URL,
  'https://symphonious-marzipan-cd1f3d.netlify.app',
  'http://localhost:8888',
  'http://localhost:3000',
].filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (allowedOrigins.some((o) => origin === o || origin.startsWith(o.replace(/\/$/, ''))) || process.env.NODE_ENV !== 'production')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'degens-against-decency',
    discordBot: discordBot.isReady,
    uptime: process.uptime(),
  });
});

app.use(express.static(path.join(__dirname, 'public')));

// Serve Discord SDK from node_modules
app.get('/scripts/discord-sdk.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'node_modules', '@discord', 'embedded-app-sdk', 'dist', 'main.js'));
});

// Authentication routes - Supabase OAuth takes priority if configured
// Discord Activity routes
app.get('/discord-activity', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'discord-activity.html'));
});

// POST /api/discord-activity/token
// Exchange Activity authorization code for access token
app.post('/api/discord-activity/token', async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'Missing authorization code' });
    }

    const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code: code,
    }), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const accessToken = tokenResponse.data.access_token;

    // Fetch user info from Discord to set up the session
    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const discordUser = userResponse.data;

    // Store user in session
    req.session.user = {
      id: discordUser.id,
      username: discordUser.username,
      discriminator: discordUser.discriminator,
      avatar: discordUser.avatar,
      email: discordUser.email,
      provider: 'discord',
      providerUserId: discordUser.id
    };

    res.json({ 
      access_token: accessToken,
      user: req.session.user
    });
  } catch (error) {
    console.error('Error exchanging Discord Activity token:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to exchange token', 
      details: error.response?.data || error.message 
    });
  }
});

// GET /api/config/discord-client-id
// Used by Discord Activity to initialize SDK
app.get('/api/config/discord-client-id', (req, res) => {
  res.json({ clientId: process.env.DISCORD_CLIENT_ID });
});

if (supabaseEnabled) {
  // Supabase Discord OAuth routes
  app.get('/auth/discord', async (req, res) => {
    try {
      const redirectTo = `${req.protocol}://${req.get('host')}/auth/callback`;
      const authData = await supabase.getDiscordAuthUrl(redirectTo);
      
      if (authData && authData.url) {
        res.redirect(authData.url);
      } else {
        res.redirect('/?error=auth_failed');
      }
    } catch (error) {
      console.error('Error initiating Discord auth:', error);
      res.redirect('/?error=auth_failed');
    }
  });

  // Supabase OAuth callback
  app.get('/auth/callback', async (req, res) => {
    try {
      const code = req.query.code;
      
      if (!code) {
        return res.redirect('/?error=no_code');
      }

      const sessionData = await supabase.exchangeCodeForSession(code);
      
      if (!sessionData || !sessionData.session) {
        return res.redirect('/?error=auth_failed');
      }

      // Store session in express session
      req.session.supabaseSession = sessionData.session;
      req.session.user = {
        id: sessionData.user.id,
        username: extractUsername(sessionData.user),
        discriminator: '0000',
        avatar: sessionData.user.user_metadata?.avatar_url || null,
        email: sessionData.user.email,
        provider: 'discord',
        providerUserId: sessionData.user.user_metadata?.provider_id || sessionData.user.id
      };

      // Check if user has completed onboarding
      const hasCompletedOnboarding = await supabase.getOnboardingStatus(sessionData.user.id);
      
      if (!hasCompletedOnboarding) {
        res.redirect('/onboarding');
      } else {
        res.redirect('/arena');
      }
    } catch (error) {
      console.error('Error in OAuth callback:', error);
      res.redirect('/?error=auth_failed');
    }
  });

  // Legacy callback route for backward compatibility
  app.get('/auth/discord/callback', (req, res) => {
    const codeParam = req.query.code ? `?code=${encodeURIComponent(req.query.code)}` : '';
    res.redirect('/auth/callback' + codeParam);
  });
} else if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) {
  // Fallback to passport-discord if Supabase is not configured
  app.get('/auth/discord', passport.authenticate('discord'));
  app.get('/auth/discord/callback', 
    passport.authenticate('discord', { failureRedirect: '/?error=auth_failed' }),
    async (req, res) => {
      // Check if user has completed onboarding
      const userId = req.user.id;
      let hasCompletedOnboarding = onboardingStatus.get(userId);
      
      // Also check Supabase if available
      if (supabaseEnabled) {
        hasCompletedOnboarding = await supabase.getOnboardingStatus(userId);
      }
      
      if (!hasCompletedOnboarding) {
        // New user, redirect to onboarding
        res.redirect('/onboarding');
      } else {
        // Existing user, go to arena
        res.redirect('/arena');
      }
    }
  );
} else {
  // Fallback routes for development without Discord
  app.get('/auth/discord', (req, res) => {
    // Redirect to index page with error parameter for user-friendly display
    res.redirect('/?error=discord_not_configured');
  });
  app.get('/auth/discord/callback', (req, res) => {
    res.redirect('/arena');
  });
}

app.get('/auth/logout', async (req, res) => {
  try {
    // Sign out from Supabase if session exists
    if (req.session.supabaseSession) {
      await supabase.signOut(req.session.supabaseSession.access_token);
      delete req.session.supabaseSession;
      delete req.session.user;
    }
    
    // Also logout from passport if authenticated
    if (req.isAuthenticated && req.isAuthenticated()) {
      req.logout(() => {
        res.redirect('/');
      });
    } else {
      req.session.destroy(() => {
        res.redirect('/');
      });
    }
  } catch (error) {
    console.error('Error logging out:', error);
    res.redirect('/');
  }
});

// API routes
app.get('/api/user', async (req, res) => {
  try {
    // Check Supabase session first
    if (req.session.user && req.session.supabaseSession) {
      // Verify the session is still valid
      const user = await supabase.getUserFromToken(req.session.supabaseSession.access_token);
      if (user) {
        return res.json(req.session.user);
      } else {
        // Session expired, clear it
        delete req.session.supabaseSession;
        delete req.session.user;
      }
    }
    
    // Check passport authentication
    if (req.isAuthenticated && req.isAuthenticated()) {
      return res.json(req.user);
    }
    
    // For non-authenticated users, create a guest user
    const guestId = `guest-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    res.json({
      id: guestId,
      username: `Guest_${guestId.slice(-6)}`,
      discriminator: '0000',
      avatar: null,
      email: null,
      isGuest: true
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to retrieve user information', message: error.message });
  }
});

// Helper function to check if user is authenticated (either Supabase or Passport)
function isAuthenticated(req) {
  return (req.session.user && req.session.supabaseSession) || (req.isAuthenticated && req.isAuthenticated());
}

// Helper function to get current user
function getCurrentUser(req) {
  if (req.session.user) {
    return req.session.user;
  }
  if (req.user) {
    return req.user;
  }
  return null;
}

// Onboarding status endpoint
app.get('/api/user/onboarding-status', async (req, res) => {
  try {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const user = getCurrentUser(req);
    const userId = user.id;
    
    // Try Supabase first
    if (supabaseEnabled) {
      const completed = await supabase.getOnboardingStatus(userId);
      return res.json({ completed });
    }
    
    // Fallback to in-memory
    const completed = onboardingStatus.get(userId) || false;
    res.json({ completed });
  } catch (error) {
    console.error('Error fetching onboarding status:', error);
    res.status(500).json({ error: 'Failed to retrieve onboarding status', message: error.message });
  }
});

// Save onboarding data
app.post('/api/user/onboarding', async (req, res) => {
  try {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const user = getCurrentUser(req);
    const userId = user.id;
    const profileData = req.body;
    
    // Try to save to Supabase first
    if (supabaseEnabled) {
      const savedProfile = await supabase.upsertUserProfile(userId, {
        display_name: profileData.displayName,
        bio: profileData.bio,
        experience: profileData.experience,
        game_modes: profileData.gameModes,
        preferred_player_count: profileData.preferredPlayerCount,
        playstyle: profileData.playstyle,
        content_filter: profileData.contentFilter,
        privacy_settings: profileData.privacy,
        notifications: profileData.notifications,
        onboarding_completed: true
      });
      
      if (savedProfile) {
        console.log(`✅ User ${userId} completed onboarding (Supabase)`);
        return res.json({ success: true, message: 'Onboarding completed successfully' });
      }
    }
    
    // Fallback to in-memory storage
    userProfiles.set(userId, {
      ...profileData,
      userId,
      createdAt: new Date().toISOString()
    });
    
    // Mark onboarding as completed
    onboardingStatus.set(userId, true);
    
    console.log(`✅ User ${userId} completed onboarding (in-memory)`);
    
    res.json({ success: true, message: 'Onboarding completed successfully' });
  } catch (error) {
    console.error('Error saving onboarding data:', error);
    res.status(500).json({ error: 'Failed to save onboarding data', message: error.message });
  }
});

// Get user profile
app.get('/api/user/profile', async (req, res) => {
  try {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const user = getCurrentUser(req);
    const userId = user.id;
    
    // Try Supabase first
    if (supabaseEnabled) {
      const profile = await supabase.getUserProfile(userId);
      if (profile) {
        return res.json(profile);
      }
    }
    
    // Fallback to in-memory
    const profile = userProfiles.get(userId);
    
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    res.json(profile);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ error: 'Failed to retrieve profile', message: error.message });
  }
});

// Update user profile
app.put('/api/user/profile', async (req, res) => {
  try {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const user = getCurrentUser(req);
    const userId = user.id;
    const profileData = req.body;
    
    // Try to save to Supabase first
    if (supabaseEnabled) {
      const savedProfile = await supabase.upsertUserProfile(userId, {
        display_name: profileData.displayName,
        bio: profileData.bio,
        experience: profileData.experience,
        game_modes: profileData.gameModes,
        preferred_player_count: profileData.preferredPlayerCount,
        playstyle: profileData.playstyle,
        content_filter: profileData.contentFilter,
        privacy_settings: profileData.privacy,
        notifications: profileData.notifications
      });
      
      if (savedProfile) {
        return res.json({ success: true, profile: savedProfile });
      }
    }
    
    // Fallback to in-memory storage
    const existingProfile = userProfiles.get(userId) || {};
    userProfiles.set(userId, {
      ...existingProfile,
      ...profileData,
      userId,
      updatedAt: new Date().toISOString()
    });
    
    res.json({ success: true, profile: userProfiles.get(userId) });
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ error: 'Failed to update profile', message: error.message });
  }
});


app.get('/api/games', (req, res) => {
  try {
    const games = gameManager.getPublicGames();
    res.json(games || []);
  } catch (error) {
    console.error('Error fetching games:', error);
    res.status(500).json({ error: 'Failed to retrieve games', message: error.message });
  }
});

app.get('/api/games/:gameId', (req, res) => {
  try {
    const game = gameManager.getGame(req.params.gameId);
    const isInvite = req.query.invite === 'true';
    
    if (!game) {
      return res.status(404).json({ error: 'Game not found', message: 'The requested game does not exist or has ended' });
    }
    
    // Allow access to private games via invite link
    if (game.isPrivate && !isInvite && !isAuthenticated(req) && process.env.NODE_ENV !== 'development') {
      return res.status(401).json({ error: 'Not authorized to view this private game', message: 'This is a private game. Use an invite link to join.' });
    }
    
    res.json(game.getGameState());
  } catch (error) {
    console.error('Error fetching game:', error);
    res.status(500).json({ error: 'Failed to retrieve game', message: error.message });
  }
});

app.post('/api/games', (req, res) => {
  try {
    let user = getCurrentUser(req);
    
    // If not authenticated, create a guest user
    if (!user) {
      const guestId = `guest-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      user = {
        id: guestId,
        username: `Guest_${guestId.slice(-6)}`,
        discriminator: '0000',
        isGuest: true
      };
    }
    
    const { gameType, isPrivate, maxPlayers } = req.body;
    
    // Validate required fields
    if (!gameType) {
      return res.status(400).json({ error: 'Game type is required', message: 'Please select a game type' });
    }
    
    const game = gameManager.createGame(gameType, user, isPrivate, maxPlayers);
    res.json(game);
  } catch (error) {
    console.error('Error creating game:', error);
    res.status(400).json({ error: 'Failed to create game', message: error.message });
  }
});

// Integration API endpoints
app.get('/api/integrations/health', (req, res) => {
  try {
    const health = integrationManager.getHealthStatus();
    res.json(health);
  } catch (error) {
    console.error('Error fetching integration health:', error);
    res.status(500).json({ error: 'Failed to retrieve integration health', message: error.message });
  }
});

app.post('/api/integrations/tiltcheck/register', async (req, res) => {
  try {
    const { playerId, options } = req.body;
    if (!integrationManager.tiltCheck.enabled) {
      return res.status(503).json({ error: 'TiltCheck integration not enabled' });
    }
    const result = await integrationManager.tiltCheck.trackPlayer(playerId, options);
    res.json(result);
  } catch (error) {
    console.error('TiltCheck registration error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/integrations/tiltcheck/stats/:playerId', async (req, res) => {
  try {
    if (!integrationManager.tiltCheck.enabled) {
      return res.status(503).json({ error: 'TiltCheck integration not enabled' });
    }
    const stats = await integrationManager.tiltCheck.getPlayerStats(req.params.playerId);
    res.json(stats || { error: 'Player not found' });
  } catch (error) {
    console.error('TiltCheck stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/integrations/justthetip/register-wallet', async (req, res) => {
  try {
    const { userId, walletAddress } = req.body;
    if (!integrationManager.justTheTip.enabled) {
      return res.status(503).json({ error: 'JustTheTip integration not enabled' });
    }
    const result = await integrationManager.justTheTip.registerWallet(userId, walletAddress);
    res.json(result);
  } catch (error) {
    console.error('JustTheTip wallet registration error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/integrations/justthetip/tip', async (req, res) => {
  try {
    const { fromUserId, toUserId, amount, currency, context } = req.body;
    if (!integrationManager.justTheTip.enabled) {
      return res.status(503).json({ error: 'JustTheTip integration not enabled' });
    }
    const result = await integrationManager.justTheTip.createTip(fromUserId, toUserId, amount, currency, context);
    res.json(result);
  } catch (error) {
    console.error('JustTheTip tip creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/integrations/justthetip/balance/:userId', async (req, res) => {
  try {
    if (!integrationManager.justTheTip.enabled) {
      return res.status(503).json({ error: 'JustTheTip integration not enabled' });
    }
    const balance = await integrationManager.justTheTip.getBalance(req.params.userId);
    res.json(balance);
  } catch (error) {
    console.error('JustTheTip balance query error:', error);
    res.status(500).json({ error: error.message });
  }
});

// AI Gateway statistics endpoint
app.get('/api/ai-gateway/stats', (req, res) => {
  try {
    const stats = aiCardGenerator.getAIGatewayStats();
    res.json(stats);
  } catch (error) {
    console.error('AI Gateway stats error:', error);
    res.status(500).json({ error: 'Failed to retrieve AI Gateway statistics', message: error.message });
  }
});

// Feedback submission endpoint
app.post('/api/feedback', (req, res) => {
  try {
    const feedback = req.body;
    
    // Validate feedback data
    if (!feedback.gameId || !feedback.userId) {
      return res.status(400).json({ error: 'Missing required fields (gameId, userId)' });
    }
    
    // Log feedback (in production, this would be saved to a database)
    console.log('📋 Feedback received:', {
      gameId: feedback.gameId,
      userId: feedback.userId,
      timestamp: feedback.timestamp,
      ratings: feedback.ratings,
      hasComment: !!feedback.comment
    });
    
    // In a real implementation, save to database:
    // await feedbackRepository.save(feedback);
    
    res.json({ 
      success: true, 
      message: 'Feedback received successfully',
      feedbackId: `fb-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
    });
  } catch (error) {
    console.error('Error processing feedback:', error);
    res.status(500).json({ error: 'Failed to process feedback', message: error.message });
  }
});

// Serve different pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/arena', (req, res) => {
  // Allow access to arena for public games, even without authentication
  res.sendFile(path.join(__dirname, 'public', 'arena.html'));
});

app.get('/game/:gameId', (req, res) => {
  const game = gameManager.getGame(req.params.gameId);
  const isInvite = req.query.invite === 'true';
  
  // Allow access to all games - guest users can play public games
  // Private games require invite link
  if (game && game.isPrivate && !isInvite) {
    // Private game without invite - redirect to home
    return res.redirect('/');
  }
  
  // Allow access to the game page (game existence is checked client-side)
  res.sendFile(path.join(__dirname, 'public', 'game.html'));
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-lobby', (userId) => {
    socket.userId = userId;
    socket.join('lobby');
    socket.emit('lobby-games', gameManager.getPublicGames());
  });

  socket.on('request-lobby-update', () => {
    if (socket.userId) {
      socket.emit('lobby-games', gameManager.getPublicGames());
    }
  });

  socket.on('join-game', (gameId) => {
    const result = gameManager.joinGame(gameId, socket.userId, socket);
    if (result.success) {
      socket.join(gameId);
      socket.gameId = gameId;
      socket.isSpectator = false;
      io.to(gameId).emit('game-update', result.game);
      // Update lobby when player joins
      io.to('lobby').emit('lobby-games', gameManager.getPublicGames());
    } else {
      socket.emit('error', result.error);
    }
  });

  socket.on('spectate-game', (gameId) => {
    const result = gameManager.spectateGame(gameId, socket.userId, socket);
    if (result.success) {
      socket.join(gameId);
      socket.gameId = gameId;
      socket.isSpectator = true;
      socket.emit('game-update', result.game);
      socket.emit('spectator-mode', true);
      // Update lobby when spectator joins
      io.to('lobby').emit('lobby-games', gameManager.getPublicGames());
    } else {
      socket.emit('error', result.error);
    }
  });

  socket.on('leave-game', () => {
    if (socket.gameId) {
      if (socket.isSpectator) {
        gameManager.leaveSpectator(socket.gameId, socket.userId);
      } else {
        gameManager.leaveGame(socket.gameId, socket.userId);
      }
      socket.leave(socket.gameId);
      const game = gameManager.getGame(socket.gameId);
      if (game) {
        io.to(socket.gameId).emit('game-update', game.getGameState());
      }
      // Update lobby when player/spectator leaves
      io.to('lobby').emit('lobby-games', gameManager.getPublicGames());
      socket.gameId = null;
      socket.isSpectator = false;
    }
  });

  socket.on('game-action', (data) => {
    if (socket.gameId && !socket.isSpectator) {
      const result = gameManager.handleGameAction(socket.gameId, socket.userId, data);
      if (result.success) {
        io.to(socket.gameId).emit('game-update', result.game);
        // Update lobby when game status changes
        io.to('lobby').emit('lobby-games', gameManager.getPublicGames());
      } else {
        socket.emit('error', result.error);
      }
    } else if (socket.isSpectator) {
      socket.emit('error', 'Spectators cannot perform game actions');
    }
  });

  socket.on('chat-message', (data) => {
    if (socket.gameId) {
      // Broadcast chat message to all players in the game
      io.to(socket.gameId).emit('chat-message', {
        sender: data.sender,
        text: data.message,
        timestamp: new Date()
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    if (socket.gameId) {
      if (socket.isSpectator) {
        gameManager.leaveSpectator(socket.gameId, socket.userId);
      } else {
        gameManager.leaveGame(socket.gameId, socket.userId);
      }
      const game = gameManager.getGame(socket.gameId);
      if (game) {
        io.to(socket.gameId).emit('game-update', game.getGameState());
      }
      // Update lobby when player/spectator disconnects
      io.to('lobby').emit('lobby-games', gameManager.getPublicGames());
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🎮 Degens Against Decency Arena running on port ${PORT}`);
  console.log(`📡 WebSocket spectators on ws://0.0.0.0:${PORT}`);
  if (process.env.ACTIVITY_URL) {
    console.log(`🎯 Activity URL: ${process.env.ACTIVITY_URL}`);
  }
});

function shutdown(signal) {
  console.log(`${signal} received — shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
