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

    // Activity apps have a Primary Entry Point (type 4) that must be kept on bulk PUT
    // or Discord returns 50240.
    const existing = await rest.get(Routes.applicationCommands(clientId));
    const entryPoints = existing
      .filter((cmd) => cmd.type === 4)
      .map(({ id, application_id, version, guild_id, ...cmd }) => cmd);
    if (entryPoints.length) {
      console.log(`Preserving ${entryPoints.length} Activity Entry Point command(s).`);
    }

    const body = [...entryPoints, ...commands];
    console.log(`Registering ${commands.length} slash commands globally (+${entryPoints.length} entry point)...`);
    await rest.put(Routes.applicationCommands(clientId), { body });
    console.log('✅ Global commands registered:');
    for (const cmd of body) {
      console.log(`   /${cmd.name}${cmd.type === 4 ? ' (entry point)' : ''}`);
    }
    console.log('Discord may take up to ~1 hour to propagate globally (usually minutes).');
    console.log('Restart Discord (Ctrl+R) if the client still shows old commands.');
  } catch (err) {
    console.error('❌ Failed:', err);
    process.exit(1);
  }
})();
