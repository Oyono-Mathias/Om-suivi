'use client';

import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import AdOverlay from '@/components/ad-overlay';

const AD_FREQUENCY_MINUTES = 30;
const LOCAL_STORAGE_KEY = 'lastAdShownTimestamp';

type AdContextType = {
  tryShowAd: () => void;
};

const AdContext = createContext<AdContextType | undefined>(undefined);

export const AdProvider = ({ children }: { children: ReactNode }) => {
  const [isAdVisible, setIsAdVisible] = useState(false);

  const tryShowAd = useCallback(() => {
    const now = new Date().getTime();
    const lastAdTimestamp = localStorage.getItem(LOCAL_STORAGE_KEY);
    const timeSinceLastAd = lastAdTimestamp ? now - parseInt(lastAdTimestamp, 10) : Infinity;
    const adFrequencyMs = AD_FREQUENCY_MINUTES * 60 * 1000;

    if (timeSinceLastAd > adFrequencyMs) {
      setIsAdVisible(true);
      localStorage.setItem(LOCAL_STORAGE_KEY, now.toString());
    }
  }, []);

  const handleAdClose = () => {
    setIsAdVisible(false);
  };

  return (
    <AdContext.Provider value={{ tryShowAd }}>
      {children}
      <AdOverlay isOpen={isAdVisible} onClose={handleAdClose} />
    </AdContext.Provider>
  );
};

export const useAd = () => {
  const context = useContext(AdContext);
  if (context === undefined) {
    throw new Error('useAd must be used within an AdProvider');
  }
  return context;
};
