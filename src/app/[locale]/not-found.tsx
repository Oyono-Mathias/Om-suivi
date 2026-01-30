
'use client';

import { useTranslations } from 'next-intl';

export default function NotFound() {
  const t = useTranslations('NotFound');
  return (
    <div className="flex flex-col justify-center items-center h-screen gap-4">
      <h1 className="text-4xl font-bold">{t('title')}</h1>
      <p>{t('description')}</p>
    </div>
  );
}
