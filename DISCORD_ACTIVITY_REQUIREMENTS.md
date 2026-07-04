# Discord Activity Requirements

This document lists all requirements needed to run Degens Against Decency as a Discord Activity (embedded app within Discord).

# Discord Activity Implementation

## Current Status

**✅ IMPLEMENTED: Discord Activities are now fully supported.**

The application now supports the Discord Embedded App SDK (formerly Activity SDK), allowing players to launch and play directly within Discord voice channels as a native Discord Activity.

This document serves as the guide for the existing Discord Activity implementation.

---

## What are Discord Activities?

Discord Activities (formerly Embedded App SDK) allow developers to create interactive applications that run directly within Discord voice channels. They provide:

- Rich HTML5 canvas/iframe embedded in Discord
- Synchronized state across participants
- Integration with Discord voice channels
- Native Discord UI integration
- Cross-platform support (Desktop and Mobile Discord apps)

**Key Limitation:** Users must be in a voice channel to participate in Discord Activities.

---

## Prerequisites (If Implementing Discord Activities)

### System Requirements
All requirements from [WEBSITE_REQUIREMENTS.md](WEBSITE_REQUIREMENTS.md) plus:

- **Node.js**: Version 18.0.0+ (Discord Activities SDK requirement)
- **NPM**: Version 8.0.0+
- **Modern Browser**: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
- **HTTPS**: Mandatory (no exceptions for Discord Activities)

### Discord-Specific Requirements

#### 1. Discord Application (Enhanced)
Everything from website Discord OAuth setup, PLUS:

**Additional Discord App Configuration:**
- Activity URL endpoint configured
- Activity assets (icons, banners) uploaded
- Activity metadata configured
- OAuth2 scopes for Activities enabled

**Required OAuth2 Scopes:**
- `identify` - Get user information
- `guilds` - Access user's servers
- `rpc.activities.write` - Enable Activity functionality
- `applications.commands` - Slash commands (already have this)

**Activity-Specific Settings:**
- Activity Name (public-facing name in Discord)
- Activity Description
- Activity URL (HTTPS endpoint hosting your Activity)
- Activity Icon (512x512 PNG)
- Activity Splash Image (1920x1080 PNG)

#### 2. Discord Developer Portal Setup
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Select your application
3. Go to **Activities** section (new tab)
4. Click **"Enable Activity"**
5. Configure Activity settings:
   - Set Activity URL: `https://tiltcheck.me/discord-activity`
   - Upload required assets
   - Set supported platforms (Desktop, Mobile)
   - Configure Activity type (Game, Entertainment, etc.)
6. Submit for review (required for public distribution)

---

## Required Dependencies

### Additional NPM Packages
Beyond the packages listed in [WEBSITE_REQUIREMENTS.md](WEBSITE_REQUIREMENTS.md):

```json
{
  "dependencies": {
    "@discord/embedded-app-sdk": "^1.0.0",
    "discord-api-types": "^0.37.0"
  }
}
```

**Package Purposes:**
- `@discord/embedded-app-sdk` - Official Discord Activity SDK
- `discord-api-types` - TypeScript types for Discord API

### Frontend Requirements

**Additional Browser APIs Used:**
- WebGL or Canvas API (for rich graphics)
- Web Audio API (optional, for sound effects)
- IndexedDB (for local state storage)
- Service Workers (optional, for offline support)

---

## Architecture Requirements

### Hosting Requirements

**Mandatory:**
- **HTTPS only** - HTTP not supported for Activities
- **Valid SSL certificate** - Self-signed certificates will NOT work
- **Public domain** - Must be accessible from internet (no localhost)
- **CORS headers** - Properly configured for Discord domains
- **CSP headers** - Content Security Policy allowing Discord frames

**Recommended Platforms:**
- **Railway** - Best WebSocket support, Activity-friendly
- **Heroku** - Good support, proven track record
- **DigitalOcean** - Full control, reliable
- **AWS/Google Cloud** - Enterprise scale
- **NOT Vercel** - WebSocket limitations may cause issues

### URL Structure

Discord Activities require specific URL endpoints:

