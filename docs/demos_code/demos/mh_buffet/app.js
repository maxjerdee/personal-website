/* =============================================================
   MH Buffet Table — Metropolis-Hastings Educational Visualization
   Vanilla JS + Canvas 2D, no dependencies
   ============================================================= */

'use strict';

// ─── POLYFILL: roundRect ──────────────────────────────────────
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
    const radius = Array.isArray(r) ? r[0] : (r || 0);
    this.beginPath();
    this.moveTo(x + radius, y);
    this.lineTo(x + w - radius, y);
    this.quadraticCurveTo(x + w, y, x + w, y + radius);
    this.lineTo(x + w, y + h - radius);
    this.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    this.lineTo(x + radius, y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - radius);
    this.lineTo(x, y + radius);
    this.quadraticCurveTo(x, y, x + radius, y);
    this.closePath();
  };
}

// ─── CONSTANTS ────────────────────────────────────────────────
const NUM_DISHES = 6;

const DISH_NAMES = ['Soup', 'Cake', 'Sushi', 'Burger', 'Salad', 'Pizza'];

const DISTRIBUTIONS = {
  uniform:  [1, 1, 1, 1, 1, 1],
  unimodal: [1, 2, 5, 8, 4, 2],
  bimodal:  [3, 7, 2, 1, 2, 7],
  skewed:   [8, 5, 3, 2, 1, 1],
};

// Warm + cool distinct colors for walkers
const WALKER_COLORS = [
  '#E76F51', // terracotta
  '#2A9D8F', // teal
  '#F4A261', // amber
  '#5E60CE', // indigo
  '#52B788', // sage green
  '#E9C46A', // golden yellow
  '#D62828', // red
  '#4CC9F0', // sky
  '#9B2226', // deep red
  '#48CAE4', // cyan
  '#A7C957', // lime green
  '#FF6B9D', // pink
  '#7B2FBE', // purple
  '#FB8500', // orange
  '#219EBC', // ocean blue
  '#8338EC', // violet
  '#06D6A0', // mint
  '#FFBE0B', // sun
  '#3A86FF', // blue
  '#FF006E', // hot pink
];

// Speed level → steps per second per walker
const SPEED_TABLE = [0.5, 1, 2, 4, 8, 20, 60];
const SPEED_NAMES = ['Very Slow', 'Slow', 'Moderate', 'Medium', 'Fast', 'Very Fast', 'Max'];

// Layout geometry (logical units, scaled to canvas)
const LAYOUT = {
  paddingX: 28,
  tableTopY: 60,
  tableHeight: 84,
  walkerZoneH: 160,  // tall enough for 3 stacked walkers per dish
  histoTopMargin: 16,
  histoH: 100,
  legendH: 28,
};

// Animation durations (ms)
const MOVE_DURATION   = 320;
const REACT_DURATION  = 500;   // disgusted / happy face hold time
const BOUNCE_DURATION = 280;

// ─── GLOBALS ──────────────────────────────────────────────────
const canvas = document.getElementById('main-canvas');
const ctx = canvas.getContext('2d');

let state = {
  running: true,
  preset: 'uniform',
  beta: 1.0,
  numWalkers: 3,
  speedLevel: 4,            // index into SPEED_TABLE
  stepsPerSec: SPEED_TABLE[3],
  totalSteps: 0,
  distribution: [],         // normalized
  rawDist: [],              // unnormalized copy
  histogram: [],            // raw counts per dish
  histoDisplay: [],         // smoothed display heights [0..1]
  walkers: [],
  lastFrameTime: 0,
  accumulatedTime: 0,
};

// ─── WALKER CLASS ─────────────────────────────────────────────
class Walker {
  constructor(id, color) {
    this.id = id;
    this.color = color;
    this.dish = Math.floor(Math.random() * NUM_DISHES);
    this.x = 0;             // current pixel x (lerped)
    this.y = 0;             // current pixel y (lerped)
    this.targetX = 0;
    this.targetY = 0;
    this.moving = false;
    this.moveStartTime = 0;
    this.moveFromX = 0;
    this.moveFromY = 0;
    this.mood = 'normal';   // 'normal' | 'happy' | 'disgusted'
    this.moodTimer = 0;     // ms remaining for mood expression
    this.shakePhase = 0;
    this.bouncePhase = 0;
    this.slot = 0;          // vertical stacking index among co-located walkers
    this.lungeDish = -1;    // proposed dish to lunge toward on rejection
  }
}

// ─── INITIALIZATION ───────────────────────────────────────────
function normalizeDistribution(raw) {
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map(v => v / sum);
}

function initState() {
  const raw = DISTRIBUTIONS[state.preset];
  state.rawDist = [...raw];
  state.distribution = normalizeDistribution(raw);
  state.histogram = new Array(NUM_DISHES).fill(0);
  state.histoDisplay = new Array(NUM_DISHES).fill(0);
  state.totalSteps = 0;
  state.walkers = [];
  for (let i = 0; i < state.numWalkers; i++) {
    state.walkers.push(new Walker(i, WALKER_COLORS[i % WALKER_COLORS.length]));
  }
  state.accumulatedTime = 0;
  updateStepCounter();
}

