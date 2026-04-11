export function createPlayerAnimationRenderer({
  ctx,
  game,
  maxDrag,
  multiPollMs,
  worldToScreenX,
  worldToScreenY,
  getDragVector,
  getTurnState,
  getPlayerColor,
  isMultiplayer,
  isMyTurn,
  maybeSyncLive,
  update,
  updateCamera,
  drawCourse
}) {
  function drawAimGuide() {
    if (!game.dragging || !game.dragPos) return;

    const { dx, dy, dist } = getDragVector();
    if (dist <= 0) return;

    const power = dist / maxDrag;
    const startX = worldToScreenX(game.ball.x);
    const startY = worldToScreenY(game.ball.y);
    const endX = worldToScreenX(game.ball.x - dx * 1.8);
    const endY = worldToScreenY(game.ball.y - dy * 1.8);

    ctx.strokeStyle = power > 0.72 ? '#d64949' : '#262626';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    const arrowHead = 12;
    const angle = Math.atan2(endY - startY, endX - startX);

    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(
      endX - arrowHead * Math.cos(angle - Math.PI / 6),
      endY - arrowHead * Math.sin(angle - Math.PI / 6)
    );
    ctx.moveTo(endX, endY);
    ctx.lineTo(
      endX - arrowHead * Math.cos(angle + Math.PI / 6),
      endY - arrowHead * Math.sin(angle + Math.PI / 6)
    );
    ctx.stroke();
  }

  function drawClub() {
    const ballX = worldToScreenX(game.ball.x);
    const ballY = worldToScreenY(game.ball.y);

    let angle = null;
    let distance = 0;

    if (game.dragging && game.dragPos) {
      const { dx, dy, dist } = getDragVector();
      angle = Math.atan2(dy, dx);
      distance = 28 + dist * 0.12;
    } else if (game.swingTime > 0) {
      const progress = 1 - game.swingTime / 0.12;
      angle = game.lastShotAngle + 1.1 - progress * 2.2;
      distance = 28;
    }

    if (angle === null) return;

    const pivotX = ballX + Math.cos(angle) * distance;
    const pivotY = ballY + Math.sin(angle) * distance;
    const shaftLen = 52;

    const tipX = pivotX + Math.cos(angle) * shaftLen;
    const tipY = pivotY + Math.sin(angle) * shaftLen;

    ctx.strokeStyle = '#9c6b30';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(pivotX, pivotY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    ctx.save();
    ctx.translate(tipX, tipY);
    ctx.rotate(angle);
    ctx.fillStyle = '#2b2b2b';
    ctx.fillRect(-7, -6, 16, 12);
    ctx.restore();
  }

  function drawBallAt(ball, fill, stroke = '#1f1f1f', ring = false) {
    const sx = worldToScreenX(ball.x);
    const sy = worldToScreenY(ball.y);

    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(sx, sy, ball.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(sx, sy, ball.r, 0, Math.PI * 2);
    ctx.stroke();

    if (ring) {
      ctx.strokeStyle = '#232323';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, ball.r + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function getInterpolatedBallPosition(state) {
    if (!state || !state.lastSyncTime || !state.prevBall) return state.ball;
    const now = performance.now();
    const timeSinceSync = now - state.lastSyncTime;
    const interpolationWindowMs = Math.max(1, multiPollMs);
    const progress = Math.min(1, timeSinceSync / interpolationWindowMs);
    const prev = state.prevBall;
    const curr = state.ball;
    return {
      x: prev.x + (curr.x - prev.x) * progress,
      y: prev.y + (curr.y - prev.y) * progress,
      r: curr.r,
      vx: curr.vx,
      vy: curr.vy,
      grounded: curr.grounded
    };
  }

  function drawBall() {
    if (!isMultiplayer()) {
      drawBallAt(game.ball, '#ffffff');
      return;
    }

    for (const player of game.multiplayer.players) {
      const isTurn = player.id === game.multiplayer.turnPlayerId;
      if (isTurn) {
        drawBallAt(game.ball, getPlayerColor(player.id), '#1f1f1f', true);
        const state = getTurnState(player.id);
        state.ball = { ...game.ball };
      } else {
        const state = getTurnState(player.id);
        const interpolated = getInterpolatedBallPosition(state);
        drawBallAt(interpolated, getPlayerColor(player.id), '#1f1f1f', false);
      }
    }
  }

  function frame(now) {
    const dt = Math.min((now - game.lastTime) / 1000, 0.033);
    game.lastTime = now;

    game.swingTime = Math.max(0, game.swingTime - dt);

    update(dt);
    updateCamera(dt);
    drawCourse();
    drawAimGuide();
    drawClub();
    drawBall();

    if (isMultiplayer() && isMyTurn()) {
      maybeSyncLive(now);
    }

    requestAnimationFrame(frame);
  }

  return {
    drawAimGuide,
    drawClub,
    drawBallAt,
    getInterpolatedBallPosition,
    drawBall,
    frame
  };
}