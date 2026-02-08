'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PrivyProvider } from '@privy-io/react-auth';
import { defineChain } from 'viem';
import { NextStepProvider, NextStepReact } from 'nextstepjs';
import { TokenPairProvider } from '@/contexts/TokenPairContext';
import { OnboardingCard } from '@/components/onboarding/OnboardingCard';
import { onboardingSteps } from '@/lib/onboarding/predictTourSteps';

const ONBOARDING_SEEN_KEY = 'drawfi-predict-onboarding-seen';

const queryClient = new QueryClient();

// Define Ethereum Sepolia chain for Privy
const ethereumSepoliaChain = defineChain({
  id: 11155111,
  name: 'Ethereum Sepolia',
  network: 'sepolia',
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
      name: 'Etherscan Sepolia',
      url: 'https://sepolia.etherscan.io/',
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
        defaultChain: ethereumSepoliaChain,
        supportedChains: [ethereumSepoliaChain],
      }}
    >
      <QueryClientProvider client={queryClient}>
        <TokenPairProvider>
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
        </TokenPairProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
