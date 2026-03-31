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
