/**
 * Register guild-scoped slash commands for Degens Against Decency.
 * Run: node deploy-commands.js
 */

require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const required = ['DISCORD_BOT_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID'];
for (const key of required) {
  if (!process.env[key]?.trim()) {
    console.error(`Missing ${key} in .env`);
    process.exit(1);
  }
}

const commands = [
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

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

(async () => {
  try {
    console.log('Registering guild slash commands...');
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.DISCORD_CLIENT_ID,
        process.env.DISCORD_GUILD_ID,
      ),
      { body: commands },
    );
    console.log('✅ Commands registered. Start server with: npm start');
  } catch (err) {
    console.error('❌ Failed:', err);
    process.exit(1);
  }
})();