```
https://tiltcheck.me/
├── /discord-activity          # Main Activity entry point
├── /discord-activity/lobby    # Game lobby within Activity
├── /discord-activity/game/:id # Game interface within Activity
└── /api/discord-activity/*    # Activity-specific API endpoints
```

### Security Requirements

**Enhanced Security (Beyond Website):**
- Activity requests must be validated from Discord
- Instance tokens must be verified
- User authentication via Discord RPC
- Encrypted communication with Discord SDK
- Rate limiting per Activity instance
- DDoS protection

---

## Required Configuration

### Environment Variables

All variables from [WEBSITE_REQUIREMENTS.md](WEBSITE_REQUIREMENTS.md) PLUS:

```env
# Discord Activity Configuration (NEW)
DISCORD_ACTIVITY_ENABLED=true
DISCORD_ACTIVITY_CLIENT_ID=your_discord_client_id
DISCORD_ACTIVITY_CLIENT_SECRET=your_discord_client_secret
DISCORD_ACTIVITY_PUBLIC_KEY=your_discord_public_key
DISCORD_ACTIVITY_URL=https://tiltcheck.me/discord-activity

# Activity Bot Settings (if different from main bot)
DISCORD_ACTIVITY_BOT_TOKEN=your_activity_bot_token

# Activity-Specific Features
DISCORD_ACTIVITY_VOICE_REQUIRED=true
DISCORD_ACTIVITY_MAX_PARTICIPANTS=8
DISCORD_ACTIVITY_MIN_PARTICIPANTS=3
```

### Discord Manifest

Create `discord-activity-manifest.json`:

```json
{
  "name": "Degens Against Decency",
  "description": "Multiplayer party game with AI-generated cards",
  "type": "GAME",
  "primary_sku_id": "your_sku_id",
  "slug": "degens-against-decency",
  "cover_image": "activity_cover.png",
  "url": "https://tiltcheck.me/discord-activity",
  "supported_platforms": ["desktop", "mobile"],
  "activity_orientation": "landscape",
  "max_participants": 8,
  "features": [
    "multiplayer",
    "voice_optional",
    "text_chat"
  ]
}
```

---

## Implementation Requirements

### Frontend Changes Needed

#### 1. Discord SDK Integration
```javascript
// Initialize Discord SDK
import { DiscordSDK } from "@discord/embedded-app-sdk";

const discordSdk = new DiscordSDK(process.env.DISCORD_CLIENT_ID);

// Authenticate user
await discordSdk.ready();
const { code } = await discordSdk.commands.authorize({
  client_id: process.env.DISCORD_CLIENT_ID,
  response_type: "code",
  state: "",
  prompt: "none",
  scope: ["identify", "guilds", "rpc.activities.write"]
});

// Exchange code for access token
const response = await fetch('/api/discord-activity/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code })
});
```

#### 2. Activity UI Adaptation
- Redesign UI for Discord's embedded iframe constraints
- Optimize for Activity canvas size (typically 1280x720 or responsive)
- Remove Discord OAuth login flow (handled by SDK)
- Add voice channel participant indicators
- Implement Discord's native UI patterns

#### 3. State Synchronization
```javascript
// Sync game state with Discord Activity participants
discordSdk.commands.setActivity({
  activity: {
    type: 5, // PLAYING
    details: "Playing Degens Against Decency",
    state: "In Game",
    party: {
      id: gameId,
      size: [currentPlayers, maxPlayers]
    }
  }
});
```

### Backend Changes Needed

#### 1. Activity Authentication Endpoint
```javascript
// POST /api/discord-activity/token
// Exchange Activity authorization code for access token
router.post('/discord-activity/token', async (req, res) => {
  const { code } = req.body;
  // Exchange with Discord API
  // Validate and return access token
});
```

#### 2. Activity Instance Management
- Track Activity instances (one per voice channel)
- Manage participant join/leave events
- Synchronize state across Activity instance
- Handle Activity lifecycle (create, update, destroy)

#### 3. Activity-Specific WebSocket Events
```javascript
// Additional WebSocket events for Activity
socket.on('activity-join', (data) => {
  // Handle user joining from Activity
});

socket.on('activity-participant-update', (data) => {
  // Handle participant list changes in voice channel
});

socket.on('activity-instance-create', (data) => {
  // Create new Activity instance for voice channel
});
```

