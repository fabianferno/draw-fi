# Trading Chart Rebuild — Design Spec

## Overview

Rebuild the TradingChart component system from scratch. Replace lightweight-charts with a custom Canvas 2D renderer, adopt a component-per-layer architecture, drop NyanCat/rainbow decorations, remove the legacy position-opening flow, and deliver a clean trading terminal aesthetic.

## Goals

- Clean, professional chart that matches the reference design (dark bg, orange price line, green crosshair, minimal grid)
- Prediction line rendered as a cyan→purple gradient with widening uncertainty band
- Ghost mode: when a position is active, the prediction dims and actual price draws over it
- Full control over rendering — no third-party chart library
- Simplified page orchestrator with ~50 lines instead of ~150 for position handling
- Any drawing stroke works — interpolation handles short swipes

## Non-Goals

- Candlestick/OHLC chart support (tick line only)
- Drawing directly on the chart (stays as a separate drawing box)
- Keeping NyanCat or rainbow trail
- Keeping the legacy EIP-712 position flow
- 24h volume, high/low in the info bar

---

## Architecture

### Component Tree

```
<PredictPage>                          (orchestrator — slimmed down)
  ├── <Header />                       (existing, unchanged)
  ├── <TokenPairSelector />            (existing, unchanged)
  ├── <TradingChart>                   (new wrapper)
  │     ├── <ChartInfoBar />           (HTML — icon, price, pair name)
  │     ├── <ChartContainer>           (manages shared coordinate system)
  │     │     ├── <PriceCanvas />      (Canvas 2D — grid, axes, price line, crosshair)
  │     │     └── <PredictionCanvas /> (Canvas 2D — gradient line, ghost mode, uncertainty band)
  │     └── <TimeAxis />              (HTML — time labels below chart)
  ├── <PatternDrawingBox />            (redesigned — canvas + controls unified)
  ├── <PositionStatusCard />           (existing, cleaned up)
  └── <BottomControls />               (existing, unchanged)
```

### Shared Coordinate System

A `ChartCoordinateContext` (React context) provides coordinate conversion and visible range state. Both canvases and the info bar consume this context.

```ts
interface ChartCoordinates {
  // Dimensions
  width: number;
  height: number;

  // Visible range
  visibleTimeRange: { start: number; end: number };  // Unix seconds
  visiblePriceRange: { min: number; max: number };

  // Converters
  timeToX: (time: number) => number;
  priceToY: (price: number) => number;
  xToTime: (x: number) => number;
  yToPrice: (y: number) => number;

  // Zoom
  barSpacing: number;
  setBarSpacing: (s: number) => void;
}
```

**Auto-scaling:** Price range auto-fits to visible data with 10% vertical padding. Time range shows a sliding window anchored to "now" — latest data point sits ~80% from the left, leaving ~20% as future space for the prediction line.

**Zoom:** Mouse wheel on the chart adjusts `barSpacing` (pixels per second). No teardown — recalculates the coordinate transform and redraws.

---

## Components

### PriceCanvas

Custom Canvas 2D renderer. Draws every frame via `requestAnimationFrame` (skips when nothing changed via dirty flag).

**Render layers (in order):**
1. **Grid** — horizontal price lines at `rgba(255,255,255,0.04)`, vertical time lines at same opacity
2. **Price line** — orange `#f0a030` polyline from rolling price buffer, with subtle vertical gradient fill below (`0.3` opacity at line → `0` at bottom)
3. **Current price crosshair** — green `#22c55e` dashed horizontal line at latest price
4. **Price badge** — green rectangle on right edge with current price in monospace
5. **Live dot** — pulsing cyan `#00E5FF` circle at the line's tip (pulse via sinusoidal radius oscillation in the rAF loop)

**Right axis:** Price labels in `rgba(255,255,255,0.3)`, monospace, positioned at grid line Y coordinates.

### PredictionCanvas

Layered on top of PriceCanvas, same pixel dimensions. Transparent background — only draws prediction-related visuals.

**Normal mode (prediction drawn, position not yet active):**
1. **Junction dot** — cyan circle where prediction starts (at the current price point)
2. **Gradient prediction line** — stroke uses a horizontal linear gradient: `#00E5FF` (opacity 1.0) → `#7B61FF` (opacity 0.1), drawn as a polyline through the 60 sampled price points
3. **Uncertainty band** — two filled polygons above and below the prediction line, widening linearly from 0px at the junction to ~20px at the end, filled with `rgba(0,229,255,0.04)`

