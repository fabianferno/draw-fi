'use client';

import { useEffect, useState } from 'react';
import { BrowserProvider, Contract, formatEther } from 'ethers';
import { motion, AnimatePresence } from 'framer-motion';
import { useNextStep } from 'nextstepjs';
import { TradingChart } from '@/components/chart/TradingChart';
import { PatternDrawingBox } from '@/components/chart/PatternDrawingBox';
import { usePredictionDrawing } from '@/hooks/usePredictionDrawing';
import { usePriceData } from '@/hooks/usePriceData';
import { useTokenPair } from '@/contexts/TokenPairContext';
import { TokenPairSelector } from '@/components/TokenPairSelector';
import {
  samplePredictionPoints,
  uploadSampledPredictionPoints,
} from '@/lib/prediction/samplePredictionPoints';
import { Header, BottomControls } from '@/components/layout';
import { NoiseEffect } from '@/components/ui/NoiseEffect';
import { usePrivyWallet } from '@/hooks/usePrivyWallet';
import { useYellowFaucet, useYellowDeposit } from '@/hooks/useYellow';
import { openPositionWithYellowBalance } from '@/lib/api/yellow';
import { signFundPosition } from '@/lib/yellow/relayer';
import { ytestToEthWei, getMinYtestAmount } from '@/lib/yellow/ytestConversion';
import { predictTourId } from '@/lib/onboarding/predictTourSteps';

const ONBOARDING_SEEN_KEY = 'drawfi-predict-onboarding-seen';

export const dynamic = 'force-dynamic';

const LINE_FUTURES_ABI = [
  'function openPosition(uint16 _leverage, string _predictionCommitmentId) external payable returns (uint256)',
  'function batchOpenPositions(uint16 _leverage, string[] _predictionCommitmentIds) external payable returns (uint256[])',
  'function canClosePosition(uint256 _positionId) external view returns (bool)',
  'function getPosition(uint256 _positionId) external view returns (tuple(address user,uint256 amount,uint16 leverage,uint256 openTimestamp,string predictionCommitmentId,bool isOpen,int256 pnl,string actualPriceCommitmentId,uint256 closeTimestamp))',
  'event PositionOpened(uint256 indexed positionId, address indexed user, uint256 amount, uint16 leverage, uint256 timestamp, string predictionCommitmentId)',
];

const DEFAULT_FUTURES_CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_FUTURES_CONTRACT_ADDRESS ||
  '0x30200d6273e6e08B08Bd9C8f3A1A8807265B7adC';