---

## Discord Activity Approval Process

### Submission Requirements

To make your Activity publicly available, Discord requires:

1. **Complete Application Review**
   - Working Activity deployed and accessible
   - No bugs or critical issues
   - Follows Discord Community Guidelines
   - Follows Discord Developer Terms of Service

2. **Content Review**
   - All content appropriate for Discord's audience
   - No prohibited content (gambling, excessive violence, etc.)
   - Age rating assigned (Degens Against Decency likely 13+ or 17+)
   - Content warnings if applicable

3. **Technical Requirements**
   - HTTPS with valid certificate
   - Fast loading time (< 3 seconds)
   - Stable WebSocket connections
   - No memory leaks or performance issues
   - Mobile responsive (if supporting mobile)

4. **Documentation**
   - Privacy policy
   - Terms of service
   - How to use the Activity
   - Support contact information

### Approval Timeline
- **Initial Review**: 2-4 weeks
- **Revisions**: 1-2 weeks per revision
- **Final Approval**: 1 week

### Public Distribution Requirements
Once approved:
- Activity appears in Discord's Activity Launcher
- Users can start Activity from any voice channel
- Activity must maintain performance standards
- Regular updates may trigger re-review

---

## Testing Requirements

### Development Testing

**Discord Developer Mode:**
1. Enable Developer Mode in Discord settings
2. Use test Activity URL during development
3. Test with small group of users
4. Cannot test without valid HTTPS domain

**Testing Environment:**
```env
NODE_ENV=development
DISCORD_ACTIVITY_ENABLED=true
DISCORD_ACTIVITY_URL=https://dev.yourdomain.com/discord-activity
```

### Beta Testing

Before public release:
- Limited access beta via Discord Developer Portal
- Test with 10-50 users across different servers
- Test on both Desktop and Mobile Discord
- Monitor performance metrics
- Collect user feedback

### Required Test Cases
- [ ] Activity launches from voice channel
- [ ] Users authenticate via Discord SDK
- [ ] Game state syncs across participants
- [ ] Voice channel join/leave handled correctly
- [ ] Activity closes properly when done
- [ ] Mobile interface works correctly
- [ ] Performance acceptable with max participants
- [ ] No memory leaks during extended play
- [ ] Error handling for network issues
- [ ] Graceful degradation if WebSocket fails

---

## Performance Requirements

### Discord Activity Specifications

**Technical Limits:**
- **Max Participants**: 25 (Discord limit for Activities)
- **Recommended Max**: 8-10 for game quality
- **Canvas Size**: Responsive, typical 1280x720 to 1920x1080
- **Bundle Size**: < 5MB recommended
- **Initial Load**: < 3 seconds
- **Frame Rate**: 30 FPS minimum, 60 FPS recommended

**Network Requirements:**
- WebSocket latency: < 100ms ideal
- State sync frequency: 10-30 updates per second
- Bandwidth: < 1 Mbps per user

### Optimization Requirements
- Lazy load game assets
- Minimize JavaScript bundle size
- Use efficient rendering (Canvas over DOM when possible)
- Implement frame rate throttling
- Compress images and assets
- Cache static resources
- Preload critical resources

---

## Cost Considerations

### Development Costs
**Additional Development Time:**
- Frontend Activity integration: 40-60 hours
- Backend Activity endpoints: 20-30 hours
- UI/UX redesign for Activity: 30-40 hours
- Testing and debugging: 40-60 hours
- **Total Estimate**: 130-190 hours

### Hosting Costs
**Enhanced Requirements:**
- Better hosting needed (Railway/Heroku instead of Vercel free tier)
- Estimated: $15-50/month for small scale
- Scales with number of concurrent Activities

### Maintenance Costs
- Discord SDK updates and API changes
- Activity re-approval for major updates
- Enhanced monitoring and logging
- Additional customer support

---

## Migration Path (From Current Implementation)

If deciding to implement Discord Activities:

### Phase 1: Foundation (Weeks 1-2)
- [ ] Install Discord Activity SDK
- [ ] Set up HTTPS hosting environment
- [ ] Configure Discord Application for Activities
- [ ] Implement basic Activity authentication
- [ ] Create Activity entry point

