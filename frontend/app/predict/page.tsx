'use client';

import { useEffect, useState } from 'react';
import { BrowserProvider, Contract, parseEther, formatEther } from 'ethers';
import { motion, AnimatePresence } from 'framer-motion';
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
import { useDemoBalance, useYellowFaucet, useYellowDeposit } from '@/hooks/useYellow';
import {
  openDemoPosition,
  closeDemoPosition,
  fundPositionViaRelayer,
  openPositionWithYellowBalance,
} from '@/lib/api/yellow';
import { signFundPosition } from '@/lib/yellow/relayer';

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
  const [mntBalance, setMntBalance] = useState<bigint | null>(null);
  const [isBalanceLoading, setIsBalanceLoading] = useState(false);
  const { selectedPair } = useTokenPair();

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
    setDebugInfo('');
  }, [selectedPair]); // eslint-disable-line react-hooks/exhaustive-deps -- only run when pair changes

  const [barSpacing, setBarSpacing] = useState(3);
  const [selectedMinute, setSelectedMinute] = useState<number | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [amount, setAmount] = useState<number>(10);
  const [leverage, setLeverage] = useState<number>(2500);
  const [positionIds, setPositionIds] = useState<number[]>([]);
  const [demoPositionIds, setDemoPositionIds] = useState<string[]>([]);
  const [positionStatus, setPositionStatus] = useState<'idle' | 'trading' | 'awaiting_settlement' | 'closed'>('idle');
  const [batchPnL, setBatchPnL] = useState<number | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [statusMessageIndex, setStatusMessageIndex] = useState(0);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [isYellowMode, setIsYellowMode] = useState(false);
  const [useRelayer, setUseRelayer] = useState(false);
  const relayerNonceRef = { current: 0 };

  const { balance: demoBalance, refresh: refreshDemoBalance, addFunds: addDemoFunds } = useDemoBalance(
    address ?? null,
    isDemoMode
  );
  const { request: requestFaucet, loading: faucetLoading, result: faucetResult } = useYellowFaucet(address ?? null);
  const { depositAddress, depositBalance, loading: yellowDepositLoading, refresh: refreshYellowDeposit } =
    useYellowDeposit(address ?? null);

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

  // Poll demo positions and close when ready
  const demoClosedRef = { current: new Set<string>() };
  useEffect(() => {
    if (demoPositionIds.length === 0 || !isDemoMode) return;
    demoClosedRef.current.clear();
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      if (cancelled) return;
      const nowSec = Math.floor(Date.now() / 1000);
      let totalPnL = 0;
      let stillOpen = 0;
      const closedIds = demoClosedRef.current;

      for (const pid of demoPositionIds) {
        if (closedIds.has(pid)) continue;
        try {
          const closed = await closeDemoPosition(pid);
          if (closed && !closed.isOpen) {
            totalPnL += closed.pnl ?? 0;
            closedIds.add(pid);
          } else {
            stillOpen++;
          }
        } catch {
          stillOpen++;
        }
      }

      if (stillOpen === 0 && closedIds.size === demoPositionIds.length) {
        setBatchPnL(totalPnL);
        setPositionStatus('closed');
        setTimeRemaining(0);
        setDemoPositionIds([]);
        refreshDemoBalance();
        if (intervalId) clearInterval(intervalId);
      } else {
        setPositionStatus('trading');
        setTimeRemaining(60 - (nowSec % 60));
      }
    };

    poll();
    intervalId = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [demoPositionIds, isDemoMode, refreshDemoBalance]);

  // Fetch MNT balance for the Privy wallet (once per address)
  useEffect(() => {
    const fetchBalance = async () => {
      if (!isConnected || !address) {
        return;
      }
      // If we already have a balance for this address, don't refetch
      if (mntBalance !== null) {
        return;
      }
      setIsBalanceLoading(true);
      try {
        const signer = await getSigner();
        const provider = signer?.provider as BrowserProvider | null;
        if (!provider) {
          return;
        }
        const balance = await provider.getBalance(address);
        setMntBalance(balance);
      } catch (err) {
        console.error('Failed to fetch MNT balance for Privy wallet', err);
      } finally {
        setIsBalanceLoading(false);
      }
    };

    fetchBalance();
  }, [isConnected, address, getSigner, mntBalance]);

  const handleClear = () => {
    clearPrediction();
    setSelectedMinute(null);
    setDebugInfo('');
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
    if (!priceData || priceData.length === 0 || points.length === 0) return;

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

    const commitmentIds: string[] = [];

    if (!isConnected || !address) {
      console.error('wallet not connected; cannot upload predictions or open position');
    } else if (isDemoMode) {
      try {
        const ids: string[] = [];
        const amtPerPos = Math.min(amount, 100);
        for (let i = 0; i < commitmentIds.length; i++) {
          const position = await openDemoPosition({
            userAddress: address,
            amount: amtPerPos,
            leverage,
            predictionCommitmentId: commitmentIds[i],
          });
          if (position) ids.push(position.id);
          else break;
        }
        if (ids.length > 0) {
          setDemoPositionIds(ids);
          setPositionStatus('trading');
          setTimeRemaining(60);
          setBatchPnL(null);
          refreshDemoBalance();
        } else {
          alert('Insufficient demo balance. Click "+1000 demo" to get more.');
        }
      } catch (err) {
        console.error('Demo position failed', err);
        alert(`Error: ${err instanceof Error ? err.message : 'Failed to open demo position'}`);
      }
    } else if (isYellowMode && commitmentIds.length >= 1) {
      try {
        const signer = await getSigner();
        if (!signer) throw new Error('No signer available');
        const valueWei = parseEther(amount.toString());
        const deadline = Math.floor(Date.now() / 1000) + 300;
        const nonce = ++relayerNonceRef.current;
        const signature = await signFundPosition(signer, {
          userAddress: address,
          amountWei: valueWei,
          leverage: Number(leverage),
          commitmentId: commitmentIds[0],
          nonce: BigInt(nonce),
          deadline: BigInt(deadline),
        });
        const result = await openPositionWithYellowBalance({
          userAddress: address,
          amountWei: valueWei.toString(),
          leverage: Number(leverage),
          commitmentId: commitmentIds[0],
          signature,
          nonce,
          deadline,
        });
        setPositionIds([result.positionId]);
        setPositionStatus('trading');
        setTimeRemaining(60);
        setBatchPnL(null);
        refreshYellowDeposit();
      } catch (err) {
        console.error('Yellow balance position failed', err);
        alert(`Error: ${err instanceof Error ? err.message : 'Failed to open position'}`);
      }
    } else if (useRelayer && commitmentIds.length >= 1) {
      try {
        const signer = await getSigner();
        if (!signer) throw new Error('No signer available');
        const valueWei = parseEther(amount.toString());
        const deadline = Math.floor(Date.now() / 1000) + 300;
        const nonce = ++relayerNonceRef.current;
        const signature = await signFundPosition(signer, {
          userAddress: address,
          amountWei: valueWei,
          leverage: Number(leverage),
          commitmentId: commitmentIds[0],
          nonce: BigInt(nonce),
          deadline: BigInt(deadline),
        });
        const result = await fundPositionViaRelayer({
          userAddress: address,
          amountWei: valueWei.toString(),
          leverage: Number(leverage),
          commitmentId: commitmentIds[0],
          signature,
          nonce,
          deadline,
        });
        setPositionIds([result.positionId]);
        setPositionStatus('trading');
        setTimeRemaining(60);
        setBatchPnL(null);
      } catch (err) {
        console.error('Relayer fund position failed', err);
        alert(`Error: ${err instanceof Error ? err.message : 'Relayer failed'}`);
      }
    } else {
      try {
        // For each minute in the selected horizon, create a separate EigenDA
        // commitment containing 60 predictions.
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
    }

    if (commitmentIds.length > 0 && typeof window !== 'undefined' && address) {
      try {
        // Validate inputs
        const lev = Number(leverage);
        if (!Number.isFinite(lev) || lev < 1 || lev > 2500) {
          throw new Error('Leverage must be a number between 1 and 2500');
        }

        const amt = Number(amount);
        if (!Number.isFinite(amt) || amt < 10) {
          throw new Error('Amount must be at least 10 ETH');
        }

        const positionsCount = Math.max(1, offsetMinutes);

        const signer = await getSigner();
        if (!signer) {
          throw new Error('No Privy signer available. Please reconnect your wallet.');
        }

        const contract = new Contract(
          DEFAULT_FUTURES_CONTRACT_ADDRESS,
          LINE_FUTURES_ABI,
          signer,
        );

        // Convert per-position amount to wei
        const valuePerPositionWei = parseEther(amt.toString());

        if (commitmentIds.length === 1) {
          const commitment = commitmentIds[0];
          if (!commitment || commitment.trim().length === 0) {
            throw new Error('Invalid commitment ID: cannot be empty');
          }

          const totalValueWei = valuePerPositionWei;

          console.log('Calling openPosition with:', {
            leverage: lev,
            leverageType: typeof lev,
            commitmentId: commitment,
            commitmentIdLength: commitment.length,
            amount: amt,
            valueInWei: totalValueWei.toString(),
            contractAddress: DEFAULT_FUTURES_CONTRACT_ADDRESS,
          });

          // Estimate gas first to catch any issues early
          try {
            const gasEstimate = await contract.openPosition.estimateGas(
              lev,
              commitment.trim(),
              {
                value: totalValueWei,
              },
            );
            console.log('Gas estimate (openPosition):', gasEstimate.toString());
          } catch (gasErr) {
            console.error('Gas estimation failed:', gasErr);
            throw new Error(
              `Gas estimation failed: ${gasErr instanceof Error ? gasErr.message : String(gasErr)
              }`,
            );
          }

          // Call contract - leverage must be uint16, commitmentId must be non-empty string
          const tx = await contract.openPosition(lev, commitment.trim(), {
            value: totalValueWei,
          });

          console.log('openPosition tx sent:', tx.hash);
          const receipt = await tx.wait();
          console.log('openPosition tx confirmed:', receipt);

          // Try to read PositionOpened from logs to get positionId
          let openedPositionId: number | null = null;
          for (const log of receipt.logs || []) {
            try {
              const parsed = contract.interface.parseLog(log);
              if (parsed?.name === 'PositionOpened') {
                openedPositionId = Number(parsed.args.positionId.toString());
                break;
              }
            } catch {
              // Not our event, ignore
            }
          }

          if (openedPositionId !== null) {
            setPositionIds([openedPositionId]);
            setPositionStatus('trading');
            setTimeRemaining(60);
            setBatchPnL(null);
          }
        } else {
          // Batch open positions: amount is per position, so total value is
          // per-position value multiplied by the number of positions.
          const totalValueWei = valuePerPositionWei * BigInt(positionsCount);

          console.log('Calling batchOpenPositions with:', {
            leverage: lev,
            leverageType: typeof lev,
            commitmentIds,
            commitmentCount: commitmentIds.length,
            amountPerPosition: amt,
            totalValueWei: totalValueWei.toString(),
            contractAddress: DEFAULT_FUTURES_CONTRACT_ADDRESS,
          });

          // Basic validation on commitment IDs
          if (commitmentIds.some((id) => !id || id.trim().length === 0)) {
            throw new Error('Invalid commitment ID in batch: cannot be empty');
          }

          try {
            const gasEstimate = await contract.batchOpenPositions.estimateGas(
              lev,
              commitmentIds.map((id) => id.trim()),
              {
                value: totalValueWei,
              },
            );
            console.log(
              'Gas estimate (batchOpenPositions):',
              gasEstimate.toString(),
            );
          } catch (gasErr) {
            console.error('Gas estimation failed (batch):', gasErr);
            throw new Error(
              `Gas estimation failed (batch): ${gasErr instanceof Error ? gasErr.message : String(gasErr)
              }`,
            );
          }

          const tx = await contract.batchOpenPositions(
            lev,
            commitmentIds.map((id) => id.trim()),
            {
              value: totalValueWei,
            },
          );

          console.log('batchOpenPositions tx sent:', tx.hash);
          const receipt = await tx.wait();
          console.log('batchOpenPositions tx confirmed:', receipt);

          // Collect all opened position IDs from logs for batch tracking
          const openedIds: number[] = [];
          for (const log of receipt.logs || []) {
            try {
              const parsed = contract.interface.parseLog(log);
              if (parsed?.name === 'PositionOpened') {
                openedIds.push(Number(parsed.args.positionId.toString()));
              }
            } catch {
              // Not our event, ignore
            }
          }

          if (openedIds.length > 0) {
            setPositionIds(openedIds);
            setPositionStatus('trading');
            setTimeRemaining(60);
            setBatchPnL(null);
          }
        }
      } catch (err) {
        const message =
          err && typeof err === 'object' && 'message' in err
            ? String((err as { message: unknown }).message)
            : 'Failed to open position on LineFutures';
        console.error('failed to open position on LineFutures', err);
        alert(`Error opening position: ${message}`);
      }
    } else {
      if (commitmentIds.length === 0) {
        console.error('Cannot open position: no commitment IDs');
      }
      if (!address) {
        console.error('Cannot open position: wallet not connected');
      }
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

    setDebugInfo(
      `${offsetMinutes}min window starting @ ${new Date(
        futureStartTime * 1000,
      ).toLocaleTimeString()}`,
    );

    clearPrediction();
    setSelectedMinute(offsetMinutes);

    startDrawing(predictionPoints[0]);
    for (let i = 1; i < predictionPoints.length; i++) {
      addPoint(predictionPoints[i]);
    }
    finishDrawing();
  };

  return (

    <div className="text-white pb-24 relative overflow-hidden">
      {/* Header */}
      <Header
        showStatus={currentPoints.length > 0}
        statusText={selectedMinute ? `+${selectedMinute}m` : undefined}
      />

      <motion.div
        className="relative z-10 px-3 py-4 sm:px-4 sm:py-6 max-w-7xl mx-auto space-y-2"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Token Pair Selector + Yellow Demo Mode */}
        <motion.section
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
            {isConnected && (
              <div className="flex flex-wrap items-center gap-2">
                <motion.button
                  onClick={() => {
                    setIsDemoMode((v) => !v);
                    if (!isDemoMode) setIsYellowMode(false);
                  }}
                  className={`px-3 py-1.5 rounded-lg border-2 text-xs font-bold transition-all ${isDemoMode
                    ? 'bg-[#00E5FF] text-[#000000] border-[#00E5FF]'
                    : 'bg-[#0a0a0a] text-[#00E5FF] border-[#00E5FF]'
                    }`}
                >
                  Demo
                </motion.button>
                <motion.button
                  onClick={() => {
                    setIsYellowMode((v) => !v);
                    if (!isYellowMode) setIsDemoMode(false);
                  }}
                  className={`px-3 py-1.5 rounded-lg border-2 text-xs font-bold transition-all ${isYellowMode
                    ? 'bg-emerald-500 text-[#000000] border-emerald-500'
                    : 'bg-[#0a0a0a] text-emerald-400 border-emerald-500'
                    }`}
                  title="Fund from Yellow, settle on-chain"
                >
                  Yellow
                </motion.button>
                {!isDemoMode && !isYellowMode && (
                  <motion.button
                    onClick={() => setUseRelayer((v) => !v)}
                    className={`px-3 py-1.5 rounded-lg border-2 text-xs font-bold transition-all ${useRelayer
                      ? 'bg-amber-500 text-[#000000] border-amber-500'
                      : 'bg-[#0a0a0a] text-amber-400 border-amber-500'
                      }`}
                  >
                    Relayer
                  </motion.button>
                )}
                {isDemoMode && (
                  <>
                    <span className="text-xs text-white/60">Balance: {demoBalance}</span>
                    <motion.button
                      onClick={() => addDemoFunds(1000)}
                      className="px-3 py-1.5 rounded-lg border-2 border-[#00E5FF] bg-[#0a0a0a] text-[#00E5FF] text-xs font-bold hover:bg-[#00E5FF]/20"
                    >
                      +1000 demo
                    </motion.button>
                  </>
                )}
                {isYellowMode && (
                  <>
                    <span className="text-xs text-white/60">
                      Balance: {yellowDepositLoading ? '...' : depositBalance} ytest.usd
                    </span>
                    <button
                      type="button"
                      onClick={() => depositAddress && navigator.clipboard?.writeText(depositAddress)}
                      className="px-3 py-1.5 rounded-lg border-2 border-emerald-500 bg-[#0a0a0a] text-emerald-400 text-xs font-bold hover:bg-emerald-500/20"
                      title="Copy deposit address"
                    >
                      Deposit to {depositAddress ? `${depositAddress.slice(0, 6)}...` : '...'}
                    </button>
                    <motion.button
                      onClick={() => refreshYellowDeposit()}
                      className="px-2 py-1.5 rounded border border-emerald-500/50 text-emerald-400 text-xs"
                    >
                      Refresh
                    </motion.button>
                  </>
                )}
                <motion.button
                  onClick={() => requestFaucet()}
                  disabled={faucetLoading}
                  className="px-3 py-1.5 rounded-lg border-2 border-amber-500 bg-[#0a0a0a] text-amber-400 text-xs font-bold hover:bg-amber-500/20 disabled:opacity-50"
                >
                  {faucetLoading ? 'Requesting...' : 'Get Yellow test tokens'}
                </motion.button>
                {faucetResult && (
                  <span className={`text-xs ${faucetResult.success ? 'text-emerald-400' : 'text-red-400'}`}>
                    {faucetResult.success ? 'Sent!' : faucetResult.message}
                  </span>
                )}
              </div>
            )}
          </div>
        </motion.section>

        {/* Main Chart Card - Nyan style */}
        <NoiseEffect opacity={0.7} className="">
          <motion.div
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
              />
            </div>
          </motion.div>
        </NoiseEffect>


        {/* Pattern Drawing Box */}
        <NoiseEffect opacity={0.5} className="">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
          >
            <PatternDrawingBox onPatternComplete={handlePatternComplete} amount={amount} leverage={leverage} onAmountChange={function (amount: number): void {
              setAmount(amount);
            }} onLeverageChange={(leverage) => setLeverage(leverage)} />
          </motion.div>
        </NoiseEffect>


        {/* Status Info */}
        <AnimatePresence>
          {(debugInfo || positionStatus !== 'idle') && (
            <motion.div
              className="relative overflow-hidden"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-[#00E5FF]/20 via-[#000000]/20 to-[#00E5FF]/20 animate-pulse" />
              <div className="relative flex flex-col sm:flex-row items-center justify-center gap-2 px-4 py-3 bg-[#0a0a0a]/60 border-2 border-[#00E5FF] rounded-xl">
                <motion.span
                  className="text-lg"
                  animate={{ rotate: [0, 10, -10, 0] }}
                  transition={{ repeat: Infinity, duration: 1 }}
                >
                  🎯
                </motion.span>
                <div className="flex flex-col items-center sm:items-start gap-1">
                  {positionStatus === 'trading' && (
                    <span className="text-sm font-bold text-[#00E5FF]">
                      {['Trading...', 'Future booming...', 'Position active...'][statusMessageIndex]}
                      {timeRemaining !== null && timeRemaining > 0 && (
                        <span className="ml-2 text-xs text-[#00E5FF]/80">
                          ({timeRemaining}s left)
                        </span>
                      )}
                    </span>
                  )}

                  {positionStatus === 'awaiting_settlement' && (
                    <span className="text-sm font-bold text-[#00E5FF]">
                      Awaiting settlement... crunching the future lines
                    </span>
                  )}

                  {positionStatus === 'closed' && batchPnL !== null && (
                    <span
                      className={`text-sm font-bold ${batchPnL >= 0 ? 'text-emerald-300' : 'text-red-300'
                        }`}
                    >
                      PnL:{' '}
                      {batchPnL >= 0 ? '+' : ''}
                      {batchPnL.toFixed(4)} ETH
                    </span>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Bottom Controls */}
      <BottomControls
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        selectedMinute={selectedMinute}
        hasPoints={currentPoints.length > 0}
        onClear={handleClear}
        mntBalance={mntBalance}
        isBalanceLoading={isBalanceLoading}
        isConnected={isConnected}
        batchPnL={batchPnL}
        isDemoMode={isDemoMode}
        demoBalance={demoBalance}
        isYellowMode={isYellowMode}
        yellowDepositBalance={depositBalance}
      />
    </div>

  );
}
