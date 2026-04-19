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


def main() -> None:
    parser = argparse.ArgumentParser(description="game4s pygame client")
    parser.add_argument("--category", default="arith", choices=[c.id for c in CATEGORY_DEFS])
    parser.add_argument("--name", default="Игрок")
    parser.add_argument("--players", type=int, default=1, choices=[1, 2, 3, 4])
    parser.add_argument("--multi", action="store_true", help="Compatibility alias: enables 2 local players")
    parser.add_argument("--no-menu", action="store_true", help="Skip launch menu and start immediately")
    args = parser.parse_args()

    cli_players = 2 if args.multi and args.players == 1 else args.players

    launch: LaunchConfig | None
    if args.no_menu:
        launch = LaunchConfig(
            category_id=args.category,
            player_name=args.name,
            local_players=cli_players,
            text_scale=1.35,
            sfx_volume=0.7,
            gameplay_settings=GameplaySettings(),
        )
    else:
        menu = MenuApp(
            default_category=args.category,
            default_name=args.name,
            default_players=cli_players,
        )
        launch = menu.run()

    if not launch:
        return

    if "SDL_VIDEO_CENTERED" not in os.environ:
        os.environ["SDL_VIDEO_CENTERED"] = "1"

    players = max(1, min(4, int(launch.local_players)))
    mp = MultiplayerState(enabled=players > 1, local_mode=True, local_players=players)
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
