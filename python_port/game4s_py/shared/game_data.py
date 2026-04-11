from __future__ import annotations

from dataclasses import dataclass
import math
import random
import re

WORLD_WIDTH = 2550
WORLD_HEIGHT = 1750

MAX_DRAG = 190.0
MIN_DRAG_TO_SHOT = 10.0
STOP_SPEED = 32.0
ROLL_DAMPING = 0.96
AIR_DAMPING = 0.999


def clamp(value: float, min_value: float, max_value: float) -> float:
    return max(min_value, min(max_value, value))


def rand_int(min_value: int, max_value: int) -> int:
    return random.randint(min_value, max_value)


def parse_answer_input(text: str) -> float:
    clean = text.strip().replace(",", ".")
    if not clean:
        return math.nan

    if re.fullmatch(r"-?\d+/-?\d+", clean):
        left, right = [int(x) for x in clean.split("/")]
        if right == 0:
            return math.nan
        return left / right

    try:
        return float(clean)
    except ValueError:
        return math.nan


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


@dataclass
class Rect:
    x: float
    y: float
    w: float
    h: float


@dataclass
class Hole:
    x: float
    y: float
    r: float


@dataclass
class Level:
    par: int
    start_x: float
    start_y: float
    hole: Hole
    platforms: list[Rect]
    water: list[Rect]


@dataclass
class Question:
    text: str
    answer: float
    tolerance: float


@dataclass
class CategoryDef:
    id: str
    title: str
    difficulty: int

    def create_question(self) -> Question:
        trig_bank = [
            ("sin(30°)", 0.5, 0.02),
            ("sin(45°)", 0.707, 0.03),
            ("sin(60°)", 0.866, 0.03),
            ("cos(30°)", 0.866, 0.03),
            ("cos(45°)", 0.707, 0.03),
            ("cos(60°)", 0.5, 0.02),
            ("tan(45°)", 1.0, 0.02),
            ("tan(60°)", 1.732, 0.04),
        ]

        if self.id == "arith":
            mode = rand_int(0, 2)
            if mode == 0:
                a = rand_int(14, 99)
                b = rand_int(11, 88)
                return Question(f"{a} + {b} = ?", float(a + b), 0.001)
            if mode == 1:
                a = rand_int(90, 180)
                b = rand_int(16, 70)
                return Question(f"{a} - {b} = ?", float(a - b), 0.001)
            b = rand_int(4, 12)
            ans = rand_int(3, 14)
            return Question(f"{b * ans} ÷ {b} = ?", float(ans), 0.001)

        if self.id == "fractions":
            den = random.choice([4, 5, 6, 8, 10])
            a = rand_int(1, den - 1)
            b = rand_int(1, den - 1)
            return Question(f"{a}/{den} + {b}/{den} = ? (десятичное)", (a + b) / den, 0.03)

        if self.id == "percent":
            p = random.choice([10, 15, 20, 25, 30, 40])
            n = rand_int(80, 300)
            return Question(f"{p}% от {n} = ?", (n * p) / 100, 0.03)

        if self.id == "powers":
            if rand_int(0, 1) == 0:
                base = rand_int(3, 11)
                exp = rand_int(2, 3)
                return Question(f"{base}^{exp} = ?", float(base**exp), 0.001)
            root = rand_int(4, 18)
            return Question(f"√{root * root} = ?", float(root), 0.001)

        if self.id == "equations":
            x = rand_int(2, 14)
            a = rand_int(2, 8)
            b = rand_int(4, 32)
            return Question(f"{a}x + {b} = {a * x + b}. Найди x", float(x), 0.001)

        expr, answer, tolerance = random.choice(trig_bank)
        return Question(f"{expr} = ?", answer, tolerance)


def _build_diagonal_level(
    *,
    start_x: float,
    start_y: float,
    hole_x: float,
    hole_y: float,
    segments: int,
    zigzag: float,
    phase: float,
    width_base: float,
    water_every: int,
    water_shift: int,
    par: int,
) -> Level:
    platforms: list[Rect] = []
    for index in range(segments):
        t = 0.0 if segments == 1 else index / (segments - 1)
        center_x = lerp(start_x + 50, hole_x - 70, t) + math.sin(index * 1.14 + phase) * zigzag * (1 - t * 0.35)
        center_y = lerp(start_y + 65, hole_y + 170, t) + math.cos(index * 0.9 + phase) * 36
        width = clamp(width_base + ((index % 4) - 1.5) * 24, 160, 370)
        x = clamp(center_x - width * 0.5, 20, WORLD_WIDTH - width - 20)
        y = clamp(center_y, 110, WORLD_HEIGHT - 120)
        platforms.append(Rect(round(x), round(y), round(width), 20))

        if index % 4 == 1:
            side = 1 if index % 8 == 1 else -1
            assist_x = clamp(x + side * (width + 34), 20, WORLD_WIDTH - 150)
            assist_y = clamp(y - 92, 90, WORLD_HEIGHT - 130)
            platforms.append(Rect(round(assist_x), round(assist_y), 140, 18))

    platforms.append(
        Rect(
            clamp(hole_x - 130, 30, WORLD_WIDTH - 260),
            clamp(hole_y + 120, 100, WORLD_HEIGHT - 120),
            260,
            20,
        )
    )

    water: list[Rect] = []
    for index in range(water_shift, segments, water_every):
        source = platforms[min(index, len(platforms) - 1)]
        side = -1 if index % 2 == 0 else 1
        w = 112
        h = 82
        x = clamp(source.x + (-w - 22 if side < 0 else source.w + 22), 0, WORLD_WIDTH - w)
        y = clamp(source.y + 18, 90, WORLD_HEIGHT - h - 50)
        water.append(Rect(round(x), round(y), w, h))

    return Level(par, start_x, start_y, Hole(hole_x, hole_y, 20), platforms, water)


