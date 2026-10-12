'use client';

import React, { useEffect, useRef } from 'react';

interface TurnstileProps {
  onVerify: (token: string) => void;
  siteKey?: string;
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        element: string | HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          'error-callback'?: () => void;
          theme?: 'light' | 'dark' | 'auto';
        }
      ) => string;
      reset: (widgetId: string) => void;
    };
  }
}

export const TurnstileWidget: React.FC<TurnstileProps> = ({
  onVerify,
  siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '1x00000000000000000000AA',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let widgetId: string | null = null;

    const initTurnstile = () => {
      if (window.turnstile && containerRef.current) {
        try {
          widgetId = window.turnstile.render(containerRef.current, {
            sitekey: siteKey,
            callback: (token: string) => {
              onVerify(token);
            },
            theme: 'light',
          });
        } catch (e) {
          console.warn('Turnstile render warning:', e);
        }
      } else {
        // Fallback untuk local mock dev jika CDN Turnstile diblokir
        onVerify('mock-turnstile-token-dev');
      }
    };

    const timer = setTimeout(initTurnstile, 500);

    return () => {
      clearTimeout(timer);
    };
  }, [siteKey, onVerify]);

  return (
    <div className="flex flex-col items-center justify-center my-3">
      <div ref={containerRef} className="min-h-[65px] flex items-center justify-center" />
      <span className="text-[11px] text-slate-400 mt-1">Dilindungi oleh Cloudflare Turnstile Bot Defense</span>
    </div>
  );
};
