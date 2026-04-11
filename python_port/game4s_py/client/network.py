from __future__ import annotations

from dataclasses import dataclass
from typing import Any
import httpx


@dataclass
class MultiplayerState:
    enabled: bool = False
    api_base: str = "http://127.0.0.1:8000"
    room_code: str = ""
    player_id: str = ""
    turn_player_id: str = ""
    revision: int = 0


@dataclass
class GameplaySettings:
    shot_power: float = 1.0
    gravity: float = 1.0
    bounce: float = 1.0

    def to_api(self) -> dict[str, float]:
        return {
            "shotPower": float(self.shot_power),
            "gravity": float(self.gravity),
            "bounce": float(self.bounce),
        }

    @staticmethod
    def from_api(data: dict[str, Any] | None) -> "GameplaySettings":
        payload = data or {}
        return GameplaySettings(
            shot_power=float(payload.get("shotPower", 1.0)),
            gravity=float(payload.get("gravity", 1.0)),
            bounce=float(payload.get("bounce", 1.0)),
        )


class MultiplayerApi:
    def __init__(self, state: MultiplayerState) -> None:
        self.state = state
        self.client = httpx.Client(timeout=4.0)

    def _url(self, path: str) -> str:
        return f"{self.state.api_base}{path}"

    @staticmethod
    def _extract_error(response: httpx.Response, fallback: str) -> str:
        try:
            payload = response.json()
            if isinstance(payload, dict):
                return str(payload.get("error") or payload.get("detail") or fallback)
        except Exception:
            pass
        return fallback

    def create_room(self, category: str, name: str, gameplay_settings: GameplaySettings) -> dict[str, Any]:
        response = self.client.post(
            self._url("/api/room/create"),
            json={"category": category, "name": name, "gameplaySettings": gameplay_settings.to_api()},
        )
        if response.status_code >= 400:
            raise RuntimeError(self._extract_error(response, "create room failed"))
        data = response.json()
        if not data.get("ok"):
            raise RuntimeError(data.get("error") or "create room failed")
        self.state.room_code = data["roomCode"]
        self.state.player_id = data["playerId"]
        self.state.revision = int(data["room"].get("revision") or 0)
        self.state.turn_player_id = data["room"].get("turnPlayerId") or self.state.player_id
        self.state.enabled = True
        return data

    def join_room(self, room_code: str, name: str) -> dict[str, Any]:
        response = self.client.post(self._url("/api/room/join"), json={"roomCode": room_code, "name": name})
        if response.status_code >= 400:
            raise RuntimeError(self._extract_error(response, "join room failed"))
        data = response.json()
        if not data.get("ok"):
            raise RuntimeError(data.get("error") or "join room failed")
        self.state.room_code = data["roomCode"]
        self.state.player_id = data["playerId"]
        self.state.revision = int(data["room"].get("revision") or 0)
        self.state.turn_player_id = data["room"].get("turnPlayerId") or self.state.player_id
        self.state.enabled = True
        return data

    def state_poll(self) -> dict[str, Any]:
        response = self.client.get(
            self._url("/api/room/state"),
            params={"room": self.state.room_code, "player": self.state.player_id},
        )
        if response.status_code >= 400:
            raise RuntimeError(self._extract_error(response, "poll failed"))
        data = response.json()
        if not data.get("ok"):
            raise RuntimeError(data.get("error") or "poll failed")
        room = data["room"]
        self.state.revision = int(room.get("revision") or self.state.revision)
        self.state.turn_player_id = room.get("turnPlayerId") or self.state.turn_player_id
        return room

    def update(self, snapshot: dict[str, Any], pass_turn: bool, allow_any_player: bool = False) -> dict[str, Any]:
        payload = {
            "roomCode": self.state.room_code,
            "playerId": self.state.player_id,
            "passTurn": pass_turn,
            "allowAnyPlayer": allow_any_player,
            "baseRevision": self.state.revision,
            "snapshot": snapshot,
        }
        response = self.client.post(self._url("/api/room/update"), json=payload)
        if response.status_code >= 400:
            raise RuntimeError(self._extract_error(response, "sync failed"))
        data = response.json()
        if not data.get("ok"):
            if data.get("code") == "REVISION_MISMATCH":
                room = data.get("room") or {}
                self.state.revision = int(room.get("revision") or self.state.revision)
                self.state.turn_player_id = room.get("turnPlayerId") or self.state.turn_player_id
            raise RuntimeError(data.get("error") or "sync failed")

        room = data["room"]
        self.state.revision = int(room.get("revision") or self.state.revision)
        self.state.turn_player_id = room.get("turnPlayerId") or self.state.turn_player_id
        return room
