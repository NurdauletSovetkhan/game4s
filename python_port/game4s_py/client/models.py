from __future__ import annotations

from dataclasses import dataclass

from game4s_py.client.network import GameplaySettings


@dataclass
class Ball:
    x: float = 0
    y: float = 0
    r: float = 11
    vx: float = 0
    vy: float = 0
    grounded: bool = False


@dataclass
class LaunchConfig:
    category_id: str
    player_name: str
    multiplayer: bool
    room_code: str
    api_base: str
    text_scale: float
    sfx_volume: float
    gameplay_settings: GameplaySettings
