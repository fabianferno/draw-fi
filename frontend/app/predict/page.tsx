// frontend/app/predict/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNextStep } from 'nextstepjs';
import { TradingChart } from '@/components/chart/TradingChart';
import { PatternDrawingBox } from '@/components/chart/PatternDrawingBox';
import { usePredictionDrawing } from '@/hooks/usePredictionDrawing';
import { usePriceData } from '@/hooks/usePriceData';
import { useTokenPair } from '@/contexts/TokenPairContext';
import { TokenPairSelector } from '@/components/TokenPairSelector';
import { samplePredictionPoints } from '@/lib/prediction/samplePredictionPoints';
import { Header, BottomControls } from '@/components/layout';
import { usePrivyWallet } from '@/hooks/usePrivyWallet';
import { useYellowDeposit } from '@/hooks/useYellow';
import { predictTourId } from '@/lib/onboarding/predictTourSteps';
import { useOpenPosition, type PositionStatus, type PositionResult } from '@/hooks/useOpenPosition';

const ONBOARDING_SEEN_KEY = 'drawfi-predict-onboarding-seen';

export const dynamic = 'force-dynamic';

function PositionStatusCard({
  status,
  result,
  timeRemaining,
  error,
  onReset,
}: {
  status: PositionStatus;
  result: PositionResult | null;
  timeRemaining: number | null;
  error: string | null;
  onReset: () => void;
}) {
  if (status === 'idle') return null;

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}m ${sec}s`;
  };

  const pnlNum = result ? parseInt(result.pnl) : 0;
  const isProfit = pnlNum > 0;

  return (
    <div className={`rounded-lg border-2 p-4 mt-4 ${
      status === 'closed'
        ? (isProfit ? 'border-green-400/50 bg-green-400/5' : 'border-red-400/50 bg-red-400/5')
        : status === 'error'
          ? 'border-red-400/50 bg-red-400/5'
          : 'border-[#00E5FF]/30 bg-[#00E5FF]/5'
    }`}>
      {status === 'creating' && (
        <p className="text-[#00E5FF] text-sm">Setting up position...</p>
      )}
      {status === 'transferring' && (
        <p className="text-[#00E5FF] text-sm">Transferring collateral...</p>
      )}
      {status === 'active' && (
        <p className="text-[#00E5FF] text-sm">
          Position active — closes in {timeRemaining !== null ? formatTime(timeRemaining) : '...'}
        </p>
      )}
      {status === 'closed' && result && (
        <div className="space-y-1">
          <p className={`text-lg font-bold ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
            PnL: {isProfit ? '+' : ''}{(pnlNum / 1e6).toFixed(4)} USDC ({result.pnlPercent}%)
          </p>
          <p className="text-white/60 text-xs">
            Accuracy: {(result.accuracy * 100).toFixed(1)}% ({result.correctDirections}/{result.totalDirections})
          </p>
          <p className="text-white/60 text-xs">
            Return: {(parseInt(result.returnAmount) / 1e6).toFixed(4)} USDC
          </p>
          <button onClick={onReset} className="mt-2 text-xs text-[#00E5FF] underline">
            New prediction
          </button>
        </div>
      )}
      {status === 'error' && (
        <div className="flex items-center gap-2">
          <p className="text-red-400 text-sm">{error}</p>
          <button onClick={onReset} className="text-xs text-white/40 underline">Retry</button>
        </div>
      )}
    </div>
  );
}