CATEGORY_DEFS: list[CategoryDef] = [
    CategoryDef("arith", "Базовая арифметика", 1),
    CategoryDef("fractions", "Дроби", 2),
    CategoryDef("percent", "Проценты", 3),
    CategoryDef("powers", "Степени и корни", 4),
    CategoryDef("equations", "Линейные уравнения", 5),
    CategoryDef("trig", "Тригонометрия", 6),
]


COURSES: dict[str, list[Level]] = {
    "arith": [
        _build_diagonal_level(start_x=120, start_y=1470, hole_x=2320, hole_y=240, segments=8, zigzag=75, phase=0.2, width_base=344, water_every=7, water_shift=4, par=3),
        _build_diagonal_level(start_x=150, start_y=1470, hole_x=2280, hole_y=250, segments=8, zigzag=85, phase=1.1, width_base=332, water_every=6, water_shift=3, par=3),
        _build_diagonal_level(start_x=180, start_y=1460, hole_x=2300, hole_y=230, segments=9, zigzag=95, phase=2.1, width_base=320, water_every=6, water_shift=4, par=4),
    ],
    "fractions": [
        _build_diagonal_level(start_x=120, start_y=1470, hole_x=2350, hole_y=240, segments=9, zigzag=110, phase=0.5, width_base=310, water_every=6, water_shift=3, par=4),
        _build_diagonal_level(start_x=150, start_y=1460, hole_x=2290, hole_y=240, segments=9, zigzag=120, phase=1.4, width_base=302, water_every=6, water_shift=2, par=4),
        _build_diagonal_level(start_x=200, start_y=1460, hole_x=2310, hole_y=220, segments=10, zigzag=130, phase=2.6, width_base=295, water_every=5, water_shift=3, par=4),
    ],
    "percent": [
        _build_diagonal_level(start_x=130, start_y=1470, hole_x=2320, hole_y=230, segments=10, zigzag=145, phase=0.3, width_base=288, water_every=5, water_shift=2, par=4),
        _build_diagonal_level(start_x=170, start_y=1460, hole_x=2300, hole_y=220, segments=10, zigzag=155, phase=1.7, width_base=282, water_every=5, water_shift=3, par=5),
        _build_diagonal_level(start_x=210, start_y=1460, hole_x=2320, hole_y=205, segments=10, zigzag=165, phase=2.4, width_base=275, water_every=5, water_shift=2, par=5),
    ],
    "powers": [
        _build_diagonal_level(start_x=130, start_y=1470, hole_x=2330, hole_y=215, segments=10, zigzag=180, phase=0.8, width_base=268, water_every=5, water_shift=2, par=5),
        _build_diagonal_level(start_x=170, start_y=1460, hole_x=2300, hole_y=210, segments=10, zigzag=192, phase=1.9, width_base=262, water_every=4, water_shift=2, par=5),
        _build_diagonal_level(start_x=210, start_y=1460, hole_x=2320, hole_y=195, segments=11, zigzag=200, phase=2.7, width_base=255, water_every=4, water_shift=3, par=5),
    ],
    "equations": [
        _build_diagonal_level(start_x=120, start_y=1470, hole_x=2320, hole_y=205, segments=11, zigzag=215, phase=0.4, width_base=248, water_every=4, water_shift=2, par=5),
        _build_diagonal_level(start_x=160, start_y=1460, hole_x=2300, hole_y=198, segments=11, zigzag=225, phase=1.5, width_base=242, water_every=4, water_shift=1, par=6),
        _build_diagonal_level(start_x=210, start_y=1460, hole_x=2320, hole_y=188, segments=11, zigzag=235, phase=2.2, width_base=238, water_every=4, water_shift=2, par=6),
    ],
    "trig": [
        _build_diagonal_level(start_x=120, start_y=1470, hole_x=2340, hole_y=198, segments=11, zigzag=248, phase=0.7, width_base=230, water_every=4, water_shift=1, par=6),
        _build_diagonal_level(start_x=160, start_y=1460, hole_x=2310, hole_y=188, segments=11, zigzag=260, phase=1.8, width_base=225, water_every=3, water_shift=1, par=6),
        _build_diagonal_level(start_x=210, start_y=1460, hole_x=2325, hole_y=180, segments=12, zigzag=272, phase=2.9, width_base=220, water_every=3, water_shift=2, par=7),
    ],
}
