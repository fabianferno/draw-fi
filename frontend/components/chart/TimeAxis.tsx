'use client';

interface TimeAxisProps {
  visibleTimeRange: { start: number; end: number };
  width: number;
}

function formatTime(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function TimeAxis({ visibleTimeRange, width }: TimeAxisProps) {
  const { start, end } = visibleTimeRange;
  const tickCount = Math.max(2, Math.min(6, Math.floor(width / 120)));
  const ticks: { time: number; left: string }[] = [];

  for (let i = 0; i < tickCount; i++) {
    const t = start + ((end - start) * i) / (tickCount - 1);
    const left = `${(i / (tickCount - 1)) * 100}%`;
    ticks.push({ time: t, left });
  }

  return (
    <div className="relative h-6 px-1" style={{ width }}>
      {ticks.map((tick, i) => (
        <span
          key={i}
          className="absolute top-1 text-[10px] font-mono text-white/25 -translate-x-1/2"
          style={{ left: tick.left }}
        >
          {formatTime(tick.time)}
        </span>
      ))}
    </div>
  );
}
