'use client';

import { useRef, useState, MouseEvent, TouchEvent, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SlotMachineLeverButton } from '@/components/ui/SlotMachineLever';

const NEON_COLOR = '#00E5FF';

interface PatternPoint {
  x: number;
  y: number;
}

interface PatternDrawingBoxProps {
  onPatternComplete: (points: PatternPoint[], offsetMinutes: number) => void;
  amount: number;
  leverage: number;
  onAmountChange: (amount: number) => void;
  onLeverageChange: (leverage: number) => void;
}

export function PatternDrawingBox({
  onPatternComplete,
  amount,
  leverage,
  onAmountChange,
  onLeverageChange,
}: PatternDrawingBoxProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [points, setPoints] = useState<PatternPoint[]>([]);
  const [selectedOffset, setSelectedOffset] = useState(1);

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

    // Draw gradient based on first/last point so the stretch animation keeps rainbow hues stable
    const startPoint = pointsToDraw[0];
    const endPoint = pointsToDraw[pointsToDraw.length - 1];

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

  const handleApply = () => {
    if (points.length > 1) {
      onPatternComplete(points, selectedOffset);
      handleClear();
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
      className="relative group"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Glow effect */}
      <div className="absolute -inset-1 bg-gradient-to-r from-[#00E5FF] via-[#000000] to-[#00E5FF] rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-500 animate-pulse" />

      <div className="relative bg-[#0a0a0a] rounded-2xl border-4 border-[#00E5FF] p-3 sm:p-4 shadow-[6px_6px_0_0_#000000]">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h3
            className="text-xl font-venite text-[#00E5FF]"
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

        {/* Drawing Canvas - Nyan style */}
        <div className="relative mb-2">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-[#00E5FF]/50 to-[#000000]/50 rounded-xl blur-sm opacity-50" />
          <canvas
            ref={canvasRef}
            // width={600}
            // height={300}
            className="relative w-full h-[150px] h-[170px] bg-[#000000]/30 rounded-xl border-3 border-[#00E5FF]/50 cursor-crosshair touch-none shadow-[inset_0_2px_0_0_rgba(0,0,0,0.6)]"
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

        {/* Time Selector - Buttons */}
        <div className="mb-4 w-full">
          <p className="text-[13px] text-[#00E5FF]/70 mb-2 font-light">
            Choose time horizon & resolve
          </p>
          <div className="flex w-full gap-2">
            {[1, 2, 3, 4, 5].map((min) => (
              <motion.button
                key={min}
                onClick={() => setSelectedOffset(min)}
                className={`
                  flex-1 min-w-0 py-3 rounded-xl text-sm font-bold border-3
                  transition-all duration-200
                  ${selectedOffset === min
                    ? 'bg-[#00E5FF] text-[#000000] border-[#00E5FF] shadow-[3px_3px_0_0_#000000]'
                    : 'bg-[#000000] text-[#00E5FF] border-[#00E5FF] hover:bg-[#000000]/80 shadow-[3px_3px_0_0_#00E5FF]'
                  }
                `}
                title={`${min} minute${min > 1 ? 's' : ''}`}
                whileHover={{ x: -1, y: -1 }}
                whileTap={{ scale: 0.98 }}
              >
                {min} min
              </motion.button>
            ))}
          </div>
        </div>

        {/* Action Buttons - Nyan style */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <motion.input
              type="number"
              min={0}
              value={amount}
              onChange={(e) => onAmountChange(Number(e.target.value) || 0)}
              className="w-15 px-3 py-2 bg-[#000000] hover:bg-[#000000]/80 border-3 border-[#00E5FF] rounded-xl text-[#00E5FF] text-xs font-bold shadow-[3px_3px_0_0_#00E5FF] focus:outline-none focus:bg-[#000000]/90"
              whileHover={{ x: -2, y: -2, boxShadow: '5px 5px 0 0 #00E5FF' }}
              whileFocus={{ x: -2, y: -2, boxShadow: '5px 5px 0 0 #00E5FF' }}
            />
            <motion.select
              value={leverage}
              onChange={(e) => onLeverageChange(Number(e.target.value))}
              className="px-2 py-2 bg-[#000000] hover:bg-[#000000]/80 border-3 border-[#00E5FF] rounded-xl text-[#00E5FF] text-xs font-bold shadow-[3px_3px_0_0_#00E5FF] focus:outline-none focus:bg-[#000000]/90 [&>option]:bg-[#000000] [&>option]:text-[#00E5FF]"
              whileHover={{ x: -2, y: -2, boxShadow: '5px 5px 0 0 #00E5FF' }}
              whileFocus={{ x: -2, y: -2, boxShadow: '5px 5px 0 0 #00E5FF' }}
            >
              {[100, 200, 500, 1000, 1500, 2000, 2500].map((lev) => (
                <option key={lev} value={lev}>
                  {lev}x
                </option>
              ))}
            </motion.select>
          </div>
          <SlotMachineLeverButton
            text="DRAW-FI"
            onClick={handleApply}
            disabled={points.length < 2}
            className="flex-1"
          />

          <motion.button
            onClick={handleClear}
            disabled={points.length === 0}
            className="px-2 py-2 bg-[#000000] hover:bg-[#000000]/80 border-3 border-[#00E5FF] rounded-xl text-[#00E5FF] text-xs font-bold shadow-[3px_3px_0_0_#00E5FF] disabled:opacity-30 disabled:cursor-not-allowed"
            whileHover={{ x: -2, y: -2, boxShadow: '5px 5px 0 0 #00E5FF' }}
            whileTap={{ x: 2, y: 2, boxShadow: '1px 1px 0 0 #00E5FF' }}
          >
            ✕
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