export default function PredictPage() {
  const { ready, authenticated, address, isWalletLoading } = usePrivyWallet();
  const isConnected = ready && authenticated && !!address && !isWalletLoading;
  const { selectedPair, availablePairs } = useTokenPair();
  const { startNextStep, isNextStepVisible } = useNextStep();

  // Show onboarding tour the first time user visits the predict page
  useEffect(() => {
    if (typeof window === 'undefined' || isNextStepVisible) return;
    const seen = window.localStorage.getItem(ONBOARDING_SEEN_KEY);
    if (!seen) {
      startNextStep(predictTourId);
    }
  }, [startNextStep, isNextStepVisible]);

  const {
    currentPoints,
    startDrawing,
    addPoint,
    finishDrawing,
    clearPrediction,
  } = usePredictionDrawing();

  const { data: priceData } = usePriceData(selectedPair);

  const [selectedMinute, setSelectedMinute] = useState<number | null>(null);
  const [amount, setAmount] = useState<number>(1);
  const [leverage, setLeverage] = useState<number>(500);
  const [isOpeningPosition, setIsOpeningPosition] = useState(false);

  const {
    openPosition: openDirectionalPosition,
    status: positionStatus,
    result: positionResult,
    timeRemaining,
    error: positionError,
    reset: resetPosition,
  } = useOpenPosition();

  const { depositAddress, depositBalance, loading: yellowDepositLoading, refresh: refreshYellowDeposit } =
    useYellowDeposit(address ?? null);

  // When token pair changes, clear prediction state
  useEffect(() => {
    clearPrediction();
    setSelectedMinute(null);
  }, [selectedPair]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClear = () => {
    clearPrediction();
    setSelectedMinute(null);
  };

  const handlePatternComplete = async (
    points: Array<{ x: number; y: number }>,
    offsetMinutes: number,
  ) => {
    if (!priceData || priceData.length === 0) {
      alert('Price data is still loading. Please wait and try again.');
      return;
    }
    if (points.length < 2) {
      alert('Please draw a pattern with at least 2 points.');
      return;
    }
    if (!isConnected || !address) {
      alert('Please connect your wallet to open a position.');
      return;
    }

    setIsOpeningPosition(true);

    try {
      const currentPrice = priceData[priceData.length - 1].value;
      const canvasHeight = 170; // PatternDrawingBox canvas height

      // Sample/interpolate to 60 points
      let sampledPoints: Array<{ x: number; y: number }>;
      try {
        sampledPoints = samplePredictionPoints(points, 60);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Sampling failed';
        alert(message.includes('Not enough') || message.includes('draw at least')
          ? 'Please draw a longer pattern.'
          : `Error: ${message}`);
        return;
      }

      // Map canvas Y → price predictions
      const priceRange = currentPrice * 0.05;
      const minPrice = currentPrice - priceRange;
      const maxPrice = currentPrice + priceRange;
      const predictions = sampledPoints.map(p =>
        minPrice + (1 - p.y / canvasHeight) * (maxPrice - minPrice)
      );

      const nowSec = Math.floor(Date.now() / 1000);
      const totalDurationSeconds = offsetMinutes * 60;
      const ticker = selectedPair?.replace('/', '') || 'BTCUSDT';

      await openDirectionalPosition({
        ticker,
        predictions,
        leverage: Number(leverage),
        amount: amount.toString(),
        startTime: nowSec,
        endTime: nowSec + totalDurationSeconds,
      });

      // Inject prediction points onto the chart
      const canvasWidth = points.length > 0
        ? Math.max(...points.map(p => p.x))
        : 600;

      const predictionPoints = sampledPoints.map((point) => {
        const normalizedX = point.x / (canvasWidth || 1);
        const time = nowSec + normalizedX * totalDurationSeconds;
        const price = minPrice + (1 - point.y / canvasHeight) * (maxPrice - minPrice);
        return { x: 0, y: 0, time: Math.floor(time), price };
      });

      clearPrediction();
      setSelectedMinute(offsetMinutes);

      startDrawing(predictionPoints[0]);
      for (let i = 1; i < predictionPoints.length; i++) {
        addPoint(predictionPoints[i]);
      }
      finishDrawing();
    } finally {
      setIsOpeningPosition(false);
    }
  };

  // Find display name for current pair
  const currentPairInfo = availablePairs.find(p => p.symbol === selectedPair);
  const pairDisplay = currentPairInfo?.display || selectedPair;
  const isPositionActive = positionStatus === 'active' || positionStatus === 'creating' || positionStatus === 'transferring';

  return (
    <div className="text-white pb-24 relative">
      <Header
        showStatus={currentPoints.length > 0}
        statusText={selectedMinute ? `+${selectedMinute}m` : undefined}
      />

      <motion.div
        className="relative z-10 px-3 py-4 sm:px-4 sm:py-6 mb-20 max-w-7xl mx-auto space-y-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <motion.div
          className="text-center mb-10"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1
            className="flex items-center justify-start gap-3 text-4xl md:text-6xl font-melodrame font-medium text-[#00E5FF]"
            style={{ textShadow: '4px 4px 0 #000000' }}
          >
            Predict
          </h1>
          <p className="text-lg text-start text-white/70">
            Draw your curve on the live chart and open a position.
          </p>
        </motion.div>

        {/* Token Pair Selector */}
        <motion.section
          id="onboard-token-pair"
          className="mb-4"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex flex-col gap-4 w-full">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex flex-col items-start text-left">
                <p className="text-sm font-medium text-[#00E5FF]/90">
                  Choose the market you want to predict
                </p>
                <p className="text-xs text-white/60 max-w-md">
                  Select a token pair below. The chart and your prediction will use this market.
                </p>
              </div>
              <TokenPairSelector />
            </div>
          </div>
        </motion.section>

        {/* Trading Chart */}
        <motion.div
          id="onboard-chart"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
        >
          <TradingChart
            key={selectedPair}
            priceData={priceData}
            predictionPoints={currentPoints}
            isPositionActive={isPositionActive}
            pairSymbol={selectedPair}
            pairDisplay={pairDisplay}
          />
        </motion.div>

        {/* Pattern Drawing Box */}
        <motion.div
          id="onboard-draw-box"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
        >
          <PatternDrawingBox
            onPatternComplete={handlePatternComplete}
            amount={amount}
            leverage={leverage}
            onAmountChange={(amt: number) => setAmount(amt)}
            onLeverageChange={(lev) => setLeverage(lev)}
            isOpeningPosition={isOpeningPosition}
          />
        </motion.div>

        <PositionStatusCard
          status={positionStatus}
          result={positionResult}
          timeRemaining={timeRemaining}
          error={positionError}
          onReset={resetPosition}
        />
      </motion.div>

      <BottomControls
        selectedMinute={selectedMinute}
        hasPoints={currentPoints.length > 0}
        onClear={handleClear}
        isConnected={isConnected}
        batchPnL={null}
        yellowDepositBalance={depositBalance}
        yellowDepositLoading={yellowDepositLoading}
        depositAddress={depositAddress}
        onRefreshDeposit={refreshYellowDeposit}
        isOpeningPosition={isOpeningPosition}
        positionStatus={'idle'}
        statusMessageIndex={0}
        timeRemaining={null}
      />
    </div>
  );
}
