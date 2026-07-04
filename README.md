# 🎮 Degens Against Decency - Game Arena

A comprehensive multiplayer party game platform featuring Discord authentication, AI-generated content, and real-time gameplay across multiple game types.

## 📋 Quick Links

**Looking for deployment requirements?**
- ⚡ **[Requirements Summary](REQUIREMENTS_SUMMARY.md)** - Quick reference guide (start here!)
- 🌐 **[Website Deployment Requirements](WEBSITE_REQUIREMENTS.md)** - Complete guide for deploying on a website (Vercel, Railway, VPS, etc.)
- 🔷 **[Vercel Deployment Guide](DEPLOYMENT_VERCEL.md)** - Step-by-step Vercel deployment with environment variables
- 🚂 **[Railway Deployment Guide](DEPLOYMENT_RAILWAY.md)** - Deploy to Railway (recommended for WebSocket support)
- 🎨 **[Render Deployment Guide](DEPLOYMENT_RENDER.md)** - Deploy to Render (great free tier)
- 🎮 **[Discord Activity Implementation](DISCORD_ACTIVITY_REQUIREMENTS.md)** - Guide for Discord Activity (Now implemented!)
- ✅ **[Discord Activity Status](DISCORD_ACTIVITY_STATUS.md)** - Detailed summary of the Activity implementation

**Other Documentation:**
- 🤖 **[Vercel AI Gateway Guide](VERCEL_AI_GATEWAY.md)** - Multi-provider AI integration with automatic failover
- 📝 **[AI Gateway Examples](AI_GATEWAY_EXAMPLES.md)** - Ready-to-use configurations for different scenarios
- 📖 [Integration Guide](INTEGRATIONS.md) - TiltCheck and JustTheTip integration details
- 🚀 [Deployment with Integrations](DEPLOYMENT_INTEGRATIONS.md) - Deploy with optional integrations
- 📱 [Discord Activities Analysis](DISCORD_ACTIVITIES.md) - Why Discord Activities aren't currently implemented

## 🎯 Features

### 🔐 Discord OAuth Authentication
- Secure login via Discord
- User session management
- Avatar and username integration
- Development mode for testing (bypass authentication)

### 🤖 Discord Bot Integration
- Create and join games directly from Discord
- Slash commands for game management
- Real-time game notifications via DM
- Bridge between Discord and web interface

### 🎮 Discord Activity Support (NEW)
- Play directly within Discord voice channels
- Native embedded experience (no browser switching)
- Automatic authentication via Discord SDK
- Rich presence and activity state synchronization
- Cross-platform support (Desktop & Mobile Discord apps)

### 🎮 Multiple Game Types

#### 1. Degens Against Decency
- Cards Against Humanity-style gameplay
- AI-generated question and answer cards
- Card Czar rotation system
- Real-time card submission and judging
- Configurable rounds and scoring

#### 2. 2 Truths and a Lie
- Classic deception game with modern twist
- AI-generated prompts and categories
- Scoring system based on successful deception
- Multiplayer voting and revelation phases

#### 3. Poker (5-Card Stud)
- Traditional poker gameplay
- Betting rounds and pot management
- Hand evaluation and winner determination
- Fold/Call/Raise mechanics

### 🤖 AI Integration
- **Multi-Provider Support**: Unified interface to OpenAI, Anthropic, Google, and xAI models
- **Automatic Failover**: Seamless provider switching if one is unavailable
- **Cost Tracking**: Real-time monitoring and configurable spending limits
- **Dynamic Card Generation**: AI-powered card creation via multiple providers
- **Context-Aware Content**: Theme-based generation for personalized experiences
- **Intelligent Fallback**: Curated content available if all AI providers are down
- See [Vercel AI Gateway Integration](VERCEL_AI_GATEWAY.md) for details

### 🌐 Real-time Multiplayer
- WebSocket-based real-time communication
- Game state synchronization
- Live chat during games
- Player presence and status updates

### 🎨 Modern UI/UX
- Responsive design for desktop and mobile
- Dark theme with neon accents
- Smooth animations and transitions
- Intuitive game controls and feedback

### 🔌 Backend Integrations (Optional)
- **TiltCheck** - Player behavior monitoring for responsible gaming
- **JustTheTip** - Cryptocurrency tipping with Solana smart contracts
- Non-custodial wallet support
- Real-time balance queries and transaction tracking
- See [INTEGRATIONS.md](INTEGRATIONS.md) for full details

## 🚀 Getting Started

> **📋 For comprehensive deployment requirements, see [WEBSITE_REQUIREMENTS.md](WEBSITE_REQUIREMENTS.md)**  
> This section provides a quick start guide. For detailed requirements, configuration options, and troubleshooting, refer to the complete requirements documentation.

