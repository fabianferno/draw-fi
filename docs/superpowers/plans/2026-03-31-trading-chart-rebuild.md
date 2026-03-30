# Trading Chart Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the lightweight-charts-based trading chart with a custom Canvas 2D renderer using component-per-layer architecture, clean trading terminal aesthetic, gradient prediction line with ghost mode, and simplified predict page.

**Architecture:** Component-per-layer with shared coordinate context. Two stacked canvases (PriceCanvas for the price line/grid/axes, PredictionCanvas for prediction overlay/ghost mode) share a `ChartCoordinateContext`. PatternDrawingBox stays separate with interpolation support. Legacy position flow removed entirely.

**Tech Stack:** React 19, Next.js 16, Canvas 2D API, TypeScript, Tailwind CSS, Framer Motion

**Note:** No test framework is configured in this project. Verification is done via `next build` and manual browser testing. Each task ends with a build check.

---

### Task 1: Create useChartCoordinates hook

**Files:**
- Create: `frontend/hooks/useChartCoordinates.ts`

- [ ] **Step 1: Create the hook file**

```ts
// frontend/hooks/useChartCoordinates.ts
'use client';

import { useMemo } from 'react';
import type { PricePoint } from '@/types/price';

export interface ChartCoordinates {
  width: number;
  height: number;
  visibleTimeRange: { start: number; end: number };
  visiblePriceRange: { min: number; max: number };
  timeToX: (time: number) => number;
  priceToY: (price: number) => number;
  xToTime: (x: number) => number;
  yToPrice: (y: number) => number;
  barSpacing: number;
}

export function useChartCoordinates(opts: {
  width: number;
  height: number;
  priceData: PricePoint[];
  barSpacing: number;
}): ChartCoordinates {
  const { width, height, priceData, barSpacing } = opts;

  return useMemo(() => {
    const now = priceData.length > 0
      ? priceData[priceData.length - 1].time
      : Math.floor(Date.now() / 1000);

    // Time range: latest point sits at 80% of width
    const visibleDuration = width / barSpacing;
    const futureSpace = visibleDuration * 0.2;
    const start = now - (visibleDuration - futureSpace);
    const end = now + futureSpace;

    // Price range: auto-fit to visible data with 10% padding
    const visiblePoints = priceData.filter(p => p.time >= start && p.time <= end);
    let minPrice: number, maxPrice: number;
    if (visiblePoints.length > 0) {
      minPrice = Math.min(...visiblePoints.map(p => p.value));
      maxPrice = Math.max(...visiblePoints.map(p => p.value));
    } else if (priceData.length > 0) {
      minPrice = Math.min(...priceData.map(p => p.value));
      maxPrice = Math.max(...priceData.map(p => p.value));
    } else {
      minPrice = 0;
      maxPrice = 100;
    }

    const priceSpan = maxPrice - minPrice || 1;
    const padding = priceSpan * 0.1;
    minPrice -= padding;
    maxPrice += padding;

    const timeToX = (time: number) => ((time - start) / (end - start)) * width;
    const priceToY = (price: number) => height - ((price - minPrice) / (maxPrice - minPrice)) * height;
    const xToTime = (x: number) => start + (x / width) * (end - start);
    const yToPrice = (y: number) => minPrice + ((height - y) / height) * (maxPrice - minPrice);

    return {
      width,
      height,
      visibleTimeRange: { start, end },
      visiblePriceRange: { min: minPrice, max: maxPrice },
      timeToX,
      priceToY,
      xToTime,
      yToPrice,
      barSpacing,
    };
  }, [width, height, priceData, barSpacing]);
}
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/fabianferno/Documents/draw-fi/frontend && npx next build`
Expected: Build succeeds (unused file, but no type errors)

- [ ] **Step 3: Commit**

```bash
git add frontend/hooks/useChartCoordinates.ts
git commit -m "feat(chart): add useChartCoordinates hook for shared coordinate system"
```

---

### Task 2: Create useAnimationFrame hook

**Files:**
- Create: `frontend/hooks/useAnimationFrame.ts`

- [ ] **Step 1: Create the hook file**

```ts
// frontend/hooks/useAnimationFrame.ts
'use client';

import { useEffect, useRef } from 'react';

/**
 * Runs a requestAnimationFrame loop that calls `draw` whenever the canvas
 * needs a repaint. Sets a dirty flag when `deps` change so idle frames
 * are skipped.
 */
export function useAnimationFrame(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  draw: (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => void,
  deps: unknown[],
): void {
  const dirtyRef = useRef(true);
  const drawRef = useRef(draw);
  drawRef.current = draw;

  // Mark dirty when deps change
  useEffect(() => {
    dirtyRef.current = true;
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let rafId: number;
    let running = true;

    const loop = () => {
      if (!running) return;
      if (dirtyRef.current) {
        dirtyRef.current = false;
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            drawRef.current(ctx, canvas);
          }
        }
      }
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);

    return () => {
      running = false;
      cancelAnimationFrame(rafId);
    };
  }, [canvasRef]);
}
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/fabianferno/Documents/draw-fi/frontend && npx next build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend/hooks/useAnimationFrame.ts
git commit -m "feat(chart): add useAnimationFrame hook with dirty-flag optimization"
```

