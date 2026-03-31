'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { QuestionMarkCircleIcon } from '@heroicons/react/24/outline';
import { useNextStep } from 'nextstepjs';
import { predictTourId } from '@/lib/onboarding/predictTourSteps';
import { ConnectWalletButton } from './ConnectWalletButton';

interface HeaderProps {
  showStatus?: boolean;
  statusText?: string;
}

export function Header({ showStatus, statusText }: HeaderProps) {
  const pathname = usePathname();
  const { startNextStep } = useNextStep();
  const isPredictPage = pathname === '/predict';

  return (
    <>
      <header className="fixed inset-x-0 top-3 z-50 w-full">
        <motion.div
          className="max-w-7xl mx-auto py-2 rounded-lg backdrop-blur-xl bg-[#00E5FF]/20 shadow-[0_4px_0_0_#0a0a0a]"
          initial={{ y: -100 }}
          animate={{ y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        >
          <div className="px-3">
            <div className="flex items-center justify-between gap-3">
              {/* Logo */}
              <Link href="/" className="flex items-center gap-3 group">
                <motion.div
                  className="relative"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <div className="absolute inset-0 rounded-lg bg-[#00E5FF]/40 blur-lg opacity-60 group-hover:opacity-100 transition-opacity" />
                  <div className="relative overflow-hidden rounded-lg bg-black">
                    <Image
                      src="/slides/draw-fi-logo.png"
                      alt="Draw-Fi"
                      width={48}
                      height={48}
                      className="h-10 w-10 sm:h-11 sm:w-11 object-cover"
                      priority
                    />
                  </div>
                </motion.div>
                <div className="flex flex-col">
                  <motion.h1
                    className="relative font-melodrame text-3xl font-medium text-white"
                    whileHover={{ scale: 1.02 }}
                  >
                    Draw.Fi
                  </motion.h1>
                  <span className="text-[10px] -mt-2 text-white uppercase">
                    Futures, Trade, Play
                  </span>
                </div>
              </Link>

              {/* Navigation */}
              <nav className="hidden sm:flex items-center md:gap-10 gap-4">
                <Link href="/predict" className=" text-sm text-white/80 hover:text-cyan-500 transition-colors">
                  Play
                </Link>
                <Link href="/leaderboard" className=" text-sm text-white/80 hover:text-cyan-500 transition-colors">
                  Leaderboard
                </Link>
                <Link href="/history" className=" text-sm text-white/80 hover:text-cyan-500 transition-colors">
                  History
                </Link>
                <Link href="/pitch" className=" text-sm text-white/80 hover:text-cyan-500 transition-colors">
                  Pitch
                </Link>
                <Link href="/portfolio" className=" text-sm text-white/80 hover:text-cyan-500 transition-colors">
                  Portfolio
                </Link>
              </nav>

              {/* Right side */}
              <div className="flex items-center gap-2 sm:gap-3">
                {isPredictPage && (
                  <motion.button
                    type="button"
                    onClick={() => startNextStep(predictTourId)}
                    className="p-2 rounded-lg border-2 border-white text-white/80 hover:text-white hover:bg-black/10 transition-colors"
                    aria-label="Show onboarding tour"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <QuestionMarkCircleIcon className="w-6 h-6" />
                  </motion.button>
                )}
                <ConnectWalletButton />

                {/* Status badge */}
                {showStatus && statusText && (
                  <motion.div
                    className="flex items-center gap-2 px-3 py-1.5 bg-[#00E5FF]/20 border-2 border-[#00E5FF] rounded-full"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 500 }}
                  >
                    <motion.div
                      className="w-2 h-2 rounded-full bg-[#00E5FF]"
                      animate={{
                        scale: [1, 1.2, 1],
                        opacity: [1, 0.7, 1]
                      }}
                      transition={{ repeat: Infinity, duration: 1 }}
                    />
                    <span className="text-xs font-bold text-[#00E5FF]">
                      {statusText}
                    </span>
                  </motion.div>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </header>
      {/* Reserve layout height (py-2 + logo / title row) */}
      <div className="h-[68px] w-full shrink-0 sm:h-[72px]" aria-hidden />
    </>
  );
}
