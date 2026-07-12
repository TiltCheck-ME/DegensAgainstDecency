# DAD Slash Command Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wipe stale/duplicate Degens Against Decency slash commands and re-register the same five commands globally only, with deploy-time registration as the single source of truth.

**Architecture:** Rewrite `deploy-commands.js` to clear optional guild overrides then `PUT` exactly five global commands. Stop `DiscordBot.js` from calling `application.commands.set` on ready. Handlers stay unchanged.

**Tech Stack:** Node.js, discord.js v14 REST (`Routes.applicationCommands` / `applicationGuildCommands`), dotenv, npm scripts on Fly app `degensagainstdecency`.

**Spec:** `docs/superpowers/specs/2026-07-12-dad-slash-command-cleanup-design.md`

**Working directory:** `DegensAgainstDecency/` (repo root for `TiltCheck-ME/DegensAgainstDecency`)

---

## File map

| File | Responsibility |
|------|----------------|
| `deploy-commands.js` | Single source of truth: clear guild overrides + register 5 global commands |
| `src/DiscordBot.js` | Local handler map only; no Discord command registration on ready |
| `package.json` | Keep `deploy-commands`; add alias `deploy` |
| `.env.example` | Document `DISCORD_CLIENT_ID`, `DISCORD_GUILD_IDS` |
| `docs/superpowers/specs/2026-07-12-dad-slash-command-cleanup-design.md` | Mark status Approved |

**YAGNI:** Do not extract a shared `commandDefs.js` in this pass. Keep builders in `deploy-commands.js` and leave `setupCommands()` in `DiscordBot.js` with the same five names/options.

---

### Task 1: Mark spec approved + document env

**Files:**
- Modify: `docs/superpowers/specs/2026-07-12-dad-slash-command-cleanup-design.md` (header status line)
- Modify: `.env.example`

- [ ] **Step 1: Update spec status**

Change the header line from:

```markdown
**Status:** Approved (conversational) — awaiting spec file review
```

to:

```markdown
**Status:** Approved
```

- [ ] **Step 2: Update `.env.example` Discord bot section**

Replace the guild-scoped block around `DISCORD_BOT_TOKEN` / `DISCORD_GUILD_ID` with:

```env
# Discord Bot Configuration (REQUIRED for Discord bot to come online)
DISCORD_BOT_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_discord_application_id_here

# Optional: comma-separated guild IDs — guild command overrides cleared on deploy
# (prevents global + guild duplicate slash commands). Also accepts single DISCORD_GUILD_ID.
# DISCORD_GUILD_IDS=1358552411718942913
# DISCORD_GUILD_ID=1358552411718942913

# Run after command changes: npm run deploy-commands
```

Keep other `.env.example` sections unchanged.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-07-12-dad-slash-command-cleanup-design.md .env.example
git commit -m "docs: approve DAD slash cleanup spec and document deploy env"
```

---

### Task 2: Rewrite `deploy-commands.js` (global-only)

**Files:**
- Modify: `deploy-commands.js` (full replace)
- Modify: `package.json` (scripts)

- [ ] **Step 1: Replace `deploy-commands.js` with this complete file**

```javascript
/**
 * Register slash commands globally for Degens Against Decency.
 * Clears guild overrides first so commands never appear twice.
 * Run: npm run deploy-commands
 */

require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

function requireEnv(keys) {
  const missing = keys.filter((k) => !process.env[k]?.trim());
  if (missing.length) {
    console.error(`Missing required env: ${missing.join(', ')}`);
    process.exit(1);
  }
}

function parseGuildIds() {
  const multi = process.env.DISCORD_GUILD_IDS || '';
  const single = process.env.DISCORD_GUILD_ID || '';
  const raw = multi.trim() ? multi : single;
  if (!raw.trim()) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function buildCommands() {
  return [
    new SlashCommandBuilder()
      .setName('create-game')
      .setDescription('Create a new Discord game')
      .addStringOption((opt) =>
        opt.setName('type').setDescription('Game type').setRequired(true).addChoices(
          { name: 'Degens Against Decency', value: 'degens-against-decency' },
          { name: '2 Truths and a Lie', value: '2-truths-and-a-lie' },
          { name: 'Poker', value: 'poker' },
        ),
      )
      .addIntegerOption((opt) =>
        opt.setName('max-players').setDescription('Maximum players (3-7)').setMinValue(3).setMaxValue(7),
      )
      .addBooleanOption((opt) =>
        opt.setName('private').setDescription('Make game private (default: false)'),
      ),
    new SlashCommandBuilder()
      .setName('list-games')
      .setDescription('List available public Discord games'),
    new SlashCommandBuilder()
      .setName('join-game')
      .setDescription('Join a game by ID')
      .addStringOption((opt) =>
        opt.setName('game-id').setDescription('Game ID to join').setRequired(true),
      ),
    new SlashCommandBuilder()
      .setName('start-game')
      .setDescription('Start a game')
      .addStringOption((opt) =>
        opt.setName('game-id').setDescription('Game ID to start').setRequired(true),
      ),
    new SlashCommandBuilder()
      .setName('game-status')
      .setDescription('Check your current game status'),
  ].map((cmd) => cmd.toJSON());
}

requireEnv(['DISCORD_BOT_TOKEN', 'DISCORD_CLIENT_ID']);

const token = process.env.DISCORD_BOT_TOKEN.trim();
const clientId = process.env.DISCORD_CLIENT_ID.trim();
const guildIds = parseGuildIds();
const commands = buildCommands();
const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    for (const guildId of guildIds) {
      try {
        console.log(`Clearing guild-specific commands on ${guildId}...`);
        await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
        console.log(`✅ Guild ${guildId} cleared — will use global commands only.`);
      } catch (err) {
        console.warn(`⚠️  Guild ${guildId} skipped: ${err.message}`);
      }
    }

    console.log(`Registering ${commands.length} commands globally...`);
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log('✅ Global commands registered:');
    for (const cmd of commands) {
      console.log(`   /${cmd.name}`);
    }
    console.log('Discord may take up to ~1 hour to propagate globally (usually minutes).');
    console.log('Restart Discord (Ctrl+R) if the client still shows old commands.');
  } catch (err) {
    console.error('❌ Failed:', err);
    process.exit(1);
  }
})();
```

- [ ] **Step 2: Add `deploy` script alias in `package.json`**

In `"scripts"`, set:

```json
"deploy": "node deploy-commands.js",
"deploy-commands": "node deploy-commands.js",
```

- [ ] **Step 3: Smoke-check the script file exists**

Run:

```bash
node -e "require('fs').accessSync('deploy-commands.js'); console.log('ok')"
```

Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add deploy-commands.js package.json
git commit -m "fix: register DAD slash commands globally only"
```

