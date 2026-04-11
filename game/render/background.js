export function createBackgroundRenderer({ ctx, canvas, game, gameBackgroundImage, isGameBackgroundLoaded }) {
  function drawPaperBackground() {
    ctx.fillStyle = '#fefcf4';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.05)';
    ctx.lineWidth = 1;
    for (let y = 18; y < canvas.height; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y + (y % 2 === 0 ? 1 : 0));
      ctx.stroke();
    }
  }

  function getTimeOfDay() {
    const elapsed = (performance.now() - game.backgroundStartTime) / 1000;
    const cycleDuration = 120;
    return (elapsed % cycleDuration) / cycleDuration;
  }

  function drawMountains(t) {
    const baseY = canvas.height * 0.65;

    ctx.fillStyle = '#4a5f3f';
    ctx.beginPath();
    ctx.moveTo(-50, canvas.height);
    ctx.quadraticCurveTo(canvas.width * 0.2, baseY - 80, canvas.width * 0.35, baseY);
    ctx.lineTo(canvas.width, canvas.height);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#5a7a4f';
    ctx.beginPath();
    ctx.moveTo(canvas.width * 0.1, canvas.height);
    ctx.quadraticCurveTo(canvas.width * 0.45, baseY - 120, canvas.width * 0.65, baseY + 20);
    ctx.lineTo(canvas.width * 1.1, canvas.height);
    ctx.closePath();
    ctx.fill();

    const sunX = Math.sin((t - 0.25) * Math.PI * 2) * canvas.width * 0.6 + canvas.width * 0.5;
    if (sunX < canvas.width * 0.6) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
      ctx.beginPath();
      ctx.moveTo(canvas.width * 0.35, baseY);
      ctx.quadraticCurveTo(canvas.width * 0.4, baseY - 40, canvas.width * 0.5, baseY + 30);
      ctx.lineTo(canvas.width * 0.5, baseY);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawCelestialBodies(t) {
    const sunX = Math.sin((t - 0.25) * Math.PI * 2) * canvas.width * 0.6 + canvas.width * 0.5;
    const sunY = Math.cos((t - 0.25) * Math.PI * 2) * canvas.height * 0.2 + canvas.height * 0.25;

    if (t < 0.5) {
      const radius = 34;
      const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, radius * 1.5);
      glow.addColorStop(0, 'rgba(255, 200, 80, 0.4)');
      glow.addColorStop(1, 'rgba(255, 150, 0, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(sunX - radius * 1.5, sunY - radius * 1.5, radius * 3, radius * 3);

      ctx.fillStyle = '#ffdd55';
      ctx.beginPath();
      ctx.arc(sunX, sunY, radius, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    const moonPhase = (t - 0.5) * 2;
    const moonX = Math.sin((moonPhase - 0.25) * Math.PI * 2) * canvas.width * 0.6 + canvas.width * 0.5;
    const moonY = Math.cos((moonPhase - 0.25) * Math.PI * 2) * canvas.height * 0.2 + canvas.height * 0.25;
    const moonRadius = 28;

    const glow = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, moonRadius * 2);
    glow.addColorStop(0, 'rgba(200, 220, 255, 0.3)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(moonX - moonRadius * 2, moonY - moonRadius * 2, moonRadius * 4, moonRadius * 4);

    ctx.fillStyle = '#e8e8ff';
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(100, 100, 150, 0.4)';
    ctx.beginPath();
    ctx.arc(moonX - 6, moonY - 5, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(moonX + 8, moonY + 3, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawWaterfalls(t) {
    const waterfalls = [
      { x: canvas.width * 0.25, width: 8 },
      { x: canvas.width * 0.75, width: 6 }
    ];

    for (const fall of waterfalls) {
      ctx.strokeStyle = 'rgba(100, 200, 255, 0.6)';
      ctx.lineWidth = fall.width;
      ctx.lineCap = 'round';

      for (let i = 0; i < 5; i++) {
        const phase = ((t * 3) + i * 0.2) % 1;
        const startY = canvas.height * (0.4 + phase * 0.3);
        const endY = canvas.height * 0.7;

        ctx.beginPath();
        ctx.moveTo(fall.x, startY);
        ctx.bezierCurveTo(
          fall.x + Math.sin(phase * Math.PI * 4) * 10,
          startY + (endY - startY) * 0.5,
          fall.x - Math.sin(phase * Math.PI * 4 + 1) * 8,
          endY,
          fall.x,
          endY
        );
        ctx.stroke();
      }

      ctx.fillStyle = 'rgba(150, 220, 255, 0.3)';
      ctx.beginPath();
      ctx.ellipse(fall.x, canvas.height * 0.7 + 15, fall.width * 1.5, 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function initBirds() {
    game.birds = [];
    for (let i = 0; i < 4; i += 1) {
      game.birds.push({
        x: Math.random() * (canvas.width + 300) - 150,
        y: Math.random() * canvas.height * 0.3 + 20,
        speed: 30 + Math.random() * 40,
        size: 0.6 + Math.random() * 0.5
      });
    }
  }

  function drawBirds() {
    if (game.birds.length === 0) initBirds();

    const elapsedSec = (performance.now() - game.backgroundStartTime) / 1000;
    const isDaytime = getTimeOfDay() < 0.5;
    ctx.save();
    ctx.globalAlpha = isDaytime ? 0.6 : 0.28;
    ctx.fillStyle = isDaytime ? '#2d2d2d' : '#555';

    for (const bird of game.birds) {
      const flightX = ((bird.x + bird.speed * elapsedSec) % (canvas.width + 240)) - 120;
      const flightY = bird.y + Math.sin(elapsedSec * 2.2 + bird.x * 0.01) * 16;

      ctx.save();
      ctx.translate(flightX, flightY);
      ctx.scale(bird.size, bird.size);
      ctx.beginPath();
      ctx.moveTo(-8, 0);
      ctx.quadraticCurveTo(-4, -3, 0, -2);
      ctx.quadraticCurveTo(4, -3, 8, 0);
      ctx.quadraticCurveTo(4, 1, 0, 0);
      ctx.quadraticCurveTo(-4, 1, -8, 0);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  function drawLiveBackground() {
    if (isGameBackgroundLoaded()) {
      const imgW = gameBackgroundImage.naturalWidth;
      const imgH = gameBackgroundImage.naturalHeight;
      if (imgW > 0 && imgH > 0) {
        const scale = Math.max(canvas.width / imgW, canvas.height / imgH);
        const drawW = imgW * scale;
        const drawH = imgH * scale;
        const offsetX = (canvas.width - drawW) * 0.5;
        const offsetY = (canvas.height - drawH) * 0.5;
        ctx.drawImage(gameBackgroundImage, offsetX, offsetY, drawW, drawH);
        return;
      }
    }

    const t = getTimeOfDay();
    const isDaytime = t < 0.5;
    const phase = isDaytime ? t * 2 : (t - 0.5) * 2;

    let topColor = '#8ec7f7';
    let bottomColor = '#cdecb6';
    if (isDaytime) {
      topColor = `hsl(${200 - phase * 30}, ${70 - phase * 20}%, ${80 + phase * 10}%)`;
      bottomColor = `hsl(${140 + phase * 20}, ${60 + phase * 10}%, ${85 + phase * 10}%)`;
    } else {
      topColor = `hsl(${260 - phase * 60}, ${50 + phase * 30}%, ${45 - phase * 35}%)`;
      bottomColor = `hsl(${200 - phase * 80}, ${40 + phase * 20}%, ${50 - phase * 40}%)`;
    }

    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, topColor);
    gradient.addColorStop(1, bottomColor);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawMountains(t);
    drawCelestialBodies(t);
    drawWaterfalls(t);
    drawBirds();

    ctx.save();
    ctx.globalAlpha = 0.08;
    drawPaperBackground();
    ctx.restore();
  }

  return {
    drawLiveBackground
  };
}