---

### Task 3: Create ChartInfoBar component

**Files:**
- Create: `frontend/components/chart/ChartInfoBar.tsx`

- [ ] **Step 1: Create the component**

```tsx
// frontend/components/chart/ChartInfoBar.tsx
'use client';

interface ChartInfoBarProps {
  price: number | null;
  pairSymbol: string;     // e.g. "BTCUSDT"
  pairDisplay: string;    // e.g. "BTC/USDT"
}

export function ChartInfoBar({ price, pairSymbol, pairDisplay }: ChartInfoBarProps) {
  // Extract base token name from symbol (e.g. "BTC" from "BTCUSDT")
  const baseName = pairSymbol.replace(/USDT$/, '');

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06]">
      {/* Token icon placeholder */}
      <div className="w-9 h-9 rounded-full bg-[#1a1f2e] flex items-center justify-center text-xs font-bold text-white/60">
        {baseName.slice(0, 3)}
      </div>

      {/* Live price */}
      <span className="text-[22px] font-bold font-mono text-[#f0b90b] tabular-nums">
        {price !== null ? price.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: price < 10 ? 6 : price < 1000 ? 4 : 2,
        }) : '—'}
      </span>

      {/* Pair name */}
      <span className="text-sm text-white/50">
        {pairDisplay || baseName}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/fabianferno/Documents/draw-fi/frontend && npx next build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend/components/chart/ChartInfoBar.tsx
git commit -m "feat(chart): add ChartInfoBar component with live price display"
```

---

### Task 4: Create TimeAxis component

**Files:**
- Create: `frontend/components/chart/TimeAxis.tsx`

- [ ] **Step 1: Create the component**

```tsx
// frontend/components/chart/TimeAxis.tsx
'use client';

interface TimeAxisProps {
  visibleTimeRange: { start: number; end: number };
  width: number;
}

function formatTime(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function TimeAxis({ visibleTimeRange, width }: TimeAxisProps) {
  const { start, end } = visibleTimeRange;
  const tickCount = Math.max(2, Math.min(6, Math.floor(width / 120)));
  const ticks: { time: number; left: string }[] = [];

  for (let i = 0; i < tickCount; i++) {
    const t = start + ((end - start) * i) / (tickCount - 1);
    const left = `${(i / (tickCount - 1)) * 100}%`;
    ticks.push({ time: t, left });
  }

  return (
    <div className="relative h-6 px-1" style={{ width }}>
      {ticks.map((tick, i) => (
        <span
          key={i}
          className="absolute top-1 text-[10px] font-mono text-white/25 -translate-x-1/2"
          style={{ left: tick.left }}
        >
          {formatTime(tick.time)}
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/fabianferno/Documents/draw-fi/frontend && npx next build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend/components/chart/TimeAxis.tsx
git commit -m "feat(chart): add TimeAxis component for time labels"
```

---

### Task 5: Create PriceCanvas component

**Files:**
- Create: `frontend/components/chart/PriceCanvas.tsx`

- [ ] **Step 1: Create the component**

```tsx
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
        // Area fill
        const gradient = ctx.createLinearGradient(0, 0, 0, h);
        gradient.addColorStop(0, 'rgba(240,160,48,0.3)');
        gradient.addColorStop(1, 'rgba(240,160,48,0)');

        ctx.beginPath();
        ctx.moveTo(timeToX(visibleData[0].time), priceToY(visibleData[0].value));
        for (let i = 1; i < visibleData.length; i++) {
          ctx.lineTo(timeToX(visibleData[i].time), priceToY(visibleData[i].value));
        }
        ctx.lineTo(timeToX(visibleData[visibleData.length - 1].time), h);
        ctx.lineTo(timeToX(visibleData[0].time), h);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();

        // Price line
        ctx.beginPath();
        ctx.moveTo(timeToX(visibleData[0].time), priceToY(visibleData[0].value));
        for (let i = 1; i < visibleData.length; i++) {
          ctx.lineTo(timeToX(visibleData[i].time), priceToY(visibleData[i].value));
        }
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
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/fabianferno/Documents/draw-fi/frontend && npx next build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend/components/chart/PriceCanvas.tsx
git commit -m "feat(chart): add PriceCanvas with custom Canvas 2D renderer"
```

---

### Task 6: Create PredictionCanvas component

**Files:**
- Create: `frontend/components/chart/PredictionCanvas.tsx`

- [ ] **Step 1: Create the component**

