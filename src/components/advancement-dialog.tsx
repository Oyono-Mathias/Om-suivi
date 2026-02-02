'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from './ui/button';
import { useTranslations } from 'next-intl';
import type { Notification } from '@/lib/types';
import { useFirestore, updateDocumentNonBlocking } from '@/firebase';
import { doc } from 'firebase/firestore';

const Confetti = dynamic(() => import('react-confetti'), { ssr: false });


interface AdvancementDialogProps {
  notification: Notification;
  onClose: () => void;
}

const useWindowSize = () => {
  const [windowSize, setWindowSize] = useState({
    width: 0,
    height: 0,
  });

  useEffect(() => {
    // This code now only runs on the client
    function handleResize() {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    }
    
    window.addEventListener("resize", handleResize);
    handleResize();
    
    return () => window.removeEventListener("resize", handleResize);
  }, []); // Empty dependency array ensures this runs once on mount

  return windowSize;
};


export default function AdvancementDialog({ notification, onClose }: AdvancementDialogProps) {
  const t = useTranslations('AdvancementNotification');
  const firestore = useFirestore();
  const { width, height } = useWindowSize();
  const [showConfetti, setShowConfetti] = useState(true);

  const handleClose = async () => {
    const notificationRef = doc(firestore, 'users', notification.userId, 'notifications', notification.id);
    updateDocumentNonBlocking(notificationRef, { isRead: true });
    setShowConfetti(false);
    onClose();
  };

  return (
    <Dialog open={true} onOpenChange={handleClose}>
      {showConfetti && width > 0 && <Confetti width={width} height={height} recycle={false} onConfettiComplete={() => setShowConfetti(false)} />}
      <DialogContent className="max-w-md text-center">
        <DialogHeader>
          <DialogTitle className="text-2xl">{notification.title}</DialogTitle>
          <DialogDescription className="text-base text-muted-foreground pt-2 whitespace-pre-wrap">
            {notification.body}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-center">
          <Button onClick={handleClose} className="w-full h-12 text-lg">
            {t('closeButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
