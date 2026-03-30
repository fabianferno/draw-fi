'use client';

import { useEffect, useState } from 'react';
import './nyan-cat.css';

interface NyanCatProps {
  x: number;
  y: number;
  size?: number; // Scale factor, default 0.5 for smaller size
  isMobile?: boolean; // Adjust positioning for mobile
}

export function NyanCat({ x, y, size = 0.5, isMobile = false }: NyanCatProps) {
  const [frame, setFrame] = useState(1);

  // Animate through 6 frames - slower for smoother look
  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((prev) => (prev % 6) + 1);
    }, 150); // Slower animation

    return () => clearInterval(interval);
  }, []);

  const catWidth = 194 * size;
  const catHeight = 122 * size;
  
  // Position cat so rainbow connects to the pop-tart body (like original Nyan Cat)
  // Pop-tart body starts at ~52px from left edge of cat sprite (at scale 1)
  // Rainbow should end right at the pop-tart body edge
  const popTartBodyStart = 52 * size; // Where pop-tart body begins
  
  // Responsive Y offset: mobile needs less offset due to smaller chart
  const topOffset = isMobile ? catHeight * 0.6 : catHeight * 0.8;

  return (
    <div
      className={`nyan-cat frame${frame}`}
      style={{
        position: 'absolute',
        left: x - popTartBodyStart, // Position so pop-tart body edge is at x (rainbow end)
        top: y - topOffset, // Responsive: 0.6 for mobile, 0.8 for desktop
        transform: `scale(${size})`,
        transformOrigin: 'left center',
        zIndex: 1002, // Above the rainbow
        pointerEvents: 'none',
      }}
    >
      <div className="nyan-tail" />
      <div className="nyan-paws" />
      <div className="nyan-pop-tarts-body">
        <div className="nyan-pop-tarts-body-cream" />
      </div>
      <div className="nyan-head">
        <div className="nyan-face" />
      </div>
    </div>
  );
}

// Rainbow trail that follows a path of points - trails BEHIND the cat with wavy animation
interface RainbowPathTrailProps {
  points: Array<{ x: number; y: number }>;
  catX: number; // Cat's X position - rainbow ends here
  strokeWidth?: number;
}

export function RainbowPathTrail({ points, catX, strokeWidth = 14 }: RainbowPathTrailProps) {
  if (points.length < 2) return null;

  // Rainbow extends exactly to catX where it connects to the pop-tart body
  // Like the original Nyan Cat - rainbow goes right into the body
  const trailPoints = points.filter(p => p.x <= catX);
  
  if (trailPoints.length < 2) return null;

  // Create smooth SVG path using monotone cubic interpolation
  // This matches the smooth curve that lightweight-charts renders for the area series
  const pathD = (() => {
    if (trailPoints.length < 2) return '';
    if (trailPoints.length === 2) {
      return `M ${trailPoints[0].x} ${trailPoints[0].y} L ${trailPoints[1].x} ${trailPoints[1].y}`;
    }

    // Compute tangents using monotone method (prevents overshoot)
    const n = trailPoints.length;
    const dx: number[] = [];
    const dy: number[] = [];
    const slopes: number[] = [];
    const tangents: number[] = new Array(n);

    for (let i = 0; i < n - 1; i++) {
      dx.push(trailPoints[i + 1].x - trailPoints[i].x);
      dy.push(trailPoints[i + 1].y - trailPoints[i].y);
      slopes.push(dx[i] === 0 ? 0 : dy[i] / dx[i]);
    }

    // Endpoints
    tangents[0] = slopes[0];
    tangents[n - 1] = slopes[n - 2];

    // Interior points: average of adjacent slopes, zeroed if signs differ
    for (let i = 1; i < n - 1; i++) {
      if (slopes[i - 1] * slopes[i] <= 0) {
        tangents[i] = 0;
      } else {
        tangents[i] = (slopes[i - 1] + slopes[i]) / 2;
      }
    }

    // Monotonicity constraint
    for (let i = 0; i < n - 1; i++) {
      if (Math.abs(slopes[i]) < 1e-10) {
        tangents[i] = 0;
        tangents[i + 1] = 0;
      } else {
        const alpha = tangents[i] / slopes[i];
        const beta = tangents[i + 1] / slopes[i];
        const s = alpha * alpha + beta * beta;
        if (s > 9) {
          const t = 3 / Math.sqrt(s);
          tangents[i] = t * alpha * slopes[i];
          tangents[i + 1] = t * beta * slopes[i];
        }
      }
    }

    // Build path with cubic Bezier segments
    let d = `M ${trailPoints[0].x} ${trailPoints[0].y}`;
    for (let i = 0; i < n - 1; i++) {
      const segDx = dx[i] / 3;
      const cp1x = trailPoints[i].x + segDx;
      const cp1y = trailPoints[i].y + tangents[i] * segDx;
      const cp2x = trailPoints[i + 1].x - segDx;
      const cp2y = trailPoints[i + 1].y - tangents[i + 1] * segDx;
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${trailPoints[i + 1].x} ${trailPoints[i + 1].y}`;
    }
    return d;
  })();

  // Rainbow colors from top to bottom (like original Nyan Cat)
  const rainbowColors = [
    '#ff0000', // Red
    '#ff9900', // Orange  
    '#ffff00', // Yellow
    '#33ff00', // Green
    '#0099ff', // Blue
    '#6633ff', // Purple
  ];

  const bandHeight = strokeWidth / 6;

  return (
    <svg
      className="rainbow-path-trail"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 1000,
        overflow: 'visible',
      }}
    >
      {/* Wave A - bobs up and down */}
      <g className="rainbow-wave-a">
        {rainbowColors.map((color, index) => (
          <path
            key={`a-${color}`}
            d={pathD}
            fill="none"
            stroke={color}
            strokeWidth={bandHeight}
            strokeLinecap="square"
            strokeLinejoin="round"
            style={{
              transform: `translateY(${(index - 2.5) * bandHeight}px)`,
            }}
          />
        ))}
      </g>
      {/* Wave B - bobs opposite direction for wavy effect */}
      <g className="rainbow-wave-b">
        {rainbowColors.map((color, index) => (
          <path
            key={`b-${color}`}
            d={pathD}
            fill="none"
            stroke={color}
            strokeWidth={bandHeight}
            strokeLinecap="square"
            strokeLinejoin="round"
            style={{
              transform: `translateY(${(index - 2.5) * bandHeight}px)`,
            }}
          />
        ))}
      </g>
    </svg>
  );
}
