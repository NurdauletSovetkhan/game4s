from __future__ import annotations

from array import array
import math
from pathlib import Path

import pygame


SFX_DIR = Path(__file__).resolve().parents[2] / "assets" / "sfx"


class AudioEngine:
    def __init__(self, volume: float = 0.7) -> None:
        self.available = False
        self.volume = max(0.0, min(1.0, float(volume)))
        self._cache: dict[tuple[int, int], pygame.mixer.Sound] = {}
        self._samples: dict[str, pygame.mixer.Sound] = {}
        try:
            if not pygame.mixer.get_init():
                pygame.mixer.init(frequency=44100, size=-16, channels=1)
            self.available = True
        except Exception:
            self.available = False
        if self.available:
            self._load_samples()

    def set_volume(self, volume: float) -> None:
        self.volume = max(0.0, min(1.0, float(volume)))

    def _load_samples(self) -> None:
        names = {
            "click": "click.wav",
            "select": "select.wav",
            "shot": "shot.wav",
            "correct": "correct.wav",
            "wrong": "wrong.wav",
            "checkpoint": "checkpoint.wav",
            "hazard": "hazard.wav",
            "hole_complete": "hole_complete.wav",
            "victory": "victory.wav",
        }
        for key, filename in names.items():
            path = SFX_DIR / filename
            if not path.exists():
                continue
            try:
                self._samples[key] = pygame.mixer.Sound(str(path))
            except Exception:
                continue

    def _play_sample(self, key: str, gain: float = 1.0) -> bool:
        if not self.available:
            return False
        sample = self._samples.get(key)
        if sample is None:
            return False
        sample.set_volume(max(0.0, min(1.0, self.volume * gain)))
        sample.play()
        return True

    def _tone(self, freq_hz: int, duration_ms: int) -> pygame.mixer.Sound | None:
        key = (freq_hz, duration_ms)
        if key in self._cache:
            return self._cache[key]
        sample_rate = 44100
        samples_count = int(sample_rate * (duration_ms / 1000.0))
        amplitude = int(32767 * 0.35)
        samples = array("h")
        for index in range(samples_count):
            sample = int(amplitude * math.sin(2.0 * math.pi * freq_hz * index / sample_rate))
            samples.append(sample)
        try:
            sound = pygame.mixer.Sound(buffer=samples.tobytes())
            self._cache[key] = sound
            return sound
        except Exception:
            return None

    def play_tone(self, freq_hz: int, duration_ms: int, gain: float = 1.0) -> None:
        if not self.available:
            return
        sound = self._tone(freq_hz, duration_ms)
        if sound is None:
            return
        sound.set_volume(max(0.0, min(1.0, self.volume * gain)))
        sound.play()

    def click(self) -> None:
        if self._play_sample("click", 0.7):
            return
        self.play_tone(740, 55, 0.5)

    def select(self) -> None:
        if self._play_sample("select", 0.9):
            return
        self.play_tone(900, 80, 0.7)

    def shot(self) -> None:
        if self._play_sample("shot", 1.0):
            return
        self.play_tone(240, 110, 0.9)

    def correct(self) -> None:
        if self._play_sample("correct", 1.0):
            return
        self.play_tone(950, 120, 0.9)

    def wrong(self) -> None:
        if self._play_sample("wrong", 1.0):
            return
        self.play_tone(170, 150, 0.9)

    def checkpoint(self) -> None:
        if self._play_sample("checkpoint", 0.95):
            return
        self.play_tone(620, 90, 0.75)

    def hazard(self) -> None:
        if self._play_sample("hazard", 1.0):
            return
        self.play_tone(120, 180, 0.95)

    def hole_complete(self) -> None:
        if self._play_sample("hole_complete", 1.0):
            return
        self.play_tone(1020, 170, 0.95)

    def victory(self) -> None:
        if self._play_sample("victory", 1.0):
            return
        self.play_tone(1150, 190, 1.0)