**Ghost mode (position active):**
- Prediction line opacity drops to 15%
- Uncertainty band opacity drops to 5%
- PriceCanvas continues drawing the orange price line into the prediction time window — the real price draws over the ghost

**Position closed:**
- Ghost stays at 15% for reference
- PositionStatusCard shows PnL result

### ChartInfoBar

HTML component above the chart canvas area.

**Contents (left to right):**
- Token icon (from existing token pair data or a generic circle placeholder)
- Live price in large monospace font (amber/gold color `#f0b90b`)
- Token pair name (e.g., "ETH · Ethereum") in subdued white

No 24h volume, high/low, tick dropdown, or settings gear.

### TimeAxis

HTML component below the chart canvas area. Renders 4-6 evenly spaced time labels in `rgba(255,255,255,0.25)` monospace. Updates when visible time range changes.

### ChartContainer

Manages the canvas stacking and coordinate context:
- Wraps both canvases in a `position: relative` div
- Both canvases are `position: absolute`, `inset: 0`
- PredictionCanvas has higher z-index
- Provides `ChartCoordinateContext` based on container dimensions (via `ResizeObserver`) and current price data
- Handles mouse wheel events for zoom

### TradingChart

Thin wrapper that composes `ChartInfoBar`, `ChartContainer`, and `TimeAxis`. Accepts props:
- `priceData: PricePoint[]`
- `predictionPoints: PredictionPoint[]`
- `isPositionActive: boolean`
- `barSpacing: number`
- `onBarSpacingChange: (s: number) => void`

No internal business logic — pure presentation.

### PatternDrawingBox (Redesigned)

Same core UX, clean aesthetic:

**Drawing canvas:**
- 170px tall, full width
- Dark background `#0a0f1a`, subtle border
- Orange `#f0a030` stroke while drawing (matches chart price line color)
- Left-to-right enforcement (same as current)
- Stretch animation on finish (same ease-out-cubic as current)
- Live point count badge

**Controls row (below canvas):**
- Amount input with x2/÷2 quick buttons
- Leverage discrete slider: `[100, 200, 500, 1000, 1500, 2000, 2500]`
- DRAWFI submit button

**Interpolation:** When `onPatternComplete` fires, if raw points < 60, cubic spline interpolation upsamples to 60. This happens inside the component before calling the callback — the parent always receives 60 points.

---

## Hooks

### useAnimationFrame

Shared rAF loop with dirty flag pattern:

```ts
function useAnimationFrame(draw: (ctx: CanvasRenderingContext2D) => void, deps: unknown[]): void
```

- Calls `requestAnimationFrame` in a loop
- Only calls `draw` when `deps` change (sets a dirty flag)
- Cleans up on unmount
- Both PriceCanvas and PredictionCanvas use this independently

### useChartCoordinates

Encapsulates coordinate calculation logic. Consumed by `ChartContainer` to provide context:

```ts
function useChartCoordinates(opts: {
  width: number;
  height: number;
  priceData: PricePoint[];
  barSpacing: number;
}): ChartCoordinates
```

- Recalculates visible time/price range when data or dimensions change
- Price range: auto-fit to visible data ± 10% padding
- Time range: sliding window where latest point sits at 80% of width

### usePredictionDrawing (Modified)

Fix the stale closure bug in `confirmPrediction`: use `useRef` for `currentPoints` or restructure so the callback reads from the reducer state directly.

### usePriceData (Unchanged)

Bybit WebSocket feed, rolling 120-point buffer. No changes needed.

### useOpenPosition (Unchanged)

Backend position lifecycle. No changes needed.

---

## Data Flow

