from __future__ import annotations

import os

from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware

from game4s_py.server.models import CreateRoomRequest, JoinRoomRequest, Room, UpdateRoomRequest
from game4s_py.server.service import new_room, next_turn_player, normalize_name, now_iso, random_code, random_player_id
from game4s_py.server.storage import RoomStorage


def _cors_origins() -> list[str]:
    raw = os.getenv("CORS_ALLOW_ORIGINS", "*").strip()
    if not raw:
        return ["*"]
    if raw == "*":
        return ["*"]
    return [item.strip() for item in raw.split(",") if item.strip()]


app = FastAPI(title="game4s-python-api", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

storage = RoomStorage()


@app.get("/health")
async def health() -> dict[str, bool]:
    return {"ok": True}


@app.get("/")
async def root() -> dict[str, str]:
    return {
        "service": "game4s-python-api",
        "status": "ok",
        "health": "/health",
        "docs": "/docs",
    }


@app.get("/favicon.ico", include_in_schema=False)
async def favicon() -> Response:
    return Response(status_code=204)


@app.post("/api/room/create")
async def create_room(payload: CreateRoomRequest) -> dict:
    category = payload.category.strip()
    if not category:
        raise HTTPException(status_code=400, detail="Category is required")

    player_id = random_player_id()
    room_code = random_code()
    tries = 0
    while tries < 8 and await storage.get_room(room_code):
        room_code = random_code()
        tries += 1

    if await storage.get_room(room_code):
        raise HTTPException(status_code=503, detail="Unable to allocate room code")

    room = new_room(
        room_code,
        category,
        player_id,
        normalize_name(payload.name),
        payload.gameplaySettings,
    )
    await storage.save_room(room_code, room.model_dump())
    return {"ok": True, "roomCode": room_code, "category": category, "playerId": player_id, "room": room.model_dump()}


@app.post("/api/room/join")
async def join_room(payload: JoinRoomRequest) -> dict:
    room_code = payload.roomCode.strip().upper()
    if not room_code:
        raise HTTPException(status_code=400, detail="Room code is required")

    raw = await storage.get_room(room_code)
    if not raw:
        raise HTTPException(status_code=404, detail="Room not found")

    room = Room.model_validate(raw)
    if len(room.players) >= 2:
        raise HTTPException(status_code=409, detail="Room is full")

    player_id = random_player_id()
    room.players.append({"id": player_id, "name": normalize_name(payload.name)})
    room.status = "active"
    room.updatedAt = now_iso()
    room.revision = (room.revision or 1) + 1
    await storage.save_room(room_code, room.model_dump())
    return {
        "ok": True,
        "roomCode": room_code,
        "category": room.category,
        "playerId": player_id,
        "room": room.model_dump(),
    }


@app.get("/api/room/state")
async def room_state(room: str = Query(default=""), player: str = Query(default="")) -> dict:
    room_code = room.strip().upper()
    player_id = player.strip()
    if not room_code or not player_id:
        raise HTTPException(status_code=400, detail="Room and player are required")

    raw = await storage.get_room(room_code)
    if not raw:
        raise HTTPException(status_code=404, detail="Room not found")

    game_room = Room.model_validate(raw)
    if not any(p.id == player_id for p in game_room.players):
        raise HTTPException(status_code=403, detail="Player not in this room")

    return {"ok": True, "room": game_room.model_dump()}


@app.post("/api/room/update")
async def update_room(payload: UpdateRoomRequest) -> dict:
    room_code = payload.roomCode.strip().upper()
    player_id = payload.playerId.strip()
    if not room_code or not player_id:
        raise HTTPException(status_code=400, detail="Room and player are required")

    raw = await storage.get_room(room_code)
    if not raw:
        raise HTTPException(status_code=404, detail="Room not found")

    room = Room.model_validate(raw)
    if not any(p.id == player_id for p in room.players):
        raise HTTPException(status_code=403, detail="Player not in this room")

    if not payload.allowAnyPlayer and room.turnPlayerId and room.turnPlayerId != player_id:
        raise HTTPException(status_code=409, detail="Not your turn")

    if payload.baseRevision > 0 and (room.revision or 1) != payload.baseRevision:
        return {
            "ok": False,
            "error": "Room revision mismatch",
            "code": "REVISION_MISMATCH",
            "room": room.model_dump(),
        }

    if payload.snapshot is not None:
        room.snapshot = payload.snapshot

    if payload.passTurn:
        room.turnPlayerId = next_turn_player(room, room.turnPlayerId or player_id)

    room.updatedAt = now_iso()
    room.revision = (room.revision or 1) + 1
    await storage.save_room(room_code, room.model_dump())
    return {"ok": True, "room": room.model_dump()}
