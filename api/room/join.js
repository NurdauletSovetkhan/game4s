import { getRoom, handleOptions, normalizeName, nowIso, randomPlayerId, saveRoom, sendJson } from '../_lib/rooms.js';

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    const body = req.body || {};
    const roomCode = String(body.roomCode || '').trim().toUpperCase();
    if (!roomCode) {
      sendJson(res, 400, { error: 'Room code is required' });
      return;
    }

    const room = await getRoom(roomCode);
    if (!room) {
      sendJson(res, 404, { error: 'Room not found' });
      return;
    }

    if (room.players.length >= 2) {
      sendJson(res, 409, { error: 'Room is full' });
      return;
    }

    const name = normalizeName(body.name);
    const playerId = randomPlayerId();

    room.players.push({ id: playerId, name });
    room.status = 'active';
    room.updatedAt = nowIso();
    room.revision = (room.revision || 1) + 1;

    await saveRoom(roomCode, room);

    sendJson(res, 200, {
      ok: true,
      roomCode,
      category: room.category,
      playerId,
      room
    });
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Internal error' });
  }
}
