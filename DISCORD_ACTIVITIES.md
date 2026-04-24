# Discord Activities Integration - Analysis and Decision

## Overview
Discord Activities (formerly known as Embedded App SDK) allows developers to create rich, interactive applications that run directly within Discord voice channels and servers. This document analyzes whether Discord Activities would benefit the Degens Against Decency game implementation.

## What are Discord Activities?

Discord Activities are embedded applications that:
- Run in an iframe within Discord voice channels
- Support multiplayer interactions with synchronized state
- Provide a rich canvas for custom UI/UX
- Work across desktop and mobile Discord clients
- Require users to be in a voice channel to participate

## Current Implementation

Our current implementation uses:
1. **Slash Commands** - For game creation and management
2. **Text Channel Messages** - For public game announcements and actions
3. **Direct Messages (DMs)** - For private information like card hands
4. **Message Reactions** - For voting and interactions (2 Truths and a Lie)
5. **Web Interface** - Standalone web app accessible via browser

## Discord Activities vs Current Approach

### Advantages of Discord Activities

1. **Unified Experience**
   - Players stay within Discord entirely
   - No need to switch between Discord and web browser
   - Voice chat naturally integrated

2. **Better for Voice Channel Gaming**
   - Perfect for groups already in voice
   - Can see who's participating via voice indicators
   - Ideal for social party games

3. **Richer UI Possibilities**
   - Full HTML5/Canvas rendering
   - Custom animations and transitions
   - More polished visual experience

4. **State Synchronization**
   - Built-in state sync between participants
   - Handles network latency better
   - Reduces need for custom WebSocket implementation

### Disadvantages of Discord Activities

1. **Development Complexity**
   - Requires separate Activity SDK integration
   - More complex setup and testing
   - Additional authentication flow

2. **Deployment Constraints**
   - Must be hosted on HTTPS with specific requirements
   - Requires Discord app approval for public distribution
   - Additional configuration in Discord Developer Portal

3. **User Requirements**
   - Players must be in a voice channel (even if not speaking)
   - Mobile support may be limited
   - Requires Discord desktop or mobile app

4. **Limited Accessibility**
   - Cannot be played in text-only channels
   - Not suitable for async gameplay
   - Excludes users who prefer text-based interaction

## Decision: Hybrid Approach

### Recommendation
**Maintain current text-based Discord bot implementation while keeping Discord Activities as a future enhancement option.**

### Rationale

1. **Current Implementation Works Well**
   - Text-based commands work in any channel
   - DM-based private cards maintain game integrity
   - Supports both sync and async play styles
   - Lower barrier to entry

2. **Broader Accessibility**
   - Works for users without voice setup
   - Can be played in text channels
   - No requirement for voice channel participation
   - Better for public servers

3. **Faster Development**
   - Text-based bot is already implemented
   - No additional SDK integration needed
   - Easier to test and debug
   - Quicker to iterate

4. **Complementary Web Interface**
   - Web interface provides rich UI when desired
   - Players can choose text or web experience
   - Best of both worlds approach

### Future Enhancement Path

Discord Activities could be added later as an **optional premium experience** for:
- Private gaming groups already in voice
- Users who want the most immersive experience
- Special events or tournaments

Implementation priority: **LOW** (Post-v1.0)

## Current Discord Bot Features

✅ **Fully Implemented:**
- Slash commands for game management
- 2 Truths and a Lie with full Discord gameplay
- Degens Against Decency with DM-based private cards
- Poker with DM-based private hands
- Public channel for game actions and announcements
- Reaction-based interactions
- Timeout handling and game flow management

✅ **Card Privacy:**
- Cards sent via DMs (invisible to other players)
- Public channel shows only game state and actions
- Maintains game integrity without Activities SDK

## Conclusion

The current text-based Discord bot implementation with DM-based private card distribution provides:
- Full game functionality
- Proper privacy for hidden information
- Accessibility for all users
- Simpler maintenance and deployment

Discord Activities remain a viable option for future enhancement but are **not necessary** for complete and functional Discord gameplay.

---

**Last Updated:** November 5, 2024  
**Decision By:** Development Team  
**Status:** APPROVED - Current Implementation Sufficient

---

## 2026 Update: Live Trivia Discord Activity (Implemented)

The repository now includes a production-ready **Live Trivia Discord Activity** at:

- `GET /trivia-activity`
- Static assets under `public/trivia-activity/`

### Implemented capabilities

- HQ-style elimination rounds (`trivia` game type)
- Server-driven round lifecycle via Socket.IO:
  - `trivia:start`
  - `trivia:answer`
  - `trivia:question`
  - `trivia:answer-locked`
  - `trivia:reveal`
  - `trivia:leaderboard`
  - `trivia:game-over`
- 100-question local fallback bank in `src/trivia-questions.json`
- `/trivia` Discord slash command with category/round/time options and activity launch link

### Environment variables

- `DISCORD_ACTIVITY_URL`
- `TRIVIA_TIME_PER_QUESTION`
- `TRIVIA_MAX_ROUNDS`
