from __future__ import annotations

import math
from typing import Any

import pygame

from game4s_py.client.audio_engine import AudioEngine
from game4s_py.client.models import Ball
from game4s_py.client.network import GameplaySettings, MultiplayerApi, MultiplayerState
from game4s_py.client.text_engine import build_text_engine
from game4s_py.shared.game_data import (
    AIR_DAMPING,
    CATEGORY_DEFS,
    COURSES,
    MAX_DRAG,
    MIN_DRAG_TO_SHOT,
    ROLL_DAMPING,
    STOP_SPEED,
    WORLD_HEIGHT,
    WORLD_WIDTH,
    CategoryDef,
    Question,
    clamp,
    parse_answer_input,
)


class GameApp:
    def __init__(
        self,
        category_id: str,
        multiplayer: MultiplayerState,
        player_name: str = "Игрок",
        text_scale: float = 1.35,
        sfx_volume: float = 0.7,
        gameplay_settings: GameplaySettings | None = None,
    ) -> None:
        pygame.init()
        self.screen = pygame.display.set_mode((0, 0), pygame.FULLSCREEN)
        pygame.display.set_caption("game4s python")
        self.clock = pygame.time.Clock()
        self.text = build_text_engine()
        self.text_scale = max(1.0, min(2.4, float(text_scale)))
        self.font = self.text.make_font(int(34 * self.text_scale))
        self.small = self.text.make_font(int(24 * self.text_scale))
        self.audio = AudioEngine(sfx_volume)
        self.gameplay_settings = gameplay_settings or GameplaySettings()

        self.running = True
        self.message = ""
        self.category = self._pick_category(category_id)
        self.levels = COURSES[self.category.id]
        self.level_index = 0
        self.level = self.levels[0]

        self.gravity = 960 + self.category.difficulty * 85
        self.shot_speed = 1500 - self.category.difficulty * 45
        self.restitution = clamp(0.66 - self.category.difficulty * 0.035, 0.42, 0.66)
        self.spike_height = 20 + self.category.difficulty * 3
        self.water_scale = 0.72 + self.category.difficulty * 0.05
        self.apply_gameplay_settings(self.gameplay_settings)

        self.score = 0
        self.lives = 0
        self.strokes = 0
        self.won = False
        self.shot_unlocked = False
        self.dragging = False
        self.drag_pos: tuple[float, float] | None = None
        self.current_question: Question | None = None
        self.answer_buffer = ""
        self.quiz_open = True
        self.shots_remaining = 0
        self.just_stopped = False

        self.ball = Ball()
        self.checkpoint = (self.level.start_x, self.level.start_y)
        self.camera_x = 0.0
        self.camera_y = 0.0

        self.multiplayer = multiplayer
        self.api = MultiplayerApi(multiplayer)
        self.player_name = player_name
        self.remote_snapshot: dict[str, Any] | None = None
        self.multiplayer_players: list[dict[str, str]] = []
        self.player_states: dict[str, dict[str, Any]] = {}
        self.last_poll_ms = 0
        self.turn_pass_pending = False
        self.awaiting_turn_end = False

        self.load_level(0)
        self.setup_multiplayer()

    @staticmethod
    def _pick_category(category_id: str) -> CategoryDef:
        for category in CATEGORY_DEFS:
            if category.id == category_id:
                return category
        return CATEGORY_DEFS[0]

    def setup_multiplayer(self) -> None:
        if not self.multiplayer.enabled:
            return
        try:
            if self.multiplayer.room_code:
                data = self.api.join_room(self.multiplayer.room_code, self.player_name)
                host_gameplay = GameplaySettings.from_api((data.get("room") or {}).get("gameplaySettings"))
                self.apply_gameplay_settings(host_gameplay)
            else:
                self.api.create_room(self.category.id, self.player_name, self.gameplay_settings)
                data = self.api.state_poll()
        except Exception as error:
            self.multiplayer.enabled = False
            self.multiplayer.room_code = ""
            self.multiplayer.player_id = ""
            self.multiplayer.turn_player_id = ""
            self.set_message(f"Ошибка мультиплеера: {error}. Запущен solo режим.")
            return

        room = data.get("room") if isinstance(data, dict) else data
        if isinstance(room, dict):
            self.multiplayer_players = list(room.get("players") or [])
        self._ensure_multiplayer_player_states()
        if isinstance(room, dict) and room.get("snapshot"):
            self.apply_snapshot(room.get("snapshot") or {})

        if self.multiplayer.turn_player_id:
            self._load_turn_state(self.multiplayer.turn_player_id)

        self.set_message(f"Комната: {self.multiplayer.room_code}")

    def _default_player_state(self) -> dict[str, Any]:
        return {
            "ball": {
                "x": float(self.level.start_x),
                "y": float(self.level.start_y),
                "vx": 0.0,
                "vy": 0.0,
                "grounded": False,
            },
            "checkpoint": {"x": float(self.level.start_x), "y": float(self.level.start_y)},
            "shotUnlocked": False,
            "shotsRemaining": 0,
            "justStopped": False,
        }

    def _ensure_multiplayer_player_states(self) -> None:
        if not self.multiplayer.enabled:
            return

        ids = [p.get("id") for p in self.multiplayer_players if p.get("id")]
        if self.multiplayer.player_id and self.multiplayer.player_id not in ids:
            ids.append(self.multiplayer.player_id)

        for player_id in ids:
            if player_id not in self.player_states:
                self.player_states[player_id] = self._default_player_state()

    def _save_active_turn_state(self) -> None:
        if not self.multiplayer.enabled:
            return
        turn_id = self.multiplayer.turn_player_id or self.multiplayer.player_id
        if not turn_id:
            return
        self._ensure_multiplayer_player_states()
        state = self.player_states.setdefault(turn_id, self._default_player_state())
        state["ball"] = {
            "x": float(self.ball.x),
            "y": float(self.ball.y),
            "vx": float(self.ball.vx),
            "vy": float(self.ball.vy),
            "grounded": bool(self.ball.grounded),
        }
        state["checkpoint"] = {"x": float(self.checkpoint[0]), "y": float(self.checkpoint[1])}
        state["shotUnlocked"] = bool(self.shot_unlocked)
        state["shotsRemaining"] = int(self.shots_remaining)
        state["justStopped"] = bool(self.just_stopped)

    def _load_turn_state(self, player_id: str) -> None:
        if not self.multiplayer.enabled:
            return
        self._ensure_multiplayer_player_states()
        state = self.player_states.get(player_id)
        if not state:
            return
        ball = state.get("ball") or {}
        checkpoint = state.get("checkpoint") or {}
        self.ball.x = float(ball.get("x", self.ball.x))
        self.ball.y = float(ball.get("y", self.ball.y))
        self.ball.vx = float(ball.get("vx", 0.0))
        self.ball.vy = float(ball.get("vy", 0.0))
        self.ball.grounded = bool(ball.get("grounded", False))
        self.checkpoint = (
            float(checkpoint.get("x", self.level.start_x)),
            float(checkpoint.get("y", self.level.start_y)),
        )
        self.shot_unlocked = bool(state.get("shotUnlocked", False))
        self.shots_remaining = int(state.get("shotsRemaining", 0))
        self.just_stopped = bool(state.get("justStopped", False))

    def apply_gameplay_settings(self, gameplay_settings: GameplaySettings) -> None:
        self.gameplay_settings = gameplay_settings
        base_gravity = 960 + self.category.difficulty * 85
        base_shot = 1500 - self.category.difficulty * 45
        base_restitution = clamp(0.66 - self.category.difficulty * 0.035, 0.42, 0.66)

        self.gravity = base_gravity * max(0.5, min(2.0, gameplay_settings.gravity))
        self.shot_speed = base_shot * max(0.5, min(2.0, gameplay_settings.shot_power))
        self.restitution = clamp(
            base_restitution * max(0.6, min(1.6, gameplay_settings.bounce)),
            0.28,
            0.88,
        )

    def is_my_turn(self) -> bool:
        return not self.multiplayer.enabled or self.multiplayer.turn_player_id == self.multiplayer.player_id

    def set_message(self, text: str) -> None:
        self.message = text

    def align_camera(self) -> None:
        sw, sh = self.screen.get_size()
        self.camera_x = clamp(self.ball.x - sw * 0.5, 0, WORLD_WIDTH - sw)
        self.camera_y = clamp(self.ball.y - sh * 0.55, 0, WORLD_HEIGHT - sh)

    def load_level(self, index: int) -> None:
        self.level_index = max(0, min(index, len(self.levels) - 1))
        self.level = self.levels[self.level_index]
        self.strokes = 0
        self.won = False
        self.checkpoint = (self.level.start_x, self.level.start_y)
        self.reset_ball_to_checkpoint()
        self.current_par = max(3, self.level.par + (-1 if self.category.difficulty >= 5 else 0))
        self.shot_unlocked = False
        self.shots_remaining = 0
        self.awaiting_turn_end = False
        self.open_quiz("Реши задачу, чтобы сделать удар.")

    def reset_ball_to_checkpoint(self) -> None:
        self.ball.x, self.ball.y = self.checkpoint
        self.ball.vx = 0
        self.ball.vy = 0
        self.ball.grounded = False
        self.dragging = False
        self.drag_pos = None
        self.align_camera()

    def open_quiz(self, reason: str) -> None:
        if self.multiplayer.enabled and not self.is_my_turn():
            self.quiz_open = False
            return
        if self.multiplayer.enabled and self.shots_remaining > 0:
            self.quiz_open = False
            self.shot_unlocked = True
            self.set_message(f"Твой ход: осталось {self.shots_remaining} удар(а).")
            return
        if self.shot_unlocked:
            self.quiz_open = False
            return
        if self.current_question is not None and self.quiz_open and not self.shot_unlocked:
            self.set_message(reason)
            return
        self.current_question = self.category.create_question()
        self.answer_buffer = ""
        self.quiz_open = True
        self.set_message(reason)

    def submit_answer(self) -> None:
        if not self.current_question:
            return
        if self.multiplayer.enabled and not self.is_my_turn():
            self.set_message("Сейчас ход соперника.")
            return
        value = parse_answer_input(self.answer_buffer)
        if math.isnan(value):
            self.set_message("Введи число (десятичное или дробь).")
            return
        diff = abs(value - self.current_question.answer)
        if diff <= (self.current_question.tolerance or 0.02):
            reward = 8 * self.category.difficulty
            self.score = max(0, self.score + reward)
            if self.multiplayer.enabled:
                self.lives += 2
                self.shots_remaining = 2
                self.awaiting_turn_end = False
            else:
                self.lives += 1
            self.shot_unlocked = True
            self.quiz_open = False
            self.set_message("Верно! Удар открыт.")
            self.audio.correct()
            self.sync_room(pass_turn=False)
            return

        self.score = max(0, self.score - 2 * self.category.difficulty)
        self.set_message("Неверно. Попробуй снова.")
        self.audio.wrong()
        self.sync_room(pass_turn=False)

    def world_to_screen(self, x: float, y: float) -> tuple[int, int]:
        return int(x - self.camera_x), int(y - self.camera_y)

    def _preview_rect_collision(
        self,
        px: float,
        py: float,
        vx: float,
        vy: float,
        grounded: bool,
        rx: float,
        ry: float,
        rw: float,
        rh: float,
    ) -> tuple[float, float, float, float, bool]:
        nearest_x = clamp(px, rx, rx + rw)
        nearest_y = clamp(py, ry, ry + rh)
        dx = px - nearest_x
        dy = py - nearest_y
        dist_sq = dx * dx + dy * dy
        rr = self.ball.r * self.ball.r

        if dist_sq > rr:
            return px, py, vx, vy, grounded

        dist = math.sqrt(dist_sq) if dist_sq > 0.0001 else 0.0
        if dist > 0:
            normal_x = dx / dist
            normal_y = dy / dist
        else:
            normal_x, normal_y = 0.0, -1.0

        penetration = self.ball.r - dist
        px += normal_x * penetration
        py += normal_y * penetration

        vn = vx * normal_x + vy * normal_y
        if vn < 0:
            vx -= (1 + self.restitution) * vn * normal_x
            vy -= (1 + self.restitution) * vn * normal_y

        if normal_y < -0.5 and vy >= -24:
            grounded = True
            if abs(vy) < 35:
                vy = 0

        return px, py, vx, vy, grounded

    def _predict_trajectory(self, dx: float, dy: float, dist: float) -> list[tuple[float, float]]:
        power = dist / MAX_DRAG
        vx = -(dx / (dist or 1)) * self.shot_speed * power
        vy = -(dy / (dist or 1)) * self.shot_speed * power
        px = self.ball.x
        py = self.ball.y
        grounded = False
        points: list[tuple[float, float]] = []

        step = 1 / 60
        for _ in range(50):
            grounded = False
            vy += self.gravity * step
            px += vx * step
            py += vy * step

            if px < self.ball.r:
                px = self.ball.r
                if vx < 0:
                    vx *= -self.restitution
            if px > WORLD_WIDTH - self.ball.r:
                px = WORLD_WIDTH - self.ball.r
                if vx > 0:
                    vx *= -self.restitution
            if py < self.ball.r:
                py = self.ball.r
                if vy < 0:
                    vy *= -self.restitution
            if py > WORLD_HEIGHT - self.ball.r:
                py = WORLD_HEIGHT - self.ball.r
                if vy > 0:
                    vy *= -self.restitution
                    if abs(vy) < 70:
                        vy = 0
                    grounded = True

            for platform in self.level.platforms:
                px, py, vx, vy, grounded = self._preview_rect_collision(
                    px,
                    py,
                    vx,
                    vy,
                    grounded,
                    platform.x,
                    platform.y,
                    platform.w,
                    platform.h,
                )

            if grounded:
                vx *= ROLL_DAMPING
            else:
                vx *= AIR_DAMPING
                vy *= AIR_DAMPING

            points.append((px, py))
            if math.hypot(vx, vy) < STOP_SPEED * 0.55:
                break

        return points

    def begin_drag(self, mx: float, my: float) -> None:
        if self.quiz_open or not self.shot_unlocked or self.won:
            return
        if self.multiplayer.enabled and not self.is_my_turn():
            return
        if math.hypot(self.ball.vx, self.ball.vy) > STOP_SPEED:
            return

        wx, wy = mx + self.camera_x, my + self.camera_y
        if math.hypot(wx - self.ball.x, wy - self.ball.y) > 34:
            self.set_message("Начни натяжку прямо от мяча.")
            return
        self.dragging = True
        self.drag_pos = (wx, wy)

    def move_drag(self, mx: float, my: float) -> None:
        if not self.dragging:
            return
        self.drag_pos = (mx + self.camera_x, my + self.camera_y)

    def end_drag(self) -> None:
        if not self.dragging:
            return
        self.dragging = False
        if not self.drag_pos:
            return
        dx = self.drag_pos[0] - self.ball.x
        dy = self.drag_pos[1] - self.ball.y
        dist = math.hypot(dx, dy)
        self.drag_pos = None
        if dist < MIN_DRAG_TO_SHOT:
            self.set_message("Слишком слабый удар.")
            self.audio.wrong()
            return

        dist = min(dist, MAX_DRAG)
        power = dist / MAX_DRAG
        self.ball.vx = -(dx / (dist or 1)) * self.shot_speed * power
        self.ball.vy = -(dy / (dist or 1)) * self.shot_speed * power
        self.ball.grounded = False
        self.shot_unlocked = False
        self.just_stopped = False
        self.strokes += 1
        if self.multiplayer.enabled:
            self.shots_remaining = max(0, self.shots_remaining - 1)
            self.awaiting_turn_end = self.shots_remaining <= 0
            self.set_message(f"Удар! Осталось ударов: {self.shots_remaining}.")
        else:
            self.set_message("Удар!")
        self.audio.shot()
        self.sync_room(pass_turn=False)

    def rect_collision(self, rx: float, ry: float, rw: float, rh: float) -> None:
        nx = clamp(self.ball.x, rx, rx + rw)
        ny = clamp(self.ball.y, ry, ry + rh)
        dx = self.ball.x - nx
        dy = self.ball.y - ny
        dist_sq = dx * dx + dy * dy
        rr = self.ball.r * self.ball.r
        if dist_sq > rr:
            return

        dist = math.sqrt(dist_sq) if dist_sq > 0.0001 else 0
        if dist > 0:
            normal_x = dx / dist
            normal_y = dy / dist
        else:
            normal_x, normal_y = 0, -1
        penetration = self.ball.r - dist
        self.ball.x += normal_x * penetration
        self.ball.y += normal_y * penetration

        vn = self.ball.vx * normal_x + self.ball.vy * normal_y
        if vn < 0:
            self.ball.vx -= (1 + self.restitution) * vn * normal_x
            self.ball.vy -= (1 + self.restitution) * vn * normal_y
        if normal_y < -0.5 and self.ball.vy >= -24:
            self.ball.grounded = True
            if abs(self.ball.vy) < 35:
                self.ball.vy = 0

    def hit_hazard(self, with_life: str, no_life: str) -> None:
        if self.multiplayer.enabled:
            self.reset_ball_to_checkpoint()
            self.audio.hazard()
            if self.shots_remaining > 0:
                self.shot_unlocked = True
                self.set_message(f"Препятствие. Осталось ударов: {self.shots_remaining}.")
                self.sync_room(pass_turn=False)
            else:
                self.end_turn("Ход завершён после препятствия.")
            return

        if self.lives > 0:
            self.lives -= 1
            self.reset_ball_to_checkpoint()
            self.shot_unlocked = False
            self.audio.hazard()
            self.open_quiz(f"{with_life} Осталось жизней: {self.lives}.")
            return

        self.reset_ball_to_checkpoint()
        self.shot_unlocked = False
        self.audio.hazard()
        self.open_quiz(no_life)

    def finish_level(self) -> None:
        self.ball.vx = 0
        self.ball.vy = 0
        self.audio.hole_complete()
        bonus = 100 + self.category.difficulty * 20 + max(0, (self.current_par - self.strokes) * 25)
        self.score += bonus
        if self.level_index < len(self.levels) - 1:
            self.load_level(self.level_index + 1)
            if self.multiplayer.enabled:
                self.end_turn(f"Лунка пройдена. Бонус +{bonus}. Ход сопернику.")
            else:
                self.set_message(f"Лунка пройдена. Бонус +{bonus}.")
            return

        self.won = True
        self.audio.victory()
        self.set_message(f"Матч завершён! Финальный бонус +{bonus}.")
        self.sync_room(pass_turn=False, allow_any_player=True)

    def serialize_snapshot(self) -> dict[str, Any]:
        if self.multiplayer.enabled:
            self._save_active_turn_state()
        return {
            "levelIndex": self.level_index,
            "strokes": self.strokes,
            "score": self.score,
            "lives": self.lives,
            "won": self.won,
            "ball": {
                "x": self.ball.x,
                "y": self.ball.y,
                "vx": self.ball.vx,
                "vy": self.ball.vy,
                "grounded": self.ball.grounded,
            },
            "checkpoint": {"x": self.checkpoint[0], "y": self.checkpoint[1]},
            "shotUnlocked": self.shot_unlocked,
            "shotsRemaining": self.shots_remaining,
            "playerStates": self.player_states if self.multiplayer.enabled else None,
        }

    def apply_snapshot(self, snap: dict[str, Any], preserve_local_turn: bool = False) -> None:
        if not snap:
            return
        new_level = int(snap.get("levelIndex", self.level_index))
        if new_level != self.level_index:
            self.load_level(new_level)
        self.strokes = int(snap.get("strokes", self.strokes))
        self.score = int(snap.get("score", self.score))
        self.lives = int(snap.get("lives", self.lives))
        self.won = bool(snap.get("won", self.won))
        if not preserve_local_turn:
            ball = snap.get("ball") or {}
            self.ball.x = float(ball.get("x", self.ball.x))
            self.ball.y = float(ball.get("y", self.ball.y))
            self.ball.vx = float(ball.get("vx", self.ball.vx))
            self.ball.vy = float(ball.get("vy", self.ball.vy))
            self.ball.grounded = bool(ball.get("grounded", self.ball.grounded))
            checkpoint = snap.get("checkpoint") or {}
            self.checkpoint = (float(checkpoint.get("x", self.checkpoint[0])), float(checkpoint.get("y", self.checkpoint[1])))
            self.shot_unlocked = bool(snap.get("shotUnlocked", self.shot_unlocked))
            self.shots_remaining = int(snap.get("shotsRemaining", self.shots_remaining))

        if self.multiplayer.enabled:
            incoming_states = snap.get("playerStates")
            if isinstance(incoming_states, dict):
                if preserve_local_turn and self.multiplayer.player_id:
                    self._save_active_turn_state()
                    local_state = self.player_states.get(self.multiplayer.player_id)
                    if local_state is not None:
                        incoming_states[self.multiplayer.player_id] = local_state
                self.player_states = incoming_states
                self._ensure_multiplayer_player_states()
                if self.multiplayer.turn_player_id and not preserve_local_turn:
                    self._load_turn_state(self.multiplayer.turn_player_id)

    def sync_room(self, pass_turn: bool, allow_any_player: bool = False) -> None:
        if not self.multiplayer.enabled:
            return
        try:
            room = self.api.update(self.serialize_snapshot(), pass_turn=pass_turn, allow_any_player=allow_any_player)
            self.multiplayer.turn_player_id = room.get("turnPlayerId") or self.multiplayer.turn_player_id
        except Exception as error:
            self.set_message(f"Сеть: {error}")

    def end_turn(self, text: str) -> None:
        if not self.multiplayer.enabled or self.turn_pass_pending:
            return
        self.turn_pass_pending = True
        self.awaiting_turn_end = False
        self.shot_unlocked = False
        self.shots_remaining = 0
        self.set_message(text)
        self.sync_room(pass_turn=True)
        self.turn_pass_pending = False

    def poll_room(self, now_ms: int) -> None:
        if not self.multiplayer.enabled or now_ms - self.last_poll_ms < 100:
            return
        self.last_poll_ms = now_ms
        try:
            previous_turn_id = self.multiplayer.turn_player_id
            room = self.api.state_poll()
            self.multiplayer.turn_player_id = room.get("turnPlayerId") or self.multiplayer.turn_player_id
            self.multiplayer_players = list(room.get("players") or self.multiplayer_players)
            became_my_turn = (
                previous_turn_id != self.multiplayer.player_id
                and self.multiplayer.turn_player_id == self.multiplayer.player_id
            )
            remote = room.get("snapshot")
            if remote:
                preserve_local_turn = self.is_my_turn() and not became_my_turn
                self.apply_snapshot(remote, preserve_local_turn=preserve_local_turn)
            if not self.is_my_turn():
                self.quiz_open = False
                self.set_message("Ход соперника...")
            elif self.is_my_turn() and not self.shot_unlocked and math.hypot(self.ball.vx, self.ball.vy) <= STOP_SPEED:
                if self.awaiting_turn_end:
                    self.set_message("Передача хода сопернику...")
                elif self.shots_remaining > 0:
                    self.shot_unlocked = True
                elif not self.quiz_open:
                    self.open_quiz("Твой ход. Реши задачу и сделай два удара.")
        except Exception as error:
            self.set_message(f"Сеть: {error}")

    def update(self, dt: float) -> None:
        if self.won:
            return
        if self.multiplayer.enabled and not self.is_my_turn():
            return

        sub_step = 1 / 120
        remaining = dt
        while remaining > 0:
            step = min(sub_step, remaining)
            remaining -= step

            self.ball.grounded = False
            self.ball.vy += self.gravity * step
            self.ball.x += self.ball.vx * step
            self.ball.y += self.ball.vy * step

            if self.ball.x < self.ball.r:
                self.ball.x = self.ball.r
                if self.ball.vx < 0:
                    self.ball.vx *= -self.restitution
            if self.ball.x > WORLD_WIDTH - self.ball.r:
                self.ball.x = WORLD_WIDTH - self.ball.r
                if self.ball.vx > 0:
                    self.ball.vx *= -self.restitution
            if self.ball.y < self.ball.r:
                self.ball.y = self.ball.r
                if self.ball.vy < 0:
                    self.ball.vy *= -self.restitution
            if self.ball.y > WORLD_HEIGHT - self.ball.r:
                self.ball.y = WORLD_HEIGHT - self.ball.r
                if self.ball.vy > 0:
                    self.ball.vy *= -self.restitution
                    if abs(self.ball.vy) < 70:
                        self.ball.vy = 0
                    self.ball.grounded = True

            for platform in self.level.platforms:
                self.rect_collision(platform.x, platform.y, platform.w, platform.h)

            if self.ball.grounded:
                self.ball.vx *= ROLL_DAMPING
            else:
                self.ball.vx *= AIR_DAMPING
                self.ball.vy *= AIR_DAMPING

        for pond in self.level.water:
            cx = pond.x + pond.w * 0.5
            cy = pond.y + pond.h * 0.5
            sw = pond.w * self.water_scale
            sh = pond.h * self.water_scale
            px = cx - sw * 0.5
            py = cy - sh * 0.5
            if self.ball.x + self.ball.r > px and self.ball.x - self.ball.r < px + sw and self.ball.y + self.ball.r > py and self.ball.y - self.ball.r < py + sh:
                self.hit_hazard("Плюх! Потрачена 1 жизнь.", "Плюх! Реши задачу заново.")
                return

        if self.ball.y + self.ball.r >= WORLD_HEIGHT - self.spike_height:
            self.hit_hazard("Шипы! Потрачена 1 жизнь.", "Шипы! Реши задачу заново.")
            return

        hole_dist = math.hypot(self.ball.x - self.level.hole.x, self.ball.y - self.level.hole.y)
        if hole_dist < self.level.hole.r - 2 and math.hypot(self.ball.vx, self.ball.vy) < 600:
            self.finish_level()
            return

        if math.hypot(self.ball.vx, self.ball.vy) <= STOP_SPEED:
            self.ball.vx = 0
            self.ball.vy = 0
            if math.hypot(self.ball.x - self.checkpoint[0], self.ball.y - self.checkpoint[1]) > 18:
                self.checkpoint = (self.ball.x, self.ball.y)
            if not self.just_stopped:
                self.just_stopped = True
                if self.multiplayer.enabled:
                    if self.awaiting_turn_end or self.shots_remaining <= 0:
                        self.audio.checkpoint()
                        self.end_turn("Чекпоинт сохранён. Ход сопернику.")
                    else:
                        self.shot_unlocked = True
                        self.set_message(f"Чекпоинт. Осталось ударов: {self.shots_remaining}.")
                        self.audio.checkpoint()
                        self.sync_room(pass_turn=False)
                else:
                    self.audio.checkpoint()
                    self.open_quiz("Чекпоинт сохранён. Реши новую задачу.")
        else:
            self.just_stopped = False

    def draw(self) -> None:
        self.align_camera()
        self.screen.fill((177, 223, 255))
        sw, sh = self.screen.get_size()

        for platform in self.level.platforms:
            sx, sy = self.world_to_screen(platform.x, platform.y)
            pygame.draw.rect(self.screen, (244, 234, 214), (sx, sy, platform.w, platform.h), border_radius=10)
            pygame.draw.rect(self.screen, (44, 44, 44), (sx, sy, platform.w, platform.h), width=2, border_radius=10)

        for pond in self.level.water:
            cx = pond.x + pond.w * 0.5
            cy = pond.y + pond.h * 0.5
            swater = pond.w * self.water_scale
            shater = pond.h * self.water_scale
            sx, sy = self.world_to_screen(cx - swater * 0.5, cy - shater * 0.5)
            pygame.draw.rect(self.screen, (159, 219, 255), (sx, sy, swater, shater), border_radius=10)
            pygame.draw.rect(self.screen, (20, 86, 140), (sx, sy, swater, shater), width=2, border_radius=10)

        spike_top = int(WORLD_HEIGHT - self.spike_height - self.camera_y)
        pygame.draw.rect(self.screen, (143, 32, 32), (0, spike_top, sw, sh - spike_top))

        hx, hy = self.world_to_screen(self.level.hole.x, self.level.hole.y)
        pygame.draw.circle(self.screen, (31, 29, 26), (hx, hy), int(self.level.hole.r))

        bx, by = self.world_to_screen(self.ball.x, self.ball.y)
        pygame.draw.circle(self.screen, (252, 229, 106), (bx, by), int(self.ball.r))
        pygame.draw.circle(self.screen, (45, 45, 45), (bx, by), int(self.ball.r), width=2)

        if self.multiplayer.enabled:
            opponent_id = ""
            for player in self.multiplayer_players:
                pid = str(player.get("id") or "")
                if pid and pid != self.multiplayer.player_id:
                    opponent_id = pid
                    break
            opponent_state = self.player_states.get(opponent_id, {}) if opponent_id else {}
            opponent_ball = opponent_state.get("ball") or {}
            if opponent_ball:
                ox, oy = self.world_to_screen(float(opponent_ball.get("x", -9999)), float(opponent_ball.get("y", -9999)))
                pygame.draw.circle(self.screen, (106, 199, 255), (ox, oy), int(self.ball.r))
                pygame.draw.circle(self.screen, (20, 86, 140), (ox, oy), int(self.ball.r), width=2)

        if self.dragging and self.drag_pos:
            dx = self.drag_pos[0] - self.ball.x
            dy = self.drag_pos[1] - self.ball.y
            dist = min(math.hypot(dx, dy), MAX_DRAG)
            if dist > 0:
                points = self._predict_trajectory(dx, dy, dist)
                prev = (bx, by)
                for index, point in enumerate(points):
                    sx, sy = self.world_to_screen(point[0], point[1])
                    glow = max(90, 255 - index * 4)
                    width = 2 if index < len(points) - 1 else 3
                    pygame.draw.line(self.screen, (glow, glow, 100), prev, (sx, sy), width)
                    prev = (sx, sy)

                if len(points) >= 2:
                    ex, ey = self.world_to_screen(points[-1][0], points[-1][1])
                    px2, py2 = self.world_to_screen(points[-2][0], points[-2][1])
                    ax = ex - px2
                    ay = ey - py2
                    alen = math.hypot(ax, ay)
                    if alen > 0:
                        ux = ax / alen
                        uy = ay / alen
                        arrow_len = 14
                        wing = 7
                        left = (ex - ux * arrow_len - uy * wing, ey - uy * arrow_len + ux * wing)
                        right = (ex - ux * arrow_len + uy * wing, ey - uy * arrow_len - ux * wing)
                        pygame.draw.polygon(self.screen, (255, 245, 100), [(ex, ey), left, right])

                px = self.ball.x + dx / math.hypot(dx, dy) * dist
                py = self.ball.y + dy / math.hypot(dx, dy) * dist
                ex, ey = self.world_to_screen(px, py)
                pygame.draw.line(self.screen, (240, 70, 70), (bx, by), (ex, ey), width=3)

        hud = f"{self.category.title} | Лунка {self.level_index + 1}/{len(self.levels)} | Par {self.current_par} | Удары {self.strokes} | Очки {self.score} | Жизни {self.lives}"
        self.screen.blit(self.text.render(self.small, hud, (20, 20, 20)), (12, 10))
        self.screen.blit(self.text.render(self.small, self.message, (15, 15, 15)), (12, 34))
        if self.multiplayer.enabled:
            turn_text = "твой" if self.is_my_turn() else "соперника"
            self.screen.blit(self.text.render(self.small, f"Комната {self.multiplayer.room_code} | Ход: {turn_text}", (15, 15, 15)), (12, 56))

        if self.quiz_open and self.current_question:
            panel = pygame.Rect(145, 420, 900, 190)
            pygame.draw.rect(self.screen, (255, 255, 255), panel, border_radius=14)
            pygame.draw.rect(self.screen, (20, 20, 20), panel, width=2, border_radius=14)
            self.screen.blit(self.text.render(self.font, "Квиз для удара", (20, 20, 20)), (panel.x + 16, panel.y + 14))
            self.screen.blit(self.text.render(self.small, self.current_question.text, (20, 20, 20)), (panel.x + 16, panel.y + 56))
            self.screen.blit(self.text.render(self.small, f"Ответ: {self.answer_buffer}", (20, 20, 20)), (panel.x + 16, panel.y + 92))
            self.screen.blit(self.text.render(self.small, "Enter — проверить, Backspace — стереть", (80, 80, 80)), (panel.x + 16, panel.y + 132))

        pygame.display.flip()

    def handle_event(self, event: pygame.event.Event) -> None:
        if event.type == pygame.QUIT:
            self.running = False
            return

        if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
            self.begin_drag(*event.pos)
            return
        if event.type == pygame.MOUSEMOTION and self.dragging:
            self.move_drag(*event.pos)
            return
        if event.type == pygame.MOUSEBUTTONUP and event.button == 1:
            self.end_drag()
            return

        if self.quiz_open and event.type == pygame.KEYDOWN:
            if event.key == pygame.K_RETURN:
                self.submit_answer()
            elif event.key == pygame.K_BACKSPACE:
                self.answer_buffer = self.answer_buffer[:-1]
            elif event.unicode and event.unicode in "0123456789-.,/":
                self.answer_buffer += event.unicode
            return

        if event.type == pygame.KEYDOWN:
            if event.key == pygame.K_ESCAPE:
                self.running = False
            elif event.key == pygame.K_r and not self.multiplayer.enabled:
                self.load_level(self.level_index)
            elif event.key == pygame.K_n and not self.multiplayer.enabled:
                self.load_level(min(self.level_index + 1, len(self.levels) - 1))

    def run(self) -> None:
        while self.running:
            dt = self.clock.tick(60) / 1000
            now_ms = pygame.time.get_ticks()
            for event in pygame.event.get():
                self.handle_event(event)
            self.poll_room(now_ms)
            self.update(dt)
            self.draw()

        pygame.quit()
