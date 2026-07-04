/**
 * Serialize Discord-native games for Activity spectators (no hidden card text).
 */

function serializeGameForSpectator(game) {
  if (!game) return null;

  const players = (game.players || []).map((p) => ({
    id: p.id,
    username: p.username,
    score: game.scores?.get?.(p.id) ?? 0,
  }));

  return {
    gameId: game.id,
    gameType: game.type,
    status: game.status,
    phase: game.waitingFor || game.status,
    players,
    playerCount: players.length,
    maxPlayers: game.maxPlayers,
    round: game.currentRound || 0,
    maxRounds: game.maxRounds || null,
    cardCzar: game.cardCzar?.username || null,
    blackCard: game.currentQuestion?.text || null,
    submissionCount: game.submissions?.size ?? 0,
    creator: game.creator?.username || null,
  };
}

function buildChannelGamesMap(discordGames) {
  const map = new Map();
  if (!discordGames) return map;

  for (const game of discordGames.values()) {
    if (!game.channelId || game.status === 'finished') continue;
    const existing = map.get(game.channelId);
    const serialized = serializeGameForSpectator(game);
    if (!existing || game.status === 'playing' || existing.gameState.status !== 'playing') {
      map.set(game.channelId, { gameState: serialized });
    }
  }
  return map;
}

module.exports = { serializeGameForSpectator, buildChannelGamesMap };
