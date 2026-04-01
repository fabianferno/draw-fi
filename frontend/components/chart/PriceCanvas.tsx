// frontend/components/chart/PriceCanvas.tsx
'use client';

import { useRef, useCallback } from 'react';
import { useAnimationFrame } from '@/hooks/useAnimationFrame';
import type { PricePoint } from '@/types/price';
import type { ChartCoordinates } from '@/hooks/useChartCoordinates';

interface PriceCanvasProps {
  priceData: PricePoint[];
  coords: ChartCoordinates;
}

// Right axis width in pixels
const AXIS_WIDTH = 56;
// Grid line style
const GRID_COLOR = 'rgba(255,255,255,0.04)';
// Crosshair
const CROSSHAIR_COLOR = '#22c55e';

// Rainbow trail colors (classic Nyan Cat order: red → orange → yellow → green → blue → violet)
const RAINBOW_COLORS = [
  '#ff0000',
  '#ff9900',
  '#ffff00',
  '#33ff00',
  '#0099ff',
  '#6633ff',
];
const BAND_HEIGHT = 3;    // Height of each rainbow band
const BAND_GAP = 1;       // Gap between bands
const NYAN_CAT_SCALE = 1.6; // Scale of the Nyan Cat sprite

export function PriceCanvas({ priceData, coords }: PriceCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { width, height, visibleTimeRange, visiblePriceRange, timeToX, priceToY } = coords;

  const draw = useCallback((ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    const dpr = window.devicePixelRatio || 1;
    const w = width;
    const h = height;

    // Resize canvas for DPR
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Clear
    ctx.clearRect(0, 0, w, h);

    const chartW = w - AXIS_WIDTH;
    const { min: minP, max: maxP } = visiblePriceRange;

    // --- Grid lines ---
    const priceSpan = maxP - minP;
    const gridStep = niceStep(priceSpan, 5);
    const firstGrid = Math.ceil(minP / gridStep) * gridStep;

    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let p = firstGrid; p <= maxP; p += gridStep) {
      const y = priceToY(p);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(chartW, y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillText(formatPrice(p), w - 4, y);
    }

    // Vertical time grid
    const { start, end } = visibleTimeRange;
    const timeDuration = end - start;
    const timeStep = niceTimeStep(timeDuration, 6);
    const firstTime = Math.ceil(start / timeStep) * timeStep;

    for (let t = firstTime; t <= end; t += timeStep) {
      const x = timeToX(t);
      if (x < 0 || x > chartW) continue;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // --- Sparkle stars background ---
    const now = Date.now();
    drawSparkles(ctx, chartW, h, now);

    // --- Rainbow trail + Nyan Cat ---
    if (priceData.length > 1) {
      const visibleData = priceData.filter(
        p => p.time >= visibleTimeRange.start && p.time <= visibleTimeRange.end
      );

      if (visibleData.length > 1) {
        const pts = visibleData.map(d => ({
          x: timeToX(d.time),
          y: priceToY(d.value),
        }));

        // Densify the points for smoother rainbow bands
        const densePts = densifyPath(pts, 2);

        // Draw rainbow trail — 6 colored bands offset vertically from the line
        const totalBandHeight = RAINBOW_COLORS.length * (BAND_HEIGHT + BAND_GAP);
        for (let band = 0; band < RAINBOW_COLORS.length; band++) {
          const offset = (band - (RAINBOW_COLORS.length - 1) / 2) * (BAND_HEIGHT + BAND_GAP);

          ctx.save();
          ctx.beginPath();
          // Animate the trail with a wavy pattern
          const offsetPts = densePts.map((p, i) => ({
            x: p.x,
            y: p.y + offset,
          }));
          if (offsetPts.length > 0) {
            ctx.moveTo(offsetPts[0].x, offsetPts[0].y);
            for (let i = 1; i < offsetPts.length; i++) {
              ctx.lineTo(offsetPts[i].x, offsetPts[i].y);
            }
          }
          ctx.strokeStyle = RAINBOW_COLORS[band];
          ctx.lineWidth = BAND_HEIGHT;
          ctx.lineCap = 'butt';
          ctx.lineJoin = 'round';
          // Subtle glow
          ctx.shadowColor = RAINBOW_COLORS[band];
          ctx.shadowBlur = 6;
          ctx.globalAlpha = 0.85;
          ctx.stroke();
          ctx.restore();
        }

        // Rainbow glow under the trail
        ctx.save();
        ctx.beginPath();
        smoothPath(ctx, pts);
        ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y + totalBandHeight);
        ctx.lineTo(pts[0].x, pts[0].y + totalBandHeight);
        ctx.closePath();
        const glowGrad = ctx.createLinearGradient(0, 0, 0, h);
        glowGrad.addColorStop(0, 'rgba(255,100,200,0.15)');
        glowGrad.addColorStop(1, 'rgba(255,100,200,0)');
        ctx.fillStyle = glowGrad;
        ctx.fill();
        ctx.restore();

        // Draw Nyan Cat at the last point
        const lastPt = pts[pts.length - 1];
        const bounceOffset = Math.sin((now % 400) / 400 * Math.PI * 2) * 3;
        drawNyanCat(ctx, lastPt.x, lastPt.y + bounceOffset, NYAN_CAT_SCALE, now);
      }
    }

    // --- Current price crosshair ---
    if (priceData.length > 0) {
      const lastPoint = priceData[priceData.length - 1];
      const lastY = priceToY(lastPoint.value);
      const lastX = timeToX(lastPoint.time);

      // Dashed green line
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = CROSSHAIR_COLOR;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, lastY);
      ctx.lineTo(chartW, lastY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // Price badge on right axis
      const badgeText = formatPrice(lastPoint.value);
      const badgeW = ctx.measureText(badgeText).width + 12;
      const badgeH = 18;
      const badgeX = chartW + 2;
      const badgeY = lastY - badgeH / 2;

      ctx.fillStyle = CROSSHAIR_COLOR;
      roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 3);
      ctx.fill();

      ctx.fillStyle = '#000000';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, badgeX + 6, lastY);
    }
  }, [priceData, coords, width, height, visibleTimeRange, visiblePriceRange, timeToX, priceToY]);

  // Always repaint for Nyan Cat bounce animation + sparkles
  useAnimationFrame(canvasRef, draw, [priceData, coords, Date.now()]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0"
      style={{ width, height }}
    />
  );
}

