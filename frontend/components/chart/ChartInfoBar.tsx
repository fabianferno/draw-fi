'use client';

interface ChartInfoBarProps {
  price: number | null;
  pairSymbol: string;     // e.g. "BTCUSDT"
  pairDisplay: string;    // e.g. "BTC/USDT"
}

export function ChartInfoBar({ price, pairSymbol, pairDisplay }: ChartInfoBarProps) {
  // Extract base token name from symbol (e.g. "BTC" from "BTCUSDT")
  const baseName = pairSymbol.replace(/USDT$/, '');

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06]">
      {/* Token icon placeholder */}
      <div className="w-9 h-9 rounded-full bg-[#1a1f2e] flex items-center justify-center text-xs font-bold text-white/60">
        {baseName.slice(0, 3)}
      </div>

      {/* Live price */}
      <span className="text-[22px] font-bold font-mono text-[#f0b90b] tabular-nums">
        {price !== null ? price.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: price < 10 ? 6 : price < 1000 ? 4 : 2,
        }) : '—'}
      </span>

      {/* Pair name */}
      <span className="text-sm text-white/50">
        {pairDisplay || baseName}
      </span>
    </div>
  );
}
