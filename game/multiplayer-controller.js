export class MultiplayerController {
  constructor({ game, pollMs, liveSyncMs, stopSpeed, hooks }) {
    this.game = game;
    this.pollMs = pollMs;
    this.liveSyncMs = liveSyncMs;
    this.stopSpeed = stopSpeed;
    this.hooks = hooks;
  }

  isMultiplayer() {
    return Boolean(this.game.multiplayer?.enabled);
  }

  isMyTurn() {
    return this.hooks.isMyTurn();
  }

  async fetchJson(url, options) {
    const response = await fetch(url, options);
    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok || !data?.ok) {
      const error = new Error(data?.error || 'Network error');
      error.status = response.status;
      error.code = data?.code || null;
      error.room = data?.room || null;
      throw error;
    }

    return data;
  }

  setTurnPlayer(turnPlayerId) {
    if (!this.isMultiplayer()) return;
    if (!turnPlayerId) return;

    if (
      this.game.multiplayer.turnPlayerId &&
      this.game.multiplayer.turnPlayerId !== turnPlayerId
    ) {
      this.hooks.saveActiveTurnState();
    }

    this.game.multiplayer.turnPlayerId = turnPlayerId;
    this.hooks.loadTurnState(turnPlayerId);
    this.hooks.applyTurnStatsToGame();
    this.hooks.updateMultiplayerHud();
  }

  mergeSyncOptions(previous, next) {
    if (!previous) return { ...next };
    return {
      passTurn: Boolean(previous.passTurn || next.passTurn),
      allowAnyPlayer: Boolean(previous.allowAnyPlayer || next.allowAnyPlayer),
      silent: Boolean(previous.silent && next.silent)
    };
  }

  isStaleRoomRevision(nextRevision) {
    const incoming = Number(nextRevision || 0);
    const current = Number(this.game.multiplayer.revision || 0);
    return incoming > 0 && current > 0 && incoming < current;
  }

  applyRoomMeta(room) {
    if (!room || typeof room !== 'object') return;

    if (Array.isArray(room.players)) {
      this.game.multiplayer.players = room.players;
    }

    const incomingRevision = Number(room.revision || 0);
    if (incomingRevision > 0) {
      this.game.multiplayer.revision = Math.max(
        Number(this.game.multiplayer.revision || 0),
        incomingRevision
      );
    }

    if (room.turnPlayerId) {
      this.setTurnPlayer(room.turnPlayerId);
    }

    if (!this.isMyTurn()) {
      this.game.multiplayer.turnPassPending = false;
    }
  }

  async syncRoom({ passTurn = false, allowAnyPlayer = false, silent = false } = {}) {
    if (!this.isMultiplayer()) return;

    const options = { passTurn, allowAnyPlayer, silent };

    if (this.game.multiplayer.syncInFlight) {
      this.game.multiplayer.pendingSync = this.mergeSyncOptions(
        this.game.multiplayer.pendingSync,
        options
      );
      return;
    }

    this.game.multiplayer.syncInFlight = true;

    const payload = {
      roomCode: this.game.multiplayer.roomCode,
      playerId: this.game.multiplayer.playerId,
      passTurn: options.passTurn,
      allowAnyPlayer: options.allowAnyPlayer,
      baseRevision: Number(this.game.multiplayer.revision || 0),
      snapshot: this.hooks.serializeSnapshot()
    };

    try {
      const data = await this.fetchJson('./api/room/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (this.isStaleRoomRevision(data.room?.revision)) {
        return;
      }

      this.applyRoomMeta(data.room);
      if (passTurn) {
        this.game.multiplayer.turnPassPending = false;
      }

      this.hooks.updateMultiplayerHud();

      if (!options.silent) {
        if (!this.isMyTurn()) {
          this.hooks.closeQuizModal();
          const turn = this.hooks.currentTurnPlayer();
          this.hooks.setMessage(`Ход соперника: ${turn?.name || 'ожидание'}...`);
        } else if (!this.game.shotUnlocked && this.hooks.ballSpeed() <= this.stopSpeed) {
          if (this.hooks.isQuizModalHidden()) {
            this.hooks.openQuizModal('Твой ход. Реши задачу для удара.');
          } else {
            this.hooks.setMessage('Твой ход. Реши задачу для удара.');
          }
        }
      }
    } catch (error) {
      if (
        error?.status === 409 &&
        (error?.code === 'REVISION_MISMATCH' || error?.message === 'Room revision mismatch')
      ) {
        if (error.room) {
          if (!this.isStaleRoomRevision(error.room.revision)) {
            this.applyRoomMeta(error.room);
            if (error.room.snapshot) {
              this.hooks.applySnapshot(error.room.snapshot);
            }
          }
        }
      }

      if (passTurn) {
        this.game.multiplayer.turnPassPending = false;
      }
      throw error;
    } finally {
      this.game.multiplayer.syncInFlight = false;
      const pending = this.game.multiplayer.pendingSync;
      this.game.multiplayer.pendingSync = null;
      if (pending) {
        this.syncRoom(pending).catch(() => {});
      }
    }
  }

  async pollRoomState() {
    if (
      !this.isMultiplayer() ||
      this.game.multiplayer.initializing ||
      this.game.multiplayer.pollInFlight
    ) {
      return;
    }

    this.game.multiplayer.pollInFlight = true;

    try {
      const previousTurnId = this.game.multiplayer.turnPlayerId;
      const data = await this.fetchJson(
        `./api/room/state?room=${encodeURIComponent(this.game.multiplayer.roomCode)}&player=${encodeURIComponent(this.game.multiplayer.playerId)}`
      );
      const room = data.room;

      if (this.isStaleRoomRevision(room?.revision)) {
        return;
      }

      this.applyRoomMeta(room);

      const becameMyTurn =
        previousTurnId !== this.game.multiplayer.playerId &&
        this.game.multiplayer.turnPlayerId === this.game.multiplayer.playerId;
      const shouldApplySnapshot = Boolean(room.snapshot) && (!this.isMyTurn() || becameMyTurn);

      if (shouldApplySnapshot) {
        this.hooks.applySnapshot(room.snapshot);
      } else {
        this.hooks.updateMultiplayerHud();
        this.hooks.applyTurnStatsToGame();
      }

      if (!this.isMyTurn()) {
        this.hooks.closeQuizModal();
        const turn = this.hooks.currentTurnPlayer();
        this.hooks.setMessage(`Ход соперника: ${turn?.name || 'ожидание'}...`);
      } else if (becameMyTurn) {
        if (this.game.shotsRemaining > 0) {
          this.game.shotUnlocked = true;
          this.hooks.setMessage(`Твой ход. Осталось ударов: ${this.game.shotsRemaining}.`);
        } else {
          this.hooks.openQuizModal('Твой ход. Реши задачу и сделай два удара.');
        }
      } else if (!this.game.shotUnlocked && !this.hooks.isQuizModalHidden()) {
        this.hooks.setMessage('Твой ход. Реши задачу и сделай два удара.');
      }
    } catch (error) {
      const now = performance.now();
      if (now - this.game.multiplayer.lastNetworkErrorAt > 1800) {
        this.hooks.setMessage(`Сеть: ${error.message}`);
        this.game.multiplayer.lastNetworkErrorAt = now;
      }
    } finally {
      this.game.multiplayer.pollInFlight = false;
    }
  }

  startMultiplayerPolling() {
    if (!this.isMultiplayer()) return;

    if (this.game.multiplayer.pollTimer) {
      clearInterval(this.game.multiplayer.pollTimer);
    }

    this.game.multiplayer.pollTimer = setInterval(() => {
      this.pollRoomState();
    }, this.pollMs);
  }

  endTurnAndSync(reasonText) {
    if (!this.isMultiplayer()) return;
    if (this.game.multiplayer.turnPassPending) return;

    this.hooks.closeQuizModal();
    this.game.shotUnlocked = false;
    this.game.shotsRemaining = 0;
    this.game.multiplayer.turnPassPending = true;
    this.hooks.saveActiveTurnState();
    this.game.multiplayer.pendingSync = null;
    this.hooks.setMessage(reasonText);

    this.syncRoom({ passTurn: true, silent: false }).catch((error) => {
      this.game.multiplayer.turnPassPending = false;
      this.hooks.setMessage(`Сеть: ${error.message}`);
    });
  }

  maybeSyncLive(nowMs) {
    if (!this.isMultiplayer() || !this.isMyTurn()) return;
    if (this.hooks.ballSpeed() <= this.stopSpeed) return;
    if (nowMs - this.game.multiplayer.lastLiveSyncAt < this.liveSyncMs) return;

    this.game.multiplayer.lastLiveSyncAt = nowMs;
    this.hooks.saveActiveTurnState();
    this.syncRoom({ passTurn: false, allowAnyPlayer: false, silent: true }).catch(() => {});
  }
}
