'use client';

import { motion } from "framer-motion";
import {
  PencilSquareIcon,
  BoltIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";
import { Header, Footer } from "@/components/layout";
import { WaitlistForm } from "@/components/waitlist/WaitlistForm";
import { PitchChartVisual } from "@/components/landing/PitchChartVisual";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.2,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.4, 0, 0.2, 1] as const },
  },
};

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="relative flex flex-col min-h-screen">
        <Header />



        {/* Content overlay */}
        <div className="relative z-10 flex-1">
          {/* Hero Section */}
          <section className="relative flex min-h-[70vh] flex-col md:flex-row items-center justify-center px-4 sm:px-8 md:px-14 py-8 md:py-12 text-start gap-8 md:gap-0 overflow-hidden">
            {/* Cyan gradient radial - light, bottom */}
            <div
              className="absolute inset-x-0 bottom-0 h-2/3 pointer-events-none z-1"
              aria-hidden="true"
              style={{
                background: 'radial-gradient(ellipse 100% 80% at 50% 100%, rgba(0, 229, 255, 0.12) 0%, transparent 65%)',
              }}
            />
            <motion.div
              className="max-w-3xl z-10 space-y-4 md:space-y-6 w-full md:w-auto"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
            >
              <motion.div
                className="flex flex-col sm:flex-row items-center sm:items-start gap-4 mb-2"
              >
                <motion.h1
                  className="text-4xl md:text-9xl font-melodrame font-medium text-[#00E5FF] text-center sm:text-left"
                  style={{ textShadow: '4px 4px 0 #000000' }}
                  variants={itemVariants}
                >
                  Draw.Fi
                </motion.h1>
              </motion.div>
              <motion.p
                className="text-lg sm:text-xl md:text-2xl font-bold text-white drop-shadow-md text-center md:text-left"
                variants={itemVariants}
              >
                For everyone who reads charts but won&apos;t touch an order book.{" "}
                <span className="text-[#00E5FF]">Draw your curve. Get scored in 60 seconds.</span>
              </motion.p>

              <motion.p
                className="text-sm sm:text-base md:text-md leading-relaxed text-white/80 text-center md:text-left max-w-xl mx-auto md:mx-0"
                variants={itemVariants}
              >
                DrawFi turns your sketch into a position: live BTC (and more) charts, micro-stakes from about $0.10, and leverage up to 2500x—settled against real price, no liquidations maze. Built on Base with Yellow Network for gasless opens (EIP-712 signatures, off-chain USDC balance)—so you deposit once and keep drawing.
              </motion.p>

              <motion.p
                className="text-xs sm:text-sm text-[#00E5FF]/90 text-center md:text-left font-medium tracking-wide uppercase"
                variants={itemVariants}
              >
                Live on Base · Yellow Network · Leaderboard &amp; history
              </motion.p>

              <motion.div
                className="flex flex-col items-start justify-start gap-3 sm:gap-4 pt-2 w-full md:w-auto"
                variants={itemVariants}
              >
                <motion.div
                  whileHover={{ scale: 1.05, x: -2, y: -2 }}
                  whileTap={{ scale: 0.95, x: 2, y: 2 }}
                  className="w-auto"
                >
                  <a
                    href="#waitlist"
                    className="inline-block w-auto text-center px-6 sm:px-8 py-3 sm:py-4 text-base sm:text-lg font-bold text-[#00E5FF] bg-[#000000] border-4 border-[#00E5FF] rounded-xl shadow-[6px_6px_0_0_#000000] transition-all hover:shadow-[8px_8px_0_0_#000000]"
                  >
                    Join waitlist
                  </a>
                </motion.div>
              </motion.div>
            </motion.div>

            <motion.div
              className="w-full z-0 md:w-auto md:max-w-[min(100%,520px)] flex justify-center md:justify-end md:flex-1"
              animate={{
                y: [-10, 10, -10],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: [0.4, 0, 0.6, 1],
              }}
            >
              <div className="w-full max-w-[500px] rounded-2xl border border-[#00E5FF]/20 bg-[#00E5FF]/4 p-4 sm:p-5 shadow-[0_0_60px_-12px_rgba(0,229,255,0.25)]">
                <PitchChartVisual
                  svgClassName="w-full h-[200px] sm:h-[240px] md:h-[260px]"
                />
              </div>
            </motion.div>
          </section>

          {/* Why + problem / solution (conversion strip) */}
          <section className="relative px-4 py-10 sm:py-12 md:py-14 bg-[#000000]/40 border-y border-[#00E5FF]/30">
            <motion.div
              className="mx-auto max-w-4xl text-center space-y-4"
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <h2 className="font-melodrame text-2xl sm:text-3xl md:text-4xl text-[#00E5FF]" style={{ textShadow: "3px 3px 0 #000000" }}>
                Why DrawFi exists
              </h2>
              <p className="text-sm sm:text-base text-white/85 leading-relaxed">
                Most perp tools are built for desks, not humans—order books, margin, and gas keep chart-literate users on the sidelines. DrawFi sits between heavy DEXs and binary prediction markets: express direction by drawing, stake small, and get a clear win/loss from real price in one minute.
              </p>
            </motion.div>
          </section>

          {/* How It Works Section */}
          <section className="max-w-7xl mx-auto relative bg-[#0a0a0a]/80 backdrop-blur-xl py-12 sm:py-16 md:py-24 px-4 border-y border-[#00E5FF]">
            <motion.div
              className="mx-auto max-w-6xl"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <motion.h2
                className="text-center font-melodrame text-4xl md:text-6xl font-medium text-[#00E5FF] mb-3 sm:mb-4 md:mb-6 px-4"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                style={{ textShadow: '4px 4px 0 #000000' }}
              >
                How it works
              </motion.h2>
              <p className="text-center text-sm sm:text-base text-white/70 max-w-2xl mx-auto mb-8 sm:mb-10 md:mb-12 px-4">
                Three steps from sketch to settlement—no order tickets, no gas on every open.
              </p>

              <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                {[
                  {
                    num: "1",
                    title: "Draw on the live chart",
                    desc: "Open Predict, watch the candle stream (e.g. from Bybit), and trace where you think price goes before the window ends. Your line is your conviction—no bids and asks.",
                    Icon: PencilSquareIcon,
                  },
                  {
                    num: "2",
                    title: "Stake and sign (gasless)",
                    desc: "Choose stake and leverage. Yellow Network keeps USDC in custody on Base; you sign EIP-712 messages so opens can run without a gas popup. Micro-positions stay economical.",
                    Icon: BoltIcon,
                  },
                  {
                    num: "3",
                    title: "Settle in 60 seconds",
                    desc: "We score dozens of directional checks against real ticks. Above about 50% accuracy you are in the green; below, you are not—simple, fast, and tied to actual market movement.",
                    Icon: ClockIcon,
                  },
                ].map((item, i) => {
                  const Icon = item.Icon;
                  return (
                    <motion.div
                      key={item.num}
                      className="relative p-6 sm:p-8 bg-[#000000]/60 border-4 border-[#00E5FF] rounded-2xl shadow-[6px_6px_0_0_#00E5FF]"
                      initial={{ opacity: 0, y: 30 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.15 }}
                      whileHover={{
                        scale: 1.02,
                        x: -4,
                        y: -4,
                        boxShadow: '10px 10px 0 0 #00E5FF'
                      }}
                    >
                      <div className="flex items-center gap-3 mb-4">
                        <Icon className="h-12 w-12 sm:h-14 sm:w-14 md:h-16 md:w-16 text-[#00E5FF]" aria-hidden />
                      </div>
                      <h3 className="mb-3 sm:mb-4 text-lg sm:text-xl font-bold text-[#00E5FF]">{item.title}</h3>
                      <p className="text-sm sm:text-base text-white/80">
                        {item.desc}
                      </p>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          </section>

          {/* CTA Section */}
          <section className="relative overflow-hidden py-12 sm:py-16 md:py-24 px-4 bg-[#0a0a0a]/80">
            <motion.div
              className="relative z-10 mx-auto max-w-3xl text-center"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <motion.h2
                className="mb-2 text-4xl md:text-6xl font-melodrame font-medium text-[#00E5FF] px-4"
                style={{ textShadow: '4px 4px 0 #000000' }}
              >
                Join the waitlist
              </motion.h2>
              <p className="mb-8 sm:mb-12 max-w-xl mx-auto text-base sm:text-lg md:text-xl text-white/80 px-4">
                We&apos;re opening access in waves. Join the waitlist and we&apos;ll let you know when you can draw and play.
              </p>
              <motion.div
                whileHover={{ scale: 1.05, x: -3, y: -3 }}
                whileTap={{ scale: 0.95, x: 3, y: 3 }}
                className="px-4"
              >
                <WaitlistForm />
              </motion.div>
            </motion.div>
          </section>

        </div>

        {/* Footer */}
        <div className="relative z-10">
          <Footer showNavLinks={false} />
        </div>
      </div>
    </div>
  );
}