---

### Task 3: Stop runtime command registration

**Files:**
- Modify: `src/DiscordBot.js`

- [ ] **Step 1: Change the ready handler**

Find in `setupEventHandlers()`:

```javascript
    this.client.once('ready', () => {
      console.log(`🎮 Discord Bot ready! Logged in as ${this.client.user.tag}`);
      this.isReady = true;
      initOps(this.client, { botId: 'degens-against-decency' });
      this.registerSlashCommands();
    });
```

Replace with:

```javascript
    this.client.once('ready', () => {
      console.log(`🎮 Discord Bot ready! Logged in as ${this.client.user.tag}`);
      this.isReady = true;
      initOps(this.client, { botId: 'degens-against-decency' });
      console.log('Slash commands are managed by: npm run deploy-commands');
    });
```

- [ ] **Step 2: Delete `registerSlashCommands` method**

Remove the entire `async registerSlashCommands() { ... }` method from `src/DiscordBot.js`.

Confirm no callers remain:

```bash
rg "registerSlashCommands" src/
```

Expected: no matches.

- [ ] **Step 3: Commit**

```bash
git add src/DiscordBot.js
git commit -m "fix: stop DAD bot from registering slash commands at runtime"
```

---

### Task 4: Production deploy of commands + Fly app

**Files:** none (ops)

- [ ] **Step 1: Ensure local `.env` has production bot credentials**

Required:

```env
DISCORD_BOT_TOKEN=<prod token from Fly secret / Developer Portal>
DISCORD_CLIENT_ID=<DAD application ID>
DISCORD_GUILD_IDS=1358552411718942913
```

Do **not** commit `.env`.

Verify Client ID matches the DAD Discord application (not Royale / JustTheBuilder).

- [ ] **Step 2: Register commands against Discord**

From repo root:

```bash
npm run deploy-commands
```

Expected stdout includes:

```
✅ Global commands registered:
   /create-game
   /list-games
   /join-game
   /start-game
   /game-status
```

If `DISCORD_CLIENT_ID` missing: add it from Developer Portal → General Information → Application ID, then retry.

- [ ] **Step 3: Push commits and deploy Fly**

```bash
git push origin HEAD
flyctl deploy -a degensagainstdecency --ha=false
```

Expected: deploy succeeds; health shows discord bot online:

```bash
curl -s https://degensagainstdecency.fly.dev/api/health
```

Expected JSON includes `"discordBot":true`.

- [ ] **Step 4: Verify in Discord (manual)**

1. Open bot-test guild (`1358552411718942913`).
2. Type `/` — confirm only the five DAD commands (no duplicates like two `/create-game`).
3. If stale: Discord Ctrl+R / wait a few minutes.
4. Smoke: `/create-game` with type Degens Against Decency in a test channel.

- [ ] **Step 5: Optional README note**

If README still says guild-only deploy, update that sentence to:

```markdown
Slash commands: `npm run deploy-commands` (global). Optional `DISCORD_GUILD_IDS` clears guild overrides.
```

Then:

```bash
git add README.md
git commit -m "docs: point DAD command deploy at global npm run deploy-commands"
git push origin HEAD
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Same five command names/options | Task 2 `buildCommands()` |
| Global-only registration | Task 2 global `PUT` |
| Clear guild overrides via `DISCORD_GUILD_IDS` / `DISCORD_GUILD_ID` | Task 2 `parseGuildIds` + clear loop |
| Remove runtime `application.commands.set` | Task 3 |
| Ready log points at deploy script | Task 3 |
| `npm run deploy-commands` / package script | Task 2 |
| Production run + Fly redeploy | Task 4 |
| Handlers unchanged | Explicit non-change in Task 3 |
| Error handling (fail on missing env / global PUT) | Task 2 |

## Out of scope (do not implement)

- `/dad` command tree, Activity launch, renames, mass guild announcements
