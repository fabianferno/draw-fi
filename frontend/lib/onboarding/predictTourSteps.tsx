'use client';

import type { Tour } from 'nextstepjs';

const PREDICT_TOUR_ID = 'predictTour';

export const predictTourId = PREDICT_TOUR_ID;

export const onboardingSteps: Tour[] = [
  {
    tour: PREDICT_TOUR_ID,
    steps: [
      {
        icon: '👋',
        title: 'Welcome to Draw-Fi',
        content:
          "You're on the Play page. Here you draw your price prediction and open a position. Let's walk through the main areas.",
        selector: '#onboard-token-pair',
        side: 'bottom',
        showControls: true,
        showSkip: true,
        pointerPadding: 10,
        pointerRadius: 10,
      },
      {
        icon: '📊',
        title: 'Choose your market',
        content:
          'Select the token pair you want to trade. The chart and your prediction will use this market.',
        selector: '#onboard-token-pair',
        side: 'bottom',
        showControls: true,
        showSkip: true,
        pointerPadding: 10,
        pointerRadius: 10,
      },
      {
        icon: '📈',
        title: 'Live chart',
        content:
          'This is the price chart. After you place a position, your drawn prediction will appear here and resolve over time.',
        selector: '#onboard-chart',
        side: 'bottom',
        showControls: true,
        showSkip: true,
        pointerPadding: 10,
        pointerRadius: 10,
      },
      {
        icon: '✏️',
        title: 'Draw your prediction',
        content:
          'Draw a line from left to right: where you think the price will go. You can pick a time horizon (1–5 min), set leverage, and amount below.',
        selector: '#onboard-draw-box',
        side: 'top',
        showControls: true,
        showSkip: true,
        pointerPadding: 10,
        pointerRadius: 10,
      },
      {
        icon: '🎰',
        title: 'Pull the lever',
        content:
          'When your pattern is ready, set your amount and pull the DRAWFI lever to open your position. Good luck!',
        selector: '#onboard-draw-box',
        side: 'top',
        showControls: true,
        showSkip: true,
        pointerPadding: 10,
        pointerRadius: 10,
      },
    ],
  },
];
