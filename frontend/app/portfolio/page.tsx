'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  WalletIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  SignalIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';
import { Header, Footer, ConnectWalletButton } from '@/components/layout';
import { NoiseEffect } from '@/components/ui/NoiseEffect';
import { usePrivyWallet } from '@/hooks/usePrivyWallet';
import { useYellowClient } from '@/hooks/useYellowClient';
import { useYellowPortfolioBalances } from '@/hooks/useYellowPortfolioBalances';
import { useYellowPortfolioDeposit } from '@/hooks/useYellowPortfolioDeposit';
import { useYellowPortfolioWithdraw } from '@/hooks/useYellowPortfolioWithdraw';
import { formatUsdc, parseUsdc, getBlockExplorerUrl } from '@/lib/yellow/constants';
import { useDepositToYellow, type DepositStep } from '@/hooks/useDepositToYellow';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.2 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

function BalanceCard({
  label,
  amount,
  icon: Icon,
}: {
  label: string;
  amount: bigint;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <motion.div
      variants={itemVariants}
      className="bg-[#0a0a0a] border-2 border-[#00E5FF]/30 rounded-lg p-6 hover:border-[#00E5FF]/60 transition-colors"
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-lg bg-[#00E5FF]/10 flex items-center justify-center">
          <Icon className="w-5 h-5 text-[#00E5FF]" />
        </div>
        <span className="text-sm font-bold text-white/60 uppercase tracking-wider">
          {label}
        </span>
      </div>
      <p className="text-3xl font-bold text-[#00E5FF] font-mono">
        {formatUsdc(amount)}
      </p>
      <p className="text-xs text-white/40 mt-1">USDC</p>
    </motion.div>
  );
}

function ActionCard({
  title,
  icon: Icon,
  maxAmount,
  onSubmit,
  isSubmitting,
  txHash,
  error,
  onReset,
  buttonLabel,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  maxAmount: bigint;
  onSubmit: (amount: bigint) => Promise<void>;
  isSubmitting: boolean;
  txHash: string | null;
  error: string | null;
  onReset: () => void;
  buttonLabel: string;
}) {
  const [inputValue, setInputValue] = useState('');

  const handleMax = () => {
    setInputValue(formatUsdc(maxAmount));
  };

  const handleSubmit = async () => {
    const amount = parseUsdc(inputValue);
    if (amount <= 0n) return;
    try {
      await onSubmit(amount);
      setInputValue('');
    } catch {
      // error is already set in the hook
    }
  };

  const explorerUrl = getBlockExplorerUrl();

  return (
    <motion.div
      variants={itemVariants}
      className="bg-[#0a0a0a] border-2 border-[#00E5FF]/30 rounded-lg p-6"
    >
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-lg bg-[#00E5FF]/10 flex items-center justify-center">
          <Icon className="w-5 h-5 text-[#00E5FF]" />
        </div>
        <h3 className="text-lg font-bold text-white uppercase tracking-wider">
          {title}
        </h3>
      </div>

      <div className="space-y-4">
        {/* Amount input */}
        <div className="relative">
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={inputValue}
            onChange={(e) => {
              onReset();
              setInputValue(e.target.value.replace(/[^0-9.]/g, ''));
            }}
            disabled={isSubmitting}
            className="w-full bg-black border-2 border-[#00E5FF]/30 rounded-lg px-4 py-3 text-white font-mono text-lg focus:border-[#00E5FF] focus:outline-none disabled:opacity-50 transition-colors"
          />
          <button
            type="button"
            onClick={handleMax}
            disabled={isSubmitting}
            className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-1 text-xs font-bold text-[#00E5FF] border border-[#00E5FF]/50 rounded hover:bg-[#00E5FF]/10 disabled:opacity-50 transition-colors"
          >
            MAX
          </button>
        </div>

        {/* Submit button */}
        <motion.button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting || !inputValue || parseUsdc(inputValue) <= 0n}
          className="w-full py-3 bg-[#00E5FF] text-black font-bold uppercase tracking-wider rounded-lg border-2 border-black shadow-[4px_4px_0_0_#000] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          whileHover={
            !isSubmitting
              ? { x: -2, y: -2, boxShadow: '6px 6px 0 0 #000' }
              : {}
          }
          whileTap={
            !isSubmitting
              ? { x: 2, y: 2, boxShadow: '2px 2px 0 0 #000' }
              : {}
          }
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <motion.span
                className="inline-block w-4 h-4 border-2 border-black border-t-transparent rounded-full"
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
              />
              Processing...
            </span>
          ) : (
            buttonLabel
          )}
        </motion.button>

        {/* Tx hash */}
        <AnimatePresence>
          {txHash && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="text-sm"
            >
              <span className="text-white/60">Tx: </span>
              <a
                href={`${explorerUrl}/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#00E5FF] hover:underline font-mono text-xs break-all"
              >
                {txHash.slice(0, 10)}...{txHash.slice(-8)}
              </a>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-2 text-sm text-red-400"
            >
              <ExclamationCircleIcon className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function StepIndicator({ step }: { step: DepositStep }) {
  return (
    <div className="flex items-center gap-3 py-2">
      {step.status === 'pending' && (
        <div className="w-5 h-5 rounded-full border-2 border-white/20" />
      )}
      {step.status === 'active' && (
        <motion.div
          className="w-5 h-5 border-2 border-[#00E5FF] border-t-transparent rounded-full"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
        />
      )}
      {step.status === 'complete' && (
        <CheckCircleIcon className="w-5 h-5 text-green-400" />
      )}
      {step.status === 'error' && (
        <XCircleIcon className="w-5 h-5 text-red-400" />
      )}
      <span className={`text-sm ${
        step.status === 'active' ? 'text-[#00E5FF]' :
        step.status === 'complete' ? 'text-green-400' :
        step.status === 'error' ? 'text-red-400' :
        'text-white/40'
      }`}>
        {step.label}
        {step.txHash && (
          <span className="ml-2 font-mono text-xs text-white/30">
            {step.txHash.slice(0, 8)}...
          </span>
        )}
      </span>
    </div>
  );
}

function FundYellowCard({ maxAmount }: { maxAmount: bigint }) {
  const [inputValue, setInputValue] = useState('');
  const { execute, steps, isRunning, error, reset } = useDepositToYellow();

  const handleMax = () => setInputValue(formatUsdc(maxAmount));

  const handleSubmit = async () => {
    const parsed = parseUsdc(inputValue);
    if (parsed <= 0n) return;
    // Convert to human-readable for backend
    const humanAmount = (Number(parsed) / 1e6).toString();
    await execute(humanAmount);
  };

  const allDone = steps.every((s) => s.status === 'complete');

  return (
    <motion.div
      variants={itemVariants}
      className="bg-[#0a0a0a] border-2 border-[#00E5FF]/30 rounded-lg p-6 col-span-full"
    >
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-lg bg-[#00E5FF]/10 flex items-center justify-center">
          <ArrowDownTrayIcon className="w-5 h-5 text-[#00E5FF]" />
        </div>
        <h3 className="text-lg font-bold text-white uppercase tracking-wider">
          Fund Yellow Balance
        </h3>
      </div>

      {!isRunning && !allDone && (
        <div className="space-y-4">
          <div className="relative">
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={inputValue}
              onChange={(e) => {
                reset();
                setInputValue(e.target.value.replace(/[^0-9.]/g, ''));
              }}
              className="w-full bg-black border-2 border-[#00E5FF]/30 rounded-lg px-4 py-3 text-white font-mono text-lg focus:border-[#00E5FF] focus:outline-none transition-colors"
            />
            <button
              type="button"
              onClick={handleMax}
              className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-1 text-xs font-bold text-[#00E5FF] border border-[#00E5FF]/50 rounded hover:bg-[#00E5FF]/10 transition-colors"
            >
              MAX
            </button>
          </div>
          <motion.button
            type="button"
            onClick={handleSubmit}
            disabled={!inputValue || parseUsdc(inputValue) <= 0n}
            className="w-full py-3 bg-[#00E5FF] text-black font-bold uppercase tracking-wider rounded-lg border-2 border-black shadow-[4px_4px_0_0_#000] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            whileHover={{ x: -2, y: -2, boxShadow: '6px 6px 0 0 #000' }}
            whileTap={{ x: 2, y: 2, boxShadow: '2px 2px 0 0 #000' }}
          >
            Fund Yellow Balance
          </motion.button>
        </div>
      )}

      {(isRunning || allDone) && (
        <div className="space-y-1">
          {steps.map((step) => (
            <StepIndicator key={step.id} step={step} />
          ))}
          {allDone && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-green-400 text-sm mt-3 font-bold"
            >
              Balance available for trading!
            </motion.p>
          )}
        </div>
      )}

      {error && (
        <div className="mt-3 flex items-center gap-2 text-sm text-red-400">
          <ExclamationCircleIcon className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={reset} className="ml-auto text-xs underline text-white/40 hover:text-white/60">
            Reset
          </button>
        </div>
      )}
    </motion.div>
  );
}

export default function PortfolioPage() {
  const { ready, authenticated, isWalletLoading } = usePrivyWallet();
  const isAuthed = ready && authenticated && !isWalletLoading;

  const {
    isConnected,
    isConnecting,
    error: connectionError,
  } = useYellowClient();
  const {
    walletBalance,
    offchainBalance,
    refresh,
  } = useYellowPortfolioBalances();
  const {
    deposit,
    isDepositing,
    txHash: depositTxHash,
    error: depositError,
    reset: resetDeposit,
  } = useYellowPortfolioDeposit();
  const {
    withdraw,
    isWithdrawing,
    txHash: withdrawTxHash,
    error: withdrawError,
    reset: resetWithdraw,
  } = useYellowPortfolioWithdraw();

  const handleDeposit = async (amount: bigint) => {
    await deposit(amount);
    refresh();
  };

  const handleWithdraw = async (amount: bigint) => {
    await withdraw(amount);
    refresh();
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <NoiseEffect opacity={0.6} className="flex-1 px-4 py-10">
        <div className="max-w-4xl mx-auto">
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {/* Title */}
            <motion.h1
              variants={itemVariants}
              className="flex items-center justify-start gap-3 text-4xl md:text-6xl font-melodrame font-medium text-[#00E5FF] mb-8"
              style={{ textShadow: '4px 4px 0 #000000' }}
            >
              Portfolio
            </motion.h1>

            {/* Not authenticated */}
            {!isAuthed && (
              <motion.div
                variants={itemVariants}
                className="flex flex-col items-center justify-center gap-6 py-20"
              >
                <WalletIcon className="w-16 h-16 text-[#00E5FF]/40" />
                <p className="text-white/60 text-lg">
                  Connect your wallet to manage your portfolio
                </p>
                <ConnectWalletButton />
              </motion.div>
            )}

            {/* Authenticated — always show portfolio UI */}
            {isAuthed && (
              <>
                {/* ClearNode status banner */}
                {(isConnecting || (!isConnected && !connectionError)) && (
                  <motion.div
                    variants={itemVariants}
                    className="flex items-center gap-3 mb-6 px-4 py-3 bg-[#00E5FF]/10 border border-[#00E5FF]/30 rounded-lg"
                  >
                    <motion.div
                      className="w-4 h-4 border-2 border-[#00E5FF]/30 border-t-[#00E5FF] rounded-full flex-shrink-0"
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                    />
                    <span className="text-sm text-white/60">Connecting to ClearNode...</span>
                  </motion.div>
                )}
                {connectionError && (
                  <motion.div
                    variants={itemVariants}
                    className="flex items-center gap-3 mb-6 px-4 py-3 bg-red-400/10 border border-red-400/30 rounded-lg"
                  >
                    <ExclamationCircleIcon className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <span className="text-sm text-red-400">ClearNode: {connectionError}</span>
                  </motion.div>
                )}

                {/* Balance cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                  <BalanceCard
                    label="Wallet USDC"
                    amount={walletBalance}
                    icon={WalletIcon}
                  />
                  <BalanceCard
                    label="Off-chain Balance"
                    amount={offchainBalance}
                    icon={SignalIcon}
                  />
                </div>

                {/* Fund Yellow Balance */}
                <div className="grid grid-cols-1 gap-4 mb-8">
                  <FundYellowCard maxAmount={walletBalance} />
                </div>

                {/* Deposit / Withdraw */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                  <ActionCard
                    title="Deposit"
                    icon={ArrowDownTrayIcon}
                    maxAmount={walletBalance}
                    onSubmit={handleDeposit}
                    isSubmitting={isDepositing}
                    txHash={depositTxHash}
                    error={depositError}
                    onReset={resetDeposit}
                    buttonLabel="Deposit USDC"
                  />
                  <ActionCard
                    title="Withdraw"
                    icon={ArrowUpTrayIcon}
                    maxAmount={offchainBalance}
                    onSubmit={handleWithdraw}
                    isSubmitting={isWithdrawing}
                    txHash={withdrawTxHash}
                    error={withdrawError}
                    onReset={resetWithdraw}
                    buttonLabel="Withdraw USDC"
                  />
                </div>

                {/* Connection status */}
                <motion.div
                  variants={itemVariants}
                  className="flex items-center gap-2 text-xs text-white/40"
                >
                  <motion.div
                    className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-yellow-400'}`}
                    animate={{ opacity: [1, 0.5, 1] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                  />
                  <span>{isConnected ? 'Connected to ClearNode' : 'ClearNode disconnected'}</span>
                </motion.div>
              </>
            )}
          </motion.div>
        </div>
      </NoiseEffect>

      <Footer />
    </div>
  );
}