### Prerequisites
- Node.js 16+
- Discord Developer Application (for OAuth and Bot)
- OpenAI API Key (optional, fallback content available)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd DegensAgainstDecencyCardBot
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
```env
# Discord OAuth Configuration
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
DISCORD_CALLBACK_URL=http://localhost:3000/auth/discord/callback

# Discord Bot Configuration
DISCORD_BOT_TOKEN=your_discord_bot_token

# Session Configuration
SESSION_SECRET=your_super_secret_session_key

# Server Configuration
PORT=3000
NODE_ENV=development

# AI Card Generation (optional - defaults to degenscardbot.vercel.app)
CARD_GENERATOR_URL=https://degenscardbot.vercel.app/api/generate
OPENAI_API_KEY=your_openai_api_key
```

4. Start the server:
```bash
npm start
```

5. Visit `http://localhost:3000` to begin!

### Discord App Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a New Application
3. **OAuth2 Setup**:
   - Go to OAuth2 → General
   - Add redirect URI: `http://localhost:3000/auth/discord/callback`
   - Copy Client ID and Client Secret to your `.env` file
4. **Bot Setup**:
   - Go to Bot section
   - Create a Bot
   - Copy Bot Token to your `.env` file as `DISCORD_BOT_TOKEN`
   - Enable necessary bot permissions (Send Messages, Use Slash Commands)
5. **Install Bot to Server**:
   - Go to OAuth2 → URL Generator
   - Select scopes: `bot`, `applications.commands`
   - Select permissions: Send Messages, Use Slash Commands
   - Use generated URL to add bot to your Discord server

## 🎮 How to Play

### Starting a Game (Web Interface)
1. **Login**: Use Discord OAuth to authenticate
2. **Arena**: Browse available games or create a new one
3. **Configure**: Choose game type, max players, and privacy settings
4. **Play**: Join games and enjoy real-time multiplayer action!

### Starting a Game (Discord Bot)
Use these slash commands in any Discord server where the bot is installed:

- `/create-game` - Create a new Discord game
  - **type**: Choose game type (Degens Against Decency, 2 Truths and a Lie, Poker)
  - **max-players**: Set maximum players (3-7, optional)
  - **private**: Make game private (optional)

- `/list-games` - View all available public Discord games

- `/join-game` - Join a game by ID
  - **game-id**: The game ID to join

- `/start-game` - Start a game (creator only)
  - **game-id**: The game ID to start

- `/game-status` - Check your current game status

**Note**: All games are played directly in Discord for a seamless experience!

### Game Types Guide

#### Degens Against Decency
- **Players**: 3-8 recommended
- **Rounds**: 10 rounds (configurable)
- **Gameplay**: Submit funniest answer card to match the question
- **Scoring**: Card Czar picks winning submission
- **AI**: Generates fresh question and answer cards

#### 2 Truths and a Lie
- **Players**: 3+ (more is better)
- **Rounds**: Based on number of players
- **Gameplay**: Create believable lies, guess others' lies
- **Scoring**: Points for correct guesses and successful deception
- **AI**: Provides creative prompts and categories

#### Poker (5-Card Stud)
- **Players**: 2-8
- **Rounds**: Single hand completion
- **Gameplay**: Traditional poker betting and hand evaluation
- **Scoring**: Winner takes the pot
- **Features**: Blinds, betting rounds, fold/call/raise

## 🛠️ Technical Architecture

### Backend
- **Framework**: Express.js with Socket.IO
- **Authentication**: Passport.js with Discord strategy
- **Session Management**: Express-session
- **Real-time**: WebSocket connections
- **AI Integration**: OpenAI API for content generation

### Frontend
- **Vanilla JavaScript**: No framework dependencies
- **CSS3**: Modern styling with CSS Grid and Flexbox
- **WebSocket Client**: Real-time game state updates
- **Responsive Design**: Works on desktop and mobile

### Game Engine
- **Modular Architecture**: Base game class with specialized implementations
- **State Management**: Centralized game state with real-time sync
- **Player Management**: Session-based player tracking
- **AI Content**: Dynamic content generation with fallbacks

## 📁 Project Structure

```
DegensAgainstDecencyCardBot/
├── server.js                 # Main server file
├── package.json              # Dependencies and scripts
├── .env.example              # Environment template
├── src/
│   ├── GameManager.js        # Central game management
│   ├── AICardGenerator.js    # AI content generation
│   └── games/
│       ├── BaseGame.js       # Base game class
│       ├── DegensAgainstDecencyGame.js
│       ├── TwoTruthsAndALieGame.js
│       └── PokerGame.js
└── public/
    ├── index.html            # Landing page
    ├── arena.html           # Game lobby
    ├── game.html            # Game interface
    ├── styles/
    │   ├── main.css         # Global styles
    │   └── game.css         # Game-specific styles
    └── scripts/
        ├── auth.js          # Authentication handling
        ├── arena.js         # Lobby functionality
        └── game.js          # Game client logic
```

