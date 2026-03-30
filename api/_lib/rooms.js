import { createClient } from 'redis';

const KV_URL =
  process.env.KV_REST_API_URL ||
  process.env.UPSTASH_REDIS_REST_URL ||
  process.env.REDIS_REST_URL;
const KV_TOKEN =
  process.env.KV_REST_API_TOKEN ||
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  process.env.REDIS_REST_TOKEN;
const REDIS_URL = process.env.REDIS_URL;
const ROOM_TTL_SECONDS = 60 * 60 * 24;

let redisClientPromise = null;

function withCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export function handleOptions(req, res) {
  withCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

export function sendJson(res, status, payload) {
  withCors(res);
  res.status(status).json(payload);
}

async function kvExec(args) {
  if (!KV_URL || !KV_TOKEN) {
    throw new Error('KV environment is not configured');
  }

  const response = await fetch(KV_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(args)
  });

  if (!response.ok) {
    throw new Error(`KV request failed (${response.status})`);
  }

  return response.json();
}

async function getRedisClient() {
  if (!REDIS_URL) {
    throw new Error('REDIS_URL is not configured');
  }

  if (!redisClientPromise) {
    redisClientPromise = (async () => {
      const client = createClient({ url: REDIS_URL });
      client.on('error', () => {});
      await client.connect();
      return client;
    })();
  }

  return redisClientPromise;
}

function roomKey(roomCode) {
  return `mathgolf:room:${roomCode}`;
}

export function randomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export function randomPlayerId() {
  return `p_${Math.random().toString(36).slice(2, 10)}`;
}

export async function getRoom(roomCode) {
  let raw = null;

  if (KV_URL && KV_TOKEN) {
    const result = await kvExec(['GET', roomKey(roomCode)]);
    raw = result?.result;
  } else if (REDIS_URL) {
    const client = await getRedisClient();
    raw = await client.get(roomKey(roomCode));
  } else {
    throw new Error(
      'Storage is not configured: set KV_REST_API_URL+KV_REST_API_TOKEN or REDIS_URL'
    );
  }

  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw;
}

export async function saveRoom(roomCode, room) {
  const value = JSON.stringify(room);

  if (KV_URL && KV_TOKEN) {
    await kvExec(['SET', roomKey(roomCode), value, 'EX', ROOM_TTL_SECONDS]);
    return;
  }

  if (REDIS_URL) {
    const client = await getRedisClient();
    await client.setEx(roomKey(roomCode), ROOM_TTL_SECONDS, value);
    return;
  }

  throw new Error(
    'Storage is not configured: set KV_REST_API_URL+KV_REST_API_TOKEN or REDIS_URL'
  );
}

export function normalizeName(name) {
  const text = String(name || '').trim();
  if (!text) return 'Игрок';
  return text.slice(0, 24);
}

export function nowIso() {
  return new Date().toISOString();
}
