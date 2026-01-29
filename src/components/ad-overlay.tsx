'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogClose, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { X } from 'lucide-react';
import { Button } from './ui/button';

interface AdOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

const COUNTDOWN_SECONDS = 5;

export default function AdOverlay({ isOpen, onClose }: AdOverlayProps) {
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);

  useEffect(() => {
    if (isOpen) {
      setCountdown(COUNTDOWN_SECONDS); // Reset countdown when opened
      const timer = setInterval(() => {
        setCountdown(prev => (prev > 0 ? prev - 1 : 0));
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [isOpen]);

  // We don't want the user to close it by clicking outside, so this is a no-op if the countdown is active.
  const handleOpenChange = (open: boolean) => {
    if (!open && countdown === 0) {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="p-0 border-0 w-full h-full max-w-none sm:rounded-none flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm">
        <DialogHeader className="sr-only">
          <DialogTitle>Advertisement</DialogTitle>
          <DialogDescription>An advertisement is being displayed. You can close it after the countdown.</DialogDescription>
        </DialogHeader>
        <div className="absolute top-4 right-4 z-50">
          <DialogClose asChild>
             <Button
                variant="secondary"
                size="icon"
                onClick={onClose}
                disabled={countdown > 0}
                className="rounded-full data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed transition-opacity"
            >
                <X className="h-5 w-5" />
                {countdown > 0 && <span className="absolute text-xs flex items-center justify-center h-full w-full">{countdown}</span>}
            </Button>
          </DialogClose>
        </div>
        
        <div className="w-full max-w-md h-96 bg-muted/20 border border-dashed border-muted-foreground/50 flex items-center justify-center">
            <p className="text-muted-foreground text-center">
                Placeholder for Ad Content
                <br />
                (e.g., Google AdSense/AdMob)
            </p>
        </div>
        <p className="absolute bottom-10 text-xs text-muted-foreground/50">
            This is a placeholder for a mobile ad.
        </p>
      </DialogContent>
    </Dialog>
  );
}
