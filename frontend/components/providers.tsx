'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PrivyProvider } from '@privy-io/react-auth';
import { defineChain } from 'viem';
import { NextStepProvider, NextStepReact } from 'nextstepjs';
import { TokenPairProvider } from '@/contexts/TokenPairContext';
import { YellowClientProvider } from '@/contexts/YellowClientContext';
import { OnboardingCard } from '@/components/onboarding/OnboardingCard';
import { onboardingSteps } from '@/lib/onboarding/predictTourSteps';

const ONBOARDING_SEEN_KEY = 'drawfi-predict-onboarding-seen';

const queryClient = new QueryClient();

// Sepolia — align with NEXT_PUBLIC_ETHEREUM_RPC_URL and deployed contracts
const sepoliaChain = defineChain({
  id: 11_155_111,
  name: 'Sepolia',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_ETHEREUM_RPC_URL ||
          'https://rpc.sepolia.org',
      ],
    },
  },
  blockExplorers: {
    default: {
      name: 'Etherscan',
      url: 'https://sepolia.etherscan.io',
    },
  },
  testnet: true,
});

const baseSepoliaChain = defineChain({
  id: 84_532,
  name: 'Base Sepolia',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_ETHEREUM_RPC_URL || 'https://sepolia.base.org',
      ],
    },
  },
  blockExplorers: {
    default: {
      name: 'BaseScan',
      url: 'https://sepolia.basescan.org',
    },
  },
  testnet: true,
});

export function Providers({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (!appId) {
    console.warn(
      'NEXT_PUBLIC_PRIVY_APP_ID is not set. PrivyProvider will not initialize correctly.',
    );
  }

  const markOnboardingSeen = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ONBOARDING_SEEN_KEY, 'true');
    }
  };

  return (
    <PrivyProvider
      appId={appId ?? ''}
      config={{
        embeddedWallets: {
          createOnLogin: 'all-users',
          noPromptOnSignature: true,
          showWalletUIs: false,
        },
        defaultChain: sepoliaChain,
        supportedChains: [sepoliaChain, baseSepoliaChain],
      }}
    >
      <QueryClientProvider client={queryClient}>
        <TokenPairProvider>
          <YellowClientProvider>
            <NextStepProvider>
              <NextStepReact
                steps={onboardingSteps}
                cardComponent={OnboardingCard}
                onComplete={markOnboardingSeen}
                onSkip={markOnboardingSeen}
              >
                {children}
              </NextStepReact>
            </NextStepProvider>
          </YellowClientProvider>
        </TokenPairProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
