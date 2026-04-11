export function createCameraViewportController({
  game,
  canvas,
  worldWidth,
  worldHeight,
  clamp,
  desktopView,
  mobilePortraitView,
  mobileLandscapeView,
  tabletPortraitView,
  tabletLandscapeView
}) {
  function alignCameraToBall() {
    const targetX = clamp(game.ball.x - canvas.width * 0.5, 0, worldWidth - canvas.width);
    const targetY = clamp(game.ball.y - canvas.height * 0.68, 0, worldHeight - canvas.height);
    game.camera.x = targetX;
    game.camera.y = targetY;
  }

  function updateCamera(dt) {
    const targetX = clamp(game.ball.x - canvas.width * 0.5, 0, worldWidth - canvas.width);
    const targetY = clamp(game.ball.y - canvas.height * 0.68, 0, worldHeight - canvas.height);
    const follow = 1 - Math.exp(-7 * dt);
    game.camera.x += (targetX - game.camera.x) * follow;
    game.camera.y += (targetY - game.camera.y) * follow;
  }

  function updateCanvasViewport() {
    const isPhone = window.innerWidth <= 768;
    const isTablet = window.innerWidth > 768 && window.innerWidth <= 1200;
    const isPortrait = window.innerHeight > window.innerWidth;

    let target = desktopView;
    if (isPhone && isPortrait) {
      target = mobilePortraitView;
    } else if (isPhone) {
      target = mobileLandscapeView;
    } else if (isTablet && isPortrait) {
      target = tabletPortraitView;
    } else if (isTablet) {
      target = tabletLandscapeView;
    }

    if (canvas.width !== target.width || canvas.height !== target.height) {
      canvas.width = target.width;
      canvas.height = target.height;
      alignCameraToBall();
    }
  }

  return {
    alignCameraToBall,
    updateCamera,
    updateCanvasViewport
  };
}