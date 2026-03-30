import { getRoom, handleOptions, nowIso, saveRoom, sendJson } from '../_lib/rooms.js';

function nextTurnPlayer(room, currentId) {
  if (!room.players || room.players.length < 2) return currentId;
  if (room.players[0].id === currentId) return room.players[1].id;
  return room.players[0].id;
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    const body = req.body || {};
    const roomCode = String(body.roomCode || '').trim().toUpperCase();
    const playerId = String(body.playerId || '').trim();

    if (!roomCode || !playerId) {
      sendJson(res, 400, { error: 'Room and player are required' });
      return;
    }

    const room = await getRoom(roomCode);
    if (!room) {
      sendJson(res, 404, { error: 'Room not found' });
      return;
    }

    const member = room.players.find((player) => player.id === playerId);
    if (!member) {
      sendJson(res, 403, { error: 'Player not in this room' });
      return;
    }

    const allowAny = Boolean(body.allowAnyPlayer);
    if (!allowAny && room.turnPlayerId && room.turnPlayerId !== playerId) {
      sendJson(res, 409, { error: 'Not your turn', room });
      return;
    }

    if (body.snapshot) {
      room.snapshot = body.snapshot;
    }

    if (body.passTurn) {
      room.turnPlayerId = nextTurnPlayer(room, room.turnPlayerId || playerId);
    }

    room.updatedAt = nowIso();
    room.revision = (room.revision || 1) + 1;

    await saveRoom(roomCode, room);

    sendJson(res, 200, { ok: true, room });
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Internal error' });
  }
}
