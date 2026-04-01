'use client';

import { useId } from 'react';
import { motion } from 'framer-motion';

type PitchChartVisualProps = {
  className?: string;
  /** Classes for the animated SVG (default matches pitch product slide height) */
  svgClassName?: string;
};

export function PitchChartVisual({
  className = 'relative overflow-hidden rounded-xl border border-[#00E5FF]/15 bg-[#021218]/70 p-4',
  svgClassName = 'w-full h-[220px]',
}: PitchChartVisualProps) {
  const uid = useId().replace(/:/g, '');
  const curveStroke = `${uid}-curveStroke`;
  const predictionGlow = `${uid}-predictionGlow`;
  const curveFill = `${uid}-curveFill`;

  return (
    <div className={className}>
      <motion.svg
        viewBox="0 0 760 260"
        className={svgClassName}
        initial={{ opacity: 0.6 }}
        animate={{ opacity: [0.55, 1, 0.55] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
      >
        <defs>
          <linearGradient id={curveStroke} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#00E5FF" stopOpacity="0.55" />
            <stop offset="50%" stopColor="#00E5FF" stopOpacity="1" />
            <stop offset="100%" stopColor="#00E5FF" stopOpacity="0.55" />
          </linearGradient>
          <filter id={predictionGlow} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id={curveFill} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#00E5FF" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#00E5FF" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {Array.from({ length: 12 }).map((_, i) => (
          <line
            key={`v-${i}`}
            x1={40 + i * 60}
            y1="20"
            x2={40 + i * 60}
            y2="220"
            stroke="#00E5FF"
            strokeOpacity="0.08"
            strokeWidth="1"
          />
        ))}
        {Array.from({ length: 5 }).map((_, i) => (
          <line
            key={`h-${i}`}
            x1="40"
            y1={40 + i * 45}
            x2="700"
            y2={40 + i * 45}
            stroke="#00E5FF"
            strokeOpacity="0.08"
            strokeWidth="1"
          />
        ))}

        <motion.path
          d="M40 180 C 130 148, 210 168, 280 132 C 350 95, 460 140, 540 102 C 610 70, 665 82, 700 62"
          fill="none"
          stroke={`url(#${curveStroke})`}
          strokeWidth="4"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.5, ease: 'easeOut' }}
        />
        <motion.path
          d="M40 188 C 120 172, 210 150, 280 142 C 360 126, 450 128, 535 114 C 605 98, 660 90, 700 84"
          fill="none"
          stroke="#FF2DA6"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray="10 7"
          filter={`url(#${predictionGlow})`}
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.7, ease: 'easeOut', delay: 0.2 }}
        />
        <motion.path
          d="M40 180 C 130 148, 210 168, 280 132 C 350 95, 460 140, 540 102 C 610 70, 665 82, 700 62 L700 220 L40 220 Z"
          fill={`url(#${curveFill})`}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.15, 0.35, 0.15] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        />

        <motion.circle
          cx="40"
          cy="180"
          r="6"
          fill="#00E5FF"
          animate={{ cx: [40, 700], cy: [180, 62] }}
          transition={{ duration: 4.2, repeat: Infinity, ease: 'linear' }}
        />
        <motion.circle
          cx="540"
          cy="102"
          r="8"
          fill="#00E5FF"
          fillOpacity="0.18"
          animate={{ r: [8, 15, 8], fillOpacity: [0.15, 0.35, 0.15] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        />
      </motion.svg>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] font-mono text-white/60">
        <span className="inline-flex items-center gap-2">
          <span className="h-[2px] w-6 bg-[#00E5FF]" />
          Actual market
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-[3px] w-7 border-t-[3px] border-dashed border-[#FF2DA6]" />
          User prediction
        </span>
      </div>
    </div>
  );
}
