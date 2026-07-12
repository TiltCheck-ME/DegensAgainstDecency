# DAD Channel-First MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Degens Against Decency playable as a channel-first bot (button lobby + `/support` + `/help`), hide Activity/Poker/2T from the primary path, and close ops gaps for a 2-week PMF experiment.

**Architecture:** Extend `DiscordBot.js` with button `customId` routing and new slash handlers; extend `ops.js` with `postSupport` / `postGameEnded`; update `deploy-commands.js` to register `/support` and `/help` while preserving Entry Point type 4. Keep fallback ID commands. No Activity SDK work. No new DB (document in-memory restart limit).

**Tech Stack:** Node.js, discord.js v14, existing Fly app `degensagainstdecency`, shared OPS_* channels.

**Spec:** `docs/superpowers/specs/2026-07-12-dad-channel-first-design.md`

**Working directory:** `DegensAgainstDecency/` (TiltCheck-ME/DegensAgainstDecency)

**Reference:** Royale lobby buttons + `/support` in `rumble2.0/bot/bot.js` and `rumble2.0/bot/ops.js` (copy patterns, do not import across repos).

---

## File map

| File | Responsibility |
|------|----------------|
| `src/ops.js` | Add `postSupport`, `postGameEnded`; export them |
| `src/DiscordBot.js` | Lobby buttons, button handlers, create-game UX, support/help handlers, DAD-default type |
| `deploy-commands.js` | Register `/support`, `/help`; keep existing + Entry Point preserve |
| `README.md` | Document Fly restart limitation + channel how-to |

---

### Task 1: Ops — `postSupport` + `postGameEnded`

**Files:**
- Modify: `src/ops.js`

- [ ] **Step 1: Add `postSupport` to `src/ops.js`**

After `postAnalytics`, add (footer bot id via `botId()`):

```javascript
function postSupport({ type, user, guild, details }) {
  const typeLabel = {
    bug_report: '🐛 Bug report',
    suggestion: '💡 Suggestion',
    say_hi: '👋 Say hi',
    donate: '☕ Donate',
  }[type] || type;

  postOps('support', () => ({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.support)
        .setTitle(typeLabel)
        .setDescription(details ? truncate(details, 1500) : '_No details_')
        .addFields(
          { name: 'User', value: `${user?.tag || '?'} (<@${user?.id}>)`, inline: true },
          { name: 'Guild', value: guild ? `${guild.name}\n\`${guild.id}\`` : 'DM / unknown', inline: true },
        )
        .setFooter({ text: `${botId()} · /support` })
        .setTimestamp(),
    ],
  }));
}
```

- [ ] **Step 2: Add `postGameEnded`**

```javascript
function postGameEnded({ guildId, channelId, gameType, winnerTag, players }) {
  postAnalytics({
    event: 'game_ended',
    title: '🏆 Game ended',
    fields: [
      { name: 'Type', value: gameType || '?', inline: true },
      { name: 'Winner', value: winnerTag || '?', inline: true },
      { name: 'Players', value: String(players ?? '?'), inline: true },
      { name: 'Guild', value: `\`${guildId || '?'}\``, inline: true },
      channelId ? { name: 'Channel', value: `<#${channelId}>`, inline: true } : null,
    ],
  });
}
```

- [ ] **Step 3: Export both from `module.exports`**

Include `postSupport` and `postGameEnded` alongside existing exports.

- [ ] **Step 4: Commit**

```bash
git add src/ops.js
git commit -m "feat: add DAD ops postSupport and postGameEnded"
```

---

### Task 2: Lobby embed + Join/Leave/Start buttons (no Activity CTA)

**Files:**
- Modify: `src/DiscordBot.js`

- [ ] **Step 1: Add helpers** (`lobbyCustomId`, `parseLobbyCustomId`, `buildLobbyComponents`, `buildLobbyEmbed`) as specified in the design — Join/Leave/Start buttons with `dad_join:`, `dad_leave:`, `dad_start:` customIds; embed shows roster without Activity link.

- [ ] **Step 2: Rewrite `createDiscordGame` reply path**

1. Remove Activity `Link` button (`Open Retro View`).
2. Reply with lobby embed + `buildLobbyComponents`.
3. Store `lobbyMessageId` from the reply.
4. Do not post ID/reaction-primary follow-up; skip `react('🎮')`.

- [ ] **Step 3: Commit**

```bash
git add src/DiscordBot.js
git commit -m "feat: channel lobby embed with Join Leave Start buttons"
```

---

### Task 3: Button handlers + create-game DAD default

**Files:**
- Modify: `src/DiscordBot.js`

- [ ] **Step 1: Expand `interactionCreate`** to handle `interaction.isButton()` via `handleLobbyButton` before slash commands; keep `postError` on failures.

- [ ] **Step 2: Implement `handleLobbyButton` + `refreshLobbyMessage`**

- join: add user if waiting and not full  
- leave: non-host remove  
- start: host-only, min 3 players, `postGameStarted`, call `startDegensDiscordGame`  
- Wire `postGameEnded` where Degens finishes (`status = 'finished'` / winner announce)

- [ ] **Step 3: Make create-game `type` optional**; default `'degens-against-decency'`; if poker/2-truths selected, ephemeral “Deferred for MVP”.

- [ ] **Step 4: Commit**

```bash
git add src/DiscordBot.js
git commit -m "feat: handle lobby buttons and default create-game to Degens"
```

---

### Task 4: `/support` + `/help` handlers

**Files:**
- Modify: `src/DiscordBot.js`

- [ ] **Step 1: Add SlashCommandBuilders** for `support` (type + details, Royale choices) and `help`; register in `this.commands`.

- [ ] **Step 2: Implement `handleHelp` and `handleSupport`** using `postSupport` from ops; donate uses `KOFI_URL` or default Ko-fi.

- [ ] **Step 3: Commit**

```bash
git add src/DiscordBot.js
git commit -m "feat: add /support and /help for DAD channel MVP"
```

---

### Task 5: Deploy commands + Fly + smoke

**Files:**
- Modify: `deploy-commands.js`
- Modify: `README.md`

- [ ] **Step 1: Update `buildCommands()`** to include `/support` and `/help`; make create-game `type` optional; keep Entry Point preserve.

- [ ] **Step 2: README** — channel MVP how-to + in-memory restart note + Activity parked.

- [ ] **Step 3: Register + deploy**

```bash
npm run deploy-commands
git push origin HEAD
flyctl deploy -a degensagainstdecency --ha=false
curl -s https://degensagainstdecency.fly.dev/api/health
```

- [ ] **Step 4: Manual smoke** — `/help`, `/create-game` (no Retro View), Join button, `/support` → ops channel.

- [ ] **Step 5: Commit and push**

```bash
git add deploy-commands.js README.md
git commit -m "feat: register /support /help and document channel MVP"
git push origin HEAD
```

---

## Spec coverage

| Spec item | Task |
|-----------|------|
| Channel-first / Activity parked | Tasks 2–3 |
| Lobby buttons | Tasks 2–3 |
| `/support` + ops | Tasks 1, 4, 5 |
| `/help` | Tasks 4–5 |
| DAD-only default | Task 3 |
| `postGameEnded` | Tasks 1, 3 |
| Preserve Entry Point | Task 5 |
| Restart note | Task 5 |
| Fallback ID commands | Keep (no deletion) |

## Out of scope

- Activity SDK polish, ephemeral card UI, DB persistence, `/dad` rename, mass announcements
