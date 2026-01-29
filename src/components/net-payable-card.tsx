'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';

interface NetPayableCardProps {
  netPay: number;
}

export default function NetPayableCard({ netPay }: NetPayableCardProps) {
  const t = useTranslations('BulletinPage');

  const formatCurrency = (amount: number) => Math.round(amount).toLocaleString('fr-FR');

  return (
    <div className="relative w-full max-w-md mx-auto rounded-2xl p-6 text-white overflow-hidden shadow-2xl bg-gradient-to-br from-[#1E2A5D] to-[#5C2E6A]">
      <div className="absolute top-0 left-0 w-full h-full bg-black/10"></div>
      <div className="relative z-10">
        <div className="flex justify-between items-start">
          <span className="text-sm font-light text-white/80">{t('netPayableLabel')}</span>
          <Image src="/logo-om.png" alt="OM Suivi Logo" width={32} height={32} className="opacity-80" />
        </div>
        <div className="mt-4">
          <span className="text-4xl font-bold tracking-tight font-mono tabular-nums">
            {formatCurrency(netPay)}
          </span>
          <span className="ml-2 text-lg font-medium text-white/80">FCFA</span>
        </div>
        <div className="mt-8 flex justify-between items-center text-xs font-light text-white/60">
          <span>OM Suivi Paystub</span>
          <span>{new Date().toLocaleDateString('fr-FR', { month: '2-digit', year: '2-digit' })}</span>
        </div>
      </div>
    </div>
  );
}
