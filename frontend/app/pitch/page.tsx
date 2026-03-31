'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';

const SLIDES = [
  'title',
  'problem',
  'why-now-img',
  'why-now',
  'product',
  'product-img',
  'tech-arch-flow',
  'demo',
  'walkthrough-vid',
  'features-img',
  'market',
  'traction',
  'team',
] as const;

const SLIDE_LABELS = [
  'Title',
  'The Pain',
  'Why Now',
  'Why Now',
  'Product',
  'Product',
  'Arch flow',
  'Demo',
  'Walkthrough',
  'Features',
  'Market',
  'Traction',
  'Team',
];

type ArchBox = { x: number; y: number; w: number; h: number };

function archAnchor(b: ArchBox, side: 'n' | 's' | 'e' | 'w'): [number, number] {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  if (side === 'n') return [cx, b.y];
  if (side === 's') return [cx, b.y + b.h];
  if (side === 'e') return [b.x + b.w, cy];
  return [b.x, cy];
}

const demoFlowIconClass = 'w-6 h-6 text-[#00E5FF]/55 shrink-0 mt-0.5';

function DemoFlowStepIcon({ kind }: { kind: 'chart' | 'draw' | 'stake' | 'sign' | 'chain' | 'settle' | 'payout' }) {
  const cls = demoFlowIconClass;
  switch (kind) {
    case 'chart':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v4.125c0 .621-.504 1.125-1.125 1.125h-2.25A1.125 1.125 0 013 17.25v-4.125zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v8.625c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v13.125c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
      );
    case 'draw':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
        </svg>
      );
    case 'stake':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
        </svg>
      );
    case 'sign':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      );
    case 'chain':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
        </svg>
      );
    case 'settle':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'payout':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.001 1.453-.448V18.48c0-.548-.274-.843-.609-1.088a48.151 48.151 0 00-5.399-2.28 48.52 48.52 0 00-4.783-1.355c-.627-.087-1.258-.03-1.875.156M2.25 18.75v1.5c0 .414.336.75.75.75h15.75a.75.75 0 00.75-.75v-1.5m-16.5-1.875v-11.25c0-.621.504-1.125 1.125-1.125h4.125c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-4.125a1.125 1.125 0 01-1.125-1.125z" />
        </svg>
      );
    default:
      return null;
  }
}

