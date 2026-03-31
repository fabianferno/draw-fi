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

    // Time range: fit to actual data, with 20% future space for predictions
    // barSpacing acts as a zoom multiplier (higher = more zoomed in)
    const dataSpan = priceData.length > 1
      ? priceData[priceData.length - 1].time - priceData[0].time
      : 120;
    const minDuration = 30; // At least 30 seconds visible
    const baseDuration = Math.max(dataSpan, minDuration);
    // Apply zoom: barSpacing > 3 zooms in, < 3 zooms out
    const zoomFactor = 3 / barSpacing;
    const visibleDuration = baseDuration * zoomFactor;
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
