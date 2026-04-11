export function createPhysicsController({
  game,
  canvas,
  worldWidth,
  worldHeight,
  stopSpeed,
  rollDamping,
  airDamping,
  clamp,
  scaledRect,
  isMultiplayer,
  isMyTurn,
  loadTurnState,
  saveActiveTurnState,
  playHazardSound,
  playCheckpointSound,
  playHoleCompleteSound,
  setMessage,
  syncRoom,
  endTurnAndSync,
  openQuizModal,
  addLives,
  adjustScore,
  nextButton,
  levelEl,
  parEl,
  strokesEl,
  ballSpeed,
  alignCameraToBall
}) {
  function resetBallToCheckpoint() {
    game.ball.x = game.checkpoint.x;
    game.ball.y = game.checkpoint.y;
    game.ball.vx = 0;
    game.ball.vy = 0;
    game.ball.grounded = false;
    game.dragging = false;
    game.pointerId = null;
    game.dragPos = null;
    game.justStopped = false;
    game.awaitingStopResolution = false;
    alignCameraToBall();
  }

  function loadLevel(index) {
    game.levelIndex = clamp(index, 0, game.levels.length - 1);
    game.strokes = 0;
    game.won = false;

    const level = game.levels[game.levelIndex];
    game.start = { ...level.start };
    game.checkpoint = { ...level.start };

    if (isMultiplayer()) {
      for (const player of game.multiplayer.players) {
        game.multiplayer.stateByPlayer[player.id] = {
          ball: { x: level.start.x, y: level.start.y, r: game.ball.r, vx: 0, vy: 0, grounded: false },
          checkpoint: { x: level.start.x, y: level.start.y },
          shotUnlocked: false,
          shotsRemaining: 0,
          justStopped: false,
          awaitingStopResolution: false
        };
      }

      if (game.multiplayer.turnPlayerId) {
        loadTurnState(game.multiplayer.turnPlayerId);
      } else {
        resetBallToCheckpoint();
      }
    } else {
      resetBallToCheckpoint();
    }

    game.shotsRemaining = 0;
    game.currentPar = Math.max(3, level.par + (game.selectedCategory.difficulty >= 5 ? -1 : 0));

    levelEl.textContent = String(game.levelIndex + 1);
    parEl.textContent = String(game.currentPar);
    strokesEl.textContent = '0';
    nextButton.disabled = true;

    openQuizModal('Реши задачу, чтобы сделать удар.');
  }

  function handleHazardDeath(textWithLife, textNoLife) {
    if (isMultiplayer()) {
      resetBallToCheckpoint();
      playHazardSound();

      if (game.shotsRemaining > 0) {
        game.shotUnlocked = true;
        saveActiveTurnState();
        setMessage(`Препятствие! Осталось ударов: ${game.shotsRemaining}.`);
        syncRoom({ passTurn: false, allowAnyPlayer: false, silent: true }).catch(() => {});
      } else {
        endTurnAndSync('Ход завершён после препятствия.');
      }
      return;
    }

    if (game.lives > 0) {
      addLives(-1);
      resetBallToCheckpoint();
      game.shotUnlocked = false;
      playHazardSound();
      setMessage(`${textWithLife} Осталось жизней: ${game.lives}.`);
      if (isMultiplayer()) {
        saveActiveTurnState();
        if (game.shotsRemaining > 0) {
          syncRoom({ passTurn: false, allowAnyPlayer: false, silent: true }).catch(() => {});
        } else {
          endTurnAndSync('Ход завершён после препятствия.');
        }
      }
      openQuizModal(`${textWithLife} Осталось жизней: ${game.lives}.`);
      return;
    }

    resetBallToCheckpoint();
    playHazardSound();
    if (isMultiplayer()) {
      endTurnAndSync('Жизни закончились. Ход передан сопернику.');
      return;
    }
    game.shotUnlocked = false;
    openQuizModal(textNoLife);
  }

  function resolveBoundaryCollision() {
    const b = game.ball;

    if (b.x < b.r) {
      b.x = b.r;
      if (b.vx < 0) b.vx *= -game.settings.restitution;
    }

    if (b.x > worldWidth - b.r) {
      b.x = worldWidth - b.r;
      if (b.vx > 0) b.vx *= -game.settings.restitution;
    }

    if (b.y < b.r) {
      b.y = b.r;
      if (b.vy < 0) b.vy *= -game.settings.restitution;
    }

    if (b.y > worldHeight - b.r) {
      b.y = worldHeight - b.r;
      if (b.vy > 0) {
        b.vy *= -game.settings.restitution;
        if (Math.abs(b.vy) < 70) b.vy = 0;
        b.grounded = true;
      }
    }
  }

  function resolveRectCollision(rect) {
    const b = game.ball;

    const nearestX = clamp(b.x, rect.x, rect.x + rect.w);
    const nearestY = clamp(b.y, rect.y, rect.y + rect.h);
    const dx = b.x - nearestX;
    const dy = b.y - nearestY;
    const distSq = dx * dx + dy * dy;
    const rr = b.r * b.r;

    if (distSq > rr) return false;

    let normalX = 0;
    let normalY = -1;
    let distance = Math.sqrt(distSq);

    if (distance > 0.0001) {
      normalX = dx / distance;
      normalY = dy / distance;
    } else {
      const fromLeft = Math.abs(b.x - rect.x);
      const fromRight = Math.abs(rect.x + rect.w - b.x);
      const fromTop = Math.abs(b.y - rect.y);
      const fromBottom = Math.abs(rect.y + rect.h - b.y);
      const minSide = Math.min(fromLeft, fromRight, fromTop, fromBottom);

      if (minSide === fromLeft) {
        normalX = -1;
        normalY = 0;
      } else if (minSide === fromRight) {
        normalX = 1;
        normalY = 0;
      } else if (minSide === fromTop) {
        normalX = 0;
        normalY = -1;
      } else {
        normalX = 0;
        normalY = 1;
      }
      distance = 0;
    }

    const penetration = b.r - distance;
    b.x += normalX * penetration;
    b.y += normalY * penetration;

    const vn = b.vx * normalX + b.vy * normalY;
    if (vn < 0) {
      b.vx -= (1 + game.settings.restitution) * vn * normalX;
      b.vy -= (1 + game.settings.restitution) * vn * normalY;
    }

    if (normalY < -0.5 && b.vy >= -24) {
      b.grounded = true;
      if (Math.abs(b.vy) < 35) b.vy = 0;
    }

    return true;
  }

  function finishLevel() {
    game.ball.vx = 0;
    game.ball.vy = 0;
    const delta = game.strokes - game.currentPar;
    const scoreText =
      delta === 0 ? 'в пар' : delta < 0 ? `${Math.abs(delta)} лучше пара` : `${delta} хуже пара`;

    const bonus = 100 + game.selectedCategory.difficulty * 20 + Math.max(0, (game.currentPar - game.strokes) * 25);
    adjustScore(bonus);
    playHoleCompleteSound();

    if (isMultiplayer()) {
      const hasNextLevel = game.levelIndex < game.levels.length - 1;
      if (hasNextLevel) {
        loadLevel(game.levelIndex + 1);
        endTurnAndSync(`Лунка пройдена (${scoreText}). Бонус +${bonus}. Ход сопернику.`);
        return;
      }

      game.won = true;
      setMessage(`Матч завершён! Последняя лунка: ${scoreText}. Бонус +${bonus}.`);
      syncRoom({ passTurn: false, allowAnyPlayer: true }).catch((error) => {
        setMessage(`Сеть: ${error.message}`);
      });
      return;
    }

    game.won = true;
    nextButton.disabled = game.levelIndex >= game.levels.length - 1;
    setMessage(`Лунка пройдена: ${scoreText}. Бонус +${bonus}.`);
  }

  function update(dt) {
    if (!game.selectedCategory || game.won || game.dragging) return;
    if (isMultiplayer() && !isMyTurn()) return;

    const moving = ballSpeed() > stopSpeed;
    if (!moving && !game.ball.grounded && !game.awaitingStopResolution) return;

    const level = game.levels[game.levelIndex];
    const b = game.ball;

    const subStep = 1 / 120;
    let remaining = dt;

    while (remaining > 0) {
      const step = Math.min(subStep, remaining);
      remaining -= step;

      b.grounded = false;
      b.vy += game.settings.gravity * step;

      b.x += b.vx * step;
      b.y += b.vy * step;

      resolveBoundaryCollision();

      for (const platform of level.platforms) {
        resolveRectCollision(platform);
      }

      if (b.grounded) {
        b.vx *= rollDamping;
      } else {
        b.vx *= airDamping;
        b.vy *= airDamping;
      }
    }

    for (const pond of level.water) {
      const scaled = scaledRect(pond, game.settings.waterScale);
      if (
        b.x + b.r > scaled.x &&
        b.x - b.r < scaled.x + scaled.w &&
        b.y + b.r > scaled.y &&
        b.y - b.r < scaled.y + scaled.h
      ) {
        handleHazardDeath(
          'Плюх! Вода: потрачена 1 жизнь, респавн с чекпоинта.',
          'Плюх! Возрождение с чекпоинта. Жизни закончились — реши задачу заново.'
        );
        return;
      }
    }

    if (b.y + b.r >= worldHeight - game.settings.spikeHeight) {
      handleHazardDeath(
        'Шипы! Потрачена 1 жизнь, респавн с чекпоинта.',
        'Шипы! Возрождение с чекпоинта. Жизни закончились — реши задачу.'
      );
      return;
    }

    const hole = level.hole;
    const holeDist = Math.hypot(b.x - hole.x, b.y - hole.y);
    if (holeDist < hole.r - 2 && ballSpeed() < 220) {
      finishLevel();
      return;
    }

    if (ballSpeed() <= stopSpeed) {
      b.vx = 0;
      b.vy = 0;

      if (Math.hypot(b.x - game.checkpoint.x, b.y - game.checkpoint.y) > 18) {
        game.checkpoint.x = b.x;
        game.checkpoint.y = b.y;
      }

      if (!game.justStopped) {
        playCheckpointSound();
        if (isMultiplayer()) {
          saveActiveTurnState();
          if (game.shotsRemaining > 0) {
            game.shotUnlocked = true;
            game.awaitingStopResolution = false;
            setMessage(`Чекпоинт сохранён. Осталось ударов: ${game.shotsRemaining}.`);
            syncRoom({ passTurn: false, allowAnyPlayer: false, silent: true }).catch(() => {});
          } else {
            game.awaitingStopResolution = false;
            endTurnAndSync('Чекпоинт сохранён. Ход передан сопернику.');
          }
        } else {
          openQuizModal('Чекпоинт сохранён. Реши новую задачу для следующего удара.');
        }
        game.justStopped = true;
      }
    } else {
      game.justStopped = false;
    }
  }

  return {
    resetBallToCheckpoint,
    loadLevel,
    finishLevel,
    update
  };
}