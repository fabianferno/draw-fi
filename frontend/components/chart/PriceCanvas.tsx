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
// Price line
const LINE_COLOR = '#f0a030';
const LINE_WIDTH = 2;
// Crosshair
const CROSSHAIR_COLOR = '#22c55e';
// Live dot
const DOT_COLOR = '#00E5FF';

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
      // Horizontal grid
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(chartW, y);
      ctx.stroke();
      // Price label on right axis
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

    // --- Price fill gradient ---
    if (priceData.length > 1) {
      const visibleData = priceData.filter(
        p => p.time >= visibleTimeRange.start && p.time <= visibleTimeRange.end
      );

      if (visibleData.length > 1) {
        // Convert to pixel coordinates
        const pts = visibleData.map(d => ({
          x: timeToX(d.time),
          y: priceToY(d.value),
        }));

        // Area fill
        const gradient = ctx.createLinearGradient(0, 0, 0, h);
        gradient.addColorStop(0, 'rgba(240,160,48,0.3)');
        gradient.addColorStop(1, 'rgba(240,160,48,0)');

        ctx.beginPath();
        smoothPath(ctx, pts);
        ctx.lineTo(pts[pts.length - 1].x, h);
        ctx.lineTo(pts[0].x, h);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();

        // Price line
        ctx.beginPath();
        smoothPath(ctx, pts);
        ctx.strokeStyle = LINE_COLOR;
        ctx.lineWidth = LINE_WIDTH;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke();
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

      // Pulsing live dot
      const pulsePhase = (Date.now() % 2000) / 2000;
      const radius = 3 + Math.sin(pulsePhase * Math.PI * 2) * 1.5;

      ctx.beginPath();
      ctx.arc(lastX, lastY, radius, 0, Math.PI * 2);
      ctx.fillStyle = DOT_COLOR;
      ctx.fill();
    }
  }, [priceData, coords, width, height, visibleTimeRange, visiblePriceRange, timeToX, priceToY]);

  // Always mark dirty for the pulsing live dot animation
  useAnimationFrame(canvasRef, draw, [priceData, coords, Date.now()]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0"
      style={{ width, height }}
    />
  );
}

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