// --- Nyan Cat pixel art sprite ---

function drawNyanCat(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  scale: number, now: number,
) {
  const s = scale;
  const px = (v: number) => v * s; // pixel size helper

  // Animation frame toggle (legs alternate)
  const frame = Math.floor((now % 300) / 150);

  ctx.save();
  ctx.translate(x - px(10), y - px(10));

  // Pop-Tart body (pink with sprinkles)
  ctx.fillStyle = '#ffcc99';
  roundRect(ctx, px(0), px(1), px(18), px(16), px(2));
  ctx.fill();

  // Pop-Tart frosting
  ctx.fillStyle = '#ff99aa';
  roundRect(ctx, px(1), px(2), px(16), px(13), px(2));
  ctx.fill();

  // Sprinkles
  ctx.fillStyle = '#ff6699';
  fillPixel(ctx, px(4), px(5), px(1.5));
  fillPixel(ctx, px(10), px(4), px(1.5));
  fillPixel(ctx, px(14), px(7), px(1.5));
  fillPixel(ctx, px(6), px(9), px(1.5));
  fillPixel(ctx, px(12), px(11), px(1.5));
  fillPixel(ctx, px(3), px(12), px(1.5));
  fillPixel(ctx, px(9), px(13), px(1.5));

  // Cat head (gray, to the right of tart)
  ctx.fillStyle = '#999999';
  // Main head
  ctx.fillRect(px(16), px(3), px(8), px(8));
  // Ears
  ctx.fillRect(px(16), px(0), px(2), px(3));
  ctx.fillRect(px(22), px(0), px(2), px(3));
  // Inner ears
  ctx.fillStyle = '#ff99aa';
  fillPixel(ctx, px(16.5), px(1), px(1));
  fillPixel(ctx, px(22.5), px(1), px(1));

  // Cat eyes
  ctx.fillStyle = '#000000';
  fillPixel(ctx, px(18), px(6), px(1.5));
  fillPixel(ctx, px(22), px(6), px(1.5));

  // Cat mouth / cheeks
  ctx.fillStyle = '#ff6699';
  fillPixel(ctx, px(17), px(8.5), px(1));
  fillPixel(ctx, px(23), px(8.5), px(1));

  // Nose
  ctx.fillStyle = '#000000';
  fillPixel(ctx, px(20), px(7.5), px(0.8));

  // Cat legs (alternate based on frame)
  ctx.fillStyle = '#999999';
  if (frame === 0) {
    // Frame 1: front legs forward, back legs back
    ctx.fillRect(px(2), px(17), px(2), px(3));
    ctx.fillRect(px(6), px(17), px(2), px(4));
    ctx.fillRect(px(11), px(17), px(2), px(4));
    ctx.fillRect(px(15), px(17), px(2), px(3));
  } else {
    // Frame 2: legs swap
    ctx.fillRect(px(2), px(17), px(2), px(4));
    ctx.fillRect(px(6), px(17), px(2), px(3));
    ctx.fillRect(px(11), px(17), px(2), px(3));
    ctx.fillRect(px(15), px(17), px(2), px(4));
  }

  // Cat tail (wavy based on time)
  ctx.fillStyle = '#999999';
  const tailWave = Math.sin((now % 500) / 500 * Math.PI * 2) * 2;
  ctx.fillRect(px(-3), px(4) + tailWave, px(4), px(2));
  ctx.fillRect(px(-5), px(3) + tailWave, px(3), px(2));

  ctx.restore();
}