function resetWalkers() {
  for (let i = 0; i < state.walkers.length; i++) {
    const w = state.walkers[i];
    w.dish = Math.floor(Math.random() * NUM_DISHES);
    w.mood = 'normal';
    w.moodTimer = 0;
    w.moving = false;
  }
  state.histogram = new Array(NUM_DISHES).fill(0);
  state.histoDisplay = new Array(NUM_DISHES).fill(0);
  state.totalSteps = 0;
  state.accumulatedTime = 0;
  updateStepCounter();
  assignSlots();
}

// ─── SIMULATION STEP ──────────────────────────────────────────
function mhStep(walker) {
  const current = walker.dish;
  // Symmetric proposal: pick any of the OTHER dishes uniformly
  let proposed;
  do { proposed = Math.floor(Math.random() * NUM_DISHES); }
  while (proposed === current);

  const piCur  = state.distribution[current];
  const piProp = state.distribution[proposed];
  const alpha  = Math.min(1, Math.pow(piProp / piCur, state.beta));

  if (Math.random() < alpha) {
    // Accept
    walker.dish = proposed;
    walker.lungeDish = -1;
    walker.mood = 'happy';
    walker.moodTimer = REACT_DURATION;
    walker.bouncePhase = 0;
  } else {
    // Reject — lunge toward proposed dish then snap back
    walker.lungeDish = proposed;
    walker.mood = 'disgusted';
    walker.moodTimer = REACT_DURATION;
    walker.shakePhase = 0;
    // Immediately push position partway toward the proposed dish
    const usableW = LOGICAL_W - 2 * LAYOUT.paddingX;
    const cellW   = usableW / NUM_DISHES;
    const propX   = LAYOUT.paddingX + cellW * proposed + cellW / 2;
    if (walker.x !== 0) {
      walker.x = walker.x + (propX - walker.x) * 0.45;
    }
  }

  // Record in histogram
  state.histogram[walker.dish]++;
  state.totalSteps++;
}

// ─── SLOT ASSIGNMENT ─────────────────────────────────────────
// When multiple walkers are at same dish, stack them vertically
function assignSlots() {
  const counts = new Array(NUM_DISHES).fill(0);
  for (const w of state.walkers) {
    w.slot = counts[w.dish];
    counts[w.dish]++;
  }
}

// ─── CANVAS GEOMETRY ─────────────────────────────────────────
const LOGICAL_W = 860;
const LOGICAL_H = 470;

function setCanvasSize() {
  canvas.width  = LOGICAL_W;
  canvas.height = LOGICAL_H;
  // CSS (width: 100%; height: auto) handles visual scaling
}

function dishCenterX(dishIdx) {
  const usableW = LOGICAL_W - 2 * LAYOUT.paddingX;
  const cellW = usableW / NUM_DISHES;
  return LAYOUT.paddingX + cellW * dishIdx + cellW / 2;
}

function dishCenterY() {
  return LAYOUT.tableTopY + LAYOUT.tableHeight / 2;
}

function walkerHomeY(slot) {
  const baseY = LAYOUT.tableTopY + LAYOUT.tableHeight + 16;
  return baseY + slot * 54;
}

// ─── DRAWING: TABLE ──────────────────────────────────────────
function drawTable() {
  const x0 = LAYOUT.paddingX - 10;
  const y0 = LAYOUT.tableTopY - 12;
  const w  = LOGICAL_W - 2 * (LAYOUT.paddingX - 10);
  const h  = LAYOUT.tableHeight + 24;

  // Table body (wood)
  ctx.save();
  const woodGrad = ctx.createLinearGradient(0, y0, 0, y0 + h);
  woodGrad.addColorStop(0,   '#A0784A');
  woodGrad.addColorStop(0.3, '#8B6340');
  woodGrad.addColorStop(1,   '#6B4A28');
  ctx.fillStyle = woodGrad;
  ctx.beginPath();
  ctx.roundRect(x0, y0 + 10, w, h, [0, 0, 10, 10]);
  ctx.fill();

  // Tablecloth top surface
  const clothGrad = ctx.createLinearGradient(0, y0, 0, y0 + 18);
  clothGrad.addColorStop(0, '#FFF5E6');
  clothGrad.addColorStop(1, '#F5DFC0');
  ctx.fillStyle = clothGrad;
  ctx.beginPath();
  ctx.roundRect(x0, y0, w, 20, 6);
  ctx.fill();

  // Subtle wood grain lines
  ctx.strokeStyle = 'rgba(60,35,10,0.12)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 3; i++) {
    const gy = y0 + 24 + i * 14;
    ctx.beginPath();
    ctx.moveTo(x0 + 8, gy);
    ctx.lineTo(x0 + w - 8, gy);
    ctx.stroke();
  }

  // Dividers between dish zones
  const usableW = LOGICAL_W - 2 * LAYOUT.paddingX;
  const cellW   = usableW / NUM_DISHES;
  ctx.strokeStyle = 'rgba(255,240,220,0.25)';
  ctx.lineWidth = 1;
  for (let i = 1; i < NUM_DISHES; i++) {
    const dx = LAYOUT.paddingX + cellW * i;
    ctx.beginPath();
    ctx.moveTo(dx, y0 + 4);
    ctx.lineTo(dx, y0 + h - 2);
    ctx.stroke();
  }
  ctx.restore();
}