### Phase 2: Core Integration (Weeks 3-5)
- [ ] Adapt frontend UI for Activity canvas
- [ ] Implement Activity state synchronization
- [ ] Integrate with existing game engine
- [ ] Handle Activity lifecycle events
- [ ] Test basic game flow in Activity

### Phase 3: Polish & Testing (Weeks 6-8)
- [ ] Optimize performance for Activity constraints
- [ ] Implement mobile-responsive design
- [ ] Comprehensive testing (desktop and mobile)
- [ ] Bug fixes and optimization
- [ ] Prepare submission documentation

### Phase 4: Approval & Launch (Weeks 9-12)
- [ ] Submit Activity for Discord review
- [ ] Address review feedback
- [ ] Beta testing with select users
- [ ] Public launch after approval

**Estimated Total Time**: 3-4 months for full implementation

---

## Alternative: Hybrid Approach

### Recommended Strategy

Instead of full Discord Activity implementation, consider:

1. **Keep Current Discord Bot** (Text-based with slash commands)
   - Works in any channel
   - Lower complexity
   - Broader accessibility
   - Already implemented

2. **Keep Standalone Web App** (For rich UI experience)
   - Full control over features
   - No Discord limitations
   - Better for new users
   - Already implemented

3. **Add Discord Activity Later** (Optional premium feature)
   - Post-v1.0 enhancement
   - For users who want embedded experience
   - Voice channel focused gameplay
   - Requires significant resources

### Benefits of Hybrid Approach
✅ Faster time to market
✅ Lower development cost
✅ Broader user reach
✅ Easier maintenance
✅ Multiple access points
✅ Better user choice

---

## Why Discord Activities Are NOT Currently Implemented

As detailed in [DISCORD_ACTIVITIES.md](DISCORD_ACTIVITIES.md):

### Disadvantages That Led to Decision
1. **User Limitations**: Requires voice channel participation
2. **Development Complexity**: Significantly more complex than current implementation
3. **Approval Process**: Requires Discord review and ongoing compliance
4. **Accessibility**: Excludes text-only and async players
5. **Deployment Constraints**: Stricter hosting requirements
6. **Maintenance Burden**: Additional SDK updates and API changes

### Current Implementation Advantages
1. **Works Everywhere**: Any Discord channel, any time
2. **Text-Based**: DM-based private cards maintain game integrity
3. **Async Support**: Players can take turns on their schedule
4. **Web Option**: Rich UI available via website
5. **Simpler**: Easier to develop, test, and maintain

---

## Conclusion

**Discord Activities are a future enhancement option, not a current requirement.**

The current implementation provides:
- ✅ Full Discord integration via bot and slash commands
- ✅ Rich UI experience via standalone website
- ✅ Proper game functionality and privacy
- ✅ Broader accessibility
- ✅ Easier deployment and maintenance

**If implementing Discord Activities in the future:**
- Budget 3-4 months development time
- Prepare for Discord approval process
- Ensure adequate hosting infrastructure
- Plan for ongoing maintenance

**For now, focus on:**
- Website deployment (see [WEBSITE_REQUIREMENTS.md](WEBSITE_REQUIREMENTS.md))
- Discord bot features (already implemented)
- User acquisition and feedback
- Feature improvements based on usage

---

## Support and Resources

### Discord Activity Resources
- [Discord Activities Documentation](https://discord.com/developers/docs/activities/overview)
- [Discord Embedded App SDK](https://github.com/discord/embedded-app-sdk)
- [Discord Developer Portal](https://discord.com/developers/applications)
- [Discord Developer Community](https://discord.gg/discord-developers)

### Project Resources
- [Website Requirements](WEBSITE_REQUIREMENTS.md) - Current deployment guide
- [Discord Activities Analysis](DISCORD_ACTIVITIES.md) - Decision rationale
- [Integration Guide](INTEGRATIONS.md) - Optional integrations
- [Main README](README.md) - Project overview

---

**Last Updated:** November 7, 2024  
**Status:** NOT IMPLEMENTED (Future Enhancement)  
**Priority:** LOW (Post-v1.0)
