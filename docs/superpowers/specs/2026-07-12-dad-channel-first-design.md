# DAD Channel-First Product Design

**Date:** 2026-07-12  
**Status:** Approved (conversational) — awaiting written-spec review  
**Repo:** `TiltCheck-ME/DegensAgainstDecency`  
**Companion decision:** Channel-run bot game for next cycle; Activity parked.

## Summary

Degens Against Decency ships as a **text-channel Discord bot game** (slash commands + embeds + buttons). Discord Activity (`/launch` Entry Point) remains registered only because Discord requires it for Activity-enabled apps — **no product investment** until channel PMF is proven.

This matches a pre-PMF reality: ~33 guild installs, unclear retention. Channel play is the cheapest path to “would you be very disappointed if this disappeared?”

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Primary surface | Channel bot (slash + embeds + buttons) |
| Activity | Parked — preserve Entry Point on deploy; hide/remove primary “Open Activity” CTAs from lobby UX |
| Experiment length | ~2 weeks |
| PMF bar | 5 servers finish ≥1 game; ≥2 start a second game within 7 days; ≥1 reference mod |
| Scope of game types in MVP | **Degens Against Decency only** as default path; Poker / 2 Truths deferred or hidden behind optional type if already wired |
| Ops | Continue shared bot-test channels (errors / analytics / support) |

## PMF framing

- **Retention > installs.** 33 servers is Todd Jackson Level 2 *count* without proven Level 1 *satisfaction*.
- **One surface.** Dual channel+Activity splits attention and ADHD bandwidth.
- **Leading metric:** games completed + second-session rate (ops analytics `game_started` / `game_ended`), not Discovery clicks.
- **Reference customer:** one server owner who would recommend DAD unprompted.

## Target channel UX

```
/create-game (defaults to Degens)
    → lobby embed in channel
    → [Join] [Leave] [Start] buttons (host-only Start)
    → play loop in channel (embeds / buttons / ephemeral picks)
    → victory embed
    → ops: game_started / game_ended
```

**Friction to remove:**
- Typing `/join-game <id>` as the primary join path
- Primary CTA linking to Activity / “Open Retro View”
- Requiring players to remember short UUIDs

**Keep as secondary (optional):**
- `/join-game` / `/list-games` / `/game-status` for power users during transition
- Reaction join only if buttons are insufficient — prefer buttons

## Slash command strategy (MVP)

### Ship / improve

| Command / UI | Role |
|--------------|------|
| `/create-game` | Create channel lobby; default type = Degens; optional max-players |
| Lobby buttons | Join / Leave / Start (host) — primary multiplayer UX |
| `/start-game` | Optional fallback if button fails; or fold into Start button only |
| `/support` | **Add** — bug / suggestion / say hi / donate (mirror Royale); post to `OPS_SUPPORT_CHANNEL_ID` |
| `/help` | **Add** (or ephemeral help on create) — one-screen “how to play in this channel” |

### Keep but demote

| Command | Role |
|---------|------|
| `/join-game` | Fallback join by ID |
| `/list-games` | Fallback discovery |
| `/game-status` | Debug / “am I in a game?” |

### Preserve (non-product)

| Command | Role |
|---------|------|
| `/launch` (Entry Point, type 4) | Discord Activity requirement — never strip on `deploy-commands` bulk PUT |

### Cut / defer

| Item | Why |
|------|-----|
| Activity lobby button as primary CTA | Pulls users off channel PMF path |
| Poker / 2 Truths as equal choices | Dilutes MVP; add after Degen loop retains |
| Full Activity SDK polish | Out of scope until channel bar met |
| Mass “we’re live” DMs to all members | ToS / spam; optional later owner-announce to guild channels only |

## Architecture (channel MVP)

```
deploy-commands.js
  → clear guild overrides
  → PUT [Entry Point] + channel slash set (global)

DiscordBot.js
  → handlers for create / join / start / status / support / help
  → button collectors or interaction handlers for Join/Leave/Start
  → in-memory (or existing) discordGames map — document restart limitations
  → ops.js: install, errors (ping owner), game_started/ended, support inbox
```

**YAGNI:** No new database for v1 if in-memory lobbies already work for short games; document that Fly restart drops lobbies.

## Error handling & ops

- Interaction failures → `OPS_ERROR_CHANNEL_ID` + owner ping (`OPS_ALERT_USER_ID`)
- `/support` → `OPS_SUPPORT_CHANNEL_ID`
- Game start/end → `OPS_ANALYTICS_CHANNEL_ID`
- Missing channel perms → ephemeral “I need Send Messages + Embed Links + Add Reactions (if used)”

## Testing / success criteria

1. Bot-test: create → 2+ joins via **buttons** → start → complete one Degens round path without Activity.
2. Global commands: no duplicates; Entry Point preserved.
3. `/support` lands in support log channel.
4. After 2 weeks: evaluate PMF bar before any Activity work.

## Out of scope

- Redesigning web arena / Netlify Activity URL
- Monetization SKUs for DAD
- Renaming to `/dad` root tree (optional later cleanup)
- Portfolio work on FreeSpins / monorepo

## Rollout order

1. Spec + implementation plan  
2. Command UX: buttons on lobby + `/support` (+ `/help`)  
3. Remove/hide Activity primary CTA from create flow  
4. Deploy commands globally + Fly redeploy  
5. Soft invite 5 friendly servers; measure for 2 weeks  
6. Go/no-go on Activity based on PMF bar  

## Open items resolved by audit

Command audit (2026-07-12) of `deploy-commands.js` + `DiscordBot.js` vs Royale:

### Findings that shape this spec

1. **Five slash commands registered globally**; runtime registration already removed (cleanup shipped).
2. **No button handlers** — `interactionCreate` only handles chat commands; Join/Leave/Start buttons must be added for channel-first UX.
3. **Activity “Open Retro View”** is a primary CTA on every create — cut from lobby for MVP.
4. **Reaction join (🎮) likely broken** (missing `GuildMessageReactions` intent) and documents a stale command name — prefer buttons; do not invest in reactions for MVP.
5. **`/support` and `/help` missing** despite `OPS_SUPPORT_CHANNEL_ID` in env; Royale has the pattern to copy. `ops.js` needs `postSupport` (and `postGameEnded` for PMF).
6. **Poker / 2 Truths** — incomplete/weaker channel loops; hide from MVP create choices (DAD-only default).
7. **In-memory lobbies** — Fly restart drops games; document for v1, no DB yet.
8. **DM-dependent card deals** — high friction if DMs blocked; later improvement: ephemeral/button card picks (out of MVP unless create flow already fails without it).

### Final MVP ship set

| Ship | Demote (keep) | Preserve | Cut/defer |
|------|---------------|----------|-----------|
| `/create-game` (DAD default) + Join/Leave/Start buttons | `/join-game`, `/list-games`, `/start-game`, `/game-status` | `/launch` Entry Point | Activity lobby CTA, reaction join, Poker/2T as equal types |
| `/support`, `/help` | | | Activity SDK polish |

### Deploy readiness (post-implementation)

1. Update `deploy-commands.js` body with `/support` + `/help`  
2. `npm run deploy-commands` (preserve type 4)  
3. Fly redeploy  
4. Smoke: buttons + `/support` → ops channel  
5. Soft launch 5 servers → 2-week PMF bar  

---

## Spec self-review notes

- No TBD placeholders remaining.  
- Consistent with slash cleanup spec (global deploy, no runtime register).  
- Single implementation plan scope: channel MVP UX + support/help + ops gaps — not Activity.  
- Ambiguity resolved: buttons are primary join/start; slash ID commands are fallback only.