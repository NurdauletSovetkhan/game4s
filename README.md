# game4s

Мини-игра с математическим квизом, физикой мяча и режимом 1v1.

## Быстрый старт

- Установка зависимостей: `npm install`
- Запуск в dev-режиме: `npm run dev`
- Прод-сборка: `npm run build`
- Просмотр сборки: `npm run preview`

## Структура проекта

### Корневые файлы

- `game.js` — основной orchestration-файл игры (склейка модулей, создание контроллеров)
- `game-audio.js` — звуки игры
- `game-data.js` — уровни, категории, базовые world-константы
- `index.html`, `styles.css` — UI и стили игрового экрана
- `menu.html`, `menu.js`, `menu/*` — экран меню и выбор режима/категории
- `api/*` — серверные endpoint-ы для комнат мультиплеера

### Модули игры (`/game`)

Ниже — 11 модулей (вместе с `game.js`), разложенных по зонам ответственности:

1. `game/constants.js`
   - core-константы (drag, damping, polling, viewport presets)
   - утилиты: `clamp`, `randInt`, `scaledRect`, `parseAnswerInput`

2. `game/multiplayer-controller.js`
   - сетевой слой мультиплеера
   - polling, sync, передача хода, защита от гонок запросов

3. `game/input-controller.js`
   - pointer/drag логика
   - запуск удара и обработка слабого/валидного натяжения

4. `game/quiz-controller.js`
   - модалка вопроса
   - проверка ответа
   - начисление/штраф очков и жизней

5. `game/physics-controller.js`
   - физический тик `update`
   - коллизии, вода/шипы, чекпоинты
   - `loadLevel`, `finishLevel`, `resetBallToCheckpoint`

6. `game/camera-viewport.js`
   - `alignCameraToBall`, `updateCamera`
   - адаптация canvas под устройство/ориентацию

7. `game/bootstrap.js`
   - подписки на UI/keyboard/pointer события
   - старт инициализации игры

8. `game/render/background.js`
   - фон: небо, горы, светила, водопады, птицы

9. `game/render/hud.js`
   - HUD жизней/попыток (включая hearts-отрисовку)

10. `game/render/player-animation.js`
    - рендер мяча/клюшки/aim
    - интерполяция соперника
    - `frame` (главный рендер-луп)

11. `game.js`
    - композиция модулей и связывание зависимостей

## Куда смотреть при баге

### 1) Баги управления (не тянется удар, странный drag)

- Проверяй: `game/input-controller.js`
- Ключевые зоны:
  - `getPointerPos`
  - `getDragVector`
  - `startDrag` / `moveDrag` / `endDrag`

### 2) Баги квиза (неверная проверка ответа, не закрывается модалка)

- Проверяй: `game/quiz-controller.js`
- Ключевые зоны:
  - `openQuizModal` / `closeQuizModal`
  - `handleAnswerSubmit`
  - `onCorrectAnswer`

### 3) Баги физики (мяч проходит сквозь платформы, странный отскок)

- Проверяй: `game/physics-controller.js`
- Ключевые зоны:
  - `resolveBoundaryCollision`
  - `resolveRectCollision`
  - `update`

### 4) Баги уровней/прогресса (не грузится лунка, не засчитывается финиш)

- Проверяй: `game/physics-controller.js`
- Ключевые зоны:
  - `loadLevel`
  - `finishLevel`
  - `resetBallToCheckpoint`

### 5) Баги камеры/адаптива (прыгает камера, неверный размер canvas)

- Проверяй: `game/camera-viewport.js`
- Ключевые зоны:
  - `updateCanvasViewport`
  - `alignCameraToBall`
  - `updateCamera`

### 6) Баги фона/HUD/отрисовки

- Фон: `game/render/background.js`
- HUD жизни/попытки: `game/render/hud.js`
- Мяч/прицел/интерполяция: `game/render/player-animation.js`

### 7) Баги мультиплеера (рассинхрон, ход не передаётся, рывки соперника)

- Проверяй: `game/multiplayer-controller.js`
- Также параметры в `game/constants.js`:
  - `MULTI_POLL_MS`
  - `MULTI_LIVE_SYNC_MS`

## Практика безопасного фикса

1. Локализуй проблему в одном модуле.
2. Исправляй только этот модуль (без каскадных правок).
3. Проверь, что нет ошибок в изменённом файле.
4. Прогони игру в dev-режиме и проверь сценарий бага вручную.

## Заметка по архитектуре

`game.js` специально оставлен как точка композиции (dependency wiring). Основная логика вынесена в отдельные модули, чтобы баги проще находились и фиксились точечно.
