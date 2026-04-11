from __future__ import annotations

from typing import Any
from pydantic import BaseModel, Field


class Player(BaseModel):
    id: str
    name: str


class GameplaySettings(BaseModel):
    shotPower: float = 1.0
    gravity: float = 1.0
    bounce: float = 1.0


class Room(BaseModel):
    roomCode: str
    category: str
    status: str = "waiting"
    createdAt: str
    updatedAt: str
    revision: int = 1
    turnPlayerId: str
    players: list[Player]
    gameplaySettings: GameplaySettings = Field(default_factory=GameplaySettings)
    snapshot: dict[str, Any] | None = None


class CreateRoomRequest(BaseModel):
    category: str
    name: str | None = None
    gameplaySettings: GameplaySettings | None = None


class JoinRoomRequest(BaseModel):
    roomCode: str
    name: str | None = None


class UpdateRoomRequest(BaseModel):
    roomCode: str
    playerId: str
    allowAnyPlayer: bool = False
    passTurn: bool = False
    baseRevision: int = 0
    snapshot: dict[str, Any] | None = None


class RoomResponse(BaseModel):
    ok: bool = True
    roomCode: str
    category: str
    playerId: str
    room: Room
