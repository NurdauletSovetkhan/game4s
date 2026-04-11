from __future__ import annotations

from datetime import datetime, timezone
import random
import string

from game4s_py.server.models import GameplaySettings, Player, Room


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_name(name: str | None) -> str:
    text = (name or "").strip()
    if not text:
        return "Игрок"
    return text[:24]


def random_code() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(random.choice(alphabet) for _ in range(6))


def random_player_id() -> str:
    tail = "".join(random.choice(string.ascii_lowercase + string.digits) for _ in range(8))
    return f"p_{tail}"


def next_turn_player(room: Room, current_id: str) -> str:
    if len(room.players) < 2:
        return current_id
    if room.players[0].id == current_id:
        return room.players[1].id
    return room.players[0].id


def new_room(
    room_code: str,
    category: str,
    player_id: str,
    name: str,
    gameplay_settings: GameplaySettings | None = None,
) -> Room:
    now = now_iso()
    return Room(
        roomCode=room_code,
        category=category,
        status="waiting",
        createdAt=now,
        updatedAt=now,
        revision=1,
        turnPlayerId=player_id,
        players=[Player(id=player_id, name=name)],
        gameplaySettings=gameplay_settings or GameplaySettings(),
        snapshot=None,
    )