/** Single-SVG layout: boxes and paths share one coordinate system so edges align. */
function AnimatedArchitectureDiagram({ isPrinting }: { isPrinting: boolean }) {
  const pathMotion = isPrinting
    ? { pathLength: 1, opacity: 1 }
    : { pathLength: 0, opacity: 1 };
  const pathTransition = (delay: number, duration = 0.75) =>
    isPrinting
      ? { duration: 0 }
      : { pathLength: { delay, duration, ease: [0.4, 0, 0.2, 1] as const } };

  // Compact grid (viewBox 1000×560): tightened spacing for cleaner composition
  const user: ArchBox = { x: 120, y: 220, w: 240, h: 60 };
  const bybit: ArchBox = { x: 150, y: 80, w: 240, h: 60 };
  const master: ArchBox = { x: 460, y: 80, w: 240, h: 60 };
  const eigen: ArchBox = { x: 800, y: 80, w: 240, h: 60 };
  const yellow: ArchBox = { x: 442, y: 220, w: 240, h: 60 };
  const frontend: ArchBox = { x: 360, y: 360, w: 240, h: 60 };
  const line: ArchBox = { x: 676, y: 360, w: 240, h: 60 };

  const uE = archAnchor(user, 'e');
  const byS = archAnchor(bybit, 's');
  const maW = archAnchor(master, 'w');
  const maS = archAnchor(master, 's');
  const maE = archAnchor(master, 'e');
  const eiW = archAnchor(eigen, 'w');
  const yeW = archAnchor(yellow, 'w');
  const yeN = archAnchor(yellow, 'n');
  const yeS = archAnchor(yellow, 's');
  const feN = archAnchor(frontend, 'n');
  const feW = archAnchor(frontend, 'w');
  const feE = archAnchor(frontend, 'e');
  const liW = archAnchor(line, 'w');
  const liN = archAnchor(line, 'n');

  // Straight orthogonal connectors; rounded corners come from strokeLinejoin="round".
  const orthoHV = (a: [number, number], b: [number, number], xMid?: number) => {
    const [ax, ay] = a;
    const [bx, by] = b;
    const mx = xMid ?? (ax + bx) / 2;
    return `M ${ax} ${ay} L ${mx} ${ay} L ${mx} ${by} L ${bx} ${by}`;
  };

  const orthoVH = (a: [number, number], b: [number, number], yMid?: number) => {
    const [ax, ay] = a;
    const [bx, by] = b;
    const my = yMid ?? (ay + by) / 2;
    return `M ${ax} ${ay} L ${ax} ${my} L ${bx} ${my} L ${bx} ${by}`;
  };

  const paths: { d: string; stroke: string; dashed?: boolean; delay: number }[] = [
    // User → Frontend
    { d: orthoHV(uE, feN, 322), stroke: 'rgba(255,255,255,0.42)', delay: 0.04 },
    // User → Yellow
    { d: `M ${uE[0]} ${uE[1]} L ${yeW[0]} ${yeW[1]}`, stroke: 'rgba(255,255,255,0.42)', delay: 0.1 },
    // Bybit → Master
    { d: orthoVH(byS, maW, 152), stroke: 'rgba(255,255,255,0.38)', delay: 0.16 },
    // Master → Eigen
    { d: `M ${maE[0]} ${maE[1]} L ${eiW[0]} ${eiW[1]}`, stroke: 'rgba(255,255,255,0.38)', delay: 0.22 },
    // Eigen → Master (return, parallel offset)
    {
      d: `M ${eiW[0]} ${eiW[1] + 9} L ${maE[0]} ${maE[1] + 9}`,
      stroke: 'rgba(255,255,255,0.28)',
      delay: 0.28,
    },
    // Master → Yellow
    { d: orthoVH(maS, yeN, 188), stroke: 'rgba(255,255,255,0.42)', delay: 0.34 },
    // Master → LineFutures
    { d: orthoVH(maS, liN, 240), stroke: 'rgba(255,255,255,0.42)', delay: 0.4 },
    // Yellow → Frontend
    { d: orthoHV(yeS, feN, 548), stroke: 'rgba(0,229,255,0.45)', delay: 0.46 },
    // Frontend → Yellow
    { d: orthoVH(feW, yeW, 316), stroke: 'rgba(0,229,255,0.32)', delay: 0.52 },
    // Frontend -.-> LineFutures
    {
      d: `M ${feE[0]} ${feE[1]} L ${liW[0]} ${liW[1]}`,
      stroke: 'rgba(255,255,255,0.35)',
      dashed: true,
      delay: 0.58,
    },
  ];

  const nodes: {
    box: ArchBox;
    label: string;
    sub?: string;
    logo?: string;
    accent: 'blue' | 'muted' | 'yellow' | 'green';
  }[] = [
      { box: user, label: 'User draws prediction', accent: 'blue' },
      { box: bybit, label: 'Bybit WebSocket', sub: 'Live marks', logo: '/Bybit%20Logo.jpg', accent: 'muted' },
      { box: master, label: 'DrawFi Master Service', sub: 'Orchestration', accent: 'muted' },
      { box: eigen, label: 'DrawFi.Store / EigenDA', sub: 'Availability', accent: 'muted' },
      { box: yellow, label: 'Yellow off-chain ledger', sub: 'Balances & channels', logo: '/yellow-network.jpeg', accent: 'yellow' },
      { box: frontend, label: 'Draw-Fi frontend', sub: 'Next.js + signing', accent: 'blue' },
      { box: line, label: 'LineFutures contract', sub: 'Base L2', accent: 'green' },
    ];

  const fillFor = (a: (typeof nodes)[0]['accent']) => {
    if (a === 'yellow') return 'rgba(26,21,16,0.95)';
    if (a === 'blue') return 'rgba(12, 35, 55, 0.92)';
    if (a === 'green') return 'rgba(6, 40, 28, 0.92)';
    return 'rgba(39, 39, 42, 0.92)';
  };

  const strokeFor = (a: (typeof nodes)[0]['accent']) => {
    if (a === 'yellow') return 'rgba(251, 191, 36, 0.85)';
    if (a === 'blue') return 'rgba(56, 189, 248, 0.45)';
    if (a === 'green') return 'rgba(52, 211, 153, 0.5)';
    return 'rgba(255,255,255,0.14)';
  };

  const strokeW = (a: (typeof nodes)[0]['accent']) => (a === 'yellow' ? 2.5 : 1.25);

  return (
    <div className="w-full max-w-[min(100%,1100px)] mx-auto">
      <div className="relative rounded-2xl   overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none opacity-50"
        // style={{
        //   background:
        //     'radial-gradient(ellipse 65% 55% at 50% 42%, rgba(0,229,255,0.05) 0%, transparent 60%)',
        // }}
        />
        <div className="relative w-full overflow-x-auto">
          <svg
            className="mx-auto block h-auto w-full min-w-[520px]   max-h-[min(58vh,400px)]"
            viewBox="0 0 1000 560"
            fill="none"
            role="img"
            aria-label="DrawFi system architecture flow diagram"
          >
            <defs>
              <marker
                id="arch-arrow"
                markerWidth="7"
                markerHeight="7"
                refX="6"
                refY="3.5"
                orient="auto"
              >
                <path d="M0,0 L7,3.5 L0,7 Z" fill="rgba(255,255,255,0.5)" />
              </marker>
            </defs>

            {paths.map((p, i) => (
              <motion.path
                key={i}
                d={p.d}
                stroke={p.stroke}
                strokeWidth={p.dashed ? 1.75 : 2}
                strokeDasharray={p.dashed ? '7 9' : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                markerEnd="url(#arch-arrow)"
                initial={pathMotion}
                whileInView={isPrinting ? undefined : { pathLength: 1 }}
                viewport={{ once: true, amount: 0.35 }}
                transition={pathTransition(p.delay)}
              />
            ))}

            {nodes.map((n, i) => {
              const cx = n.box.x + n.box.w / 2;
              const titleSize = n.label.length > 22 ? 12.5 : 14;
              return (
                <motion.g
                  key={n.label}
                  initial={isPrinting ? false : { opacity: 0 }}
                  whileInView={isPrinting ? undefined : { opacity: 1 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ delay: 0.05 * i, duration: 0.35 }}
                >
                  <rect
                    x={n.box.x}
                    y={n.box.y}
                    width={n.box.w}
                    height={n.box.h}
                    rx={10}
                    fill={fillFor(n.accent)}
                    stroke={strokeFor(n.accent)}
                    strokeWidth={strokeW(n.accent)}
                  />
                  {n.sub ? (
                    <>
                      {n.logo ? (
                        <image
                          href={n.logo}
                          x={n.box.x - 40}
                          y={n.box.y + 4}
                          width={80}
                          className={n.logo == '/Bybit%20Logo.jpg' ? 'filter invert' : ''}
                          height={80}
                          preserveAspectRatio="xMidYMid slice"
                          clipPath="inset(2 round 4)"
                        />
                      ) : null}
                      <text
                        x={cx}
                        y={n.box.y + n.box.h / 2 - 6}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="rgba(255,255,255,0.95)"
                        fontSize={titleSize}
                        fontWeight={600}
                        fontFamily="system-ui, ui-sans-serif, sans-serif"
                      >
                        {n.label}
                      </text>
                      <text
                        x={cx}
                        y={n.box.y + n.box.h / 2 + 11}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="rgba(255,255,255,0.38)"
                        fontSize={11}
                        fontFamily="ui-monospace, monospace"
                      >
                        {n.sub}
                      </text>
                    </>
                  ) : (
                    <text
                      x={cx}
                      y={n.box.y + n.box.h / 2}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="rgba(255,255,255,0.95)"
                      fontSize={titleSize}
                      fontWeight={600}
                      fontFamily="system-ui, ui-sans-serif, sans-serif"
                    >
                      {n.label}
                    </text>
                  )}
                </motion.g>
              );
            })}
          </svg>
        </div>

        <div className="relative -mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <motion.div
            className="rounded-xl border border-red-400/20 bg-red-400/[0.03] px-4 py-3"
            initial={isPrinting ? false : { opacity: 0, y: 8 }}
            whileInView={isPrinting ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            <p className="text-sm font-mono text-red-400/70 mb-3">Without Yellow</p>
            <ul className="space-y-1.5 text-sm text-white/50">
              <li className="flex items-start gap-2"><span className="text-red-400 mt-0.5">✕</span> Gas on every trade</li>
              <li className="flex items-start gap-2"><span className="text-red-400 mt-0.5">✕</span> Micro-positions uneconomical</li>
              <li className="flex items-start gap-2"><span className="text-red-400 mt-0.5">✕</span> Onboarding requires ETH</li>
            </ul>
          </motion.div>
          <motion.div
            className="rounded-xl border border-[#00E5FF]/20 bg-[#00E5FF]/[0.03] px-4 py-3"
            initial={isPrinting ? false : { opacity: 0, y: 8 }}
            whileInView={isPrinting ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.28 }}
          >
            <p className="text-sm font-mono text-[#00E5FF]/70 mb-3">With Yellow</p>
            <ul className="space-y-1.5 text-sm text-white/50">
              <li className="flex items-start gap-2"><span className="text-[#00E5FF] mt-0.5">✓</span> Deposit USDC once, sign EIP-712</li>
              <li className="flex items-start gap-2"><span className="text-[#00E5FF] mt-0.5">✓</span> Zero gas for users</li>
              <li className="flex items-start gap-2"><span className="text-[#00E5FF] mt-0.5">✓</span> Auto payouts to Yellow balance</li>
            </ul>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: [0.4, 0, 0.2, 1] as const },
  }),
};