// ─── DRAWING: TARGET PROBABILITY GLOW BARS ───────────────────
function drawTargetBars() {
  const usableW = LOGICAL_W - 2 * LAYOUT.paddingX;
  const cellW   = usableW / NUM_DISHES;
  const maxBarH = LAYOUT.tableHeight - 10;
  const barW    = cellW * 0.55;

  for (let i = 0; i < NUM_DISHES; i++) {
    const p  = state.distribution[i];
    const bh = p * NUM_DISHES * maxBarH * 0.82; // scale so uniform fills ~82%
    const cx = LAYOUT.paddingX + cellW * i + cellW / 2;
    const by = LAYOUT.tableTopY + LAYOUT.tableHeight - 6;

    ctx.save();
    ctx.globalAlpha = 0.18;
    const g = ctx.createLinearGradient(0, by - bh, 0, by);
    g.addColorStop(0, '#E76F51');
    g.addColorStop(1, '#F4A261');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(cx - barW / 2, by - bh, barW, bh, [4, 4, 0, 0]);
    ctx.fill();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = '#E76F51';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - barW / 2, by - bh);
    ctx.lineTo(cx + barW / 2, by - bh);
    ctx.stroke();
    ctx.restore();
  }
}

// ─── DRAWING: DISHES ─────────────────────────────────────────
function drawDishes() {
  const usableW = LOGICAL_W - 2 * LAYOUT.paddingX;
  const cellW   = usableW / NUM_DISHES;
  for (let i = 0; i < NUM_DISHES; i++) {
    const cx = LAYOUT.paddingX + cellW * i + cellW / 2;
    const cy = dishCenterY();
    drawDish(ctx, i, cx, cy, 26);

    // Dish name label
    ctx.save();
    ctx.font = '600 10px Nunito, Arial';
    ctx.fillStyle = '#8B6340';
    ctx.textAlign = 'center';
    ctx.fillText(DISH_NAMES[i], cx, LAYOUT.tableTopY - 2);
    ctx.restore();
  }
}

// Draw a single dish icon centered at (cx, cy)
function drawDish(ctx, dishIdx, cx, cy, r) {
  ctx.save();
  switch (dishIdx) {
    case 0: drawSoup(ctx, cx, cy, r);   break;
    case 1: drawCake(ctx, cx, cy, r);   break;
    case 2: drawSushi(ctx, cx, cy, r);  break;
    case 3: drawBurger(ctx, cx, cy, r); break;
    case 4: drawSalad(ctx, cx, cy, r);  break;
    case 5: drawPizza(ctx, cx, cy, r);  break;
  }
  ctx.restore();
}

