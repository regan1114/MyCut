import type { Effects, Rhythm } from './effects';
import { alphaColor, random, TAU, wrap } from './effect-utils';

const quality = (e: Effects) => e.quality === 'draft' ? .55 : e.quality === 'high' ? 1.5 : 1;
const confettiColors = ['#ffd166', '#ff8fa3', '#8bd3dd', '#c4b5fd', '#f8fafc'];

// Reuse the compositor scratch surface. Read back at most 96 × 96 pixels,
// regardless of project resolution or duration; never retain past frames.
export function drawGraphicEffects(ctx: CanvasRenderingContext2D, W: number, H: number, e: Effects, scratch: CanvasRenderingContext2D) {
  for (const id of ['pixelate', 'halftone'] as const) {
    if (!e.enabled.includes(id)) continue;
    const bound = id === 'pixelate' ? Math.round(100 / e.density) : Math.min(96, Math.round(64 * Math.sqrt(e.density) * quality(e)));
    const scale = Math.min(1, bound / Math.max(W, H));
    const sw = Math.max(1, Math.round(W * scale)), sh = Math.max(1, Math.round(H * scale));
    if (scratch.canvas.width !== W) scratch.canvas.width = W;
    if (scratch.canvas.height !== H) scratch.canvas.height = H;
    scratch.save(); scratch.resetTransform(); scratch.globalAlpha = 1; scratch.globalCompositeOperation = 'source-over'; scratch.filter = 'none';
    scratch.clearRect(0, 0, W, H); scratch.imageSmoothingEnabled = true;
    scratch.drawImage(ctx.canvas, 0, 0, W, H, 0, 0, sw, sh);
    ctx.save(); ctx.globalAlpha = e.intensity;
    if (id === 'pixelate') {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(scratch.canvas, 0, 0, sw, sh, 0, 0, W, H);
    } else {
      const pixels = scratch.getImageData(0, 0, sw, sh).data, cw = W / sw, ch = H / sh;
      ctx.fillStyle = '#fff3d9'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#172536';
      // Draw each dot separately. Thousands of disconnected arcs in a single
      // path trigger expensive native tessellation, especially at 1080p/4K.
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          const i = (y * sw + x) * 4, light = (pixels[i] * .2126 + pixels[i + 1] * .7152 + pixels[i + 2] * .0722) / 255;
          const r = Math.min(cw, ch) * .49 * Math.sqrt(1 - light), cx = (x + .5) * cw, cy = (y + .5) * ch;
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
        }
      }
    }
    ctx.restore(); scratch.restore();
  }
}

