export interface PNLResult {
  pnl: number;
  fee: number;
  finalAmount: number;
  accuracy: number;
  correctDirections: number;
  totalDirections: number;
  priceMovement: number;
  maxProfit: number;
  positionSize: number;
}

export interface PNLInput {
  predictions: number[];
  actualPrices: number[];
  amount: number;
  leverage: number;
  feeBps: number;
}

function getDirection(price1: number, price2: number): number {
  if (price2 > price1) return 1;
  if (price2 < price1) return -1;
  return 0;
}

function countCorrectDirections(predictions: number[], actualPrices: number[]): number {
  let correct = 0;
  for (let i = 0; i < 59; i++) {
    const predictedDir = getDirection(predictions[i], predictions[i + 1]);
    const actualDir = getDirection(actualPrices[i], actualPrices[i + 1]);
    if (predictedDir === actualDir) {
      correct++;
    }
  }
  return correct;
}

export function validatePredictions(predictions: number[]): string | null {
  if (!Array.isArray(predictions) || predictions.length !== 60) {
    return `Predictions must be array of 60, got ${predictions?.length ?? 'non-array'}`;
  }
  for (let i = 0; i < 60; i++) {
    if (typeof predictions[i] !== 'number' || !isFinite(predictions[i]) || predictions[i] <= 0) {
      return `Prediction at index ${i} invalid: ${predictions[i]}`;
    }
  }
  return null;
}

export function calculatePNL(input: PNLInput): PNLResult {
  const { predictions, actualPrices, amount, leverage, feeBps } = input;

  if (predictions.length !== 60) {
    throw new Error(`Invalid predictions length: ${predictions.length}, expected 60`);
  }
  if (actualPrices.length !== 60) {
    throw new Error(`Invalid actual prices length: ${actualPrices.length}, expected 60`);
  }
  if (amount <= 0) throw new Error('Amount must be positive');
  if (leverage < 1 || leverage > 2500) throw new Error('Leverage must be between 1 and 2500');

  const correctDirections = countCorrectDirections(predictions, actualPrices);
  const totalDirections = 59;
  const accuracy = correctDirections / totalDirections;

  const priceMovement = Math.abs(actualPrices[59] - actualPrices[0]);
  const positionSize = amount / actualPrices[0];
  const maxProfit = priceMovement * positionSize * leverage;
  const pnl = (2 * accuracy - 1) * maxProfit;
  const fee = pnl > 0 ? (pnl * feeBps) / 10000 : 0;
  const finalAmount = Math.max(0, amount + pnl - fee);

  return {
    pnl: Math.floor(pnl),
    fee: Math.floor(fee),
    finalAmount: Math.max(0, Math.floor(finalAmount)),
    accuracy,
    correctDirections,
    totalDirections,
    priceMovement,
    maxProfit,
    positionSize,
  };
}
