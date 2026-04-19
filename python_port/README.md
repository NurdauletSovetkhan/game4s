# game4s на Python

Локальная версия игры на `pygame` без сервера:

- 2D мини-гольф по платформам с физикой мяча
- математический квиз перед ударом
- чекпоинты, вода/шипы, очки, жизни, par
- hot-seat режим на одном устройстве: от 1 до 4 игроков

## Запуск

Из папки `python_port`:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e .
```

Если запускаешь из корня репозитория:

```bash
python -m pip install -e python_port
```

## Старт игры

По умолчанию открывается меню:

```bash
python -m game4s_py.client.main
```

Примеры быстрого запуска:

```bash
python -m game4s_py.client.main --players 1 --name "Игрок"
python -m game4s_py.client.main --players 2 --name "Игрок 1"
python -m game4s_py.client.main --players 4 --name "Игрок 1"
```

## Управление

- Меню: `↑/↓` выбрать, `←/→` менять, `Enter` старт, `Esc` выход
- Игра: ЛКМ drag от мяча, чтобы ударить
- В hot-seat режиме ход передается следующему игроку автоматически

## Структура

- `game4s_py/client` — клиент и игровой цикл
- `game4s_py/shared` — данные мира и генерация задач

Серверные и docker-файлы удалены как неиспользуемые.