export function drawDecorativeEffects(ctx: CanvasRenderingContext2D, W: number, H: number, time: number, e: Effects, rhythm: Rhythm) {
  const on = (id: Effects['enabled'][number]) => e.enabled.includes(id), a = e.intensity, t = time * e.speed;
  const u = Math.min(W / 1920, H / 1080), rand = (i: number) => random(e.seed + 1703, i);
  const count = (base: number) => Math.round(base * e.density * quality(e));
  ctx.save();
  if (on('bubbles')) {
    for (let i = 0; i < count(26); i++) {
      const r = (12 + rand(i * 6) * 44) * u, x = wrap(rand(i * 6 + 1) + Math.sin(t * .4 + i) * .025) * W;
      const phase = wrap(rand(i * 6 + 2) + t * (.02 + rand(i * 6 + 3) * .055)), y = (1.15 - phase * 1.3) * H;
      ctx.globalAlpha = a * (.25 + rand(i * 6 + 4) * .45); ctx.lineWidth = Math.max(.5, 1.8 * u);
      const g = ctx.createRadialGradient(x - r * .3, y - r * .4, 0, x, y, Math.max(.1, r));
      g.addColorStop(0, '#ffffff00'); g.addColorStop(.75, alphaColor(e.color, .04)); g.addColorStop(1, alphaColor(e.color, .35));
      ctx.fillStyle = g; ctx.strokeStyle = e.color; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, y, r * .72, Math.PI * 1.05, Math.PI * 1.55); ctx.stroke();
    }
  }
  if (on('hearts')) for (let i = 0; i < count(24); i++) {
    const phase = wrap(rand(i * 6) + t * (.035 + rand(i * 6 + 1) * .045));
    const x = wrap(rand(i * 6 + 2) + Math.sin(t * .7 + i) * .025) * W, y = (1.1 - phase * 1.2) * H, r = (9 + rand(i * 6 + 3) * 20) * u;
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * .5 + i) * .3); ctx.globalAlpha = a * Math.sin(phase * Math.PI) * .75; ctx.fillStyle = i % 3 ? '#ff9bb8' : e.color;
    ctx.beginPath(); ctx.moveTo(0, r); ctx.bezierCurveTo(-r * 2, -r * .25, -r, -r * 1.5, 0, -r * .55); ctx.bezierCurveTo(r, -r * 1.5, r * 2, -r * .25, 0, r); ctx.fill(); ctx.restore();
  }
  if (on('butterflies')) for (let i = 0; i < count(14); i++) {
    const x = wrap(rand(i * 5) + t * (.018 + rand(i * 5 + 1) * .02), 1.2) * W - W * .1;
    const y = (.15 + rand(i * 5 + 2) * .7 + Math.sin(t * .65 + i) * .06) * H, r = (10 + rand(i * 5 + 3) * 16) * u;
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * .8 + i) * .4); ctx.globalAlpha = a * .75;
    ctx.scale(.18 + .82 * Math.abs(Math.sin(t * (5 + rand(i * 5 + 4) * 3) + i)), 1); ctx.fillStyle = i % 2 ? e.color : '#cfb7ff';
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(side * r * .55, -r * .25, r * .65, r * .8, side * -.5, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(side * r * .4, r * .65, r * .45, r * .55, side * .4, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = '#fff4d9'; ctx.fillRect(-u, -r * .6, Math.max(.4, 2 * u), r * 1.5); ctx.restore();
  }
  if (on('confetti')) for (let i = 0; i < count(95); i++) {
    const phase = wrap(rand(i * 7) + t * (.065 + rand(i * 7 + 1) * .09));
    const x = wrap(rand(i * 7 + 2) + Math.sin(t + i) * .025) * W, y = (phase * 1.2 - .1) * H;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rand(i * 7 + 3) * TAU + t * (rand(i * 7 + 4) * 4 - 2));
    ctx.scale(.15 + .85 * Math.abs(Math.cos(t * 2 + i)), 1); ctx.globalAlpha = a * (.55 + rand(i * 7 + 5) * .4);
    ctx.fillStyle = confettiColors[i % confettiColors.length]; ctx.fillRect(-4 * u, -7 * u, (6 + rand(i * 7 + 6) * 6) * u, 14 * u); ctx.restore();
  }
  if (on('ribbons')) {
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.lineCap = 'round';
    for (let i = 0; i < count(5); i++) {
      ctx.globalAlpha = a * .27; ctx.strokeStyle = i % 2 ? e.color : '#d8b4fe'; ctx.lineWidth = (5 + rand(i) * 12) * u; ctx.beginPath();
      for (let j = 0; j <= 64; j++) {
        const x = j / 64 * W, y = H * (.25 + rand(i + 11) * .5) + Math.sin(j / 64 * TAU + t * .45 + i) * H * .16;
        j ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
  if (on('sunRays')) {
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.translate(W * .18, -H * .15);
    const length = Math.hypot(W, H) * 1.4, g = ctx.createLinearGradient(0, 0, 0, length);
    g.addColorStop(0, '#fff4c7'); g.addColorStop(.7, '#ffdf9a28'); g.addColorStop(1, '#ffdf9a00'); ctx.fillStyle = g;
    for (let i = 0; i < count(10); i++) {
      ctx.save(); ctx.rotate(-1.05 + i / Math.max(1, count(10) - 1) * 1.4 + Math.sin(t * .14 + i) * .06);
      ctx.globalAlpha = a * (.08 + rand(i) * .1); const spread = length * (.025 + rand(i + 40) * .035);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-spread, length); ctx.lineTo(spread, length); ctx.closePath(); ctx.fill(); ctx.restore();
    }
    ctx.restore();
  }
  if (on('starbursts')) {
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < count(7); i++) {
      const x = (.08 + rand(i * 4) * .84) * W, y = (.1 + rand(i * 4 + 1) * .8) * H;
      const breath = .3 + .7 * (Math.sin(t * 1.1 + i * 2) + 1) / 2, r = (45 + rand(i * 4 + 2) * 110) * u;
      ctx.save(); ctx.translate(x, y); ctx.globalAlpha = a * breath * .7;
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(.1, r)); g.addColorStop(0, '#ffffff'); g.addColorStop(.15, alphaColor(e.color, .9)); g.addColorStop(1, alphaColor(e.color, 0)); ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(-r, 0); ctx.quadraticCurveTo(-r * .08, -r * .04, 0, -r * .5); ctx.quadraticCurveTo(r * .08, -r * .04, r, 0); ctx.quadraticCurveTo(r * .08, r * .04, 0, r * .5); ctx.quadraticCurveTo(-r * .08, r * .04, -r, 0); ctx.fill(); ctx.restore();
    }
    ctx.restore();
  }
  if (on('filmGrain')) {
    const tick = Math.floor(t * 24), seed = (e.seed + tick) >>> 0, grains = count(1400);
    ctx.save(); ctx.globalAlpha = a * .22;
    for (let tone = 0; tone < 2; tone++) {
      ctx.fillStyle = tone ? '#ffffff' : '#000000'; ctx.beginPath();
      for (let i = tone; i < grains; i += 2) {
        const x = random(seed, i * 3) * W, y = random(seed, i * 3 + 1) * H, size = Math.max(.6, (1 + random(seed, i * 3 + 2) * 2) * u);
        ctx.rect(x, y, size, size);
      }
      ctx.fill();
    }
    ctx.restore();
  }
  if (on('beatRays') && rhythm.pulse > .002) {
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.strokeStyle = e.color; ctx.lineCap = 'round'; ctx.globalAlpha = a * rhythm.pulse * .75;
    const radius = Math.hypot(W, H) * .56, rays = count(36);
    for (let i = 0; i < rays; i++) {
      const angle = i / rays * TAU + rand(i) * .06, inner = radius * (.3 + rand(i + 70) * .35), outer = radius * (1 + rhythm.pulse * .12);
      ctx.lineWidth = (1 + rand(i + 110) * 3) * u; ctx.beginPath(); ctx.moveTo(W / 2 + Math.cos(angle) * inner, H / 2 + Math.sin(angle) * inner); ctx.lineTo(W / 2 + Math.cos(angle) * outer, H / 2 + Math.sin(angle) * outer); ctx.stroke();
    }
    ctx.restore();
  }
  // Last overlay keeps the bars black even when other light effects are enabled.
  if (on('letterbox')) { ctx.globalAlpha = a; ctx.fillStyle = '#000000'; const height = H * .12; ctx.fillRect(0, 0, W, height); ctx.fillRect(0, H - height, W, height); }
  ctx.restore();
}
