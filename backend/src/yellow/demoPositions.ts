/**
 * Demo mode: off-chain positions with simulated balance
 * No gas, no LineFutures - paper trading for onboarding
 */
import { PNLCalculator } from '../pnl/pnlCalculator.js';
import { RetrievalService } from '../retrieval/retrievalService.js';
import logger from '../utils/logger.js';

const INITIAL_DEMO_BALANCE = 1000; // Demo tokens per user

export interface DemoPosition {
  id: string;
  userAddress: string;
  amount: number;
  leverage: number;
  openTimestamp: number;
  predictionCommitmentId: string;
  isOpen: boolean;
  pnl?: number;
  accuracy?: number;
  closedAt?: number;
}

const demoBalances: Map<string, number> = new Map();
const demoPositions: Map<string, DemoPosition> = new Map();
let demoPositionCounter = 0;

function getOrCreateBalance(address: string): number {
  const normalized = address.toLowerCase();
  if (!demoBalances.has(normalized)) {
    demoBalances.set(normalized, INITIAL_DEMO_BALANCE);
  }
  return demoBalances.get(normalized)!;
}

export function getDemoBalance(address: string): number {
  return getOrCreateBalance(address);
}

export function addDemoBalance(address: string, amount: number): number {
  const normalized = address.toLowerCase();
  const current = getOrCreateBalance(address);
  const newBalance = current + amount;
  demoBalances.set(normalized, newBalance);
  return newBalance;
}

export function openDemoPosition(
  userAddress: string,
  amount: number,
  leverage: number,
  predictionCommitmentId: string,
  openTimestamp: number
): DemoPosition | null {
  const normalized = userAddress.toLowerCase();
  const balance = getOrCreateBalance(userAddress);
  if (balance < amount) {
    logger.warn('Demo: insufficient balance', { userAddress, balance, amount });
    return null;
  }
  demoBalances.set(normalized, balance - amount);
  const id = `demo-${++demoPositionCounter}`;
  const position: DemoPosition = {
    id,
    userAddress,
    amount,
    leverage,
    openTimestamp,
    predictionCommitmentId,
    isOpen: true,
  };
  demoPositions.set(id, position);
  return position;
}

export async function closeDemoPosition(
  positionId: string,
  retrievalService: RetrievalService,
  pnlCalculator: PNLCalculator
): Promise<DemoPosition | null> {
  const position = demoPositions.get(positionId);
  if (!position || !position.isOpen) return null;

  const elapsed = Math.floor(Date.now() / 1000) - position.openTimestamp;
  if (elapsed < 60) {
    logger.warn('Demo: position not yet closable', { positionId, elapsed });
    return null;
  }

  const actualPriceWindow = await retrievalService.getWindowForPosition(position.openTimestamp);
  if (!actualPriceWindow || actualPriceWindow.prices.length !== 60) {
    logger.warn('Demo: no actual prices for position', { positionId });
    return null;
  }

  // Fetch predictions from EigenDA via commitment - we need PredictionService
  // For now assume we have a way to get predictions. The frontend sends commitmentId.
  // We need to retrieve from EigenDA - inject PredictionService or make this accept predictions
  return null; // Will be wired in API with PredictionService
}

export function closeDemoPositionWithData(
  positionId: string,
  predictions: number[],
  actualPrices: number[],
  pnlCalculator: PNLCalculator
): DemoPosition | null {
  const position = demoPositions.get(positionId);
  if (!position || !position.isOpen) return null;

  const elapsed = Math.floor(Date.now() / 1000) - position.openTimestamp;
  if (elapsed < 60) return null;

  const pnlResult = pnlCalculator.calculatePNL(
    predictions,
    actualPrices,
    position.amount,
    position.leverage,
    200
  );

  position.isOpen = false;
  position.pnl = pnlResult.pnl;
  position.accuracy = pnlResult.accuracy;
  position.closedAt = Math.floor(Date.now() / 1000);

  const normalized = position.userAddress.toLowerCase();
  const balance = getOrCreateBalance(position.userAddress);
  const finalCredit = Math.max(0, position.amount + pnlResult.pnl - pnlResult.fee);
  demoBalances.set(normalized, balance + finalCredit);

  return position;
}

export function getDemoPositions(userAddress: string): DemoPosition[] {
  const normalized = userAddress.toLowerCase();
  return Array.from(demoPositions.values()).filter(
    (p) => p.userAddress.toLowerCase() === normalized
  );
}

export function getOpenDemoPosition(positionId: string): DemoPosition | null {
  const p = demoPositions.get(positionId);
  return p?.isOpen ? p : null;
}
