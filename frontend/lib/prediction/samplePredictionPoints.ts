// frontend/lib/prediction/samplePredictionPoints.ts
export type CanvasPoint = { x: number; y: number };

const DEFAULT_BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

/**
 * Monotone cubic Hermite interpolation.
 * Given sorted xs and ys, returns a function that interpolates at any x.
 */
function monotoneCubicInterpolator(xs: number[], ys: number[]): (x: number) => number {
  const n = xs.length;
  if (n === 1) return () => ys[0];
  if (n === 2) {
    const slope = (ys[1] - ys[0]) / (xs[1] - xs[0]);
    return (x: number) => ys[0] + slope * (x - xs[0]);
  }

  // Compute slopes
  const dxs: number[] = [];
  const dys: number[] = [];
  const ms: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dxs.push(xs[i + 1] - xs[i]);
    dys.push(ys[i + 1] - ys[i]);
    ms.push(dys[i] / dxs[i]);
  }

  // Compute tangents
  const tangents: number[] = [ms[0]];
  for (let i = 1; i < n - 1; i++) {
    if (ms[i - 1] * ms[i] <= 0) {
      tangents.push(0);
    } else {
      tangents.push((ms[i - 1] + ms[i]) / 2);
    }
  }
  tangents.push(ms[n - 2]);

  // Fritsch-Carlson monotonicity
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(ms[i]) < 1e-10) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
    } else {
      const alpha = tangents[i] / ms[i];
      const beta = tangents[i + 1] / ms[i];
      const s = alpha * alpha + beta * beta;
      if (s > 9) {
        const tau = 3 / Math.sqrt(s);
        tangents[i] = tau * alpha * ms[i];
        tangents[i + 1] = tau * beta * ms[i];
      }
    }
  }

  return (x: number) => {
    // Binary search for interval
    let lo = 0;
    let hi = n - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] <= x) lo = mid;
      else hi = mid;
    }
    const i = lo;
    const h = dxs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;

    return (
      (2 * t3 - 3 * t2 + 1) * ys[i] +
      (t3 - 2 * t2 + t) * h * tangents[i] +
      (-2 * t3 + 3 * t2) * ys[i + 1] +
      (t3 - t2) * h * tangents[i + 1]
    );
  };
}

export function samplePredictionPoints(
  points: CanvasPoint[],
  desiredCount = 60,
): CanvasPoint[] {
  if (points.length < 2) {
    throw new Error(
      'Not enough points to sample — draw at least 2 points',
    );
  }

  const maxY = points.reduce((max, p) => (p.y > max ? p.y : max), points[0].y);

  // If we already have enough points, use uniform index-sampling (original behavior)
  if (points.length >= desiredCount) {
    if (points.length === desiredCount) {
      return points.map((p) => ({ x: p.x, y: maxY - p.y }));
    }

    const result: CanvasPoint[] = [];
    const lastIndex = points.length - 1;
    for (let i = 0; i < desiredCount; i++) {
      const t = desiredCount === 1 ? 0 : i / (desiredCount - 1);
      const index = Math.round(t * lastIndex);
      const point = points[index];
      result.push({ x: point.x, y: maxY - point.y });
    }
    return result;
  }

  // Interpolate: upsample using monotone cubic Hermite
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const interpolate = monotoneCubicInterpolator(xs, ys);

  const minX = xs[0];
  const maxX = xs[xs.length - 1];
  const result: CanvasPoint[] = [];

  for (let i = 0; i < desiredCount; i++) {
    const t = desiredCount === 1 ? 0 : i / (desiredCount - 1);
    const x = minX + t * (maxX - minX);
    const y = interpolate(x);
    result.push({ x, y: maxY - y });
  }

  return result;
}

export async function uploadSampledPredictionPoints(options: {
  points: CanvasPoint[];
  userAddress: string;
  desiredCount?: number;
  backendUrl?: string;
}): Promise<{ commitmentId: string; predictions: number[] }> {
  const {
    points,
    userAddress,
    desiredCount = 60,
    backendUrl = DEFAULT_BACKEND_URL,
  } = options;

  if (!userAddress) {
    throw new Error('uploadSampledPredictionPoints: userAddress is required');
  }

  const sampledPoints = samplePredictionPoints(points, desiredCount);
  const predictions = sampledPoints.map((p) => p.y + 1);

  const res = await fetch(`${backendUrl}/api/predictions/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ predictions, userAddress }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      body.error || `Prediction upload failed with status ${res.status}`,
    );
  }

  const json = await res.json();
  const commitmentId = json.commitmentId as string | undefined;

  if (!commitmentId) {
    throw new Error(
      'Prediction upload succeeded but backend did not return commitmentId',
    );
  }

  return { commitmentId, predictions };
}
