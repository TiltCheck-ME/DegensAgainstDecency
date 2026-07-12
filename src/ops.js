/**
 * Bot ops logging — posts to shared bot-test channels.
 * Fire-and-forget: never throw into gameplay / slash handlers.
 */

const { EmbedBuilder } = require('discord.js');

const COLORS = {
  error: 0xe74c3c,
  analytics: 0x3498db,
  support: 0x9b59b6,
  purchase: 0xf1c40f,
  install: 0x2ecc71,
};

let _client = null;
let _config = null;

function opsFromEnv() {
  return {
    botId: process.env.ALERTS_BOT_ID || 'degens-against-decency',
    guildId: (process.env.OPS_GUILD_ID || '').trim(),
    errorChannelId: (process.env.OPS_ERROR_CHANNEL_ID || '').trim(),
    analyticsChannelId: (process.env.OPS_ANALYTICS_CHANNEL_ID || '').trim(),
    supportChannelId: (process.env.OPS_SUPPORT_CHANNEL_ID || '').trim(),
    alertUserId: (process.env.OPS_ALERT_USER_ID || '1153034319271559328').trim(),
  };
}

function initOps(client, config = {}) {
  _client = client;
  _config = { ...opsFromEnv(), ...config };
  const ops = _config;
  if (!ops.errorChannelId && !ops.analyticsChannelId && !ops.supportChannelId) {
    console.warn('[ops] No OPS_*_CHANNEL_ID set — channel logging disabled');
    return;
  }
  console.log(
    `[ops] ${ops.botId} | guild ${ops.guildId || '(any)'} | ` +
      `errors=${ops.errorChannelId || 'off'} ` +
      `analytics=${ops.analyticsChannelId || 'off'} ` +
      `support=${ops.supportChannelId || 'off'}`,
  );
}

function truncate(text, max = 500) {
  const s = String(text ?? '');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function botId() {
  return _config?.botId || 'degens-against-decency';
}

async function sendToChannel(channelId, payload) {
  if (!_client || !channelId) return;
  try {
    const channel = await _client.channels.fetch(channelId);
    if (!channel?.isTextBased?.()) return;
    await channel.send(payload);
  } catch (err) {
    console.warn(`[ops] Failed to post to ${channelId}: ${err.message}`);
  }
}

function postOps(kind, build) {
  const ops = _config || {};
  const channelId =
    kind === 'error'
      ? ops.errorChannelId
      : kind === 'support'
        ? ops.supportChannelId
        : ops.analyticsChannelId;
  if (!channelId) return;
  Promise.resolve()
    .then(() => build())
    .then((payload) => sendToChannel(channelId, payload))
    .catch((err) => console.warn(`[ops] ${kind} dropped: ${err.message}`));
}

function criticalMention() {
  const userId = _config?.alertUserId;
  return userId ? `<@${userId}>` : '';
}

function postError({ context, message, stack }) {
  postOps('error', () => {
    const mention = criticalMention();
    const embed = new EmbedBuilder()
      .setColor(COLORS.error)
      .setTitle('🔴 Bot error')
      .setDescription(`**${truncate(context, 100)}**\n\`\`\`\n${truncate(message, 800)}\n\`\`\``)
      .setFooter({ text: botId() })
      .setTimestamp();
    if (stack) {
      embed.addFields({ name: 'Stack', value: `\`\`\`\n${truncate(stack, 900)}\n\`\`\`` });
    }
    return {
      content: mention ? `${mention} **critical alert**` : undefined,
      allowedMentions: mention ? { users: [_config.alertUserId] } : { parse: [] },
      embeds: [embed],
    };
  });
}

function postAnalytics({ event, title, description, fields = [], color }) {
  postOps('analytics', () => ({
    embeds: [
      new EmbedBuilder()
        .setColor(color ?? COLORS.analytics)
        .setTitle(title || event)
        .setDescription(description || null)
        .addFields(fields.filter(Boolean).slice(0, 10))
        .setFooter({ text: `${botId()} · ${event}` })
        .setTimestamp(),
    ],
  }));
}

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

function postGuildInstall(guild) {
  postAnalytics({
    event: 'guild_install',
    title: '🟢 Bot added to server',
    description: `**${guild.name}**`,
    color: COLORS.install,
    fields: [
      { name: 'Guild ID', value: `\`${guild.id}\``, inline: true },
      { name: 'Members', value: String(guild.memberCount ?? '?'), inline: true },
    ],
  });
}

function postGameStarted({ guildId, channelId, gameType, players }) {
  postAnalytics({
    event: 'game_started',
    title: '🎮 Game started',
    fields: [
      { name: 'Type', value: gameType || '?', inline: true },
      { name: 'Players', value: String(players ?? '?'), inline: true },
      { name: 'Guild', value: `\`${guildId || '?'}\``, inline: true },
      channelId ? { name: 'Channel', value: `<#${channelId}>`, inline: true } : null,
    ],
  });
}

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

module.exports = {
  initOps,
  postError,
  postGuildInstall,
  postGameStarted,
  postGameEnded,
  postAnalytics,
  postSupport,
};