```tsx
// frontend/components/chart/PredictionCanvas.tsx
'use client';

import { useRef, useCallback } from 'react';
import { useAnimationFrame } from '@/hooks/useAnimationFrame';
import type { PredictionPoint } from '@/types/prediction';
import type { ChartCoordinates } from '@/hooks/useChartCoordinates';

interface PredictionCanvasProps {
  predictionPoints: PredictionPoint[];
  coords: ChartCoordinates;
  isPositionActive: boolean;
}

export function PredictionCanvas({
  predictionPoints,
  coords,
  isPositionActive,
}: PredictionCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { width, height, timeToX, priceToY } = coords;

  const draw = useCallback((ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    if (predictionPoints.length < 2) return;

    // Map prediction points to pixel coordinates
    const pixels = predictionPoints.map(p => ({
      x: timeToX(p.time),
      y: priceToY(p.price),
    }));

    const globalAlpha = isPositionActive ? 0.15 : 1.0;
    const bandAlpha = isPositionActive ? 0.02 : 0.04;

    // --- Uncertainty band (widens over time) ---
    const maxBandWidth = 20;
    ctx.globalAlpha = bandAlpha;
    ctx.fillStyle = 'rgba(0,229,255,1)';

    ctx.beginPath();
    // Top edge
    for (let i = 0; i < pixels.length; i++) {
      const spread = (i / (pixels.length - 1)) * maxBandWidth;
      const x = pixels[i].x;
      const y = pixels[i].y - spread;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    // Bottom edge (reverse)
    for (let i = pixels.length - 1; i >= 0; i--) {
      const spread = (i / (pixels.length - 1)) * maxBandWidth;
      const x = pixels[i].x;
      const y = pixels[i].y + spread;
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();

    // --- Gradient prediction line ---
    ctx.globalAlpha = globalAlpha;

    const gradient = ctx.createLinearGradient(
      pixels[0].x, 0,
      pixels[pixels.length - 1].x, 0,
    );
    gradient.addColorStop(0, 'rgba(0,229,255,1)');
    gradient.addColorStop(0.4, 'rgba(0,229,255,0.7)');
    gradient.addColorStop(0.7, 'rgba(123,97,255,0.4)');
    gradient.addColorStop(1, 'rgba(123,97,255,0.1)');

    ctx.strokeStyle = gradient;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(pixels[0].x, pixels[0].y);
    for (let i = 1; i < pixels.length; i++) {
      ctx.lineTo(pixels[i].x, pixels[i].y);
    }
    ctx.stroke();

    // --- Junction dot ---
    ctx.globalAlpha = isPositionActive ? 0.3 : 0.8;
    ctx.beginPath();
    ctx.arc(pixels[0].x, pixels[0].y, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#00E5FF';
    ctx.fill();

    ctx.globalAlpha = 1;
  }, [predictionPoints, coords, isPositionActive, width, height, timeToX, priceToY]);

  useAnimationFrame(canvasRef, draw, [predictionPoints, coords, isPositionActive]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-10 pointer-events-none"
      style={{ width, height }}
    />
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/fabianferno/Documents/draw-fi/frontend && npx next build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend/components/chart/PredictionCanvas.tsx
git commit -m "feat(chart): add PredictionCanvas with gradient line and ghost mode"
```

---

### Task 7: Create ChartContainer component

**Files:**
- Create: `frontend/components/chart/ChartContainer.tsx`

- [ ] **Step 1: Create the component**

```tsx
// frontend/components/chart/ChartContainer.tsx
'use client';

import { useRef, useState, useEffect, useCallback, WheelEvent } from 'react';
import { PriceCanvas } from './PriceCanvas';
import { PredictionCanvas } from './PredictionCanvas';
import { useChartCoordinates } from '@/hooks/useChartCoordinates';
import type { PricePoint } from '@/types/price';
import type { PredictionPoint } from '@/types/prediction';

interface ChartContainerProps {
  priceData: PricePoint[];
  predictionPoints: PredictionPoint[];
  isPositionActive: boolean;
  barSpacing: number;
  onBarSpacingChange: (spacing: number) => void;
}

const CHART_HEIGHT = 350;
const MIN_BAR_SPACING = 1;
const MAX_BAR_SPACING = 20;

export function ChartContainer({
  priceData,
  predictionPoints,
  isPositionActive,
  barSpacing,
  onBarSpacingChange,
}: ChartContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Track container width via ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    observer.observe(el);
    // Initial measurement
    setContainerWidth(el.getBoundingClientRect().width);

    return () => observer.disconnect();
  }, []);

  const coords = useChartCoordinates({
    width: containerWidth,
    height: CHART_HEIGHT,
    priceData,
    barSpacing,
  });

  const handleWheel = useCallback((e: WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.5 : 0.5;
    const next = Math.max(MIN_BAR_SPACING, Math.min(MAX_BAR_SPACING, barSpacing + delta));
    onBarSpacingChange(next);
  }, [barSpacing, onBarSpacingChange]);

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden"
      style={{ height: CHART_HEIGHT }}
      onWheel={handleWheel}
    >
      {containerWidth > 0 && (
        <>
          <PriceCanvas priceData={priceData} coords={coords} />
          <PredictionCanvas
            predictionPoints={predictionPoints}
            coords={coords}
            isPositionActive={isPositionActive}
          />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/fabianferno/Documents/draw-fi/frontend && npx next build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend/components/chart/ChartContainer.tsx
git commit -m "feat(chart): add ChartContainer with stacked canvases and zoom"
```

---

### Task 8: Rewrite TradingChart as thin wrapper

**Files:**
- Rewrite: `frontend/components/chart/TradingChart.tsx`

- [ ] **Step 1: Read existing file to understand current exports and imports**

