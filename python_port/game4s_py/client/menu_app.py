from __future__ import annotations

from pathlib import Path
from typing import Any

import pygame

from game4s_py.client.audio_engine import AudioEngine
from game4s_py.client.models import LaunchConfig
from game4s_py.client.network import GameplaySettings
from game4s_py.client.text_engine import build_text_engine
from game4s_py.shared.game_data import CATEGORY_DEFS


PROJECT_ROOT = Path(__file__).resolve().parents[3]
MENU_BG_PATH = PROJECT_ROOT / "background.png"


class MenuApp:
    def __init__(self, default_category: str, default_name: str, default_players: int) -> None:
        pygame.init()
        self.screen = pygame.display.set_mode((0, 0), pygame.FULLSCREEN)
        pygame.display.set_caption("game4s python menu")
        self.clock = pygame.time.Clock()
        self.text = build_text_engine()
        self.audio = AudioEngine(0.7)
        self.title_font = self.text.make_font(58)
        self.font = self.text.make_font(34)
        self.small = self.text.make_font(24)
        self.menu_background = self._load_menu_background()

        categories = [c.id for c in CATEGORY_DEFS]
        players = max(1, min(4, int(default_players)))
        self.values: dict[str, Any] = {
            "name": default_name or "Игрок",
            "category": default_category if default_category in categories else categories[0],
            "players": players,
            "text_scale": 1.35,
            "sound_volume": 0.7,
            "shot_power": 1.0,
            "gravity": 1.0,
            "bounce": 1.0,
        }
        self.fields = [
            "name",
            "category",
            "players",
            "text_scale",
            "sound_volume",
            "shot_power",
            "gravity",
            "bounce",
            "start",
        ]
        self.index = 0
        self.error = ""
        self.running = True
        self.result: LaunchConfig | None = None
        self._apply_text_scale()

    def _load_menu_background(self) -> pygame.Surface | None:
        if not MENU_BG_PATH.exists():
            return None
        try:
            image = pygame.image.load(str(MENU_BG_PATH)).convert()
            return pygame.transform.smoothscale(image, self.screen.get_size())
        except Exception:
            return None

    def label_for(self, field: str) -> str:
        if field == "name":
            return f"Имя: {self.values['name']}"
        if field == "category":
            category = next((c for c in CATEGORY_DEFS if c.id == self.values["category"]), CATEGORY_DEFS[0])
            return f"Категория: {category.title} ({category.id})"
        if field == "players":
            players = int(self.values["players"])
            mode_label = "Соло" if players <= 1 else f"Локальная комната ({players} игрока)"
            return f"Режим: {mode_label}"
        if field == "text_scale":
            return f"Размер текста UI: {self.values['text_scale']:.2f}x"
        if field == "sound_volume":
            return f"Громкость звуков: {int(self.values['sound_volume'] * 100)}%"
        if field == "shot_power":
            return f"Сила удара: {self.values['shot_power']:.2f}x"
        if field == "gravity":
            return f"Гравитация: {self.values['gravity']:.2f}x"
        if field == "bounce":
            return f"Отскок: {self.values['bounce']:.2f}x"
        return "Старт"

    def _apply_text_scale(self) -> None:
        scale = float(self.values["text_scale"])
        self.title_font = self.text.make_font(int(58 * scale))
        self.font = self.text.make_font(int(34 * scale))
        self.small = self.text.make_font(int(24 * scale))

    def _adjust_numeric(self, key: str, step: float, min_value: float, max_value: float, direction: int) -> None:
        current = float(self.values[key])
        next_value = max(min_value, min(max_value, current + step * direction))
        self.values[key] = round(next_value, 2)

    def move_option(self, direction: int) -> None:
        field = self.fields[self.index]
        if field == "category":
            category_ids = [c.id for c in CATEGORY_DEFS]
            current = category_ids.index(self.values["category"])
            self.values["category"] = category_ids[(current + direction) % len(category_ids)]
        elif field == "players":
            current = int(self.values["players"])
            self.values["players"] = 1 if direction < 0 and current <= 1 else max(1, min(4, current + direction))
        elif field == "text_scale":
            self._adjust_numeric("text_scale", 0.1, 1.0, 2.4, direction)
            self._apply_text_scale()
        elif field == "sound_volume":
            self._adjust_numeric("sound_volume", 0.05, 0.0, 1.0, direction)
            self.audio.set_volume(float(self.values["sound_volume"]))
        elif field == "shot_power":
            self._adjust_numeric("shot_power", 0.05, 0.5, 2.0, direction)
        elif field == "gravity":
            self._adjust_numeric("gravity", 0.05, 0.5, 2.0, direction)
        elif field == "bounce":
            self._adjust_numeric("bounce", 0.05, 0.6, 1.6, direction)

    def try_start(self) -> None:
        name = self.values["name"].strip() or "Игрок"
        category = self.values["category"]
        players = max(1, min(4, int(self.values["players"])))

        self.result = LaunchConfig(
            category_id=category,
            player_name=name,
            local_players=players,
            text_scale=float(self.values["text_scale"]),
            sfx_volume=float(self.values["sound_volume"]),
            gameplay_settings=GameplaySettings(
                shot_power=float(self.values["shot_power"]),
                gravity=float(self.values["gravity"]),
                bounce=float(self.values["bounce"]),
            ),
        )
        self.audio.select()
        self.running = False

    def handle_text_input(self, event: pygame.event.Event) -> None:
        field = self.fields[self.index]
        if field != "name":
            return
        if event.key == pygame.K_BACKSPACE:
            self.values[field] = self.values[field][:-1]
            return
        if event.unicode and event.unicode.isprintable() and len(self.values[field]) < 48:
            self.values[field] += event.unicode

    def handle_event(self, event: pygame.event.Event) -> None:
        if event.type == pygame.QUIT:
            self.running = False
            return
        if event.type != pygame.KEYDOWN:
            return

        self.error = ""
        if event.key == pygame.K_ESCAPE:
            self.running = False
            self.result = None
            return
        if event.key == pygame.K_UP:
            self.index = (self.index - 1) % len(self.fields)
            self.audio.click()
            return
        if event.key == pygame.K_DOWN:
            self.index = (self.index + 1) % len(self.fields)
            self.audio.click()
            return
        if event.key == pygame.K_LEFT:
            self.move_option(-1)
            self.audio.click()
            return
        if event.key == pygame.K_RIGHT:
            self.move_option(1)
            self.audio.click()
            return
        if event.key == pygame.K_RETURN:
            if self.fields[self.index] == "start":
                self.try_start()
            else:
                self.audio.click()
            return

        self.handle_text_input(event)
        if event.unicode or event.key == pygame.K_BACKSPACE:
            self.audio.click()

    def draw(self) -> None:
        sw, sh = self.screen.get_size()
        if self.menu_background is not None:
            self.screen.blit(self.menu_background, (0, 0))
        else:
            self.screen.fill((238, 247, 255))

        panel_w = min(980, sw - 80)
        row_h = max(62, int(62 * float(self.values["text_scale"])))
        row_gap = 14
        rows_h = len(self.fields) * row_h + (len(self.fields) - 1) * row_gap
        header_h = 88
        footer_h = 48
        total_h = header_h + rows_h + footer_h

        panel_x = (sw - panel_w) // 2
        top_y = max(20, (sh - total_h) // 2)

        title_surface = self.text.render(self.title_font, "game4s — меню", (18, 24, 33))
        self.screen.blit(title_surface, ((sw - title_surface.get_width()) // 2, top_y))

        hint_surface = self.text.render(self.small, "↑↓ выбрать поле, ←→ переключать, Enter на Старт, Esc выход", (90, 96, 108))
        self.screen.blit(hint_surface, ((sw - hint_surface.get_width()) // 2, top_y + 52))

        y = top_y + header_h
        for idx, field in enumerate(self.fields):
            rect = pygame.Rect(panel_x, y, panel_w, row_h)
            selected = idx == self.index
            bg = (255, 255, 255) if selected else (247, 251, 255)
            border = (40, 95, 180) if selected else (180, 194, 210)
            pygame.draw.rect(self.screen, bg, rect, border_radius=10)
            pygame.draw.rect(self.screen, border, rect, width=2, border_radius=10)
            text = "▶ Старт" if field == "start" else self.label_for(field)
            color = (20, 30, 42) if field != "start" else (20, 70, 42)
            self.screen.blit(self.text.render(self.font, text, color), (rect.x + 16, rect.y + 16))
            y += row_h + row_gap

        footer_y = top_y + header_h + rows_h + 8
        if int(self.values["players"]) > 1:
            note_surface = self.text.render(self.small, "Локальная комната: передавайте ход на одном устройстве", (90, 96, 108))
            self.screen.blit(note_surface, ((sw - note_surface.get_width()) // 2, footer_y))
        if self.error:
            err_surface = self.text.render(self.small, self.error, (170, 28, 28))
            self.screen.blit(err_surface, ((sw - err_surface.get_width()) // 2, footer_y + 44))

        pygame.display.flip()

    def run(self) -> LaunchConfig | None:
        while self.running:
            self.clock.tick(60)
            for event in pygame.event.get():
                self.handle_event(event)
            self.draw()
        pygame.quit()
        return self.result
