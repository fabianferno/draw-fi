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

    // Time range: fit to actual data with 20% future space for predictions
    // Clamp start to earliest data point so we never show empty space on the left
    const dataStart = priceData.length > 0 ? priceData[0].time : now - 60;
    const dataSpan = priceData.length > 1
      ? now - dataStart
      : 60; // default 60s window when we have 0-1 points
    const minDuration = 30;
    const baseDuration = Math.max(dataSpan, minDuration);
    // barSpacing as zoom: >3 zooms in, <3 zooms out
    const zoomFactor = 3 / barSpacing;
    const visibleDuration = baseDuration * zoomFactor;
    const futureSpace = visibleDuration * 0.2;
    // Never start before earliest data point
    const rawStart = now - (visibleDuration - futureSpace);
    const start = Math.max(rawStart, dataStart - 2); // 2s padding before first point
    const end = now + futureSpace;

    // Price range: auto-fit to ALL data (not just visible) to avoid jumpy Y-axis
    let minPrice: number, maxPrice: number;
    if (priceData.length > 0) {
      minPrice = Math.min(...priceData.map(p => p.value));
      maxPrice = Math.max(...priceData.map(p => p.value));
    } else {
      minPrice = 0;
      maxPrice = 100;
    }

    // When we have very little price movement (e.g. first few ticks), ensure
    // a minimum visible range so movements are obvious from the start
    const priceSpan = maxPrice - minPrice;
    const minVisibleRange = (minPrice + maxPrice) / 2 * 0.0005; // 0.05% of mid price
    if (priceSpan < minVisibleRange) {
      const mid = (minPrice + maxPrice) / 2;
      minPrice = mid - minVisibleRange / 2;
      maxPrice = mid + minVisibleRange / 2;
    }

    const finalSpan = maxPrice - minPrice || 1;
    const padding = finalSpan * 0.1;
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