Read: `frontend/components/chart/TradingChart.tsx` (check what other files import from it)
Run: `cd /Users/fabianferno/Documents/draw-fi/frontend && grep -r "TradingChart" --include="*.tsx" --include="*.ts" -l`

- [ ] **Step 2: Rewrite TradingChart.tsx**

Replace the entire file with:

```tsx
// frontend/components/chart/TradingChart.tsx
'use client';

import { useState } from 'react';
import { ChartInfoBar } from './ChartInfoBar';
import { ChartContainer } from './ChartContainer';
import { TimeAxis } from './TimeAxis';
import { useChartCoordinates } from '@/hooks/useChartCoordinates';
import type { PricePoint } from '@/types/price';
import type { PredictionPoint } from '@/types/prediction';

interface TradingChartProps {
  priceData: PricePoint[];
  predictionPoints: PredictionPoint[];
  isPositionActive: boolean;
  pairSymbol: string;
  pairDisplay: string;
}

export function TradingChart({
  priceData,
  predictionPoints,
  isPositionActive,
  pairSymbol,
  pairDisplay,
}: TradingChartProps) {
  const [barSpacing, setBarSpacing] = useState(3);

  const currentPrice = priceData.length > 0
    ? priceData[priceData.length - 1].value
    : null;

  // We need coords here just for TimeAxis; ChartContainer creates its own internally
  // Use a reasonable default width — TimeAxis only needs the time range
  const coords = useChartCoordinates({
    width: 800,
    height: 350,
    priceData,
    barSpacing,
  });

  return (
    <div className="bg-[#0a0f1a] rounded-2xl border border-white/[0.08] overflow-hidden">
      <ChartInfoBar
        price={currentPrice}
        pairSymbol={pairSymbol}
        pairDisplay={pairDisplay}
      />
      <ChartContainer
        priceData={priceData}
        predictionPoints={predictionPoints}
        isPositionActive={isPositionActive}
        barSpacing={barSpacing}
        onBarSpacingChange={setBarSpacing}
      />
      <TimeAxis
        visibleTimeRange={coords.visibleTimeRange}
        width={coords.width}
      />
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `cd /Users/fabianferno/Documents/draw-fi/frontend && npx next build`
Expected: May have errors if predict/page.tsx still imports old props — that's fine, we'll fix in Task 11.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/chart/TradingChart.tsx
git commit -m "feat(chart): rewrite TradingChart as thin composable wrapper"
```

---

### Task 9: Add interpolation to samplePredictionPoints

**Files:**
- Modify: `frontend/lib/prediction/samplePredictionPoints.ts`

- [ ] **Step 1: Rewrite samplePredictionPoints.ts with interpolation support**

Replace the entire file with:

```ts
// frontend/lib/prediction/samplePredictionPoints.ts
export type CanvasPoint = { x: number; y: number };

const DEFAULT_BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

/**
 * Monotone cubic Hermite interpolation.
 * Given sorted xs and ys, returns a function that interpolates at any x.
 */
function monotoneCubicInterpolator(xs: number[], ys: number[]): (x: number) => number {
  const n = xs.length;
  if (n === 1) return () => ys[0];
  if (n === 2) {
    const slope = (ys[1] - ys[0]) / (xs[1] - xs[0]);
    return (x: number) => ys[0] + slope * (x - xs[0]);
  }

  // Compute slopes
  const dxs: number[] = [];
  const dys: number[] = [];
  const ms: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dxs.push(xs[i + 1] - xs[i]);
    dys.push(ys[i + 1] - ys[i]);
    ms.push(dys[i] / dxs[i]);
  }

  // Compute tangents
  const tangents: number[] = [ms[0]];
  for (let i = 1; i < n - 1; i++) {
    if (ms[i - 1] * ms[i] <= 0) {
      tangents.push(0);
    } else {
      tangents.push((ms[i - 1] + ms[i]) / 2);
    }
  }
  tangents.push(ms[n - 2]);

  // Fritsch-Carlson monotonicity
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(ms[i]) < 1e-10) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
    } else {
      const alpha = tangents[i] / ms[i];
      const beta = tangents[i + 1] / ms[i];
      const s = alpha * alpha + beta * beta;
      if (s > 9) {
        const tau = 3 / Math.sqrt(s);
        tangents[i] = tau * alpha * ms[i];
        tangents[i + 1] = tau * beta * ms[i];
      }
    }
  }

  return (x: number) => {
    // Binary search for interval
    let lo = 0;
    let hi = n - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] <= x) lo = mid;
      else hi = mid;
    }
    const i = lo;
    const h = dxs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;

    return (
      (2 * t3 - 3 * t2 + 1) * ys[i] +
      (t3 - 2 * t2 + t) * h * tangents[i] +
      (-2 * t3 + 3 * t2) * ys[i + 1] +
      (t3 - t2) * h * tangents[i + 1]
    );
  };
}

export function samplePredictionPoints(
  points: CanvasPoint[],
  desiredCount = 60,
): CanvasPoint[] {
  if (points.length < 2) {
    throw new Error(
      'Not enough points to sample — draw at least 2 points',
    );
  }

  const maxY = points.reduce((max, p) => (p.y > max ? p.y : max), points[0].y);

  // If we already have enough points, use uniform index-sampling (original behavior)
  if (points.length >= desiredCount) {
    if (points.length === desiredCount) {
      return points.map((p) => ({ x: p.x, y: maxY - p.y }));
    }

    const result: CanvasPoint[] = [];
    const lastIndex = points.length - 1;
    for (let i = 0; i < desiredCount; i++) {
      const t = desiredCount === 1 ? 0 : i / (desiredCount - 1);
      const index = Math.round(t * lastIndex);
      const point = points[index];
      result.push({ x: point.x, y: maxY - point.y });
    }
    return result;
  }

  // Interpolate: upsample using monotone cubic Hermite
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const interpolate = monotoneCubicInterpolator(xs, ys);

  const minX = xs[0];
  const maxX = xs[xs.length - 1];
  const result: CanvasPoint[] = [];

  for (let i = 0; i < desiredCount; i++) {
    const t = desiredCount === 1 ? 0 : i / (desiredCount - 1);
    const x = minX + t * (maxX - minX);
    const y = interpolate(x);
    result.push({ x, y: maxY - y });
  }

  return result;
}

export async function uploadSampledPredictionPoints(options: {
  points: CanvasPoint[];
  userAddress: string;
  desiredCount?: number;
  backendUrl?: string;
}): Promise<{ commitmentId: string; predictions: number[] }> {
  const {
    points,
    userAddress,
    desiredCount = 60,
    backendUrl = DEFAULT_BACKEND_URL,
  } = options;

  if (!userAddress) {
    throw new Error('uploadSampledPredictionPoints: userAddress is required');
  }

  const sampledPoints = samplePredictionPoints(points, desiredCount);
  const predictions = sampledPoints.map((p) => p.y + 1);

  const res = await fetch(`${backendUrl}/api/predictions/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ predictions, userAddress }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      body.error || `Prediction upload failed with status ${res.status}`,
    );
  }

  const json = await res.json();
  const commitmentId = json.commitmentId as string | undefined;

  if (!commitmentId) {
    throw new Error(
      'Prediction upload succeeded but backend did not return commitmentId',
    );
  }

  return { commitmentId, predictions };
}
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/fabianferno/Documents/draw-fi/frontend && npx next build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/prediction/samplePredictionPoints.ts
git commit -m "feat(chart): add cubic Hermite interpolation for short drawings"
```

---

### Task 10: Fix usePredictionDrawing stale closure

**Files:**
- Modify: `frontend/hooks/usePredictionDrawing.ts`

- [ ] **Step 1: Fix the stale closure in confirmPrediction**

In `frontend/hooks/usePredictionDrawing.ts`, replace the `confirmPrediction` callback (lines 75-78):

Old:
```ts
  const confirmPrediction = useCallback(() => {
    dispatch({ type: 'CONFIRM_PREDICTION' });
    return state.currentPoints;
  }, [state.currentPoints]);
```

New:
```ts
  const currentPointsRef = useRef(state.currentPoints);
  currentPointsRef.current = state.currentPoints;

  const confirmPrediction = useCallback(() => {
    dispatch({ type: 'CONFIRM_PREDICTION' });
    return currentPointsRef.current;
  }, []);
```

Also add `useRef` to the import on line 3:

Old:
```ts
import { useReducer, useCallback } from 'react';
```

New:
```ts
import { useReducer, useCallback, useRef } from 'react';
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/fabianferno/Documents/draw-fi/frontend && npx next build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend/hooks/usePredictionDrawing.ts
git commit -m "fix(chart): resolve stale closure in confirmPrediction via ref"
```

---

### Task 11: Rewrite predict/page.tsx

**Files:**
- Rewrite: `frontend/app/predict/page.tsx`

- [ ] **Step 1: Rewrite the page**

Replace the entire file. Key changes:
- Remove all legacy position flow code (LINE_FUTURES_ABI, contract polling, ethers imports)
- Remove positionIds, positionStatus, batchPnL, timeRemaining, statusMessageIndex state
- Remove yellowNonceRef and legacy loop
- Simplify handlePatternComplete to only use useOpenPosition
- Pass new TradingChart props (priceData, predictionPoints, isPositionActive, pairSymbol, pairDisplay)
- Keep PositionStatusCard as-is (it already works with useOpenPosition state)

```tsx
// frontend/app/predict/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNextStep } from 'nextstepjs';
import { TradingChart } from '@/components/chart/TradingChart';
import { PatternDrawingBox } from '@/components/chart/PatternDrawingBox';
import { usePredictionDrawing } from '@/hooks/usePredictionDrawing';
import { usePriceData } from '@/hooks/usePriceData';
import { useTokenPair } from '@/contexts/TokenPairContext';
import { TokenPairSelector } from '@/components/TokenPairSelector';
import { samplePredictionPoints } from '@/lib/prediction/samplePredictionPoints';
import { Header, BottomControls } from '@/components/layout';
import { usePrivyWallet } from '@/hooks/usePrivyWallet';
import { useYellowDeposit } from '@/hooks/useYellow';
import { predictTourId } from '@/lib/onboarding/predictTourSteps';
import { useOpenPosition, type PositionStatus, type PositionResult } from '@/hooks/useOpenPosition';