```
Bybit WebSocket
    │
    │ tick (~1/sec)
    ▼
usePriceData(selectedPair)
    │
    │ PricePoint[] (rolling 120-point window)
    ▼
TradingChart
    ├── ChartCoordinateContext (auto-scales to data)
    ├── PriceCanvas (draws orange line, grid, crosshair)
    └── PredictionCanvas (draws gradient prediction if present)

User draws on PatternDrawingBox canvas
    │
    │ raw canvas points {x, y}
    ▼
onPatternComplete(points, offsetMinutes=1)
    │
    ├── Interpolate to 60 points (if needed)
    ├── Map canvas Y → price: currentPrice ± 5% range
    │
    ├── openDirectionalPosition({ ticker, predictions, leverage, amount, startTime, endTime })
    │     ├── POST /positions/open → { appSessionId, backendWallet }
    │     ├── Yellow client.transfer (off-chain)
    │     └── Poll GET /positions/:id → PositionResult
    │
    └── Inject 60 points into usePredictionDrawing → PredictionCanvas renders them
          │
          │ Position becomes active → ghost mode enabled
          │ Position closes → PositionStatusCard shows PnL
```

---

## Sampling & Interpolation

**Current behavior:** `samplePredictionPoints` requires ≥ 60 raw points and throws otherwise.

**New behavior:** If raw points < 60, use monotone cubic Hermite interpolation (same algorithm currently used in `RainbowPathTrail`) to upsample:
1. Normalize raw points to `t ∈ [0, 1]` along X axis
2. Build cubic Hermite spline through all raw points
3. Sample 60 evenly-spaced points from the spline
4. Flip Y (canvas top-down → price bottom-up)

If raw points ≥ 60, use the existing uniform index-sampling (no change).

Minimum raw point requirement drops from 60 to 2 (need at least 2 points to define a line).

---

## Visual Style

| Element | Value |
|---|---|
| Chart background | `#0a0f1a` |
| Grid lines | `rgba(255,255,255, 0.04)` |
| Price line | `#f0a030`, 2px stroke |
| Price fill gradient | `#f0a030` at 0.3 opacity → transparent |
| Current price crosshair | `#22c55e`, 1px dashed |
| Price badge | `#22c55e` background, black text, monospace |
| Live dot | `#00E5FF`, pulsing radius 3-5px |
| Prediction line | Horizontal gradient `#00E5FF` → `#7B61FF`, fading opacity |
| Uncertainty band | `rgba(0,229,255, 0.04)`, widening |
| Ghost mode opacity | 15% for line, 5% for band |
| Price axis labels | `rgba(255,255,255, 0.3)`, monospace, 10px |
| Time axis labels | `rgba(255,255,255, 0.25)`, monospace, 10px |
| Drawing box stroke | `#f0a030` |
| Drawing box background | `#0a0f1a` |
| Info bar price | `#f0b90b`, monospace, bold |

---

## Files to Create / Modify / Delete

| Action | File | Purpose |
|---|---|---|
| Create | `components/chart/PriceCanvas.tsx` | Custom Canvas 2D price renderer |
| Create | `components/chart/PredictionCanvas.tsx` | Gradient prediction + ghost mode |
| Create | `components/chart/ChartInfoBar.tsx` | Token icon + live price + pair name |
| Create | `components/chart/ChartContainer.tsx` | Coordinate context + canvas stacking |
| Create | `components/chart/TimeAxis.tsx` | Time labels below chart |
| Create | `hooks/useAnimationFrame.ts` | Shared rAF loop with dirty flag |
| Create | `hooks/useChartCoordinates.ts` | Coordinate system logic |
| Rewrite | `components/chart/TradingChart.tsx` | Thin wrapper composing the layers |
| Rewrite | `components/chart/PatternDrawingBox.tsx` | Clean aesthetic, interpolation |
| Rewrite | `app/predict/page.tsx` | Remove legacy flow, use new components |
| Modify | `hooks/usePredictionDrawing.ts` | Fix stale closure bug |
| Modify | `lib/prediction/samplePredictionPoints.ts` | Add interpolation for < 60 points |
| Delete | `components/chart/ChartCanvas.tsx` | Replaced by PriceCanvas |
| Delete | `components/chart/PredictionOverlay.tsx` | Replaced by PredictionCanvas |
| Delete | `components/chart/NyanCat.tsx` | Removed |
| Delete | `components/chart/nyan-cat.css` | Removed |
| Delete | `lib/chart/config.ts` | lightweight-charts config, no longer needed |

---

## Dependencies

**Add:** None — pure Canvas 2D, no new libraries.

**Remove:** `lightweight-charts` (can be removed from package.json after migration is complete).