function drawSoup(ctx, cx, cy, r) {
  // Bowl
  ctx.fillStyle = '#E8D5B0';
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.2, r * 0.95, r * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#C4A870';
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // Soup surface
  ctx.fillStyle = '#FF8C42';
  ctx.beginPath();
  ctx.ellipse(cx, cy - r * 0.06, r * 0.75, r * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();

  // Steam lines
  ctx.strokeStyle = 'rgba(200,180,160,0.85)';
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  for (let s = -1; s <= 1; s++) {
    const sx = cx + s * r * 0.32;
    ctx.beginPath();
    ctx.moveTo(sx, cy - r * 0.38);
    ctx.bezierCurveTo(sx - 5, cy - r * 0.6, sx + 5, cy - r * 0.78, sx, cy - r);
    ctx.stroke();
  }
}

function drawCake(ctx, cx, cy, r) {
  // Cake slice (triangle-ish)
  const by = cy + r * 0.55;
  const ty = cy - r * 0.55;
  const hw = r * 0.72;

  // Bottom layer
  ctx.fillStyle = '#C97B2E';
  ctx.beginPath();
  ctx.moveTo(cx - hw, by);
  ctx.lineTo(cx + hw, by);
  ctx.lineTo(cx + hw * 0.55, ty + r * 0.32);
  ctx.lineTo(cx - hw * 0.55, ty + r * 0.32);
  ctx.closePath();
  ctx.fill();

  // Top layer (frosting)
  ctx.fillStyle = '#FFB6C1';
  ctx.beginPath();
  ctx.moveTo(cx - hw * 0.55, ty + r * 0.32);
  ctx.lineTo(cx + hw * 0.55, ty + r * 0.32);
  ctx.lineTo(cx + hw * 0.3, ty);
  ctx.lineTo(cx - hw * 0.3, ty);
  ctx.closePath();
  ctx.fill();

  // Layer stripe
  ctx.strokeStyle = '#FFDDE2';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - hw * 0.55, ty + r * 0.32);
  ctx.lineTo(cx + hw * 0.55, ty + r * 0.32);
  ctx.stroke();

  // Cherry
  ctx.fillStyle = '#E63946';
  ctx.beginPath();
  ctx.arc(cx, ty - 4, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#228B22';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx, ty - 4);
  ctx.quadraticCurveTo(cx + 5, ty - 12, cx + 3, ty - 14);
  ctx.stroke();

  // Outline
  ctx.strokeStyle = '#A05A20';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(cx - hw, by);
  ctx.lineTo(cx + hw, by);
  ctx.lineTo(cx + hw * 0.3, ty);
  ctx.lineTo(cx - hw * 0.3, ty);
  ctx.closePath();
  ctx.stroke();
}

function drawSushi(ctx, cx, cy, r) {
  // Rice base (oval)
  ctx.fillStyle = '#FFFBE6';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 4, r * 0.82, r * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#D4C090';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Nori strip (dark band around middle)
  ctx.fillStyle = '#2D2D2D';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 4, r * 0.82, r * 0.45, 0, 0, Math.PI * 2);
  ctx.save();
  ctx.clip();
  ctx.fillRect(cx - r, cy - 4, r * 2, 10);
  ctx.restore();

  // Salmon topping
  ctx.fillStyle = '#FF8C6B';
  ctx.beginPath();
  ctx.ellipse(cx, cy - 6, r * 0.6, r * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#D4603F';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Sesame dots
  ctx.fillStyle = '#FFFBE6';
  for (let d = -1; d <= 1; d++) {
    ctx.beginPath();
    ctx.arc(cx + d * 7, cy - 6, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBurger(ctx, cx, cy, r) {
  const bw = r * 0.95;
  const y0 = cy - r * 0.55;

  // Top bun
  ctx.fillStyle = '#D4903A';
  ctx.beginPath();
  ctx.arc(cx, y0 + 6, bw * 0.78, Math.PI, 0);
  ctx.closePath();
  ctx.fill();

  // Sesame seeds on bun
  ctx.fillStyle = '#FFFBE6';
  for (const [sx, sy] of [[-8, -2],[2, -7],[10, -2]]) {
    ctx.beginPath();
    ctx.ellipse(cx + sx, y0 + 6 + sy, 2.5, 1.5, 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Lettuce
  ctx.fillStyle = '#52B788';
  ctx.beginPath();
  ctx.ellipse(cx, y0 + 13, bw * 0.85, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Patty
  ctx.fillStyle = '#7B3F00';
  ctx.beginPath();
  ctx.ellipse(cx, y0 + 18, bw * 0.78, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Cheese
  ctx.fillStyle = '#F4A261';
  ctx.beginPath();
  ctx.ellipse(cx, y0 + 22, bw * 0.82, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Bottom bun
  ctx.fillStyle = '#D4903A';
  ctx.beginPath();
  ctx.ellipse(cx, y0 + 30, bw * 0.85, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  // Outline
  ctx.strokeStyle = '#A06520';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.arc(cx, y0 + 6, bw * 0.78, Math.PI, 0);
  ctx.closePath();
  ctx.stroke();
}

function drawSalad(ctx, cx, cy, r) {
  // Bowl
  ctx.fillStyle = '#E8D5B0';
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.25, r * 0.9, r * 0.52, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#C4A870';
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // Salad interior (clipping)
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.1, r * 0.75, r * 0.38, 0, 0, Math.PI * 2);
  ctx.clip();

  // Green leafy swirls
  const leaves = [
    { x: -8, y: -4, rot: 0.3,  col: '#52B788' },
    { x:  8, y: -6, rot: -0.5, col: '#40916C' },
    { x:  0, y: -8, rot: 0.1,  col: '#74C69D' },
    { x: -12, y: 2, rot: 0.8,  col: '#52B788' },
    { x: 12,  y: 0, rot: -0.3, col: '#40916C' },
    { x:  4,  y: 4, rot: 0.5,  col: '#95D5B2' },
  ];
  for (const l of leaves) {
    ctx.save();
    ctx.translate(cx + l.x, cy + l.y - r * 0.1);
    ctx.rotate(l.rot);
    ctx.fillStyle = l.col;
    ctx.beginPath();
    ctx.ellipse(0, 0, 9, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Leaf vein
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(6, 0);
    ctx.stroke();
    ctx.restore();
  }

  // Cherry tomatoes
  ctx.fillStyle = '#E63946';
  for (const [tx, ty] of [[-5, 6], [7, 5]]) {
    ctx.beginPath();
    ctx.arc(cx + tx, cy + ty, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPizza(ctx, cx, cy, r) {
  // Crust triangle
  const angle = Math.PI / 2;
  const spread = Math.PI * 0.58;
  const tipY = cy - r * 0.75;

  ctx.fillStyle = '#D4903A';
  ctx.beginPath();
  ctx.moveTo(cx, tipY);
  ctx.arc(cx, cy + r * 0.35, r * 0.88, -angle - spread/2, -angle + spread/2);
  ctx.closePath();
  ctx.fill();

  // Sauce
  ctx.fillStyle = '#E63946';
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx, tipY + 8);
  ctx.arc(cx, cy + r * 0.35, r * 0.72, -angle - spread*0.48, -angle + spread*0.48);
  ctx.closePath();
  ctx.clip();
  ctx.fillRect(cx - r, tipY, r * 2, r * 2);
  ctx.restore();

  // Cheese
  ctx.fillStyle = '#F4D03F';
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx, tipY + 14);
  ctx.arc(cx, cy + r * 0.35, r * 0.62, -angle - spread*0.45, -angle + spread*0.45);
  ctx.closePath();
  ctx.clip();
  ctx.fillRect(cx - r, tipY, r * 2, r * 2);
  ctx.restore();

  // Pepperoni dots
  const dots = [
    [cx, cy - r * 0.1],
    [cx - r * 0.28, cy + r * 0.15],
    [cx + r * 0.28, cy + r * 0.15],
  ];
  ctx.fillStyle = '#C0392B';
  for (const [dx, dy] of dots) {
    ctx.beginPath();
    ctx.arc(dx, dy, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Crust outline
  ctx.strokeStyle = '#A06520';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(cx, tipY);
  ctx.arc(cx, cy + r * 0.35, r * 0.88, -angle - spread/2, -angle + spread/2);
  ctx.closePath();
  ctx.stroke();
}

// ─── DRAWING: WALKER FACES ────────────────────────────────────
function drawWalker(w, now) {
  const r = 18;
  let px = w.x;
  let py = w.y;

  // Shake offset for disgusted
  let shakeX = 0;
  if (w.mood === 'disgusted' && w.moodTimer > 0) {
    const t = 1 - w.moodTimer / REACT_DURATION;
    shakeX = Math.sin(t * Math.PI * 10) * 5 * (1 - t);
  }

  // Bounce offset for happy
  let bounceY = 0;
  if (w.mood === 'happy' && w.moodTimer > 0) {
    const t = 1 - w.moodTimer / REACT_DURATION;
    bounceY = -Math.abs(Math.sin(t * Math.PI * 2.5)) * 10 * (1 - t * 0.7);
  }

  const fx = px + shakeX;
  const fy = py + bounceY;

  ctx.save();

  // Drop shadow
  ctx.shadowColor = 'rgba(80,40,10,0.22)';
  ctx.shadowBlur  = 6;
  ctx.shadowOffsetY = 2;

  // Body circle
  let bodyColor = w.color;
  if (w.mood === 'disgusted') {
    // Slight green tint mix
    bodyColor = blendColor(w.color, '#90EE90', 0.35);
  }
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.arc(fx, fy, r, 0, Math.PI * 2);
  ctx.fill();

  // Subtle highlight
  const hiGrad = ctx.createRadialGradient(fx - r * 0.3, fy - r * 0.3, 1, fx, fy, r);
  hiGrad.addColorStop(0, 'rgba(255,255,255,0.38)');
  hiGrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hiGrad;
  ctx.beginPath();
  ctx.arc(fx, fy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur  = 0;
  ctx.shadowOffsetY = 0;

  // Border
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(fx, fy, r, 0, Math.PI * 2);
  ctx.stroke();

  // Face
  if (w.mood === 'happy') {
    drawHappyFace(ctx, fx, fy, r);
  } else if (w.mood === 'disgusted') {
    drawDisgustedFace(ctx, fx, fy, r);
  } else {
    drawNormalFace(ctx, fx, fy, r);
  }

  // Walker ID label
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = `bold 8px Nunito, Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(w.id + 1, fx, fy + r + 11);

  ctx.restore();
}

function drawNormalFace(ctx, cx, cy, r) {
  ctx.fillStyle = '#2D1810';
  // Eyes
  ctx.beginPath(); ctx.arc(cx - r * 0.3, cy - r * 0.1, r * 0.1, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + r * 0.3, cy - r * 0.1, r * 0.1, 0, Math.PI * 2); ctx.fill();
  // Smile
  ctx.strokeStyle = '#2D1810';
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy + r * 0.08, r * 0.32, 0.2, Math.PI - 0.2);
  ctx.stroke();
}

function drawHappyFace(ctx, cx, cy, r) {
  // Star/sparkle eyes
  ctx.fillStyle = '#FFD700';
  drawStar(ctx, cx - r * 0.3, cy - r * 0.12, 4, 4, 2);
  drawStar(ctx, cx + r * 0.3, cy - r * 0.12, 4, 4, 2);

  // Big grin
  ctx.strokeStyle = '#2D1810';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy + r * 0.05, r * 0.42, 0.1, Math.PI - 0.1);
  ctx.stroke();

  // Rosy cheeks
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#FF8FA3';
  ctx.beginPath(); ctx.ellipse(cx - r * 0.46, cy + r * 0.1, r * 0.18, r * 0.1, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + r * 0.46, cy + r * 0.1, r * 0.18, r * 0.1, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
}

function drawDisgustedFace(ctx, cx, cy, r) {
  ctx.fillStyle = '#2D1810';

  // Furrowed brows (angled, worried)
  ctx.strokeStyle = '#2D1810';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  // Left brow — angled down toward center
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.5, cy - r * 0.28);
  ctx.lineTo(cx - r * 0.15, cy - r * 0.38);
  ctx.stroke();
  // Right brow — angled down toward center
  ctx.beginPath();
  ctx.moveTo(cx + r * 0.5, cy - r * 0.28);
  ctx.lineTo(cx + r * 0.15, cy - r * 0.38);
  ctx.stroke();

  // Squinting / X eyes
  ctx.strokeStyle = '#2D1810';
  ctx.lineWidth = 1.8;
  // Left eye — squint X
  ctx.beginPath(); ctx.moveTo(cx - r*0.38, cy - r*0.12); ctx.lineTo(cx - r*0.22, cy - r*0.04); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - r*0.38, cy - r*0.04); ctx.lineTo(cx - r*0.22, cy - r*0.12); ctx.stroke();
  // Right eye — squint X
  ctx.beginPath(); ctx.moveTo(cx + r*0.22, cy - r*0.12); ctx.lineTo(cx + r*0.38, cy - r*0.04); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + r*0.22, cy - r*0.04); ctx.lineTo(cx + r*0.38, cy - r*0.12); ctx.stroke();

  // Wavy/downturned disgusted mouth
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.38, cy + r * 0.28);
  ctx.bezierCurveTo(
    cx - r * 0.15, cy + r * 0.18,
    cx + r * 0.05, cy + r * 0.38,
    cx + r * 0.25, cy + r * 0.22
  );
  ctx.bezierCurveTo(
    cx + r * 0.32, cy + r * 0.17,
    cx + r * 0.38, cy + r * 0.28,
    cx + r * 0.42, cy + r * 0.22
  );
  ctx.stroke();

  // Small "blech" tongue out
  ctx.fillStyle = '#FF6B9D';
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.05, cy + r * 0.44, r * 0.14, r * 0.1, 0, 0, Math.PI);
  ctx.fill();

  // Sweat drop
  ctx.fillStyle = '#90D5FF';
  ctx.beginPath();
  ctx.arc(cx + r * 0.55, cy - r * 0.35, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + r * 0.55, cy - r * 0.35 - 3);
  ctx.lineTo(cx + r * 0.5, cy - r * 0.5);
  ctx.lineTo(cx + r * 0.6, cy - r * 0.5);
  ctx.closePath();
  ctx.fill();
}

function drawStar(ctx, cx, cy, outerR, numPoints, innerR) {
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < numPoints * 2; i++) {
    const angle = (i * Math.PI) / numPoints - Math.PI / 2;
    const rad = i % 2 === 0 ? outerR : innerR;
    if (i === 0) ctx.moveTo(cx + Math.cos(angle) * rad, cy + Math.sin(angle) * rad);
    else ctx.lineTo(cx + Math.cos(angle) * rad, cy + Math.sin(angle) * rad);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// Simple color blending helper
function blendColor(hex1, hex2, t) {
  const parse = h => {
    const v = parseInt(h.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  };
  const [r1,g1,b1] = parse(hex1);
  const [r2,g2,b2] = parse(hex2);
  const r = Math.round(r1 + (r2-r1)*t);
  const g = Math.round(g1 + (g2-g1)*t);
  const b = Math.round(b1 + (b2-b1)*t);
  return `rgb(${r},${g},${b})`;
}

// ─── DRAWING: HISTOGRAM ───────────────────────────────────────
function drawHistogram() {
  const totalVisits = state.histogram.reduce((a, b) => a + b, 0);
  const usableW = LOGICAL_W - 2 * LAYOUT.paddingX;
  const cellW   = usableW / NUM_DISHES;
  const barW    = cellW * 0.62;
  const histoTop = LAYOUT.tableTopY + LAYOUT.tableHeight + LAYOUT.walkerZoneH + LAYOUT.histoTopMargin;
  const histoH   = LAYOUT.histoH;

  // Background panel
  ctx.save();
  ctx.fillStyle = 'rgba(255,245,235,0.7)';
  ctx.beginPath();
  ctx.roundRect(LAYOUT.paddingX - 6, histoTop - 8, usableW + 12, histoH + 36, 10);
  ctx.fill();

  // Grid lines
  ctx.strokeStyle = 'rgba(200,170,130,0.3)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  for (let g = 0; g <= 4; g++) {
    const gy = histoTop + histoH - (g / 4) * histoH;
    ctx.beginPath();
    ctx.moveTo(LAYOUT.paddingX, gy);
    ctx.lineTo(LAYOUT.paddingX + usableW, gy);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  for (let i = 0; i < NUM_DISHES; i++) {
    const cx = LAYOUT.paddingX + cellW * i + cellW / 2;
    const by = histoTop + histoH;

    // Ghost / target bar
    const targetFrac = state.distribution[i];
    const ghostH = targetFrac * NUM_DISHES * histoH * 0.88;
    ctx.fillStyle = 'rgba(244,162,97,0.18)';
    ctx.strokeStyle = 'rgba(231,111,81,0.55)';
    ctx.lineWidth = 1.8;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.roundRect(cx - barW / 2, by - ghostH, barW, ghostH, [4, 4, 0, 0]);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);

    // Empirical bar (smoothly animated)
    const dispH = state.histoDisplay[i] * histoH;
    if (dispH > 0.5) {
      const barGrad = ctx.createLinearGradient(0, by - dispH, 0, by);
      barGrad.addColorStop(0, '#E76F51');
      barGrad.addColorStop(1, '#F4A261');
      ctx.fillStyle = barGrad;
      ctx.beginPath();
      ctx.roundRect(cx - barW / 2 + 2, by - dispH, barW - 4, dispH, [4, 4, 0, 0]);
      ctx.fill();

      // Empirical bar outline
      ctx.strokeStyle = 'rgba(200,90,50,0.4)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(cx - barW / 2 + 2, by - dispH, barW - 4, dispH, [4, 4, 0, 0]);
      ctx.stroke();

      // Percentage text on bar if tall enough
      if (dispH > 18) {
        const pct = totalVisits > 0 ? ((state.histogram[i] / totalVisits) * 100).toFixed(0) : '0';
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 9px Nunito, Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(pct + '%', cx, by - dispH / 2);
      }
    }

    // X-axis label
    ctx.fillStyle = '#8B6340';
    ctx.font = '600 9.5px Nunito, Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(DISH_NAMES[i], cx, by + 14);
  }

  // Legend
  const legendY = histoTop + histoH + 26;
  ctx.font = '600 9px Nunito, Arial';
  ctx.textBaseline = 'middle';

  // Empirical
  const barGrad2 = ctx.createLinearGradient(0, 0, 24, 0);
  barGrad2.addColorStop(0, '#E76F51');
  barGrad2.addColorStop(1, '#F4A261');
  ctx.fillStyle = barGrad2;
  ctx.fillRect(LAYOUT.paddingX + 4, legendY - 5, 22, 10);
  ctx.fillStyle = '#5A3B22';
  ctx.fillText('Empirical visits', LAYOUT.paddingX + 30, legendY);

  // Target ghost
  ctx.fillStyle = 'rgba(244,162,97,0.18)';
  ctx.strokeStyle = 'rgba(231,111,81,0.55)';
  ctx.setLineDash([4, 3]);
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.rect(LAYOUT.paddingX + 145, legendY - 5, 22, 10);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#5A3B22';
  ctx.fillText('Target π', LAYOUT.paddingX + 171, legendY);

  ctx.restore();
}

// ─── DRAWING: HEADING ─────────────────────────────────────────
function drawHeading() {
  ctx.save();
  ctx.font = 'bold 13px Nunito, Arial';
  ctx.fillStyle = '#7A5230';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('🍽  MH Buffet Table', LAYOUT.paddingX, 22);

  // Acceptance info
  const totalSteps = state.totalSteps;
  if (totalSteps > 0) {
    ctx.font = '600 10px Nunito, Arial';
    ctx.fillStyle = '#B08060';
    ctx.textAlign = 'right';
    ctx.fillText(`β = ${state.beta.toFixed(1)}`, LOGICAL_W - LAYOUT.paddingX, 22);
  }
  ctx.restore();
}

// ─── DRAWING: WALKER ZONE LABEL ───────────────────────────────
function drawWalkerZoneLabel() {
  ctx.save();
  ctx.font = '600 9px Nunito, Arial';
  ctx.fillStyle = 'rgba(139,99,64,0.55)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const walkerZoneY = LAYOUT.tableTopY + LAYOUT.tableHeight + LAYOUT.walkerZoneH - 4;
  ctx.fillText('Walkers', LAYOUT.paddingX, walkerZoneY);
  ctx.restore();
}

// ─── MASTER RENDER ────────────────────────────────────────────
function render(now) {
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);

  // Background
  ctx.fillStyle = '#FFF8F0';
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

  drawHeading();
  drawTable();
  drawTargetBars();
  drawDishes();
  drawWalkerZoneLabel();

  // Update and draw walkers
  updateWalkerPositions(now);
  for (const w of state.walkers) {
    drawWalker(w, now);
  }

  drawHistogram();
}

// ─── WALKER POSITION UPDATE ───────────────────────────────────
function getWalkerTargetPos(w) {
  const usableW = LOGICAL_W - 2 * LAYOUT.paddingX;
  const cellW   = usableW / NUM_DISHES;
  const tx = LAYOUT.paddingX + cellW * w.dish + cellW / 2;
  const ty = walkerHomeY(w.slot);
  return { tx, ty };
}

function updateWalkerPositions(now) {
  // Assign slots first
  assignSlots();

  for (const w of state.walkers) {
    const { tx, ty } = getWalkerTargetPos(w);
    w.targetX = tx;
    w.targetY = ty;

    if (w.x === 0 && w.y === 0) {
      // First frame init
      w.x = tx;
      w.y = ty;
    } else {
      // Smooth lerp — faster snap-back when returning from a lunge
      const lerpRate = w.lungeDish !== -1 ? 0.22 : 0.14;
      w.x += (tx - w.x) * lerpRate;
      w.y += (ty - w.y) * lerpRate;
      // Snap if close
      if (Math.abs(w.x - tx) < 0.5) w.x = tx;
      if (Math.abs(w.y - ty) < 0.5) w.y = ty;
    }

    // Tick down mood timer
    if (w.moodTimer > 0) {
      w.moodTimer = Math.max(0, w.moodTimer - 16.67);
      if (w.moodTimer === 0) {
        w.mood = 'normal';
        w.lungeDish = -1;
      }
    }
  }
}

// ─── HISTOGRAM SMOOTH UPDATE ─────────────────────────────────
function updateHistoDisplay() {
  const total = state.histogram.reduce((a, b) => a + b, 0);
  if (total === 0) {
    for (let i = 0; i < NUM_DISHES; i++) {
      state.histoDisplay[i] += (0 - state.histoDisplay[i]) * 0.08;
    }
    return;
  }
  const maxTarget = Math.max(...state.distribution) * NUM_DISHES;
  for (let i = 0; i < NUM_DISHES; i++) {
    const empiricalFrac = state.histogram[i] / total;
    // Normalize to same scale as target bars (so they're comparable)
    const targetHeight = (empiricalFrac * NUM_DISHES) / maxTarget;
    const lerpRate = 0.06;
    state.histoDisplay[i] += (targetHeight - state.histoDisplay[i]) * lerpRate;
  }
}

// ─── SIMULATION LOOP ─────────────────────────────────────────
let lastTime = 0;

function simulationTick(stepsToRun) {
  for (let s = 0; s < stepsToRun; s++) {
    for (const w of state.walkers) {
      mhStep(w);
    }
  }
  updateStepCounter();
}

function mainLoop(now) {
  requestAnimationFrame(mainLoop);

  const dt = now - lastTime;
  lastTime = now;

  if (state.running) {
    state.accumulatedTime += dt;
    const msPerStep = 1000 / state.stepsPerSec;
    const stepsToRun = Math.floor(state.accumulatedTime / msPerStep);

    if (stepsToRun > 0) {
      // Cap to avoid spiral of death
      const capped = Math.min(stepsToRun, Math.max(1, Math.round(state.stepsPerSec * 0.5)));
      simulationTick(capped);
      state.accumulatedTime -= capped * msPerStep;
    }
  }

  updateHistoDisplay();
  render(now);
}

// ─── UI HELPERS ──────────────────────────────────────────────
function updateStepCounter() {
  document.getElementById('step-counter').textContent =
    `Steps: ${state.totalSteps.toLocaleString()}`;
}

function setPreset(name) {
  state.preset = name;
  const raw = DISTRIBUTIONS[name];
  state.rawDist = [...raw];
  state.distribution = normalizeDistribution(raw);
  // Update active button
  document.querySelectorAll('.preset-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.preset === name);
  });
}

function setNumWalkers(n) {
  const current = state.walkers.length;
  if (n > current) {
    for (let i = current; i < n; i++) {
      const w = new Walker(i, WALKER_COLORS[i % WALKER_COLORS.length]);
      state.walkers.push(w);
    }
  } else if (n < current) {
    state.walkers.splice(n);
  }
  state.numWalkers = n;
  assignSlots();
}

function speedLevelToLabel(level) {
  return SPEED_NAMES[level - 1] || 'Medium';
}

// ─── CONTROLS SETUP ──────────────────────────────────────────
function setupControls() {
  // Beta slider
  const betaSlider = document.getElementById('beta-slider');
  const betaVal    = document.getElementById('beta-val');
  betaSlider.addEventListener('input', () => {
    state.beta = parseFloat(betaSlider.value);
    betaVal.textContent = `β = ${state.beta.toFixed(1)}`;
  });

  // Walkers slider
  const walkersSlider = document.getElementById('walkers-slider');
  const walkersVal    = document.getElementById('walkers-val');
  walkersSlider.addEventListener('input', () => {
    const n = parseInt(walkersSlider.value);
    setNumWalkers(n);
    walkersVal.textContent = `${n}`;
  });

  // Speed slider
  const speedSlider = document.getElementById('speed-slider');
  const speedVal    = document.getElementById('speed-val');
  speedSlider.addEventListener('input', () => {
    const level = parseInt(speedSlider.value);
    state.speedLevel = level;
    state.stepsPerSec = SPEED_TABLE[level - 1];
    speedVal.textContent = speedLevelToLabel(level);
  });

  // Preset buttons
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setPreset(btn.dataset.preset);
    });
  });

  // Play/Pause
  const ppBtn = document.getElementById('play-pause-btn');
  ppBtn.addEventListener('click', () => {
    state.running = !state.running;
    ppBtn.innerHTML = state.running
      ? '&#9646;&#9646; Pause'
      : '&#9654; Play';
  });

  // Reset
  document.getElementById('reset-btn').addEventListener('click', () => {
    resetWalkers();
  });
}

// ─── RESIZE HANDLER ───────────────────────────────────────────
function handleResize() {
  setCanvasSize();
}

window.addEventListener('resize', handleResize);

// ─── BOOT ────────────────────────────────────────────────────
function boot() {
  setCanvasSize();
  initState();
  assignSlots();
  setupControls();

  // Set initial slider display values
  document.getElementById('beta-val').textContent = `β = ${state.beta.toFixed(1)}`;
  document.getElementById('walkers-val').textContent = `${state.numWalkers}`;
  document.getElementById('speed-val').textContent = speedLevelToLabel(state.speedLevel);

  lastTime = performance.now();
  requestAnimationFrame(mainLoop);
}

boot();
