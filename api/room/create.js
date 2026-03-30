import {
  getRoom,
  handleOptions,
  normalizeName,
  nowIso,
  randomCode,
  randomPlayerId,
  saveRoom,
  sendJson
} from '../_lib/rooms.js';

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    const body = req.body || {};
    const category = String(body.category || '').trim();
    if (!category) {
      sendJson(res, 400, { error: 'Category is required' });
      return;
    }

    const name = normalizeName(body.name);
    const playerId = randomPlayerId();

    let roomCode = randomCode();
    let tries = 0;
    while (tries < 8 && (await getRoom(roomCode))) {
      roomCode = randomCode();
      tries += 1;
    }

    if (await getRoom(roomCode)) {
      sendJson(res, 503, { error: 'Unable to allocate room code' });
      return;
    }

    const now = nowIso();
    const room = {
      roomCode,
      category,
      status: 'waiting',
      createdAt: now,
      updatedAt: now,
      revision: 1,
      turnPlayerId: playerId,
      players: [{ id: playerId, name }],
      snapshot: null
    };

    await saveRoom(roomCode, room);

    sendJson(res, 200, {
      ok: true,
      roomCode,
      category,
      playerId,
      room
    });
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Internal error' });
  }
}
