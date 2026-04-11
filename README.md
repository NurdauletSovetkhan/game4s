# game4s

Репозиторий переведён на Python-стек с сохранением идеи и механик игры.

Актуальная реализация находится в папке [python_port/README.md](python_port/README.md).

## Что уже есть в Python версии

- `pygame` клиент: физика мяча, drag-удар, квиз перед ударом, чекпоинты, вода/шипы, пар и очки.
- `FastAPI` backend: комнаты 1v1 (`create/join/state/update`) с ревизиями состояния.
- Поддержка `Redis` через `REDIS_URL` и fallback в in-memory storage.

## Быстрый старт (Python)

```bash
cd python_port
python -m venv .venv
source .venv/bin/activate
pip install -e .
```

Сервер:

```bash
uvicorn game4s_py.server.main:app --reload --port 8000
```

Клиент:

```bash
python -m game4s_py.client.main --category arith --name "Игрок"
```

## Legacy

JS/Vite версия сохранена в корне как legacy-референс механик, но основной поток разработки теперь Python.