// Props are intentionally not used - they're passed by Next.js but we don't need them
export default function PredictPage(_props: { params?: unknown; searchParams?: unknown }) {
  const { ready, authenticated, address, isWalletLoading, getSigner } = usePrivyWallet();
  const isConnected = ready && authenticated && !!address && !isWalletLoading;
  const { selectedPair } = useTokenPair();
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
    isDrawing,
    currentPoints,
    startDrawing,
    addPoint,
    finishDrawing,
    clearPrediction,
  } = usePredictionDrawing();

  const { data: priceData } = usePriceData(selectedPair);

  // When token pair changes, clear prediction state so chart shows only the new pair
  useEffect(() => {
    clearPrediction();
    setSelectedMinute(null);
  }, [selectedPair]); // eslint-disable-line react-hooks/exhaustive-deps -- only run when pair changes

  const [barSpacing, setBarSpacing] = useState(3);
  const [selectedMinute, setSelectedMinute] = useState<number | null>(null);
  const [amount, setAmount] = useState<number>(1); // ytest.usd (1 = 0.01 ETH at default rate 100)
  const [leverage, setLeverage] = useState<number>(500);
  const [positionIds, setPositionIds] = useState<number[]>([]);
  const [positionStatus, setPositionStatus] = useState<'idle' | 'trading' | 'awaiting_settlement' | 'closed'>('idle');
  const [batchPnL, setBatchPnL] = useState<number | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [statusMessageIndex, setStatusMessageIndex] = useState(0);
  const [isOpeningPosition, setIsOpeningPosition] = useState(false);
  const yellowNonceRef = { current: 0 };

  const { request: requestFaucet, loading: faucetLoading, result: faucetResult } = useYellowFaucet(address ?? null);
  const { depositAddress, depositBalance, loading: yellowDepositLoading, refresh: refreshYellowDeposit } =
    useYellowDeposit(address ?? null);

  // Refresh deposit balance when faucet succeeds (e.g. when YELLOW_FAUCET_ALSO_CREDIT credits us)
  useEffect(() => {
    if (faucetResult?.success) {
      refreshYellowDeposit();
    }
  }, [faucetResult?.success, refreshYellowDeposit]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (positionIds.length === 0) return;

    const ethereum = (window as unknown as { ethereum?: unknown }).ethereum;
    if (!ethereum) return;

    let cancelled = false;
    let intervalId: number | null = null;

    const provider = new BrowserProvider(ethereum as any);
    const contract = new Contract(
      DEFAULT_FUTURES_CONTRACT_ADDRESS,
      LINE_FUTURES_ABI,
      provider,
    );

    const tradingMessages = ['Trading...', 'Future booming...', 'Position active...'] as const;

    const poll = async () => {
      if (cancelled) return;
      try {
        const nowSec = Math.floor(Date.now() / 1000);
        let anyOpen = false;
        let anyAwaiting = false;
        let minRemaining: number | null = null;
        let totalClosedPnlWei = BigInt(0);

        for (const pid of positionIds) {
          const position = await contract.getPosition(pid);
          if (position.isOpen) {
            anyOpen = true;
            const openTimestampSec = Number(position.openTimestamp?.toString?.() ?? position.openTimestamp);
            const closeAt = openTimestampSec + 60;
            const remaining = closeAt - nowSec;
            if (minRemaining === null || remaining < minRemaining) {
              minRemaining = remaining;
            }
            const canClose: boolean = await contract.canClosePosition(pid);
            if (canClose) {
              anyAwaiting = true;
            }
          } else {
            const pnlWei = BigInt(position.pnl.toString());
            totalClosedPnlWei += pnlWei;
          }
        }

        setBatchPnL(Number(formatEther(totalClosedPnlWei)));

        if (anyOpen) {
          setPositionStatus(anyAwaiting ? 'awaiting_settlement' : 'trading');
          setTimeRemaining(minRemaining !== null && minRemaining > 0 ? minRemaining : 0);
        } else {
          setPositionStatus('closed');
          setTimeRemaining(0);
          if (intervalId !== null) {
            clearInterval(intervalId);
          }
        }

        setStatusMessageIndex(prev => (prev + 1) % tradingMessages.length);
      } catch (err) {
        console.error('Error polling position status', err);
      }
    };

    // Initial poll
    poll();
    intervalId = window.setInterval(poll, 3000);

    return () => {
      cancelled = true;
      if (intervalId !== null) {
        clearInterval(intervalId);
      }
    };
  }, [positionIds]);

  const handleClear = () => {
    clearPrediction();
    setSelectedMinute(null);
  };

  const handleZoomIn = () => {
    setBarSpacing(prev => Math.min(prev + 0.5, 10));
  };

  const handleZoomOut = () => {
    setBarSpacing(prev => Math.max(prev - 0.5, 0.1));
  };

  const handlePatternComplete = async (
    points: Array<{ x: number; y: number }>,
    offsetMinutes: number,
  ) => {
    if (!priceData || priceData.length === 0) {
      alert('Price data is still loading. Please wait for the chart to connect and try again.');
      return;
    }
    if (points.length === 0) {
      alert('Please draw a pattern with at least 2 points before pulling the lever.');
      return;
    }

    const currentPrice = priceData[priceData.length - 1].value;

    const canvasWidth = 600;
    const canvasHeight = 300;

    const priceRange = currentPrice * 0.05;
    const minPrice = currentPrice - priceRange;
    const maxPrice = currentPrice + priceRange;

    const nowInSeconds = Math.floor(Date.now() / 1000);
    // Start drawing immediately from current second (position starts at current timestamp)
    const futureStartTime = nowInSeconds;
    const totalDurationSeconds = offsetMinutes * 60;

    let sampledPoints: Array<{ x: number; y: number }>;
    try {
      sampledPoints = samplePredictionPoints(points, 60);
      console.log('sampled prediction canvas points (60):', sampledPoints);
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Not enough points to sample the required number of predictions';
      console.error('sampling error:', err);
      alert(
        message.includes('Not enough points')
          ? 'Please draw a longer pattern so we can sample at least 60 points.'
          : `Error sampling prediction points: ${message}`,
      );
      return;
    }

    if (!isConnected || !address) {
      alert('Please connect your wallet to open a position.');
      return;
    }

    setIsOpeningPosition(true);
    const commitmentIds: string[] = [];
    try {
      for (let i = 0; i < offsetMinutes; i++) {
        const { commitmentId } = await uploadSampledPredictionPoints({
          points,
          userAddress: address,
          desiredCount: 60,
        });
        console.log(`prediction commitment from backend [${i}]:`, commitmentId);
        commitmentIds.push(commitmentId);
      }
    } catch (err) {
      console.error('failed to upload sampled prediction points', err);
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Prediction upload failed';
      alert(`Error uploading predictions: ${message}`);
      return;
    }

    const lev = Number(leverage);
    if (!Number.isFinite(lev) || lev < 1 || lev > 2500) {
      alert('Leverage must be between 1 and 2500');
      return;
    }
    const amt = Number(amount);
    const minYtest = getMinYtestAmount();
    if (!Number.isFinite(amt) || amt < minYtest) {
      alert(`Amount must be at least ${minYtest} ytest.usd to open a position.`);
      return;
    }

    const signer = await getSigner();
    if (!signer) {
      alert('No signer available. Please reconnect your wallet.');
      return;
    }

    try {
      const valueWei = ytestToEthWei(amt);
      const openedIds: number[] = [];

      for (let i = 0; i < commitmentIds.length; i++) {
        try {
          const commitmentId = commitmentIds[i];
          if (!commitmentId?.trim()) continue;
          const deadline = Math.floor(Date.now() / 1000) + 300;
          const nonce = ++yellowNonceRef.current;
          const signature = await signFundPosition(signer, {
            userAddress: address,
            amountWei: valueWei,
            leverage: lev,
            commitmentId,
            nonce: BigInt(nonce),
            deadline: BigInt(deadline),
          });
          const result = await openPositionWithYellowBalance({
            userAddress: address,
            amountWei: valueWei.toString(),
            leverage: lev,
            commitmentId,
            signature,
            nonce,
            deadline,
          });
          openedIds.push(result.positionId);
        } catch (err) {
          console.error('Yellow position failed', err);
          const message = err instanceof Error ? err.message : 'Failed to open position';
          const isFundingUnavailable =
            message.includes('not available') ||
            message.includes('not enabled') ||
            message.includes('disabled') ||
            message.includes('relayer');
          const isAmountBelowMin =
            message.includes('amount below minimum') || message.includes('below contract minimum');
          const friendlyMessage = isFundingUnavailable
            ? "Pay with Yellow balance isn't enabled on this server. Try opening with wallet ETH instead, or ask the operator to enable the Yellow relayer."
            : isAmountBelowMin
              ? `Position amount is below minimum. Please use at least ${minYtest} ytest.usd.`
              : message;
          alert(`Error: ${friendlyMessage}`);
          if (openedIds.length === 0) return;
          break;
        }
      }

      if (openedIds.length > 0) {
        setPositionIds(openedIds);
        setPositionStatus('trading');
        setTimeRemaining(60);
        setBatchPnL(null);
        refreshYellowDeposit();
      }

      const predictionPoints = sampledPoints.map((point) => {
        const normalizedX = point.x / canvasWidth;
        const time = futureStartTime + normalizedX * totalDurationSeconds;

        const normalizedY = point.y / canvasHeight;
        const price = maxPrice - (normalizedY * (maxPrice - minPrice));

        return {
          x: 0,
          y: 0,
          time: Math.floor(time),
          price,
          canvasX: point.x,
          canvasY: point.y,
        };
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

  return (

    <div className="text-white pb-24 relative overflow-hidden">
      {/* Header */}
      <Header
        showStatus={currentPoints.length > 0}
        statusText={selectedMinute ? `+${selectedMinute}m` : undefined}
      />

      <motion.div
        className="relative z-10 px-3 py-4 sm:px-4 sm:py-6 mb-20 max-w-7xl mx-auto space-y-2"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
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

        {/* Main Chart Card - Nyan style */}
        <NoiseEffect opacity={0.7} className="">
          <motion.div
            id="onboard-chart"
            className="relative group"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
          >
            {/* Glow effect */}
            <div className="absolute -inset-1 bg-gradient-to-r from-[#00E5FF] via-[#000000] to-[#00E5FF] rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-500 animate-pulse" />

            <div className="relative bg-[#0a0a0a] rounded-2xl border-4 border-[#00E5FF] p-3 sm:p-4 overflow-hidden shadow-[6px_6px_0_0_#000000]">
              {/* Subtle inner glow */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#000000]/20 to-transparent pointer-events-none" />

              {/* Drawing Indicator */}
              <AnimatePresence>
                {isDrawing && (
                  <motion.div
                    className="absolute top-3 right-3 z-20 flex items-center gap-2 px-3 py-1.5 bg-[#00E5FF] rounded-full shadow-[2px_2px_0_0_#000000]"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                  >
                    <motion.div
                      className="w-1.5 h-1.5 rounded-full bg-[#000000]"
                      animate={{ scale: [1, 1.5, 1] }}
                      transition={{ repeat: Infinity, duration: 0.5 }}
                    />
                    <span className="text-[11px] font-bold text-[#000000] uppercase tracking-wider">Live</span>
                  </motion.div>
                )}
              </AnimatePresence>

              <TradingChart
                key={selectedPair}
                isDark={true}
                isDrawing={isDrawing}
                isConfirmed={false}
                currentPoints={currentPoints}
                selectedMinute={selectedMinute}
                onStartDrawing={startDrawing}
                onAddPoint={addPoint}
                onFinishDrawing={finishDrawing}
                barSpacing={barSpacing}
                onZoomIn={handleZoomIn}
                onZoomOut={handleZoomOut}
              />
            </div>
          </motion.div>
        </NoiseEffect>


        {/* Pattern Drawing Box */}
        <NoiseEffect opacity={0.5} className="">
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
        </NoiseEffect>


      </motion.div>

      {/* Bottom Controls (status: Opening/Trading/Settlement/PnL shown in right slot) */}
      <BottomControls
        selectedMinute={selectedMinute}
        hasPoints={currentPoints.length > 0}
        onClear={handleClear}
        isConnected={isConnected}
        batchPnL={batchPnL}
        yellowDepositBalance={depositBalance}
        yellowDepositLoading={yellowDepositLoading}
        depositAddress={depositAddress}
        onRefreshDeposit={refreshYellowDeposit}
        onRequestFaucet={requestFaucet}
        faucetLoading={faucetLoading}
        faucetResult={faucetResult}
        isOpeningPosition={isOpeningPosition}
        positionStatus={positionStatus}
        statusMessageIndex={statusMessageIndex}
        timeRemaining={timeRemaining}
      />
    </div>

  );
}