function fillPixel(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.fillRect(x - size / 2, y - size / 2, size, size);
}

// --- Sparkle stars ---

function drawSparkles(ctx: CanvasRenderingContext2D, w: number, h: number, now: number) {
  // Deterministic "random" star positions that twinkle
  const starCount = 12;
  const seed = 42;

  ctx.save();
  for (let i = 0; i < starCount; i++) {
    const sx = ((seed * (i + 1) * 137) % 1000) / 1000 * w;
    const sy = ((seed * (i + 1) * 251) % 1000) / 1000 * h;
    const phase = ((now + i * 500) % 2000) / 2000;
    const alpha = 0.2 + Math.sin(phase * Math.PI * 2) * 0.3;

    if (alpha <= 0.05) continue;

    ctx.globalAlpha = Math.max(0, alpha);
    ctx.fillStyle = '#ffffff';
    const size = 1.5 + Math.sin(phase * Math.PI) * 1;

    // Draw a small cross/star shape
    ctx.fillRect(sx - size, sy - 0.5, size * 2, 1);
    ctx.fillRect(sx - 0.5, sy - size, 1, size * 2);
  }
  ctx.restore();
}

// --- Densify path for smooth rainbow bands ---

function densifyPath(
  pts: Array<{ x: number; y: number }>,
  maxSegLen: number,
): Array<{ x: number; y: number }> {
  if (pts.length < 2) return pts;
  const result: Array<{ x: number; y: number }> = [pts[0]];

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(1, Math.ceil(dist / maxSegLen));

    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      result.push({ x: a.x + dx * t, y: a.y + dy * t });
    }
  }

  return result;
}

// --- Helpers ---

// --- Helpers ---

/**
 * Draw a smooth cubic bezier spline through the given points.
 * Uses Catmull-Rom → cubic bezier conversion for C1 continuity.
 */
function smoothPath(
  ctx: CanvasRenderingContext2D,
  pts: Array<{ x: number; y: number }>,
) {
  if (pts.length === 0) return;
  ctx.moveTo(pts[0].x, pts[0].y);
  if (pts.length === 1) return;
  if (pts.length === 2) {
    ctx.lineTo(pts[1].x, pts[1].y);
    return;
  }

  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(i + 2, pts.length - 1)];

    // Catmull-Rom tangents scaled to 1/6 for cubic bezier control points
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function niceStep(range: number, targetTicks: number): number {
  const rough = range / targetTicks;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const normalized = rough / pow;
  let nice: number;
  if (normalized < 1.5) nice = 1;
  else if (normalized < 3) nice = 2;
  else if (normalized < 7) nice = 5;
  else nice = 10;
  return nice * pow;
}

function niceTimeStep(durationSec: number, targetTicks: number): number {
  const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  const rough = durationSec / targetTicks;
  for (const s of steps) {
    if (s >= rough) return s;
  }
  return steps[steps.length - 1];
}

function formatPrice(price: number): string {
  if (price >= 1000) return price.toFixed(2);
  if (price >= 10) return price.toFixed(3);
  return price.toFixed(6);
}
