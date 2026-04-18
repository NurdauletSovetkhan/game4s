from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

if __package__ is None or __package__ == "":
    sys.path.append(str(Path(__file__).resolve().parents[2]))

from game4s_py.client.game_app import GameApp
from game4s_py.client.menu_app import MenuApp
from game4s_py.client.models import LaunchConfig
from game4s_py.client.network import GameplaySettings, MultiplayerState
from game4s_py.shared.game_data import CATEGORY_DEFS


DEFAULT_API_BASE = os.getenv("GAME4S_API_BASE", "http://127.0.0.1:8000")


def main() -> None:
    parser = argparse.ArgumentParser(description="game4s pygame client")
    parser.add_argument("--category", default="arith", choices=[c.id for c in CATEGORY_DEFS])
    parser.add_argument("--name", default="Игрок")
    parser.add_argument("--multi", action="store_true")
    parser.add_argument("--room", default="")
    parser.add_argument("--api", default=DEFAULT_API_BASE)
    parser.add_argument("--no-menu", action="store_true", help="Skip launch menu and start immediately")
    args = parser.parse_args()

    launch: LaunchConfig | None
    if args.no_menu:
        launch = LaunchConfig(
            category_id=args.category,
            player_name=args.name,
            multiplayer=args.multi,
            room_code=args.room,
            api_base=args.api,
            text_scale=1.35,
            sfx_volume=0.7,
            gameplay_settings=GameplaySettings(),
        )
    else:
        menu = MenuApp(
            default_category=args.category,
            default_name=args.name,
            default_multi=args.multi,
            default_room=args.room,
            default_api=args.api,
        )
        launch = menu.run()

    if not launch:
        return

    if "SDL_VIDEO_CENTERED" not in os.environ:
        os.environ["SDL_VIDEO_CENTERED"] = "1"

    mp = MultiplayerState(enabled=launch.multiplayer, room_code=launch.room_code, api_base=launch.api_base)
    app = GameApp(
        launch.category_id,
        mp,
        player_name=launch.player_name,
        text_scale=launch.text_scale,
        sfx_volume=launch.sfx_volume,
        gameplay_settings=launch.gameplay_settings,
    )
    app.run()


if __name__ == "__main__":
    main()