const ONBOARDING_SEEN_KEY = 'drawfi-predict-onboarding-seen';

export const dynamic = 'force-dynamic';

function PositionStatusCard({
  status,
  result,
  timeRemaining,
  error,
  onReset,
}: {
  status: PositionStatus;
  result: PositionResult | null;
  timeRemaining: number | null;
  error: string | null;
  onReset: () => void;
}) {
  if (status === 'idle') return null;

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}m ${sec}s`;
  };

  const pnlNum = result ? parseInt(result.pnl) : 0;
  const isProfit = pnlNum > 0;

  return (
    <div className={`rounded-lg border-2 p-4 mt-4 ${
      status === 'closed'
        ? (isProfit ? 'border-green-400/50 bg-green-400/5' : 'border-red-400/50 bg-red-400/5')
        : status === 'error'
          ? 'border-red-400/50 bg-red-400/5'
          : 'border-[#00E5FF]/30 bg-[#00E5FF]/5'
    }`}>
      {status === 'creating' && (
        <p className="text-[#00E5FF] text-sm">Setting up position...</p>
      )}
      {status === 'transferring' && (
        <p className="text-[#00E5FF] text-sm">Transferring collateral...</p>
      )}
      {status === 'active' && (
        <p className="text-[#00E5FF] text-sm">
          Position active — closes in {timeRemaining !== null ? formatTime(timeRemaining) : '...'}
        </p>
      )}
      {status === 'closed' && result && (
        <div className="space-y-1">
          <p className={`text-lg font-bold ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
            PnL: {isProfit ? '+' : ''}{(pnlNum / 1e6).toFixed(4)} USDC ({result.pnlPercent}%)
          </p>
          <p className="text-white/60 text-xs">
            Accuracy: {(result.accuracy * 100).toFixed(1)}% ({result.correctDirections}/{result.totalDirections})
          </p>
          <p className="text-white/60 text-xs">
            Return: {(parseInt(result.returnAmount) / 1e6).toFixed(4)} USDC
          </p>
          <button onClick={onReset} className="mt-2 text-xs text-[#00E5FF] underline">
            New prediction
          </button>
        </div>
      )}
      {status === 'error' && (
        <div className="flex items-center gap-2">
          <p className="text-red-400 text-sm">{error}</p>
          <button onClick={onReset} className="text-xs text-white/40 underline">Retry</button>
        </div>
      )}
    </div>
  );
}

