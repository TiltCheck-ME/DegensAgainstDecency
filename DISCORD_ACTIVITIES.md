# Discord Activities Integration - Analysis and Implementation

## Overview
Discord Activities (formerly known as Embedded App SDK) allow developers to create rich, interactive applications that run directly within Discord voice channels and servers. This document summarizes the decision to implement Discord Activities for the Degens Against Decency platform.

## Current Implementation: Hybrid Approach

We have implemented a **Hybrid Approach** that provides the best of both worlds:

1. **Text-Based Bot**: slash commands and DM-based private cards for accessibility and async play.
2. **Discord Activity**: A rich, embedded experience for users in voice channels via **<https://tiltcheck.me/discord-activity>**.
3. **Web Interface**: A standalone web app for browser-based play.

## Advantages of the Discord Activity Implementation

1. **Unified Experience**: Players stay within Discord entirely.
2. **Voice Integration**: Perfect for groups already in voice channels.
3. **Rich UI**: Full HTML5 canvas rendering and custom animations.
4. **State Synchronization**: Native synchronization via Discord SDK + Socket.io.

## Implementation Details

- **Hosting**: Hosted at **<https://tiltcheck.me>**
- **SDK**: Unified Discord Embedded App SDK v1.0.0
- **Authentication**: Native Discord OAuth2 handshake within the Activity frame.
- **Rich Presence**: Real-time activity updates (playing status, round info, player counts).

## Conclusion

The addition of Discord Activities provides a premium, immersive experience for our most active users while maintaining the accessibility of our text-based bot.

---
**Last Updated**: March 23, 2026  
**Implementation Status**: ✅ COMPLETED  
**Primary URL**: <https://tiltcheck.me/discord-activity>
