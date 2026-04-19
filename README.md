# game4s

Репозиторий переведён на Python-стек с сохранением идеи и механик игры.

Актуальная реализация находится в папке [python_port/README.md](python_port/README.md).

## Что уже есть в Python версии

- `pygame` клиент: физика мяча, drag-удар, квиз перед ударом, чекпоинты, вода/шипы, пар и очки.
- Локальная hot-seat комната на одном устройстве: 1–4 игрока, передача хода по кругу.

## Быстрый старт (Python)

```bash
cd python_port
python -m venv .venv
source .venv/bin/activate
pip install -e .
```

Клиент:

```bash
python -m game4s_py.client.main --players 2 --name "Игрок 1"
```

## Legacy

JS/Vite версия сохранена в корне как legacy-референс механик, но основной поток разработки теперь Python.
