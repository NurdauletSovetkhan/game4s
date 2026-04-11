export function createHudRenderer({ ctx, canvas, game, isMultiplayer, opponentPlayer, getTurnState }) {
  function drawHeartIcon(x, y, size, fill = '#d94a4a', stroke = '#8f2424') {
    const half = size * 0.5;
    const top = y - half;
    const lobRadius = size * 0.28;
    const leftLobX = x - size * 0.2;
    const rightLobX = x + size * 0.2;
    const lobY = top + size * 0.34;
    const bottomY = y + half;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, bottomY);
    ctx.bezierCurveTo(x - size * 0.42, y + size * 0.2, x - size * 0.52, y - size * 0.05, leftLobX, lobY);
    ctx.arc(leftLobX, lobY, lobRadius, Math.PI * 0.84, Math.PI * 1.98);
    ctx.arc(rightLobX, lobY, lobRadius, Math.PI * 1.15, Math.PI * 0.16, true);
    ctx.bezierCurveTo(x + size * 0.52, y - size * 0.05, x + size * 0.42, y + size * 0.2, x, bottomY);
    ctx.closePath();

    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = Math.max(1.2, size * 0.09);
    ctx.strokeStyle = stroke;
    ctx.stroke();

    ctx.globalAlpha = 0.26;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(x - size * 0.13, top + size * 0.28, size * 0.14, size * 0.1, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawLivesHud() {
    if (isMultiplayer()) {
      const meId = game.multiplayer.playerId;
      const rival = opponentPlayer();
      const myState = getTurnState(meId);
      const rivalState = getTurnState(rival?.id);

      const myShots = meId === game.multiplayer.turnPlayerId ? game.shotsRemaining : myState.shotsRemaining;
      const rivalShots = rival?.id === game.multiplayer.turnPlayerId ? game.shotsRemaining : rivalState.shotsRemaining;

      ctx.save();
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#1f1f1f';
      ctx.font = '18px Handlee, sans-serif';
      ctx.fillText(`Ты: ❤ ${myShots}`, canvas.width - 14, 12);
      ctx.fillStyle = '#333';
      ctx.fillText(`Соперник: ❤ ${rivalShots}`, canvas.width - 14, 34);
      ctx.restore();
      return;
    }

    const displayedLives = Math.max(0, Math.round(game.lives));
    const isCompact = canvas.width <= 980;
    const heartSize = isCompact ? 22 : 18;
    const spacingX = Math.round(heartSize * 1.08);
    const spacingY = Math.round(heartSize * 1.05);
    const margin = isCompact ? 12 : 14;
    const maxCols = Math.max(4, Math.min(10, Math.floor((canvas.width * 0.32) / spacingX)));
    const maxRows = 3;
    const maxVisible = maxCols * maxRows;
    const visibleCount = Math.min(displayedLives, maxVisible);
    const overflow = Math.max(0, displayedLives - visibleCount);

    const colsInFirstRow = Math.min(visibleCount, maxCols);
    const blockWidth = Math.max(colsInFirstRow - 1, 0) * spacingX + heartSize;
    const startX = canvas.width - margin - blockWidth + heartSize * 0.5;
    const startY = margin + heartSize * 0.5;

    ctx.save();
    for (let i = 0; i < visibleCount; i += 1) {
      const row = Math.floor(i / maxCols);
      const col = i % maxCols;
      const x = startX + col * spacingX;
      const y = startY + row * spacingY;
      drawHeartIcon(x, y, heartSize);
    }

    if (displayedLives === 0) {
      const x = canvas.width - margin - heartSize * 0.5;
      const y = startY;
      drawHeartIcon(x, y, heartSize, '#d6d6d6', '#8f8f8f');
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#4b4b4b';
      ctx.font = `${Math.round(heartSize * 0.9)}px Handlee, sans-serif`;
      ctx.fillText('0', x - heartSize * 0.75, y);
    }

    if (overflow > 0) {
      const row = Math.floor((visibleCount - 1) / maxCols);
      const y = startY + row * spacingY;
      const x = canvas.width - margin;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#1f1f1f';
      ctx.font = `${Math.round(heartSize * 0.88)}px Handlee, sans-serif`;
      ctx.fillText(`+${overflow}`, x, y + heartSize * 0.08);
    }
    ctx.restore();
  }

  return {
    drawLivesHud
  };
}