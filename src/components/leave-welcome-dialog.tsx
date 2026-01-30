'use client';

import React from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction
} from '@/components/ui/alert-dialog';
import { Button } from './ui/button';
import { Palmtree } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface LeaveWelcomeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  name: string;
  days: number;
  resumeDate: string;
}

export default function LeaveWelcomeDialog({ isOpen, onClose, name, days, resumeDate }: LeaveWelcomeDialogProps) {
  const t = useTranslations('LeaveWelcomeDialog');
  
  if (!isOpen) return null;

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent className="max-w-md text-center">
        <AlertDialogHeader>
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-4">
            <Palmtree className="h-10 w-10 text-primary" />
          </div>
          <AlertDialogTitle className="text-2xl">{t('title', { name })}</AlertDialogTitle>
          <AlertDialogDescription className="text-base text-muted-foreground pt-2">
            {t('description', { days: Math.round(days), resumeDate })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="sm:justify-center">
          <AlertDialogAction onClick={onClose} className="w-full h-12 text-lg">
            {t('closeButton')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