const printItemVariants = {
  hidden: { opacity: 1, y: 0 },
  visible: { opacity: 1, y: 0 },
};

/** Motion props for slide wrappers — skips animation when printing */
function useSlideMotion(isPrinting: boolean) {
  if (isPrinting) {
    return {
      variants: printItemVariants,
      initial: 'visible' as const,
    };
  }
  return {
    variants: itemVariants,
    initial: 'hidden' as const,
    whileInView: 'visible' as const,
    viewport: { once: true },
  };
}

export default function PitchPage() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPrinting, setIsPrinting] = useState(false);
  const isScrolling = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  const slideMotion = useSlideMotion(isPrinting);
  const activeVariants = isPrinting ? printItemVariants : itemVariants;

  const handleDownloadPdf = useCallback(() => {
    setIsPrinting(true);
    // Drop expensive effects before opening the print dialog.
    requestAnimationFrame(() => {
      window.print();
    });
  }, []);

  const scrollToSlide = useCallback((index: number) => {
    if (index < 0 || index >= SLIDES.length) return;
    isScrolling.current = true;
    setCurrentSlide(index);
    slideRefs.current[index]?.scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => {
      isScrolling.current = false;
    }, 800);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        scrollToSlide(currentSlide + 1);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        scrollToSlide(currentSlide - 1);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [currentSlide, scrollToSlide]);

  // Intersection observer to sync scroll with dots
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (isScrolling.current) return;
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = slideRefs.current.indexOf(entry.target as HTMLDivElement);
            if (idx !== -1) setCurrentSlide(idx);
          }
        }
      },
      { threshold: 0.6 }
    );
    slideRefs.current.forEach((ref) => ref && observer.observe(ref));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleBeforePrint = () => setIsPrinting(true);
    const handleAfterPrint = () => setIsPrinting(false);

    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);

    const mediaQuery = window.matchMedia('print');
    const handleMediaChange = (event: MediaQueryListEvent) => {
      setIsPrinting(event.matches);
    };
    mediaQuery.addEventListener('change', handleMediaChange);

    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
      mediaQuery.removeEventListener('change', handleMediaChange);
    };
  }, []);

  const content = (
    <>
      <style jsx global>{`
        @media print {
          @page {
            size: 960px 540px;
            margin: 0;
          }

          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          html,
          body {
            background: #000 !important;
            color: #fff !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 960px !important;
            overflow: visible !important;
          }

          /* Force all motion-animated content to be visible */
          [style*="opacity"] {
            opacity: 1 !important;
            transform: none !important;
          }

          /* Kill all fixed / sticky positioning */
          .fixed,
          [class*="fixed"] {
            position: static !important;
          }

          /* Each slide = exactly one page */
          .slide-page {
            width: 960px !important;
            height: 540px !important;
            min-height: 540px !important;
            max-height: 540px !important;
            overflow: hidden !important;
            page-break-after: always !important;
            break-after: page !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            position: relative !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            box-sizing: border-box !important;
          }

          .slide-page:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }

          /* Scale down inner content to fit 960×540 */
          .slide-page > * {
            transform: scale(0.75) !important;
            transform-origin: center center !important;
          }

          /*
           * Intrinsic-size images: max-height % often fails when parent height is
           * content-driven (e.g. grid + w-full), so cap in px. Full-bleed fill
           * images stay within the 540px slide.
           */
          .slide-page img {
            max-width: 100% !important;
            max-height: 520px !important;
            object-fit: contain !important;
          }

          /* Go-to-market slide: mockup must stay a column, not full-page width */
          .slide-euphoria img {
            width: auto !important;
            max-width: min(100%, 340px) !important;
            max-height: 260px !important;
          }

          .slide-euphoria .euphoria-mockup-wrap {
            min-height: 0 !important;
            max-height: 280px !important;
            height: auto !important;
          }

          /* Kill the scroll container in print */
          .print-scroll-container {
            height: auto !important;
            overflow: visible !important;
            scroll-snap-type: none !important;
          }

          /* Hide elements not needed in print */
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>
      {/* Navigation dots */}
      <div className="fixed right-6 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-3 items-center print:hidden">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            onClick={() => scrollToSlide(i)}
            className="group relative flex items-center"
            aria-label={`Go to slide ${i + 1}: ${SLIDE_LABELS[i]}`}
          >
            <span className="absolute right-8 opacity-0 group-hover:opacity-100 transition-opacity text-xs font-mono text-white/60 whitespace-nowrap">
              {SLIDE_LABELS[i]}
            </span>
            <motion.div
              className="rounded-full border border-[#00E5FF]/40"
              animate={{
                width: currentSlide === i ? 12 : 8,
                height: currentSlide === i ? 12 : 8,
                backgroundColor: currentSlide === i ? '#00E5FF' : 'rgba(0,229,255,0.2)',
              }}
              transition={{ duration: 0.3 }}
            />
          </button>
        ))}
      </div>

      {/* Slide counter */}
      <div className="fixed bottom-6 right-6 z-50 font-mono text-sm text-white/30 print:hidden">
        {String(currentSlide + 1).padStart(2, '0')} / {String(SLIDES.length).padStart(2, '0')}
      </div>

      {/* Keyboard hint */}
      <AnimatePresence>
        {currentSlide === 0 && (
          <motion.div
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 text-white/30 text-xs font-mono print:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 2 }}
          >
            <kbd className="px-2 py-1 border border-white/20 rounded text-white/50">Space</kbd>
            <span>or scroll to navigate</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Arrow buttons */}
      {currentSlide > 0 && (
        <button
          onClick={() => scrollToSlide(currentSlide - 1)}
          className="fixed top-6 left-1/2 -translate-x-1/2 z-50 text-white/30 hover:text-[#00E5FF] transition-colors print:hidden"
          aria-label="Previous slide"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 15l-6-6-6 6" />
          </svg>
        </button>
      )}
      {currentSlide < SLIDES.length - 1 && (
        <button
          onClick={() => scrollToSlide(currentSlide + 1)}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 text-white/30 hover:text-[#00E5FF] transition-colors print:hidden"
          aria-label="Next slide"
        >
          <motion.svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            animate={currentSlide === 0 ? { y: [0, 6, 0] } : {}}
            transition={{ repeat: Infinity, duration: 1.5 }}
          >
            <path d="M6 9l6 6 6-6" />
          </motion.svg>
        </button>
      )}

      {/* Back to home */}
      <Link
        href="/"
        className="fixed top-6 left-6 z-50 font-melodrame text-xl text-[#00E5FF] hover:text-white transition-colors print:hidden"
      >
        DRAW-FI
      </Link>

      <button
        onClick={handleDownloadPdf}
        className="fixed top-6 right-6 z-50 rounded-xl border border-[#00E5FF]/40 bg-black/70 px-4 py-2 font-mono text-xs uppercase tracking-wider text-[#00E5FF] transition-colors hover:border-[#00E5FF] hover:text-white print:hidden"
        aria-label="Download pitch as PDF"
      >
        Download PDF
      </button>

      {/* Scroll container */}
      <div
        ref={containerRef}
        className="h-screen overflow-y-auto snap-y snap-mandatory print:h-auto print:overflow-visible print-scroll-container"
        style={{ scrollBehavior: 'smooth' }}
      >
        {/* ===== SLIDE 1: TITLE ===== */}
        <div
          ref={(el) => { slideRefs.current[0] = el; }}
          className="snap-start h-screen flex items-center justify-center relative overflow-hidden slide-page"
        >
          {/* Radial glow */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(0,229,255,0.08) 0%, transparent 70%)',
            }}
          />
          <motion.div
            className="text-center z-10 px-8"
            {...slideMotion}
          >
            <motion.div
              className="inline-block mb-2"
              variants={activeVariants}
              custom={0}
            >
              <div className="relative">
                <div className="absolute inset-0 rounded-2xl bg-[#00E5FF]/20 blur-2xl" />
                <h1
                  className="relative text-[200px] font-melodrame font-medium text-[#00E5FF]"
                  style={{ textShadow: '4px 4px 0 #000000' }}
                >
                  Draw.Fi
                </h1>
              </div>
            </motion.div>

            <motion.p
              className="text-xl md:text-2xl text-white/70 font-light max-w-lg -mt-20 mx-auto mb-8"
              variants={activeVariants}
              custom={1}
            >
              Draw your price prediction. Earn real payouts.{' '}
              <span className="text-[#00E5FF] font-semibold">60 seconds.</span>
            </motion.p>

            <motion.div
              className="flex flex-wrap justify-center gap-3"
              variants={activeVariants}
              custom={2}
            >
              {['Built on Base', 'Yellow Network', 'Gasless Trading', 'Up to 2500x Leverage'].map((tag) => (
                <span
                  key={tag}
                  className="px-4 py-1.5 rounded-full bg-white/[0.04] border border-[#00E5FF]/20 text-xs font-mono text-[#00E5FF]/80"
                >
                  {tag}
                </span>
              ))}
            </motion.div>
          </motion.div>
        </div>

        {/* ===== SLIDE 2: THE PAIN ===== */}
        <div
          ref={(el) => { slideRefs.current[1] = el; }}
          className="snap-start h-screen flex items-center justify-center relative slide-page"
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(circle at 15% 20%, rgba(248,113,113,0.12) 0%, transparent 35%), radial-gradient(circle at 85% 78%, rgba(0,229,255,0.12) 0%, transparent 40%)',
            }}
          />
          <motion.div
            className="max-w-5xl mx-auto px-8 md:px-20 z-10"
            {...slideMotion}
          >
            <motion.p
              className="text-sm font-mono tracking-widest uppercase text-[#00E5FF]/70 mb-6"
              variants={activeVariants}
              custom={0}
            >
              01 — The Problem
            </motion.p>

            <motion.h2
              className="text-4xl md:text-6xl font-melodrame font-medium text-white mb-0 leading-tight"
              variants={activeVariants}
              custom={1}
              style={{ textShadow: '4px 4px 0 #000000' }}
            >
              <span className="text-red-400">95%</span> of retail traders lose money
            </motion.h2>

            <motion.p
              className="text-lg text-white/50 mb-12 max-w-2xl"
              variants={activeVariants}
              custom={2}
            >
              Not because they can&apos;t read charts — because the tools are built for quant desks, not humans.
            </motion.p>

            <motion.div
              className="grid md:grid-cols-3 gap-4 mb-8"
              variants={activeVariants}
              custom={3}
            >
              {[
                {
                  title: 'Signal is clear',
                  detail: 'Most users can call direction.',
                  icon: (
                    <svg className="w-5 h-5 text-[#00E5FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5l5.25-5.25 3.75 3.75L21 6" />
                    </svg>
                  ),
                },
                {
                  title: 'Execution is painful',
                  detail: 'Order books, leverage, liquidation math.',
                  icon: (
                    <svg className="w-5 h-5 text-red-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4.5m0 3h.008v.008H12V16.5z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.29 3.86L1.82 18a2 2 0 001.72 3h16.92a2 2 0 001.72-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    </svg>
                  ),
                },
                {
                  title: 'Outcome: users churn',
                  detail: 'Confidence disappears after first losses.',
                  icon: (
                    <svg className="w-5 h-5 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L6.75 17.25M6.75 6.75l10.5 10.5" />
                    </svg>
                  ),
                },
              ].map((pain, i) => (
                <div key={pain.title} className="rounded-2xl border border-white/10 bg-white/2 p-5">
                  <div className="mb-3 inline-flex items-center justify-center rounded-lg border border-white/15 bg-black/30 p-2">
                    {pain.icon}
                  </div>
                  <p className="text-sm font-semibold text-white mb-1">{pain.title}</p>
                  <p className="text-xs text-white/45">{pain.detail}</p>
                  {i < 2 && <div className="mt-4 h-px w-full bg-linear-to-r from-[#00E5FF]/30 to-transparent" />}
                </div>
              ))}
            </motion.div>

            <motion.div
              className="grid md:grid-cols-2 gap-6"
              variants={activeVariants}
              custom={4}
            >
              <div className="rounded-2xl border border-white/10 bg-white/2 p-8">
                <p className="text-5xl md:text-6xl font-melodrame font-medium text-[#00E5FF] mb-3">$200B</p>
                <p className="text-white/40 text-sm mb-4">Daily crypto derivatives volume</p>
                <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full w-[78%] rounded-full bg-linear-to-r from-[#00E5FF] to-[#7DF4FF]" />
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/2 p-8">
                <p className="text-5xl md:text-6xl font-melodrame font-medium text-[#00E5FF] mb-3">100M+</p>
                <p className="text-white/40 text-sm mb-4">Crypto users who understand price direction but can&apos;t navigate order books</p>
                <div className="flex items-center gap-2">
                  <div className="h-2 flex-1 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full w-[92%] rounded-full bg-linear-to-r from-red-300 via-amber-300 to-[#00E5FF]" />
                  </div>
                  <span className="text-[11px] font-mono text-white/45">underserved</span>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>

        {/* ===== SLIDE 3: GO-TO-MARKET CASE STUDY ===== */}
        <div
          ref={(el) => { slideRefs.current[2] = el; }}
          className="snap-start h-screen relative bg-black overflow-hidden slide-page slide-euphoria"
        >
          <div className="h-full w-full max-w-7xl mx-auto px-8 md:px-14 lg:px-20 flex items-center">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center w-full">
              <div className="space-y-6">
                <div className="inline-flex items-center rounded-md border border-white/15 bg-white/5 px-3 py-1">
                  <span className="text-[11px] font-mono tracking-wide uppercase text-white/70">
                    Go-to-market strategy
                  </span>
                </div>
                <h2 className="font-melodrame text-8xl leading-[0.8] text-white">
                  GameFi is <br /> here to stay
                </h2>
                <p className="text-2xl text-white/50">
                  Case Study: Euphoria Finance has proven the model works - with
                </p>
              </div>

              <div className="euphoria-mockup-wrap relative h-full min-h-[420px] lg:min-h-[620px] flex items-end justify-center lg:justify-end">
                <Image
                  src="/euphoria-fi.png"
                  alt="Euphoria Finance iPhone mockup"
                  width={760}
                  height={980}
                  className="w-full max-w-[620px] rounded-4xl overflow-hidden h-auto object-contain"
                  priority
                />
              </div>
            </div>
          </div>
        </div>

        {/* ===== SLIDE 4: WHY NOW ===== */}
        <div
          ref={(el) => { slideRefs.current[3] = el; }}
          className="snap-start h-screen flex items-center justify-center relative slide-page"
        >
          <motion.div
            className="max-w-5xl mx-auto px-8 md:px-20"
            {...slideMotion}
          >
            <motion.p
              className="text-sm font-mono tracking-widest uppercase text-[#00E5FF]/70 mb-6"
              variants={activeVariants}
              custom={0}
            >
              02 — Why Now
            </motion.p>

            <motion.h2
              className="text-4xl md:text-6xl font-melodrame font-medium text-white mb-12"
              variants={activeVariants}
              custom={1}
              style={{ textShadow: '4px 4px 0 #000000' }}
            >
              Three things changed
            </motion.h2>

            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  num: '01',
                  title: 'Yellow Network enables real-time game-fi',
                  detail:
                    'State channels and instant off-chain settlement let stakes, scoring, and payouts keep pace with play—not block times or gas waits',
                  icon: (
                    <svg className="w-8 h-8 text-[#00E5FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                    </svg>
                  ),
                },
                {
                  num: '02',
                  title: 'Embedded wallets killed the barrier',
                  detail: 'Users sign up with Google, not seed phrases',
                  icon: (
                    <svg className="w-8 h-8 text-[#00E5FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
                    </svg>
                  ),
                },
                {
                  num: '03',
                  title: 'Euphoria Finance proved the model',
                  detail: '$50B+ volume — simplified speculation has massive PMF',
                  icon: (
                    <svg className="w-8 h-8 text-[#00E5FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                    </svg>
                  ),
                },
              ].map((item, i) => (
                <motion.div
                  key={item.num}
                  className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 hover:border-[#00E5FF]/30 transition-colors"
                  variants={activeVariants}
                  custom={i + 2}
                >
                  <div className="flex items-center gap-3 mb-4">
                    {item.icon}
                    <span className="text-sm font-mono text-[#00E5FF]/50">{item.num}</span>
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">{item.title}</h3>
                  <p className="text-sm text-white/40">{item.detail}</p>
                </motion.div>
              ))}
            </div>

            <motion.p
              className="mt-8 text-sm font-mono text-white/30 text-center"
              variants={activeVariants}
              custom={6}
            >
              Current perp DEXs are powerful but intimidating. Prediction markets are simple but binary. DrawFi fills the gap.
            </motion.p>
          </motion.div>
        </div>

        {/* ===== SLIDE 5: THE PRODUCT ===== */}
        <div
          ref={(el) => { slideRefs.current[4] = el; }}
          className="snap-start h-screen flex items-center justify-center relative slide-page"
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse 50% 40% at 50% 60%, rgba(0,229,255,0.05) 0%, transparent 70%)',
            }}
          />
          <motion.div
            className="max-w-5xl mx-auto px-8 md:px-20 z-10"
            {...slideMotion}
          >
            <motion.p
              className="text-sm font-mono tracking-widest uppercase text-[#00E5FF]/70 mb-6"
              variants={activeVariants}
              custom={0}
            >
              04 — The Product
            </motion.p>

            <motion.h2
              className="text-4xl md:text-6xl font-melodrame font-medium text-white mb-4"
              variants={activeVariants}
              custom={1}
              style={{ textShadow: '4px 4px 0 #000000' }}
            >
              Draw. Predict. <span className="text-[#00E5FF]">Earn.</span>
            </motion.h2>

            <motion.p
              className="text-base text-white/50 mb-10 max-w-2xl"
              variants={activeVariants}
              custom={2}
            >
              Predict price movement by drawing a curve and earn real payouts in 60 seconds, instead of learning perpetual futures.
            </motion.p>

            <motion.div
              className="mb-10 rounded-2xl border border-[#00E5FF]/20 bg-black/40 p-5 md:p-6"
              variants={activeVariants}
              custom={3}
            >
              <div className="grid gap-6 md:grid-cols-[1.6fr_1fr] md:items-center">
                <div className="relative overflow-hidden rounded-xl border border-[#00E5FF]/15 bg-[#021218]/70 p-4">
                  <motion.svg
                    viewBox="0 0 760 260"
                    className="w-full h-[220px]"
                    initial={{ opacity: 0.6 }}
                    animate={{ opacity: [0.55, 1, 0.55] }}
                    transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <defs>
                      <linearGradient id="curveStroke" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#00E5FF" stopOpacity="0.55" />
                        <stop offset="50%" stopColor="#00E5FF" stopOpacity="1" />
                        <stop offset="100%" stopColor="#00E5FF" stopOpacity="0.55" />
                      </linearGradient>
                      <filter id="predictionGlow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="1.5" result="blur" />
                        <feMerge>
                          <feMergeNode in="blur" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                      <linearGradient id="curveFill" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#00E5FF" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#00E5FF" stopOpacity="0.02" />
                      </linearGradient>
                    </defs>

                    {Array.from({ length: 12 }).map((_, i) => (
                      <line
                        key={`v-${i}`}
                        x1={40 + i * 60}
                        y1="20"
                        x2={40 + i * 60}
                        y2="220"
                        stroke="#00E5FF"
                        strokeOpacity="0.08"
                        strokeWidth="1"
                      />
                    ))}
                    {Array.from({ length: 5 }).map((_, i) => (
                      <line
                        key={`h-${i}`}
                        x1="40"
                        y1={40 + i * 45}
                        x2="700"
                        y2={40 + i * 45}
                        stroke="#00E5FF"
                        strokeOpacity="0.08"
                        strokeWidth="1"
                      />
                    ))}

                    <motion.path
                      d="M40 180 C 130 148, 210 168, 280 132 C 350 95, 460 140, 540 102 C 610 70, 665 82, 700 62"
                      fill="none"
                      stroke="url(#curveStroke)"
                      strokeWidth="4"
                      strokeLinecap="round"
                      initial={{ pathLength: 0 }}
                      whileInView={{ pathLength: 1 }}
                      viewport={{ once: true }}
                      transition={{ duration: 1.5, ease: 'easeOut' }}
                    />
                    <motion.path
                      d="M40 188 C 120 172, 210 150, 280 142 C 360 126, 450 128, 535 114 C 605 98, 660 90, 700 84"
                      fill="none"
                      stroke="#FF2DA6"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeDasharray="10 7"
                      filter="url(#predictionGlow)"
                      initial={{ pathLength: 0 }}
                      whileInView={{ pathLength: 1 }}
                      viewport={{ once: true }}
                      transition={{ duration: 1.7, ease: 'easeOut', delay: 0.2 }}
                    />
                    <motion.path
                      d="M40 180 C 130 148, 210 168, 280 132 C 350 95, 460 140, 540 102 C 610 70, 665 82, 700 62 L700 220 L40 220 Z"
                      fill="url(#curveFill)"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0.15, 0.35, 0.15] }}
                      transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                    />

                    <motion.circle
                      cx="40"
                      cy="180"
                      r="6"
                      fill="#00E5FF"
                      animate={{ cx: [40, 700], cy: [180, 62] }}
                      transition={{ duration: 4.2, repeat: Infinity, ease: 'linear' }}
                    />
                    <motion.circle
                      cx="540"
                      cy="102"
                      r="8"
                      fill="#00E5FF"
                      fillOpacity="0.18"
                      animate={{ r: [8, 15, 8], fillOpacity: [0.15, 0.35, 0.15] }}
                      transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  </motion.svg>
                  <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] font-mono text-white/60">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-[2px] w-6 bg-[#00E5FF]" />
                      Actual market
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <span className="h-[3px] w-7 border-t-[3px] border-dashed border-[#FF2DA6]" />
                      User prediction
                    </span>
                  </div>
                </div>

                <div className="space-y-3">
                  {[
                    'Sketch your conviction on live price action.',
                    'Scoring engine measures curve-vs-market fit.',
                    'Payout settles instantly when round closes.',
                  ].map((line, i) => (
                    <motion.div
                      key={line}
                      className="rounded-lg border border-[#00E5FF]/15 bg-[#00E5FF]/[0.04] px-4 py-3 text-sm text-white/70"
                      initial={{ opacity: 0, x: 18 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.45, delay: 0.15 * i }}
                    >
                      {line}
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>

            {/* How it works visual flow */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
              {[
                { step: '01', label: 'Draw a price curve', desc: 'On a live BTC chart canvas' },
                { step: '02', label: 'Pick your stake', desc: 'As low as $0.10' },
                { step: '03', label: '59 predictions scored', desc: 'Against real price data' },
                { step: '04', label: 'Instant payout', desc: '>50% accuracy = profit' },
              ].map((item, i) => (
                <motion.div
                  key={item.step}
                  className="rounded-2xl border border-[#00E5FF]/20 bg-[#00E5FF]/[0.03] p-6 text-center"
                  variants={activeVariants}
                  custom={i + 4}
                  whileHover={!isPrinting ? { y: -4, scale: 1.01 } : undefined}
                  transition={{ type: 'spring', stiffness: 220, damping: 16 }}
                >
                  <p className="text-2xl font-mono font-bold text-[#00E5FF] mb-2">{item.step}</p>
                  <p className="text-sm font-bold text-white mb-1">{item.label}</p>
                  <p className="text-xs text-white/40">{item.desc}</p>
                </motion.div>
              ))}
            </div>

            {/* Differentiator bar */}
            <motion.div
              className="flex flex-wrap justify-center gap-6 text-sm"
              variants={activeVariants}
              custom={7}
            >
              {[
                { icon: '✕', label: 'No order books', color: 'text-red-400' },
                { icon: '✕', label: 'No liquidations', color: 'text-red-400' },
                { icon: '✕', label: 'No complexity', color: 'text-red-400' },
                { icon: '✓', label: 'Just draw and earn', color: 'text-[#00E5FF]' },
              ].map((item) => (
                <span key={item.label} className="flex items-center gap-2 text-white/50">
                  <span className={`${item.color} font-bold text-lg`}>{item.icon}</span>
                  {item.label}
                </span>
              ))}
            </motion.div>
          </motion.div>
        </div>

        {/* ===== SLIDE 7: PRODUCT IMAGE ===== */}
        <div
          ref={(el) => { slideRefs.current[5] = el; }}
          className="snap-start h-screen flex items-center justify-center relative bg-black slide-page"
        >
          <Image
            src="/slides/product.png"
            alt="Product"
            fill
            className="object-contain"
            priority
          />
        </div>

        {/* ===== SLIDE 7: TECHNICAL ARCHITECTURE — ANIMATED FLOW ===== */}
        <div
          ref={(el) => { slideRefs.current[6] = el; }}
          className="snap-start h-screen flex items-center justify-center relative slide-page bg-black overflow-y-auto py-8"
        >
          <motion.div
            className="w-full max-w-6xl mx-auto px-6 md:px-12"
            {...slideMotion}
          >
            <motion.p
              className="text-sm font-mono tracking-widest uppercase text-[#00E5FF]/70 mb-4 text-center"
              variants={activeVariants}
              custom={0}
            >
              06 — Technical Architecture
            </motion.p>
            <motion.h2
              className="text-3xl md:text-5xl font-melodrame font-medium text-white mb-2 text-center"
              variants={activeVariants}
              custom={1}
              style={{ textShadow: '4px 4px 0 #000000' }}
            >
              Flow of <span className="text-[#00E5FF]">data & settlement</span>
            </motion.h2>
            <motion.p
              className="text-sm text-white/45 mb-8 text-center max-w-2xl mx-auto"
              variants={activeVariants}
              custom={2}
            >
              Built for speed and scalability — live marks, EigenDA storage, Yellow ledger, and LineFutures on Base.
            </motion.p>
            <motion.div variants={activeVariants} custom={3}>
              <AnimatedArchitectureDiagram isPrinting={isPrinting} />
            </motion.div>
          </motion.div>
        </div>

        {/* ===== SLIDE 8: DEMO FLOW ===== */}
        <div
          ref={(el) => { slideRefs.current[7] = el; }}
          className="snap-start min-h-screen flex items-center justify-center relative slide-page py-10 md:py-0"
        >
          <motion.div
            className="max-w-6xl mx-auto px-8 md:px-16 w-full"
            {...slideMotion}
          >
            <motion.p
              className="text-sm font-mono tracking-widest uppercase text-[#00E5FF]/70 mb-4 md:mb-6"
              variants={activeVariants}
              custom={0}
            >
              08 — Live Demo Flow
            </motion.p>

            <motion.h2
              className="text-3xl sm:text-4xl md:text-6xl font-melodrame font-medium text-white mb-6 md:mb-10"
              variants={activeVariants}
              custom={1}
              style={{ textShadow: '4px 4px 0 #000000' }}
            >
              Draw to earn in <span className="text-[#00E5FF]">60 seconds</span>
            </motion.h2>

            <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-8 lg:gap-10 items-start">
              <motion.div
                className="relative w-full"
                variants={activeVariants}
                custom={2}
              >
                <div className="relative w-full aspect-16/11 max-h-[min(46vh,440px)] lg:max-h-none rounded-2xl border border-[#00E5FF]/20 bg-[#00E5FF]/4 overflow-hidden shadow-[0_0_60px_-12px_rgba(0,229,255,0.25)]">
                  <Image
                    src="/trading-history.png"
                    alt="DrawFi predict UI with live price chart and trading controls"
                    fill
                    className="object-cover object-top"
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    priority
                  />
                  <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/70 via-transparent to-black/20" />
                  <div className="absolute bottom-0 left-0 right-0 px-4 py-3 md:px-5 md:py-4">
                    <p className="text-[11px] font-mono uppercase tracking-wider text-[#00E5FF]/90">
                      Live predict · BTC chart
                    </p>
                    <p className="text-xs text-white/50 mt-0.5">Draw your curve, set stake &amp; window, sign once</p>
                  </div>
                </div>
              </motion.div>

              <div className="relative min-w-0">
                <div className="absolute left-[19px] top-3 bottom-3 w-px bg-linear-to-b from-[#00E5FF]/45 via-[#00E5FF]/18 to-transparent hidden sm:block" />

                <div className="space-y-3 sm:space-y-4">
                  {(
                    [
                      { step: '1', text: 'Open predict page — live BTC chart streaming', icon: 'chart' as const },
                      { step: '2', text: 'Draw a price curve on the canvas', icon: 'draw' as const },
                      { step: '3', text: 'Set stake, leverage, 1-min window', icon: 'stake' as const },
                      { step: '4', text: 'Submit — EIP-712 signature (no gas)', icon: 'sign' as const },
                      { step: '5', text: 'Position opens on-chain via relayer', icon: 'chain' as const },
                      { step: '6', text: 'Auto-settles, PnL from accuracy', icon: 'settle' as const },
                      { step: '7', text: 'Payout lands in Yellow balance', icon: 'payout' as const },
                    ] as const
                  ).map((item, i) => (
                    <motion.div
                      key={item.step}
                      className="flex items-start gap-3 sm:gap-4"
                      variants={activeVariants}
                      custom={i + 3}
                    >
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full border border-[#00E5FF]/40 bg-[#00E5FF]/10 flex items-center justify-center shrink-0">
                        <span className="text-xs sm:text-sm font-mono font-bold text-[#00E5FF]">{item.step}</span>
                      </div>
                      <div className="flex gap-2 sm:gap-3 flex-1 min-w-0 pt-0.5">
                        <DemoFlowStepIcon kind={item.icon} />
                        <p className="text-sm sm:text-base text-white/60 leading-snug">{item.text}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* ===== SLIDE 9: WALKTHROUGH VIDEO ===== */}
        <div
          ref={(el) => { slideRefs.current[8] = el; }}
          className="snap-start h-screen flex items-center justify-center relative bg-black slide-page"
        >
          {isPrinting ? (
            <div className="flex flex-col items-center justify-center gap-4">
              <svg className="w-16 h-16 text-[#00E5FF]/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.91 11.672a.375.375 0 010 .656l-5.603 3.113a.375.375 0 01-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112z" />
              </svg>
              <p className="text-lg font-mono text-white/40">Live Walkthrough Video</p>
              <p className="text-sm text-white/25">See demo at drawfi.xyz/pitch</p>
            </div>
          ) : (
            <video
              src={
                process.env.NEXT_PUBLIC_PITCH_WALKTHROUGH_VIDEO_URL ||
                '/slides/DrawFi-Walkthrough.mp4'
              }
              className="w-full h-full object-contain"
              controls
              playsInline
              preload="metadata"
            />
          )}
        </div>

        {/* ===== SLIDE 10: FEATURES IMAGE ===== */}
        <div
          ref={(el) => { slideRefs.current[9] = el; }}
          className="snap-start h-screen flex items-center justify-center relative bg-black slide-page"
        >
          <Image
            src="/slides/features.png"
            alt="Features"
            fill
            className="object-contain"
            priority
          />
        </div>

        {/* ===== SLIDE 11: MARKET OPPORTUNITY ===== */}
        <div
          ref={(el) => { slideRefs.current[10] = el; }}
          className="snap-start h-screen flex items-center justify-center relative slide-page"
        >
          <motion.div
            className="max-w-6xl mx-auto px-8 md:px-20 w-full"
            {...slideMotion}
          >
            <motion.p
              className="text-sm font-mono tracking-widest uppercase text-[#00E5FF]/70 mb-6"
              variants={activeVariants}
              custom={0}
            >
              10 — Market Opportunity
            </motion.p>
            <motion.h2
              className="text-4xl md:text-6xl font-melodrame font-medium text-white mb-4"
              variants={activeVariants}
              custom={1}
              style={{ textShadow: '4px 4px 0 #000000' }}
            >
              Market Opportunity
            </motion.h2>
            <motion.p
              className="text-base text-white/50 mb-10 max-w-3xl"
              variants={activeVariants}
              custom={2}
            >
              We size from the largest validated market (global crypto perpetuals), narrow to on-chain perpetuals, then target an attainable wedge.
            </motion.p>

            <div className="grid lg:grid-cols-[1.2fr_1fr] gap-8 items-center">
              <motion.div
                className="relative h-[420px] rounded-2xl border border-[#00E5FF]/20 bg-[#00E5FF]/[0.03] flex items-center justify-center overflow-hidden"
                variants={activeVariants}
                custom={3}
              >
                <svg viewBox="0 0 420 340" className="w-[88%] h-[88%] max-w-[460px]" role="img" aria-label="TAM SAM SOM pyramid">
                  <polygon points="50,290 370,290 318,220 102,220" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" />
                  <polygon points="102,220 318,220 282,165 138,165" fill="rgba(255,255,255,0.09)" stroke="rgba(255,255,255,0.22)" strokeWidth="1.5" />
                  <polygon points="138,165 282,165 210,70" fill="rgba(0,229,255,0.18)" stroke="rgba(0,229,255,0.55)" strokeWidth="1.8" />

                  <text x="210" y="262" textAnchor="middle" fill="rgba(255,255,255,0.95)" fontSize="24" fontFamily="system-ui, sans-serif">$58.5T</text>
                  <text x="210" y="284" textAnchor="middle" fill="rgba(255,255,255,0.65)" fontSize="11" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">TAM</text>

                  <text x="210" y="195" textAnchor="middle" fill="rgba(255,255,255,0.95)" fontSize="20" fontFamily="system-ui, sans-serif">$1.5T</text>
                  <text x="210" y="210" textAnchor="middle" fill="rgba(255,255,255,0.65)" fontSize="10.5" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">SAM</text>

                  <text x="210" y="128" textAnchor="middle" fill="white" fontSize="18" fontFamily="system-ui, sans-serif">$7.5B</text>
                  <text x="210" y="146" textAnchor="middle" fill="rgba(0,229,255,0.9)" fontSize="10.5" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">SOM</text>
                </svg>
              </motion.div>

              <motion.div className="space-y-4" variants={activeVariants} custom={4}>
                {[
                  {
                    label: 'TAM',
                    value: '$58.5T',
                    desc: 'Total annual volume on top 10 centralized perpetual exchanges in 2024',
                  },
                  {
                    label: 'SAM',
                    value: '$1.5T',
                    desc: 'Total annual volume on top 10 decentralized perpetual exchanges in 2024',
                  },
                  {
                    label: 'SOM',
                    value: '$7.5B',
                    desc: 'Initial reachable wedge at 0.5% share of DEX perp volume',
                  },
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                    <div className="flex items-end justify-between gap-4 mb-2">
                      <p className="text-xs font-mono tracking-wider text-[#00E5FF]/70">{item.label}</p>
                      <p className="text-2xl font-melodrame text-white">{item.value}</p>
                    </div>
                    <p className="text-sm text-white/45">{item.desc}</p>
                  </div>
                ))}
              </motion.div>
            </div>

            <motion.p className="mt-8 text-xs font-mono text-white/35" variants={activeVariants} custom={5}>
              Sources: CoinGecko &quot;State of Crypto Perpetuals 2024&quot; (updated Mar 14, 2025). SOM assumption: 0.5% of 2024 DEX perp volume as an early penetration target.
            </motion.p>
          </motion.div>
        </div>

        {/* ===== SLIDE 12: TRACTION + ROADMAP ===== */}
        <div
          ref={(el) => { slideRefs.current[11] = el; }}
          className="snap-start h-screen flex items-center justify-center relative slide-page"
        >
          <motion.div
            className="max-w-5xl mx-auto px-8 md:px-20"
            {...slideMotion}
          >
            <motion.p
              className="text-sm font-mono tracking-widest uppercase text-[#00E5FF]/70 mb-6"
              variants={activeVariants}
              custom={0}
            >
              11 — Traction & Roadmap
            </motion.p>

            <motion.h2
              className="text-4xl md:text-6xl font-melodrame font-medium text-white mb-10"
              variants={activeVariants}
              custom={1}
              style={{ textShadow: '4px 4px 0 #000000' }}
            >
              We&apos;re live on mainnet
            </motion.h2>

            <div className="grid md:grid-cols-2 gap-8">
              {/* Now */}
              <motion.div
                className="rounded-2xl border border-[#00E5FF]/20 bg-[#00E5FF]/[0.03] p-8"
                variants={activeVariants}
                custom={2}
              >
                <div className="flex items-center gap-2 mb-6">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#00E5FF] animate-pulse" />
                  <p className="text-sm font-mono text-[#00E5FF]/70">LIVE NOW</p>
                </div>
                <ul className="space-y-4">
                  {[
                    'Live on Base mainnet',
                    'Full Yellow Network integration',
                    '4 trading pairs (BTC, ETH, AAVE, DOGE)',
                    'Auto position closer (every 10s)',
                    'Leaderboard: accuracy, PnL, win rate',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm text-white/60">
                      <span className="text-[#00E5FF] mt-0.5 shrink-0">✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </motion.div>

              {/* Next 90 days */}
              <motion.div
                className="rounded-2xl border border-white/10 bg-white/[0.02] p-8"
                variants={activeVariants}
                custom={3}
              >
                <p className="text-sm font-mono text-white/40 mb-6">NEXT 90 DAYS</p>
                <ul className="space-y-4">
                  {[
                    'Prediction tournaments with prize pools',
                    '10+ token pairs',
                    'Mobile-optimized drawing',
                    'Social: share predictions, follow top drawers',
                    '1,000 active weekly users target',
                  ].map((item, i) => (
                    <li key={item} className="flex items-start gap-3 text-sm text-white/40">
                      <div className="relative mt-1.5 shrink-0">
                        <div className={`w-2 h-2 rounded-full border border-white/30 ${i === 0 ? 'bg-white/30' : ''}`} />
                      </div>
                      {item}
                    </li>
                  ))}
                </ul>
              </motion.div>
            </div>
          </motion.div>
        </div>

        {/* ===== SLIDE 13: TEAM ===== */}
        <div
          ref={(el) => { slideRefs.current[12] = el; }}
          className="snap-start h-screen flex items-center justify-center relative slide-page"
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse 50% 40% at 50% 70%, rgba(0,229,255,0.06) 0%, transparent 70%)',
            }}
          />
          <motion.div
            className="max-w-3xl mx-auto px-8 text-center z-10"
            {...slideMotion}
          >
            <motion.p
              className="text-sm font-mono tracking-widest uppercase text-[#00E5FF]/70 mb-6"
              variants={activeVariants}
              custom={0}
            >
              12 — Team
            </motion.p>

            <motion.h2
              className="text-4xl md:text-6xl font-melodrame font-medium text-white mb-12"
              variants={activeVariants}
              custom={1}
              style={{ textShadow: '4px 4px 0 #000000' }}
            >
              Team
            </motion.h2>

            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  image: '/fabianferno.jpeg',
                  name: 'Fabian Ferno',
                  role: 'Full-stack Web3',
                  cred: 'Scaled products to 10K+ users',
                  focus: 'Smart contract architecture',
                },
                {
                  image: '/philo.png',
                  name: 'Philo Sanjay',
                  role: 'Backend Systems',
                  cred: 'Real-time price pipeline',
                  focus: 'Settlement engine',
                },
                {
                  image: '/silas.png',
                  name: 'Silas Ashar',
                  role: 'Frontend & Product',
                  cred: 'Drawing interface design',
                  focus: 'Trading UX',
                },
              ].map((member, i) => (
                <motion.div
                  key={member.name}
                  className="flex flex-col items-center"
                  variants={activeVariants}
                  custom={i + 2}
                >
                  <div className="relative aspect-square w-32 shrink-0 rounded-xl border-2 border-[#00E5FF]/40 overflow-hidden mb-4">
                    <Image
                      src={member.image}
                      alt={member.name}
                      fill
                      sizes="128px"
                      className="object-cover object-center saturate-0 grayscale"
                    />
                  </div>
                  <h3 className="text-lg font-bold text-white mb-1">{member.name}</h3>
                  <p className="text-xs font-mono text-[#00E5FF]/60 mb-3">{member.role}</p>
                  <ul className="space-y-1.5 text-left">
                    <li className="flex items-start gap-2 text-xs text-white/40">
                      <span className="text-[#00E5FF] mt-0.5">✓</span> {member.cred}
                    </li>
                    <li className="flex items-start gap-2 text-xs text-white/40">
                      <span className="text-[#00E5FF] mt-0.5">✓</span> {member.focus}
                    </li>
                  </ul>
                </motion.div>
              ))}
            </div>

            {/* CTA */}
            <motion.div
              className="mt-16"
              variants={activeVariants}
              custom={6}
            >
              <motion.div
                whileHover={{ scale: 1.05, x: -2, y: -2 }}
                whileTap={{ scale: 0.95, x: 2, y: 2 }}
              >
                <Link
                  href="/predict"
                  className="inline-block px-10 py-4 text-lg font-bold text-[#000000] bg-[#00E5FF] border-4 border-[#0a0a0a] rounded-xl shadow-[6px_6px_0_0_#0a0a0a] transition-all hover:shadow-[8px_8px_0_0_#0a0a0a]"
                >
                  Try DrawFi Now
                </Link>
              </motion.div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </>
  );

  return isPrinting ? (
    <div className="relative">{content}</div>
  ) : (
    <div className="relative">
      <div className="relative">{content}</div>
    </div>
  );


}
