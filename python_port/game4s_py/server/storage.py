from __future__ import annotations

import json
import os
from typing import Any
from redis.asyncio import Redis


ROOM_TTL_SECONDS = 60 * 60 * 24


class RoomStorage:
    def __init__(self) -> None:
        self.redis_url = os.getenv("REDIS_URL", "").strip()
        self._redis: Redis | None = None
        self._memory: dict[str, str] = {}

    async def _client(self) -> Redis | None:
        if not self.redis_url:
            return None
        if self._redis is None:
            self._redis = Redis.from_url(self.redis_url, decode_responses=True)
        return self._redis

    @staticmethod
    def room_key(room_code: str) -> str:
        return f"mathgolf:room:{room_code}"

    async def get_room(self, room_code: str) -> dict[str, Any] | None:
        key = self.room_key(room_code)
        client = await self._client()
        raw: str | None
        if client:
            raw = await client.get(key)
        else:
            raw = self._memory.get(key)
        if not raw:
            return None
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return None

    async def save_room(self, room_code: str, room: dict[str, Any]) -> None:
        key = self.room_key(room_code)
        value = json.dumps(room, ensure_ascii=False)
        client = await self._client()
        if client:
            await client.setex(key, ROOM_TTL_SECONDS, value)
            return
        self._memory[key] = value
