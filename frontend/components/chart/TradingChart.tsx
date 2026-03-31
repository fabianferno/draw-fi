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
    <div className="bg-transparent rounded-2xl border border-white/8 overflow-hidden">
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
