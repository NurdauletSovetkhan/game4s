const categories = [
  { id: 'arith', title: 'Базовая арифметика', difficulty: 1, description: '+, -, ×, ÷' },
  { id: 'fractions', title: 'Дроби', difficulty: 2, description: 'Сложение и вычитание дробей' },
  { id: 'percent', title: 'Проценты', difficulty: 3, description: '% от числа и скидки' },
  { id: 'powers', title: 'Степени и корни', difficulty: 4, description: 'Квадраты, кубы, корни' },
  { id: 'equations', title: 'Линейные уравнения', difficulty: 5, description: 'ax + b = c' },
  { id: 'trig', title: 'Тригонометрия', difficulty: 6, description: 'sin / cos / tan' }
];

const menuGridEl = document.getElementById('menuGrid');

let audioCtx = null;

function ensureAudio() {
  if (audioCtx) return audioCtx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  audioCtx = new Ctx();
  return audioCtx;
}

function playMenuClick() {
  const ctx = ensureAudio();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(480, now);
  osc.frequency.linearRampToValueAtTime(700, now + 0.08);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.06, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.12);
}

window.addEventListener('pointerdown', ensureAudio, { once: true });
window.addEventListener('keydown', ensureAudio, { once: true });

for (const category of categories) {
  const button = document.createElement('button');
  button.className = 'cat-btn';
  button.innerHTML = `<span class="cat-btn__title">${category.title}</span><span class="cat-btn__meta">Сложность ${category.difficulty} · ${category.description}</span>`;
  button.addEventListener('click', () => {
    playMenuClick();
    setTimeout(() => {
      window.location.href = `./index.html?category=${encodeURIComponent(category.id)}`;
    }, 90);
  });
  menuGridEl.appendChild(button);
}
