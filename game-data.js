export const WORLD_WIDTH = 2550;
export const WORLD_HEIGHT = 1750;

function clampValue(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function buildDiagonalLevel({
  startX,
  startY,
  holeX,
  holeY,
  segments,
  zigzag,
  phase,
  widthBase,
  waterEvery,
  waterShift,
  par
}) {
  const platforms = [];

  for (let index = 0; index < segments; index += 1) {
    const t = segments === 1 ? 0 : index / (segments - 1);
    const centerX =
      lerp(startX + 50, holeX - 70, t) + Math.sin(index * 1.14 + phase) * zigzag * (1 - t * 0.35);
    const centerY = lerp(startY + 65, holeY + 170, t) + Math.cos(index * 0.9 + phase) * 36;
    const width = clampValue(widthBase + ((index % 4) - 1.5) * 24, 160, 370);
    const x = clampValue(centerX - width * 0.5, 20, WORLD_WIDTH - width - 20);
    const y = clampValue(centerY, 110, WORLD_HEIGHT - 120);

    platforms.push({ x: Math.round(x), y: Math.round(y), w: Math.round(width), h: 20 });

    if (index % 4 === 1) {
      const side = index % 8 === 1 ? 1 : -1;
      const assistX = clampValue(x + side * (width + 34), 20, WORLD_WIDTH - 150);
      const assistY = clampValue(y - 92, 90, WORLD_HEIGHT - 130);
      platforms.push({ x: Math.round(assistX), y: Math.round(assistY), w: 140, h: 18 });
    }
  }

  platforms.push({
    x: clampValue(holeX - 130, 30, WORLD_WIDTH - 260),
    y: clampValue(holeY + 120, 100, WORLD_HEIGHT - 120),
    w: 260,
    h: 20
  });

  const water = [];
  for (let index = waterShift; index < segments; index += waterEvery) {
    const source = platforms[Math.min(index, platforms.length - 1)];
    const side = index % 2 === 0 ? -1 : 1;
    const w = 112;
    const h = 82;
    const x = clampValue(source.x + (side < 0 ? -w - 22 : source.w + 22), 0, WORLD_WIDTH - w);
    const y = clampValue(source.y + 18, 90, WORLD_HEIGHT - h - 50);
    water.push({ x: Math.round(x), y: Math.round(y), w, h });
  }

  return {
    par,
    start: { x: startX, y: startY },
    hole: { x: holeX, y: holeY, r: 20 },
    platforms,
    water
  };
}

export const COURSES = {
  arith: [
    buildDiagonalLevel({ startX: 120, startY: 1470, holeX: 2320, holeY: 240, segments: 8, zigzag: 75, phase: 0.2, widthBase: 344, waterEvery: 7, waterShift: 4, par: 3 }),
    buildDiagonalLevel({ startX: 150, startY: 1470, holeX: 2280, holeY: 250, segments: 8, zigzag: 85, phase: 1.1, widthBase: 332, waterEvery: 6, waterShift: 3, par: 3 }),
    buildDiagonalLevel({ startX: 180, startY: 1460, holeX: 2300, holeY: 230, segments: 9, zigzag: 95, phase: 2.1, widthBase: 320, waterEvery: 6, waterShift: 4, par: 4 })
  ],
  fractions: [
    buildDiagonalLevel({ startX: 120, startY: 1470, holeX: 2350, holeY: 240, segments: 9, zigzag: 110, phase: 0.5, widthBase: 310, waterEvery: 6, waterShift: 3, par: 4 }),
    buildDiagonalLevel({ startX: 150, startY: 1460, holeX: 2290, holeY: 240, segments: 9, zigzag: 120, phase: 1.4, widthBase: 302, waterEvery: 6, waterShift: 2, par: 4 }),
    buildDiagonalLevel({ startX: 200, startY: 1460, holeX: 2310, holeY: 220, segments: 10, zigzag: 130, phase: 2.6, widthBase: 295, waterEvery: 5, waterShift: 3, par: 4 })
  ],
  percent: [
    buildDiagonalLevel({ startX: 130, startY: 1470, holeX: 2320, holeY: 230, segments: 10, zigzag: 145, phase: 0.3, widthBase: 288, waterEvery: 5, waterShift: 2, par: 4 }),
    buildDiagonalLevel({ startX: 170, startY: 1460, holeX: 2300, holeY: 220, segments: 10, zigzag: 155, phase: 1.7, widthBase: 282, waterEvery: 5, waterShift: 3, par: 5 }),
    buildDiagonalLevel({ startX: 210, startY: 1460, holeX: 2320, holeY: 205, segments: 10, zigzag: 165, phase: 2.4, widthBase: 275, waterEvery: 5, waterShift: 2, par: 5 })
  ],
  powers: [
    buildDiagonalLevel({ startX: 130, startY: 1470, holeX: 2330, holeY: 215, segments: 10, zigzag: 180, phase: 0.8, widthBase: 268, waterEvery: 5, waterShift: 2, par: 5 }),
    buildDiagonalLevel({ startX: 170, startY: 1460, holeX: 2300, holeY: 210, segments: 10, zigzag: 192, phase: 1.9, widthBase: 262, waterEvery: 4, waterShift: 2, par: 5 }),
    buildDiagonalLevel({ startX: 210, startY: 1460, holeX: 2320, holeY: 195, segments: 11, zigzag: 200, phase: 2.7, widthBase: 255, waterEvery: 4, waterShift: 3, par: 5 })
  ],
  equations: [
    buildDiagonalLevel({ startX: 120, startY: 1470, holeX: 2320, holeY: 205, segments: 11, zigzag: 215, phase: 0.4, widthBase: 248, waterEvery: 4, waterShift: 2, par: 5 }),
    buildDiagonalLevel({ startX: 160, startY: 1460, holeX: 2300, holeY: 198, segments: 11, zigzag: 225, phase: 1.5, widthBase: 242, waterEvery: 4, waterShift: 1, par: 6 }),
    buildDiagonalLevel({ startX: 210, startY: 1460, holeX: 2320, holeY: 188, segments: 11, zigzag: 235, phase: 2.2, widthBase: 238, waterEvery: 4, waterShift: 2, par: 6 })
  ],
  trig: [
    buildDiagonalLevel({ startX: 120, startY: 1470, holeX: 2340, holeY: 198, segments: 11, zigzag: 248, phase: 0.7, widthBase: 230, waterEvery: 4, waterShift: 1, par: 6 }),
    buildDiagonalLevel({ startX: 160, startY: 1460, holeX: 2310, holeY: 188, segments: 11, zigzag: 260, phase: 1.8, widthBase: 225, waterEvery: 3, waterShift: 1, par: 6 }),
    buildDiagonalLevel({ startX: 210, startY: 1460, holeX: 2325, holeY: 180, segments: 12, zigzag: 272, phase: 2.9, widthBase: 220, waterEvery: 3, waterShift: 2, par: 7 })
  ]
};

export function createCategoryDefs(randInt) {
  const trigBank = [
    { expr: 'sin(30°)', answer: 0.5, tolerance: 0.02 },
    { expr: 'sin(45°)', answer: 0.707, tolerance: 0.03 },
    { expr: 'sin(60°)', answer: 0.866, tolerance: 0.03 },
    { expr: 'cos(30°)', answer: 0.866, tolerance: 0.03 },
    { expr: 'cos(45°)', answer: 0.707, tolerance: 0.03 },
    { expr: 'cos(60°)', answer: 0.5, tolerance: 0.02 },
    { expr: 'tan(45°)', answer: 1, tolerance: 0.02 },
    { expr: 'tan(60°)', answer: 1.732, tolerance: 0.04 }
  ];

  return [
    {
      id: 'arith',
      title: 'Базовая арифметика',
      difficulty: 1,
      createQuestion() {
        const mode = randInt(0, 2);
        if (mode === 0) {
          const a = randInt(14, 99);
          const b = randInt(11, 88);
          return { text: `${a} + ${b} = ?`, answer: a + b, tolerance: 0.001 };
        }
        if (mode === 1) {
          const a = randInt(90, 180);
          const b = randInt(16, 70);
          return { text: `${a} - ${b} = ?`, answer: a - b, tolerance: 0.001 };
        }
        const b = randInt(4, 12);
        const ans = randInt(3, 14);
        return { text: `${b * ans} ÷ ${b} = ?`, answer: ans, tolerance: 0.001 };
      }
    },
    {
      id: 'fractions',
      title: 'Дроби',
      difficulty: 2,
      createQuestion() {
        const den = [4, 5, 6, 8, 10][randInt(0, 4)];
        const a = randInt(1, den - 1);
        const b = randInt(1, den - 1);
        return {
          text: `${a}/${den} + ${b}/${den} = ? (десятичное)`,
          answer: (a + b) / den,
          tolerance: 0.03
        };
      }
    },
    {
      id: 'percent',
      title: 'Проценты',
      difficulty: 3,
      createQuestion() {
        const p = [10, 15, 20, 25, 30, 40][randInt(0, 5)];
        const n = randInt(80, 300);
        return { text: `${p}% от ${n} = ?`, answer: (n * p) / 100, tolerance: 0.03 };
      }
    },
    {
      id: 'powers',
      title: 'Степени и корни',
      difficulty: 4,
      createQuestion() {
        if (randInt(0, 1) === 0) {
          const b = randInt(3, 11);
          const e = randInt(2, 3);
          return { text: `${b}^${e} = ?`, answer: b ** e, tolerance: 0.001 };
        }
        const root = randInt(4, 18);
        return { text: `√${root * root} = ?`, answer: root, tolerance: 0.001 };
      }
    },
    {
      id: 'equations',
      title: 'Линейные уравнения',
      difficulty: 5,
      createQuestion() {
        const x = randInt(2, 14);
        const a = randInt(2, 8);
        const b = randInt(4, 32);
        return { text: `${a}x + ${b} = ${a * x + b}. Найди x`, answer: x, tolerance: 0.001 };
      }
    },
    {
      id: 'trig',
      title: 'Тригонометрия',
      difficulty: 6,
      createQuestion() {
        const q = trigBank[randInt(0, trigBank.length - 1)];
        return { text: `${q.expr} = ?`, answer: q.answer, tolerance: q.tolerance };
      }
    }
  ];
}
