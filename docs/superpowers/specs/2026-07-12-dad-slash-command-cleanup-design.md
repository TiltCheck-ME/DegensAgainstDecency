# DAD Slash Command Cleanup Design

**Date:** 2026-07-12  
**Status:** Approved  
**Repo:** `TiltCheck-ME/DegensAgainstDecency`  
**Goal:** Wipe stale/duplicate slash commands and re-register the same five commands **globally only** (cleanup, not a feature redesign).

## Problem

Degens Against Decency currently registers the same commands in two places:

1. `deploy-commands.js` — guild-scoped via `DISCORD_GUILD_ID`
2. `DiscordBot.js` `registerSlashCommands()` — `application.commands.set` at runtime (global)

That dual path causes stale names, guild + global duplicates, and inconsistent state across ~33 installed servers.

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Scope | **Cleanup only** — same features, same command names |
| Registration | **Global only** — clear guild overrides, then PUT global body |
| Runtime registration | **Remove** — deploy script is the single source of truth |
| Feature redesign | **Out of scope** (Activity-first / `/dad` tree deferred) |

## Command catalog (unchanged)

| Command | Options | Behavior |
|---------|---------|----------|
| `/create-game` | `type` (required), `max-players` (3–7), `private` | Create Discord-native lobby |
| `/list-games` | — | List public Discord games |
| `/join-game` | `game-id` (required) | Join by ID |
| `/start-game` | `game-id` (required) | Creator starts game |
| `/game-status` | — | Current game for invoking user |

Handlers in `src/DiscordBot.js` stay as-is for this pass.

## Architecture

```
deploy-commands.js (npm run deploy)
        │
        ├─ optional: for each ID in DISCORD_GUILD_IDS
        │     PUT applicationGuildCommands(app, guild) → []
        │
        └─ PUT applicationCommands(app) → [5 commands]

DiscordBot.js on ready
        └─ do NOT call application.commands.set
           (handlers still bound locally for InteractionCreate)
```

Mirror the Tilt Battle Royale pattern in `rumble2.0/bot/deploy-commands.js`.

## Deploy script changes

**Required env:**

- `DISCORD_BOT_TOKEN`
- `DISCORD_CLIENT_ID`

**Optional env:**

- `DISCORD_GUILD_IDS` — comma-separated guild IDs whose **guild-specific** command lists are cleared before global register (prevents global+guild duplicates). Prefer this over single `DISCORD_GUILD_ID`.
- Keep accepting `DISCORD_GUILD_ID` as a one-ID fallback that maps into the same clear list.

**Steps:**

1. Build the five command JSON bodies (same definitions as today).
2. For each guild ID in the clear list, `PUT` empty array to guild commands.
3. `PUT` the five commands to global application commands.
4. Exit non-zero on failure; log counts on success.

**package.json:** ensure `deploy` / `deploy-commands` script points at this file.

## Runtime changes (`DiscordBot.js`)

1. Keep `setupCommands()` (local handler map) unchanged.
2. Remove or no-op `registerSlashCommands()` so ready no longer mutates Discord’s command list.
3. On ready, log a one-line reminder: commands are managed by `npm run deploy-commands`.
4. Leave ops logging (`initOps`, etc.) untouched.

## Rollout

1. Merge code (deploy script + remove runtime register).
2. Run deploy against **production** token/client ID (from Fly secrets or local `.env` with prod values).
3. Spot-check bot-test guild: only the five commands, no duplicates.
4. Spot-check one of the 33 production guilds after propagation (usually minutes; Discord allows up to ~1 hour for globals).
5. Redeploy Fly app so running code no longer re-registers on boot.

## Error handling

- Missing token/client ID → fail fast with clear message.
- Guild clear failure → warn and continue (guild may not have overrides).
- Global PUT failure → abort (do not leave empty globals without retry).

## Out of scope

- Renaming commands or collapsing into `/dad`
- Activity launch commands
- Changing game types or lobby UX
- Mass “we’re live” announcements to guilds
- User-install vs guild-install portal settings (guild install remains primary)

## Success criteria

1. Global application command list contains exactly the five commands above (plus no unexpected leftovers from this bot).
2. Known test guilds have **empty** guild-command overrides.
3. Bot restart does **not** change Discord’s registered commands.
4. Existing create/join/start/list/status flows still work in bot-test.

## Testing

- Local: `npm run deploy-commands` against bot-test; verify in Discord client (leave/rejoin channel if cache stale).
- Production: same script with prod credentials; verify one live server.
- Regression: create → join → start a short game in bot-test.
