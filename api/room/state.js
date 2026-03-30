import { getRoom, handleOptions, sendJson } from '../_lib/rooms.js';

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    const roomCode = String(req.query?.room || '').trim().toUpperCase();
    const playerId = String(req.query?.player || '').trim();

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

    sendJson(res, 200, { ok: true, room });
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Internal error' });
  }
}