export default function PredictPage() {
  const { ready, authenticated, address, isWalletLoading } = usePrivyWallet();
  const isConnected = ready && authenticated && !!address && !isWalletLoading;
  const { selectedPair, availablePairs } = useTokenPair();
  const { startNextStep, isNextStepVisible } = useNextStep();

  // Show onboarding tour the first time user visits the predict page
  useEffect(() => {
    if (typeof window === 'undefined' || isNextStepVisible) return;
    const seen = window.localStorage.getItem(ONBOARDING_SEEN_KEY);
    if (!seen) {
      startNextStep(predictTourId);
    }
  }, [startNextStep, isNextStepVisible]);

  const {
    isDrawing,
    currentPoints,
    startDrawing,
    addPoint,
    finishDrawing,
    clearPrediction,
  } = usePredictionDrawing();

  const { data: priceData } = usePriceData(selectedPair);

  const [selectedMinute, setSelectedMinute] = useState<number | null>(null);
  const [amount, setAmount] = useState<number>(1);
  const [leverage, setLeverage] = useState<number>(500);
  const [isOpeningPosition, setIsOpeningPosition] = useState(false);

  const {
    openPosition: openDirectionalPosition,
    status: positionStatus,
    result: positionResult,
    timeRemaining,
    error: positionError,
    reset: resetPosition,
  } = useOpenPosition();

  const { depositAddress, depositBalance, loading: yellowDepositLoading, refresh: refreshYellowDeposit } =
    useYellowDeposit(address ?? null);

  // When token pair changes, clear prediction state
  useEffect(() => {
    clearPrediction();
    setSelectedMinute(null);
  }, [selectedPair]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClear = () => {
    clearPrediction();
    setSelectedMinute(null);
  };

  const handlePatternComplete = async (
    points: Array<{ x: number; y: number }>,
    offsetMinutes: number,
  ) => {
    if (!priceData || priceData.length === 0) {
      alert('Price data is still loading. Please wait and try again.');
      return;
    }
    if (points.length < 2) {
      alert('Please draw a pattern with at least 2 points.');
      return;
    }
    if (!isConnected || !address) {
      alert('Please connect your wallet to open a position.');
      return;
    }

    setIsOpeningPosition(true);

    try {
      const currentPrice = priceData[priceData.length - 1].value;
      const canvasHeight = 170; // PatternDrawingBox canvas height

      // Sample/interpolate to 60 points
      let sampledPoints: Array<{ x: number; y: number }>;
      try {
        sampledPoints = samplePredictionPoints(points, 60);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Sampling failed';
        alert(message.includes('Not enough') || message.includes('draw at least')
          ? 'Please draw a longer pattern.'
          : `Error: ${message}`);
        return;
      }

      // Map canvas Y → price predictions
      const priceRange = currentPrice * 0.05;
      const minPrice = currentPrice - priceRange;
      const maxPrice = currentPrice + priceRange;
      const predictions = sampledPoints.map(p =>
        minPrice + (1 - p.y / canvasHeight) * (maxPrice - minPrice)
      );

      const nowSec = Math.floor(Date.now() / 1000);
      const totalDurationSeconds = offsetMinutes * 60;
      const ticker = selectedPair?.replace('/', '') || 'BTCUSDT';

      await openDirectionalPosition({
        ticker,
        predictions,
        leverage: Number(leverage),
        amount: amount.toString(),
        startTime: nowSec,
        endTime: nowSec + totalDurationSeconds,
      });

      // Inject prediction points onto the chart
      const canvasWidth = points.length > 0
        ? Math.max(...points.map(p => p.x))
        : 600;

      const predictionPoints = sampledPoints.map((point) => {
        const normalizedX = point.x / (canvasWidth || 1);
        const time = nowSec + normalizedX * totalDurationSeconds;
        const price = minPrice + (1 - point.y / canvasHeight) * (maxPrice - minPrice);
        return { x: 0, y: 0, time: Math.floor(time), price };
      });

      clearPrediction();
      setSelectedMinute(offsetMinutes);

      startDrawing(predictionPoints[0]);
      for (let i = 1; i < predictionPoints.length; i++) {
        addPoint(predictionPoints[i]);
      }
      finishDrawing();
    } finally {
      setIsOpeningPosition(false);
    }
  };

  // Find display name for current pair
  const currentPairInfo = availablePairs.find(p => p.symbol === selectedPair);
  const pairDisplay = currentPairInfo?.display || selectedPair;
  const isPositionActive = positionStatus === 'active' || positionStatus === 'creating' || positionStatus === 'transferring';

  return (
    <div className="text-white pb-24 relative">
      <Header
        showStatus={currentPoints.length > 0}
        statusText={selectedMinute ? `+${selectedMinute}m` : undefined}
      />

      <motion.div
        className="relative z-10 px-3 py-4 sm:px-4 sm:py-6 mb-20 max-w-7xl mx-auto space-y-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <motion.div
          className="text-center mb-10"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1
            className="flex items-center justify-start gap-3 text-4xl md:text-6xl font-melodrame font-medium text-[#00E5FF]"
            style={{ textShadow: '4px 4px 0 #000000' }}
          >
            Predict
          </h1>
          <p className="text-lg text-start text-white/70">
            Draw your curve on the live chart and open a position.
          </p>
        </motion.div>

        {/* Token Pair Selector */}
        <motion.section
          id="onboard-token-pair"
          className="mb-4"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex flex-col gap-4 w-full">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex flex-col items-start text-left">
                <p className="text-sm font-medium text-[#00E5FF]/90">
                  Choose the market you want to predict
                </p>
                <p className="text-xs text-white/60 max-w-md">
                  Select a token pair below. The chart and your prediction will use this market.
                </p>
              </div>
              <TokenPairSelector />
            </div>
          </div>
        </motion.section>

        {/* Trading Chart */}
        <motion.div
          id="onboard-chart"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
        >
          <TradingChart
            key={selectedPair}
            priceData={priceData}
            predictionPoints={currentPoints}
            isPositionActive={isPositionActive}
            pairSymbol={selectedPair}
            pairDisplay={pairDisplay}
          />
        </motion.div>

        {/* Pattern Drawing Box */}
        <motion.div
          id="onboard-draw-box"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
        >
          <PatternDrawingBox
            onPatternComplete={handlePatternComplete}
            amount={amount}
            leverage={leverage}
            onAmountChange={(amt: number) => setAmount(amt)}
            onLeverageChange={(lev) => setLeverage(lev)}
            isOpeningPosition={isOpeningPosition}
          />
        </motion.div>

        <PositionStatusCard
          status={positionStatus}
          result={positionResult}
          timeRemaining={timeRemaining}
          error={positionError}
          onReset={resetPosition}
        />
      </motion.div>

      <BottomControls
        selectedMinute={selectedMinute}
        hasPoints={currentPoints.length > 0}
        onClear={handleClear}
        isConnected={isConnected}
        batchPnL={null}
        yellowDepositBalance={depositBalance}
        yellowDepositLoading={yellowDepositLoading}
        depositAddress={depositAddress}
        onRefreshDeposit={refreshYellowDeposit}
        isOpeningPosition={isOpeningPosition}
        positionStatus={'idle'}
        statusMessageIndex={0}
        timeRemaining={null}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/fabianferno/Documents/draw-fi/frontend && npx next build`
Expected: Build succeeds. If BottomControls has stricter types for positionStatus, adjust the prop to match its expected union type.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/predict/page.tsx
git commit -m "feat(chart): rewrite predict page — drop legacy flow, use new chart components"
```

---

### Task 12: Delete old chart files

**Files:**
- Delete: `frontend/components/chart/ChartCanvas.tsx`
- Delete: `frontend/components/chart/PredictionOverlay.tsx`
- Delete: `frontend/components/chart/NyanCat.tsx`
- Delete: `frontend/components/chart/nyan-cat.css`
- Delete: `frontend/lib/chart/config.ts`

- [ ] **Step 1: Check for any remaining imports of deleted files**

Run: `cd /Users/fabianferno/Documents/draw-fi/frontend && grep -r "ChartCanvas\|PredictionOverlay\|NyanCat\|nyan-cat\|lib/chart/config" --include="*.tsx" --include="*.ts" -l`

If any files besides the ones being deleted still import these, update those imports first.

- [ ] **Step 2: Delete the files**

```bash
cd /Users/fabianferno/Documents/draw-fi/frontend
rm -f components/chart/ChartCanvas.tsx
rm -f components/chart/PredictionOverlay.tsx
rm -f components/chart/NyanCat.tsx
rm -f components/chart/nyan-cat.css
rm -f lib/chart/config.ts
```

- [ ] **Step 3: Verify build**

Run: `cd /Users/fabianferno/Documents/draw-fi/frontend && npx next build`
Expected: Build succeeds with no missing import errors

- [ ] **Step 4: Commit**

```bash
git add -u frontend/components/chart/ChartCanvas.tsx frontend/components/chart/PredictionOverlay.tsx frontend/components/chart/NyanCat.tsx frontend/components/chart/nyan-cat.css frontend/lib/chart/config.ts
git commit -m "chore(chart): delete old chart components (ChartCanvas, PredictionOverlay, NyanCat)"
```

---

### Task 13: Update PatternDrawingBox styling

**Files:**
- Modify: `frontend/components/chart/PatternDrawingBox.tsx`

- [ ] **Step 1: Update the drawing stroke color and box styling**

In `frontend/components/chart/PatternDrawingBox.tsx`:

Replace the NEON_COLOR constant (line 9):

Old:
```ts
const NEON_COLOR = '#00E5FF';
```

New:
```ts
const DRAW_COLOR = '#f0a030';
```

Then find-and-replace all remaining `NEON_COLOR` references in the file with `DRAW_COLOR`.

Also update the outer container styling. Replace the border/background classes on the main wrapper div (line 338):

Old:
```tsx
<div className="relative bg-[#0a0a0a] rounded-2xl border-4 border-[#00E5FF] p-3 sm:p-4 shadow-[6px_6px_0_0_#000000]">
```

New:
```tsx
<div className="relative bg-[#0a0f1a] rounded-2xl border border-white/[0.08] p-3 sm:p-4">
```

And remove the glow effect div (lines 336-337):
```tsx
{/* Glow effect */}
<div className="absolute -inset-1 bg-gradient-to-r from-[#00E5FF] via-[#000000] to-[#00E5FF] rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-500 animate-pulse" />
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/fabianferno/Documents/draw-fi/frontend && npx next build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend/components/chart/PatternDrawingBox.tsx
git commit -m "style(chart): update PatternDrawingBox to orange stroke and clean aesthetic"
```

---

### Task 14: Final build verification and cleanup

**Files:**
- Possibly modify: any file with remaining import issues

- [ ] **Step 1: Full build**

Run: `cd /Users/fabianferno/Documents/draw-fi/frontend && npx next build`

If there are errors, fix them. Common issues:
- Unused imports from removed files (remove the imports)
- BottomControls prop type mismatches (update to match expected types)
- Missing `isDark` prop that old TradingChart accepted (already removed in rewrite)

- [ ] **Step 2: Check for unused lightweight-charts imports across the project**

Run: `cd /Users/fabianferno/Documents/draw-fi/frontend && grep -r "lightweight-charts" --include="*.tsx" --include="*.ts" -l`

Remove any remaining imports. If no other file uses it, note that `lightweight-charts` can be removed from `package.json` in a future cleanup task.

- [ ] **Step 3: Verify the .gitignore includes .superpowers/**

Run: `grep ".superpowers" /Users/fabianferno/Documents/draw-fi/.gitignore`
Expected: `.superpowers/`

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore(chart): final cleanup — remove stale imports and verify build"
```

---

### Task Summary

| Task | Component | Description |
|------|-----------|-------------|
| 1 | `useChartCoordinates` | Shared coordinate system hook |
| 2 | `useAnimationFrame` | rAF loop with dirty flag |
| 3 | `ChartInfoBar` | Token icon + price + pair name |
| 4 | `TimeAxis` | Time labels below chart |
| 5 | `PriceCanvas` | Custom Canvas 2D price renderer |
| 6 | `PredictionCanvas` | Gradient prediction + ghost mode |
| 7 | `ChartContainer` | Stacked canvases + ResizeObserver + zoom |
| 8 | `TradingChart` | Thin composable wrapper |
| 9 | `samplePredictionPoints` | Add cubic Hermite interpolation |
| 10 | `usePredictionDrawing` | Fix stale closure bug |
| 11 | `predict/page.tsx` | Rewrite — drop legacy, wire new components |
| 12 | Old files | Delete ChartCanvas, PredictionOverlay, NyanCat, config |
| 13 | `PatternDrawingBox` | Orange stroke, clean aesthetic |
| 14 | Cleanup | Final build verification |
