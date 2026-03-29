'use client';

import { useRef, useState, MouseEvent, TouchEvent, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SlotMachineLeverButton } from '@/components/ui/SlotMachineLever';
import { NoiseEffect } from '../ui/NoiseEffect';

const NEON_COLOR = '#00E5FF';

const LEVERAGE_OPTIONS = [100, 200, 500, 1000, 1500, 2000, 2500] as const;

function leverageToSliderIndex(lev: number): number {
  const exact = LEVERAGE_OPTIONS.findIndex((v) => v === lev);
  if (exact >= 0) return exact;
  return LEVERAGE_OPTIONS.reduce((bestIdx, v, idx) => {
    const best = LEVERAGE_OPTIONS[bestIdx];
    return Math.abs(v - lev) < Math.abs(best - lev) ? idx : bestIdx;
  }, 0);
}

interface PatternPoint {
  x: number;
  y: number;
}

interface PatternDrawingBoxProps {
  onPatternComplete: (points: PatternPoint[], offsetMinutes: number) => void | Promise<void>;
  amount: number;
  leverage: number;
  onAmountChange: (amount: number) => void;
  onLeverageChange: (leverage: number) => void;
  isOpeningPosition?: boolean;
}

export function PatternDrawingBox({
  onPatternComplete,
  amount,
  leverage,
  onAmountChange,
  onLeverageChange,
  isOpeningPosition = false,
}: PatternDrawingBoxProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [points, setPoints] = useState<PatternPoint[]>([]);
  const selectedOffset = 1;

  const getCanvasCoordinates = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    return { x, y };
  }, []);

  const startDrawing = useCallback((clientX: number, clientY: number) => {
    const coords = getCanvasCoordinates(clientX, clientY);
    if (!coords) return;

    setIsDrawing(true);
    setPoints([coords]);

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = NEON_COLOR;
    ctx.shadowColor = NEON_COLOR;
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(coords.x, coords.y, 4, 0, 2 * Math.PI);
    ctx.fill();
  }, [getCanvasCoordinates]);

  const draw = useCallback((clientX: number, clientY: number) => {
    if (!isDrawing) return;

    const coords = getCanvasCoordinates(clientX, clientY);
    if (!coords) return;

    // Only allow left-to-right drawing
    if (points.length > 0 && coords.x <= points[points.length - 1].x) {
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    if (points.length > 0) {
      const lastPoint = points[points.length - 1];
      ctx.strokeStyle = NEON_COLOR;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = NEON_COLOR;
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.moveTo(lastPoint.x, lastPoint.y);
      ctx.lineTo(coords.x, coords.y);
      ctx.stroke();
    }

    setPoints(prev => [...prev, coords]);
  }, [isDrawing, points, getCanvasCoordinates]);

  const redrawCanvas = useCallback((pointsToDraw: PatternPoint[]) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas || pointsToDraw.length === 0) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (pointsToDraw.length === 1) {
      ctx.fillStyle = NEON_COLOR;
      ctx.shadowColor = NEON_COLOR;
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(pointsToDraw[0].x, pointsToDraw[0].y, 4, 0, 2 * Math.PI);
      ctx.fill();
      return;
    }

    // Draw path
    ctx.strokeStyle = NEON_COLOR;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = NEON_COLOR;
    ctx.shadowBlur = 20;

    ctx.beginPath();
    ctx.moveTo(pointsToDraw[0].x, pointsToDraw[0].y);
    for (let i = 1; i < pointsToDraw.length; i++) {
      ctx.lineTo(pointsToDraw[i].x, pointsToDraw[i].y);
    }
    ctx.stroke();
  }, []);

  // Easing function for smooth animation (ease-out cubic)
  const easeOutCubic = useCallback((t: number): number => {
    return 1 - Math.pow(1 - t, 3);
  }, []);

  const finishDrawing = useCallback(() => {
    if (isDrawing && points.length > 1) {
      const canvas = canvasRef.current;
      if (!canvas) {
        setIsDrawing(false);
        return;
      }

      // Calculate the current x range of the drawing
      const xValues = points.map(p => p.x);
      const minX = Math.min(...xValues);
      const maxX = Math.max(...xValues);
      const xRange = maxX - minX;

      // If the drawing already spans the full width (or very close), don't stretch
      if (xRange < 10) {
        setIsDrawing(false);
        return;
      }

      // Calculate stretched points
      const canvasWidth = canvas.width;
      const originalPoints = [...points];
      const stretchedPoints: PatternPoint[] = points.map(point => {
        // Normalize x to 0-1 range based on current min/max
        const normalizedX = (point.x - minX) / xRange;
        // Scale to full canvas width
        const stretchedX = normalizedX * canvasWidth;
        // Keep y coordinate unchanged
        return { x: stretchedX, y: point.y };
      });

      setIsDrawing(false);

      // Animate the stretch transition
      const duration = 400; // milliseconds
      const startTime = performance.now();

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easedProgress = easeOutCubic(progress);

        // Interpolate between original and stretched points
        const animatedPoints: PatternPoint[] = originalPoints.map((point, index) => {
          const originalX = point.x;
          const stretchedX = stretchedPoints[index].x;
          const animatedX = originalX + (stretchedX - originalX) * easedProgress;
          return { x: animatedX, y: point.y };
        });

        // Redraw canvas with animated points
        redrawCanvas(animatedPoints);

        if (progress < 1) {
          animationFrameRef.current = requestAnimationFrame(animate);
        } else {
          // Animation complete - set final stretched points
          setPoints(stretchedPoints);
          animationFrameRef.current = null;
        }
      };

      // Cancel any existing animation
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    }
  }, [isDrawing, points, redrawCanvas, easeOutCubic]);

  // Mouse events
  const handleMouseDown = (e: MouseEvent<HTMLCanvasElement>) => {
    startDrawing(e.clientX, e.clientY);
  };

  const handleMouseMove = (e: MouseEvent<HTMLCanvasElement>) => {
    draw(e.clientX, e.clientY);
  };

  // Touch events for mobile
  const handleTouchStart = (e: TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const touch = e.touches[0];
    startDrawing(touch.clientX, touch.clientY);
  };

  const handleTouchMove = (e: TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const touch = e.touches[0];
    draw(touch.clientX, touch.clientY);
  };

  const handleTouchEnd = (e: TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    finishDrawing();
  };

  const handleApply = async () => {
    if (points.length < 2) return;
    try {
      await Promise.resolve(onPatternComplete(points, selectedOffset));
      handleClear();
    } catch (err) {
      // Error already surfaced via alert in parent; keep pattern so user can retry
      console.error('Pattern apply failed', err);
    }
  };

  const handleClear = () => {
    // Cancel any ongoing animation
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setPoints([]);
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  };

  // Initialize canvas dimensions to match display size
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const updateCanvasSize = () => {
      const rect = canvas.getBoundingClientRect();
      // Set internal canvas dimensions to match display size
      // This prevents stretching when drawing
      canvas.width = rect.width;
      canvas.height = rect.height;
    };

    // Use ResizeObserver for more reliable size detection
    const resizeObserver = new ResizeObserver(() => {
      // Use requestAnimationFrame to ensure layout has settled
      requestAnimationFrame(updateCanvasSize);
    });

    resizeObserver.observe(canvas);

    // Initial size update after a brief delay to ensure layout is ready
    const timeoutId = setTimeout(() => {
      updateCanvasSize();
    }, 0);

    return () => {
      resizeObserver.disconnect();
      clearTimeout(timeoutId);
    };
  }, []);

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return (
    <motion.div
      className="pattern-drawing-box relative group"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <style
        // Avoid styled-jsx here; plain style prevents SSR chunk syntax issues under Turbopack.
        dangerouslySetInnerHTML={{
          __html: `
            .pattern-drawing-box .leverage-range::-webkit-slider-thumb { background: var(--leverage-accent) !important; }
            .pattern-drawing-box .leverage-range::-moz-range-thumb { background: var(--leverage-accent) !important; }
          `,
        }}
      />
      {/* Glow effect */}
      <div className="absolute -inset-1 bg-gradient-to-r from-[#00E5FF] via-[#000000] to-[#00E5FF] rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-500 animate-pulse" />

      <div className="relative bg-[#0a0a0a] rounded-2xl border-4 border-[#00E5FF] p-3 sm:p-4 shadow-[6px_6px_0_0_#000000]">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h3
            className="text-xl font-melodrame text-[#00E5FF]"
            style={{ textShadow: '2px 2px 0 #000000' }}
          >
            Draw your futures
          </h3>
          <AnimatePresence>
            {points.length > 0 && (
              <motion.span
                className="text-[10px] font-bold text-[#000000] bg-[#00E5FF] px-2.5 py-1 rounded-full border-2 border-[#000000]"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
              >
                {points.length} pts
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {/* Drawing + Leverage (desktop right rail; mobile under-canvas) */}
        <div className="mb-4 w-full flex flex-col sm:flex-row gap-3 sm:gap-4">
          <div className="w-full sm:flex-1 flex flex-col gap-3">
            {/* Drawing Canvas - Nyan style */}
            <NoiseEffect opacity={0.5} className="w-full">
              <div className="relative">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-[#00E5FF]/50 to-[#000000]/50 rounded-xl blur-sm opacity-50" />
                <canvas
                  ref={canvasRef}
                  // width={600}
                  // height={300}
                  className="relative w-full h-[170px] bg-[#000000]/30 rounded-xl border-3 border-[#00E5FF]/50 cursor-crosshair touch-none shadow-[inset_0_2px_0_0_rgba(0,0,0,0.6)]"
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={finishDrawing}
                  onMouseLeave={finishDrawing}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                />
                {/* Current price guide line */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-[95%] h-[1px] bg-gradient-to-r from-transparent via-[#00E5FF]/40 to-transparent relative">
                    <span className="absolute right-0 -top-3 text-[8px] text-[#00E5FF]/50 font-medium">current</span>
                  </div>
                </div>
                <AnimatePresence>
                  {points.length === 0 && (
                    <motion.div
                      className="absolute inset-0 flex items-center justify-center pointer-events-none"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <div className="flex items-center gap-2 text-[#00E5FF]/60">
                        <span className="text-xs font-bold">Draw your prediction</span>
                        <motion.span
                          animate={{ x: [0, 10, 0] }}
                          transition={{ repeat: Infinity, duration: 1 }}
                        >
                          →
                        </motion.span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </NoiseEffect>

            {/* Mobile leverage — horizontal discrete slider (under canvas) */}
            <div className="sm:hidden w-full">
              <div className="flex items-baseline justify-between gap-2 mb-2">
                <p className="text-[13px] text-[#00E5FF]/70 font-light">
                  Leverage
                </p>
                <span
                  className="text-sm font-black text-[#00E5FF] tabular-nums border-2 border-[#00E5FF] bg-[#000000] px-2.5 py-0.5 rounded-lg shadow-[2px_2px_0_0_#000000]"
                  style={{ textShadow: '1px 1px 0 #000000' }}
                >
                  {leverage}x
                </span>
              </div>
              {/* --leverage-thumb must match thumb w/h (w-5 = 1.25rem) so labels align with snap positions */}
              <div
                className="w-full rounded-xl border-3 border-[#00E5FF] bg-[#000000]/40 shadow-[3px_3px_0_0_#00E5FF] p-2 [--leverage-thumb:1.25rem]"
                style={{ ['--leverage-accent' as never]: NEON_COLOR }}
              >
                <input
                  type="range"
                  min={0}
                  max={LEVERAGE_OPTIONS.length - 1}
                  step={1}
                  value={leverageToSliderIndex(leverage)}
                  onChange={(e) =>
                    onLeverageChange(LEVERAGE_OPTIONS[Number(e.target.value)])
                  }
                  className="leverage-range w-full h-3 rounded-full appearance-none cursor-pointer bg-[#000000] border-2 border-[#00E5FF] shadow-[inset_0_1px_0_0_rgba(0,0,0,0.5)]
                    [&::-webkit-slider-runnable-track]:h-3 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-transparent
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:mt-[-2px] [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-(--leverage-accent) [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-black [&::-webkit-slider-thumb]:shadow-[3px_3px_0_0_#000000]
                    [&::-moz-range-track]:h-3 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-transparent [&::-moz-range-track]:border-0
                    [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-black [&::-moz-range-thumb]:bg-(--leverage-accent) [&::-moz-range-thumb]:shadow-[3px_3px_0_0_#000000] [&::-moz-range-thumb]:box-border"
                  aria-valuemin={LEVERAGE_OPTIONS[0]}
                  aria-valuemax={LEVERAGE_OPTIONS[LEVERAGE_OPTIONS.length - 1]}
                  aria-valuenow={leverage}
                  aria-valuetext={`${leverage}x leverage`}
                />
                <div className="relative mt-1.5 h-4 w-full">
                  {LEVERAGE_OPTIONS.map((lev, i) => {
                    const last = LEVERAGE_OPTIONS.length - 1;
                    const t = last === 0 ? 0 : i / last;
                    const left =
                      last === 0
                        ? '50%'
                        : `calc((var(--leverage-thumb) / 2) + ${t} * (100% - var(--leverage-thumb)))`;
                    return (
                      <span
                        key={lev}
                        className={`absolute top-0 text-[9px] font-bold tabular-nums leading-none whitespace-nowrap -translate-x-1/2 ${
                          leverage === lev ? 'text-[#00E5FF]' : 'text-[#00E5FF]/35'
                        }`}
                        style={{ left }}
                      >
                        {lev}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Desktop leverage — vertical discrete slider (right rail) */}
          <div className="hidden sm:block shrink-0 sm:w-28 w-full">
            {/* Entire rail matches canvas height */}
            <div
              className="w-full h-[170px] rounded-xl border-3 border-[#00E5FF] bg-[#000000]/40 shadow-[3px_3px_0_0_#00E5FF] p-2 flex flex-col gap-2 [--leverage-thumb:1.25rem]"
              style={{ ['--leverage-accent' as never]: NEON_COLOR }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[12px] text-[#00E5FF]/70 font-light">
                  Leverage
                </p>
                <span
                  className="text-xs font-black text-[#00E5FF] tabular-nums border-2 border-[#00E5FF] bg-[#000000] px-2 py-0.5 rounded-lg shadow-[2px_2px_0_0_#000000]"
                  style={{ textShadow: '1px 1px 0 #000000' }}
                >
                  {leverage}x
                </span>
              </div>

              <div className="flex-1 min-h-0 flex items-center justify-center gap-2">
                <div className="relative h-full flex-1 flex items-center justify-center">
                <input
                  type="range"
                  min={0}
                  max={LEVERAGE_OPTIONS.length - 1}
                  step={1}
                  value={leverageToSliderIndex(leverage)}
                  onChange={(e) =>
                    onLeverageChange(LEVERAGE_OPTIONS[Number(e.target.value)])
                  }
                  style={{
                    // Cross-browser vertical range: Safari uses -webkit-appearance, others accept writing-mode.
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    WebkitAppearance: 'slider-vertical' as any,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    writingMode: 'bt-lr' as any,
                  }}
                  className="leverage-range h-full w-3 appearance-none cursor-pointer bg-transparent
                    [&::-webkit-slider-runnable-track]:w-3 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-[#000000] [&::-webkit-slider-runnable-track]:border-2 [&::-webkit-slider-runnable-track]:border-[#00E5FF]
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-(--leverage-accent) [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-black [&::-webkit-slider-thumb]:shadow-[3px_3px_0_0_#000000]
                    [&::-moz-range-track]:w-3 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-[#000000] [&::-moz-range-track]:border-2 [&::-moz-range-track]:border-[#00E5FF]
                    [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-black [&::-moz-range-thumb]:bg-(--leverage-accent) [&::-moz-range-thumb]:shadow-[3px_3px_0_0_#000000] [&::-moz-range-thumb]:box-border"
                  aria-valuemin={LEVERAGE_OPTIONS[0]}
                  aria-valuemax={LEVERAGE_OPTIONS[LEVERAGE_OPTIONS.length - 1]}
                  aria-valuenow={leverage}
                  aria-valuetext={`${leverage}x leverage`}
                />
                </div>

                {/* Tick labels (aligned to thumb travel) */}
                <div className="relative h-full w-10">
                  {LEVERAGE_OPTIONS.map((lev, i) => {
                    const last = LEVERAGE_OPTIONS.length - 1;
                    const t = last === 0 ? 0 : i / last;
                    // Thumb center travels from thumb/2 to (100% - thumb/2). We invert to map 0 -> bottom.
                    const top =
                      last === 0
                        ? '50%'
                        : `calc((var(--leverage-thumb) / 2) + ${(1 - t)} * (100% - var(--leverage-thumb)))`;
                    return (
                      <span
                        key={lev}
                        className={`absolute left-0 text-[9px] font-bold tabular-nums leading-none whitespace-nowrap -translate-y-1/2 ${
                          leverage === lev ? 'text-[#00E5FF]' : 'text-[#00E5FF]/35'
                        }`}
                        style={{ top }}
                      >
                        {lev}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons - Nyan style */}
        <div className="flex flex-col  items-center gap-3">
          <div className="flex w-full gap-3 items-end">
            <div className="flex flex-col flex-1 min-w-0 gap-2">
              <p className="text-[13px] text-[#00E5FF]/70 font-light">
                Amount (USD)
              </p>
              <div className="flex gap-2 items-stretch min-w-0">
                <motion.input
                  type="number"
                  min={0.001}
                  step={0.001}
                  value={amount}
                  onChange={(e) => onAmountChange(Number(e.target.value) || 0)}
                  className="min-w-0 flex-1 px-3 py-5 bg-[#000000] hover:bg-[#000000]/80 border-3 border-[#00E5FF] rounded-xl text-[#00E5FF] text-3xl font-bold shadow-[3px_3px_0_0_#00E5FF] focus:outline-none focus:bg-[#000000]/90"
                  whileHover={{ x: -2, y: -2, boxShadow: '5px 5px 0 0 #00E5FF' }}
                  whileFocus={{ x: -2, y: -2, boxShadow: '5px 5px 0 0 #00E5FF' }}
                />
                <div className="flex flex-col gap-2 shrink-0 w-[52px] sm:w-14">
                  <motion.button
                    type="button"
                    title="Double amount"
                    onClick={() => {
                      const next = Math.round(amount * 2 * 1000) / 1000;
                      onAmountChange(next);
                    }}
                    className="flex-1 min-h-0 px-1 py-1 bg-[#000000] hover:bg-[#000000]/80 border-3 border-[#00E5FF] rounded-lg text-[#00E5FF] text-sm sm:text-base font-black shadow-[3px_3px_0_0_#00E5FF] leading-none"
                    whileHover={{ x: -1, y: -1, boxShadow: '4px 4px 0 0 #00E5FF' }}
                    whileTap={{ scale: 0.98 }}
                  >
                    x2
                  </motion.button>
                  <motion.button
                    type="button"
                    title="Halve amount"
                    onClick={() => {
                      const raw = amount / 2;
                      const next = Math.max(0.001, Math.round(raw * 1000) / 1000);
                      onAmountChange(next);
                    }}
                    className="flex-1 min-h-0 px-1 py-1 bg-[#000000] hover:bg-[#000000]/80 border-3 border-[#00E5FF] rounded-lg text-[#00E5FF] text-sm sm:text-base font-black shadow-[3px_3px_0_0_#00E5FF] leading-none"
                    whileHover={{ x: -1, y: -1, boxShadow: '4px 4px 0 0 #00E5FF' }}
                    whileTap={{ scale: 0.98 }}
                  >
                    /2
                  </motion.button>
                </div>
              </div>
            </div>
            {/* Potential win estimate - hype */}
            <div className="flex flex-col gap-0.5 shrink-0 px-3 py-2 rounded-xl bg-[#000000] border-2 border-red-500/60 text-right">
              <span className="text-[10px] uppercase tracking-wider text-red-400/90 font-bold">
                Potential win
              </span>
              <span className="text-lg sm:text-xl font-black text-red-400">
                up to ~{(amount * (leverage - 1)).toFixed(3)} USD
              </span>
              <span className="text-[10px] text-white/50">
                if you nail it
              </span>
            </div>
          </div>
          <div id="onboard-lever" className="flex flex-row-reverse w-full gap-2">
            <NoiseEffect
              opacity={1}
              className="w-full"
            >
              <SlotMachineLeverButton
                text={isOpeningPosition ? '...' : 'DRAWFI'}
                onClick={handleApply}
                disabled={points.length < 2 || isOpeningPosition}
                className="flex-1"
                leverColor="#dc2626"
              />
            </NoiseEffect>
            <motion.button
              onClick={handleClear}
              disabled={points.length === 0}
              className="px-4 py-2 bg-[#000000] hover:bg-[#000000]/80 border-3 border-[#00E5FF] rounded-xl text-[#00E5FF] text-xl font-black shadow-[3px_3px_0_0_#00E5FF] disabled:opacity-30 disabled:cursor-not-allowed"
              whileHover={{ x: -2, y: -2, boxShadow: '5px 5px 0 0 #00E5FF' }}
              whileTap={{ x: 2, y: 2, boxShadow: '1px 1px 0 0 #00E5FF' }}
            >
              ✕
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