## 🔧 Development

### Running in Development Mode
Set `NODE_ENV=development` to enable:
- Bypass Discord authentication
- Demo user for testing
- Enhanced error logging

### Adding New Games
1. Create game class extending `BaseGame`
2. Implement required methods: `initializeGame()`, `handleAction()`, `getGameState()`
3. Add game renderer in `game.js`
4. Register in `GameManager.js`

### API Endpoints
- `GET /` - Landing page
- `GET /arena` - Game lobby (auth required)
- `GET /game/:gameId` - Game interface (auth required)
- `GET /api/user` - Current user info
- `GET /api/games` - List public games
- `POST /api/games` - Create new game
- `GET /auth/discord` - Discord OAuth initiation
- `GET /auth/discord/callback` - OAuth callback
- `GET /auth/logout` - Logout

### WebSocket Events
- `join-lobby` - Join game lobby
- `join-game` - Join specific game
- `leave-game` - Leave current game
- `game-action` - Send game-specific action
- `chat-message` - Send chat message
- `game-update` - Receive game state updates
- `lobby-games` - Receive lobby game list

## 🎨 Customization

### Themes and Styling
- Modify `/public/styles/main.css` for global styling
- Game-specific styles in `/public/styles/game.css`
- CSS custom properties for easy color scheme changes

### AI Content
- Adjust prompts in `AICardGenerator.js`
- Configure content generation parameters
- Add fallback content collections

### Game Rules
- Modify scoring systems in individual game classes
- Adjust round limits and player counts
- Customize game flow and phases

## 🚀 Deployment

Choose your preferred deployment platform - all support WebSockets and real-time multiplayer:

### 🛫 Fly.io (Recommended for Discord Bot)

Fly.io provides excellent always-on hosting with great WebSocket support, perfect for running the Discord bot.

Quick start:
1. Install Fly CLI: `curl -L https://fly.io/install.sh | sh`
2. Login: `flyctl auth login`
3. Deploy: `flyctl launch` (follow prompts)
4. **Set Discord Bot Token** (REQUIRED for bot to come online):
   ```bash
   flyctl secrets set DISCORD_BOT_TOKEN=your_bot_token_here
   flyctl secrets set SESSION_SECRET=$(openssl rand -hex 32)
   flyctl secrets set NODE_ENV=production
   ```
5. For Supabase integration (optional):
   ```bash
   flyctl secrets set SUPABASE_URL=your_supabase_url
   flyctl secrets set SUPABASE_ANON_KEY=your_anon_key
   flyctl secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```
6. Redeploy: `flyctl deploy`

