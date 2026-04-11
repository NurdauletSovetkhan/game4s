export function createInputController({
  game,
  canvas,
  maxDrag,
  minDragToShot,
  stopSpeed,
  initAudio,
  setMessage,
  isMultiplayer,
  isMyTurn,
  ballSpeed,
  playShotSound,
  saveActiveTurnState,
  syncRoom,
  strokesEl
}) {
  function getPointerPos(ev) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (ev.clientX - rect.left) * scaleX + game.camera.x,
      y: (ev.clientY - rect.top) * scaleY + game.camera.y
    };
  }

  function getDragVector() {
    if (!game.dragPos) return { dx: 0, dy: 0, dist: 0 };

    const rawDx = game.dragPos.x - game.ball.x;
    const rawDy = game.dragPos.y - game.ball.y;
    const rawDist = Math.hypot(rawDx, rawDy);

    if (rawDist === 0) return { dx: 0, dy: 0, dist: 0 };

    const dist = Math.min(rawDist, maxDrag);
    const scale = dist / rawDist;
    return { dx: rawDx * scale, dy: rawDy * scale, dist };
  }

  function startDrag(ev) {
    initAudio();

    if (!game.selectedCategory || game.won || !game.shotUnlocked || ballSpeed() > stopSpeed) return;
    if (isMultiplayer() && !isMyTurn()) return;

    const pointer = getPointerPos(ev);
    const dx = pointer.x - game.ball.x;
    const dy = pointer.y - game.ball.y;
    if (Math.hypot(dx, dy) > 34) {
      setMessage('Начни натяжку прямо от мячика.');
      return;
    }

    game.dragging = true;
    game.pointerId = ev.pointerId;
    game.dragPos = pointer;
    canvas.setPointerCapture(ev.pointerId);
  }

  function moveDrag(ev) {
    if (!game.dragging || game.pointerId !== ev.pointerId) return;
    game.dragPos = getPointerPos(ev);
  }

  function endDrag(ev) {
    if (!game.dragging || game.pointerId !== ev.pointerId) return;

    game.dragging = false;
    game.pointerId = null;
    canvas.releasePointerCapture(ev.pointerId);

    const { dx, dy, dist } = getDragVector();
    game.dragPos = null;

    if (dist < minDragToShot) {
      setMessage('Слишком слабый удар.');
      return;
    }

    const power = dist / maxDrag;
    game.ball.vx = -(dx / dist) * game.settings.shotSpeed * power;
    game.ball.vy = -(dy / dist) * game.settings.shotSpeed * power;
    game.lastShotAngle = Math.atan2(-dy, -dx);
    game.swingTime = 0.12;
    game.ball.grounded = false;
    game.justStopped = false;
    game.awaitingStopResolution = true;
    game.shotUnlocked = false;
    if (isMultiplayer()) {
      game.shotsRemaining = Math.max(0, game.shotsRemaining - 1);
    }

    game.strokes += 1;
    strokesEl.textContent = String(game.strokes);
    playShotSound(power);
    if (isMultiplayer()) {
      setMessage(`Удар! Осталось попыток в ходе: ${game.shotsRemaining}.`);
      saveActiveTurnState();
      syncRoom({ passTurn: false, allowAnyPlayer: false, silent: true }).catch(() => {});
    } else {
      setMessage('Удар!');
    }
  }

  return {
    getPointerPos,
    getDragVector,
    startDrag,
    moveDrag,
    endDrag
  };
}