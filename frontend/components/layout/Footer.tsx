'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';

interface FooterProps {
  /** When false, hide in-app route links (e.g. marketing landing). */
  showNavLinks?: boolean;
}

export function Footer({ showNavLinks = true }: FooterProps) {
  return (
    <motion.footer
      className="relative bg-[#000000] border-t-4 border-[#00E5FF] py-8 mt-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.5 }}
    >
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Logo and branding */}
          <div className="flex items-center gap-3">
            <div className="overflow-hidden rounded-lg bg-black">
              <Image
                src="/slides/draw-fi-logo.png"
                alt="Draw-Fi"
                width={48}
                height={48}
                className="h-10 w-10 object-cover"
              />
            </div>
            <div>
              <h3 className="font-melodrame text-xl font-medium text-[#00E5FF]">DrawFi</h3>
              <p className="text-[#00E5FF]/60 text-xs">Draw Your Futures</p>
            </div>
          </div>

          {/* Links */}
          {showNavLinks ? (
            <div className="flex items-center gap-6">
              <Link
                href="/"
                className="text-[#00E5FF]/80 hover:text-[#00E5FF] text-sm font-semibold transition-colors"
              >
                Home
              </Link>
              <Link
                href="/predict"
                className="text-[#00E5FF]/80 hover:text-[#00E5FF] text-sm font-semibold transition-colors"
              >
                Predict
              </Link>
              <Link
                href="/open-position"
                className="text-[#00E5FF]/80 hover:text-[#00E5FF] text-sm font-semibold transition-colors"
              >
                Positions
              </Link>
              <Link
                href="/pitch"
                className="text-[#00E5FF]/80 hover:text-[#00E5FF] text-sm font-semibold transition-colors"
              >
                Pitch
              </Link>
            </div>
          ) : null}

          {/* Built with love */}
          <div className="text-[#00E5FF]/60 text-xs">
            Built with 🐱 on Ethereum
          </div>
        </div>
      </div>
    </motion.footer>
  );
}
