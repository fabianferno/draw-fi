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
      {priceData.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-white/30 text-sm font-mono">Connecting to price feed...</p>
        </div>
      )}
    </div>
  );
}
