
'use client';
import { createContext, useContext, useState, ReactNode } from 'react';

type ShiftContextType = {
  isShiftActive: boolean;
  setIsShiftActive: (isActive: boolean) => void;
};

const ShiftContext = createContext<ShiftContextType | undefined>(undefined);

export const ShiftProvider = ({ children }: { children: ReactNode }) => {
  const [isShiftActive, setIsShiftActive] = useState(false);

  return (
    <ShiftContext.Provider value={{ isShiftActive, setIsShiftActive }}>
      {children}
    </ShiftContext.Provider>
  );
};

export const useShift = () => {
  const context = useContext(ShiftContext);
  if (context === undefined) {
    throw new Error('useShift must be used within a ShiftProvider');
  }
  return context;
};