**Important**: The Discord bot will only come online if `DISCORD_BOT_TOKEN` is set. Get your token from the [Discord Developer Portal](https://discord.com/developers/applications) → Your Application → Bot → Token.

### 🚂 Railway (Recommended for Free Tier)

Railway offers the best free tier with always-on instances and full WebSocket support.

**[📖 See detailed Railway deployment guide](DEPLOYMENT_RAILWAY.md)**

Quick start:
1. Visit [railway.app](https://railway.app) and sign in with GitHub
2. Click "New Project" → "Deploy from GitHub repo"
3. Select this repository
4. Add environment variables (at minimum: `NODE_ENV=production`, `SESSION_SECRET`)
5. Deploy! Your app will be live at `https://your-app.railway.app`

### 🎨 Render (Great Free Tier)

Render provides a generous free tier (with cold starts after 15min inactivity).

**[📖 See detailed Render deployment guide](DEPLOYMENT_RENDER.md)**

Quick start:
1. Visit [render.com](https://render.com) and sign up with GitHub
2. Click "New +" → "Web Service"
3. Connect repository: `jmenichole/DegensAgainstDecency`
4. Configure: Build `npm install`, Start `npm start`
5. Add environment variables and deploy!

### ⚡ Vercel (Alternative Option)

Vercel works great but note that WebSocket support has some limitations.

**[📖 See detailed Vercel deployment guide](DEPLOYMENT_VERCEL.md)**

Quick start:
1. Fork/clone this repository to your GitHub account
2. Visit [Vercel](https://vercel.com) and sign in with GitHub
3. Click "New Project" and import this repository
4. Add environment variables in Vercel Dashboard → Settings → Environment Variables
   - **Required**: `NODE_ENV=production`, `SESSION_SECRET` (generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
   - **Optional**: Discord OAuth credentials, OpenAI API key, etc.
5. Deploy!
6. Update Discord OAuth redirect URI to match your Vercel domain

**Important**: Environment variables must be configured in Vercel Dashboard after initial deployment. See [DEPLOYMENT_VERCEL.md](DEPLOYMENT_VERCEL.md) for complete setup instructions.

### Other Deployment Options

The app also works on:
- **Heroku**: Add Procfile with `web: node server.js`
- **DigitalOcean App Platform**: Configure as Node.js app
- **Traditional VPS**: Use PM2 process manager with nginx reverse proxy

### Environment Variables (All Platforms)

**Required:**
```env
NODE_ENV=production
SESSION_SECRET=<generate-with-crypto-randomBytes>
```

**Optional (Discord features):**
```env
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
DISCORD_CALLBACK_URL=https://yourdomain.com/auth/discord/callback
DISCORD_BOT_TOKEN=your_discord_bot_token
```

**Optional (AI features):**
```env
OPENAI_API_KEY=your_openai_api_key
```

Generate `SESSION_SECRET` with: `npm run generate-secret`

### Important Notes for Production

⚠️ **Discord OAuth is optional** - The app works in guest mode without Discord authentication

⚠️ **WebSocket Support** - Railway and Render have excellent WebSocket support. Vercel has some limitations for WebSockets.

⚠️ **Session Storage** - For production at scale, use Redis for session storage instead of in-memory sessions

## 🔧 Troubleshooting

### Login/Signup Issues

**Problem**: Can't login or signup  
**Solutions**:
1. **Check if Discord OAuth is configured**
   - The app works in guest mode without Discord OAuth
   - Visit `/arena` directly to use guest mode
   - If Discord OAuth fails, check your environment variables

2. **Verify Discord Application Setup**
   - Ensure `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` are set
   - Confirm redirect URI matches your deployment URL
   - Check that your Discord app has the correct OAuth scopes

3. **Session Secret**
   - Make sure `SESSION_SECRET` is set in environment variables
   - Generate a secure secret for production

### API Errors

**Problem**: "Failed to create game" or "Failed to retrieve games"  
**Solutions**:
1. Check browser console for specific error messages
2. Verify the server is running (check Vercel logs or server logs)
3. Ensure all required environment variables are set
4. Try refreshing the page and clearing browser cache

### Connection Issues

**Problem**: "Unable to connect to server" or WebSocket failures  
**Solutions**:
1. **On Vercel**: WebSocket support is limited, consider alternative hosting
2. **Check CORS**: Ensure your deployment allows WebSocket connections
3. **Firewall**: Check if WebSocket ports are blocked
4. **Browser Console**: Look for specific connection errors

### Build/Deployment Issues

**Problem**: Build fails or app doesn't start  
**Solutions**:
1. Run `npm install` to ensure dependencies are installed
2. Run `npm run build` locally to test
3. Check Node.js version (requires 16+)
4. Review Vercel build logs for specific errors
5. Ensure `vercel.json` is present in repository root

### Guest Mode Not Working

**Problem**: Can't access app without Discord login  
**Solutions**:
1. Navigate directly to `/arena` instead of home page
2. Check that `NODE_ENV` is properly set
3. Clear browser cookies and try again
4. Check server logs for authentication errors

## 🤝 Contributing

We welcome contributions! Here's how to get started:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/your-feature-name`
3. **Make your changes**: Ensure code follows the existing style
4. **Test locally**: Run `npm start` and test your changes
5. **Update documentation**: If you add features, update the README
6. **Submit a pull request**: Describe your changes clearly

Please read our [**Contributing Guide**](CONTRIBUTING.md) for detailed guidelines and [**Code of Conduct**](CODE_OF_CONDUCT.md) for community standards.

For security issues, see our [**Security Policy**](SECURITY.md).

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

Copyright (c) 2024 Degens Against Decency. All rights reserved.

## 🎉 Credits

Made by degens for degens ❤️ Special thanks to:
- Discord for OAuth integration
- OpenAI for AI content generation
- Socket.IO for real-time communication
- The original Cards Against Humanity creators

## 🐛 Known Issues & Roadmap

### Known Issues
- WebSocket support on Vercel is limited (use Railway/Heroku for better real-time features)
- Mobile UI could be optimized further
- AI content rate limiting not implemented
- In-memory session storage (use Redis for production scale)
- `passport-discord` package is deprecated (still functional, but consider migrating to maintained alternatives like `discord-strategy` or `passport-discord-auth` in future updates)

### Roadmap
- [ ] User statistics and game history
- [ ] Tournament mode and brackets  
- [ ] Custom card creation and sharing
- [ ] More game types (Charades, Pictionary, etc.)
- [ ] Voice chat integration
- [ ] Advanced AI personality modes
- [ ] Mobile app development

---

**Ready to party? Start your Degens Against Decency arena now!** 🎮🎉
