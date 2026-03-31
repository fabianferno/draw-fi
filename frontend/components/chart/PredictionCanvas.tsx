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
