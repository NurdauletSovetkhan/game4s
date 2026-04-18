# game4s на Python

Полный Python-порт проекта с сохранением идеи и механик:

- 2D мини-гольф по платформам с физикой мяча
- математический квиз как gate перед ударом
- чекпоинты, вода/шипы, очки, жизни, пар
- 1v1 комнаты с передачей хода и синхронизацией состояния

## Архитектура

- `game4s_py/shared/game_data.py`
  - мир, категории, генерация вопросов, генерация 3 лунок на категорию
  - константы физики и парсинг ответов
- `game4s_py/server/main.py`
  - FastAPI API: `create/join/state/update`
  - совместимая логика ревизий и передачи хода
- `game4s_py/server/storage.py`
  - Redis storage (если есть `REDIS_URL`)
  - fallback на in-memory для локальной разработки
- `game4s_py/client/main.py`
  - pygame клиент с рендером, вводом, физикой и квизом
  - опциональная синхронизация с API
  - встроенные звуки (удар, верный/неверный ответ, чекпоинт, препятствия, финиш)

## Игровая логика (перенесено)

- Удар открывается только после верного ответа в квизе.
- В мультиплеере после верного ответа игрок получает 2 удара.
- При слабом drag удар не выполняется.
- После остановки мяча сохраняется чекпоинт.
- Попадание в воду/шипы: респавн на чекпоинте и штраф.
- В одиночном режиме штраф снимает жизни; при 0 жизней снова нужен квиз.
- При попадании в лунку начисляется бонус за результат относительно par.
- В мультиплеере ход передаётся сопернику, когда удары закончились.

## Запуск

Из папки `python_port`:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e .
```

Если запускаешь из корня репозитория `game4s`, используй:

```bash
python -m pip install -e python_port
```

### API сервер

```bash
uvicorn game4s_py.server.main:app --reload --port 8000
```

### Публикация API через Cloudflare Tunnel (Debian 13)

Ниже вариант без открытия входящих портов на домашнем роутере и без раскрытия origin IP.

1) Запусти API локально на сервере (только loopback):

```bash
uvicorn game4s_py.server.main:app --host 127.0.0.1 --port 8000
```

2) В Cloudflare Zero Trust создай/используй tunnel и привяжи hostname (например, `api.<твой-домен>`).

На сервере (если tunnel уже есть):

```bash
sudo mkdir -p /etc/cloudflared
sudo cloudflared tunnel token <TUNNEL_ID_OR_NAME> > /tmp/cloudflared-token.txt
sudo cloudflared service install "$(cat /tmp/cloudflared-token.txt)"
rm /tmp/cloudflared-token.txt
```

3) Настрой ingress в `/etc/cloudflared/config.yml`:

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /etc/cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: api.<твой-домен>
    service: http://127.0.0.1:8000
  - service: http_status:404
```

4) Применить и проверить:

```bash
sudo systemctl enable --now cloudflared
sudo systemctl restart cloudflared
sudo systemctl status cloudflared --no-pager
curl -i https://api.<твой-домен>/health
```

5) В клиенте укажи API:

```bash
python -m game4s_py.client.main --multi --api https://api.<твой-домен>
```

6) CORS для продакшна (не оставляй `*`):

API читает переменную `CORS_ALLOW_ORIGINS` (через запятую).

Пример:

```bash
export CORS_ALLOW_ORIGINS="https://<твой-сайт>,https://api.<твой-домен>"
uvicorn game4s_py.server.main:app --host 127.0.0.1 --port 8000
```

Рекомендации:
- не открывай `8000` наружу на роутере;
- для API-роута в Cloudflare включи rate limiting и WAF правила;
- если нужен только приватный доступ, вместо публичного hostname используй Cloudflare Access policy.

### API в Docker (рекомендуется для always-on)

Если не хочешь держать `uvicorn` вручную, запускай API как контейнер с авто-рестартом.

Из `python_port`:

```bash
docker compose -f docker-compose.api.yml up -d --build
```

Проверка:

```bash
curl -i http://127.0.0.1:18080/health
```

Логи:

```bash
docker compose -f docker-compose.api.yml logs -f
```

Обновление после `git pull`:

```bash
docker compose -f docker-compose.api.yml up -d --build
```

Остановка:

```bash
docker compose -f docker-compose.api.yml down
```

### Одиночная игра

```bash
python -m game4s_py.client.main --category arith --name "Игрок"
```

Альтернатива (из корня репозитория, без `-m`):

```bash
python python_port/game4s_py/client/main.py
```

По умолчанию клиент открывает меню запуска (выбор имени, категории, solo/multi, room, API).

В мультиплеере при создании новой комнаты игра показывает крупный код комнаты и ждёт подключения второго игрока. После подключения соперника игра продолжается автоматически.

Поле API в меню скрыто: endpoint берётся из `--api` или `GAME4S_API_BASE`.

В меню также можно настроить:

- размер текста интерфейса
- громкость звуков
- силу удара
- гравитацию
- отскок

- Навигация: `↑/↓`
- Переключение опций: `←/→`
- Старт: `Enter` на пункте `Старт`
- Выход из меню: `Esc`

Если нужно стартовать сразу без меню:

```bash
python -m game4s_py.client.main --no-menu --category arith --name "Игрок"
```

### Мультиплеер (локально)

Хост (создать комнату):

```bash
python -m game4s_py.client.main --multi --name "Host" --category arith --api http://127.0.0.1:8000
```

Подключение к комнате (второй клиент):

```bash
python -m game4s_py.client.main --multi --room ROOMCODE --name "Guest" --category arith --api http://127.0.0.1:8000
```

Можно задать API по умолчанию через переменную окружения (чтобы не хардкодить домен в коде/командах):

```bash
export GAME4S_API_BASE="https://api.sovetkhan.kz"
python -m game4s_py.client.main --multi --name "Host" --category arith
```

Важно: при подключении к существующей комнате используются **gameplay-настройки хоста** (сила удара, гравитация, отскок). Локальные UI-настройки (размер текста, громкость) остаются у каждого игрока своими.

## Что можно улучшить дальше

- более точная визуальная копия web-рендера
- предсказание/интерполяция соперника для более плавного 1v1
- сохранение прогресса в БД
