import {createLocalizedPathnamesNavigation} from 'next-intl/navigation';

export const locales = ['fr', 'en'] as const;
export const localePrefix = 'always';

export const pathnames = {
  '/': '/',
  '/login': '/login',
  '/profile': {
    en: '/profile',
    fr: '/profil'
  },
  '/leave': {
    en: '/leave-request',
    fr: '/demande-conge'
  },
  '/reports': {
    en: '/reports',
    fr: '/rapports'
  },
  '/reports/export': {
    en: '/reports/export',
    fr: '/rapports/exporter'
  },
  '/reports/details-calcul': {
    en: '/reports/calculation-details',
    fr: '/rapports/details-calcul'
  },
  '/reports/historique-absences': {
    en: '/reports/absence-history',
    fr: '/rapports/historique-absences'
  },
  '/reports/details-conges': {
    en: '/reports/leave-details',
    fr: '/rapports/details-conges'
  },
  '/bulletin': {
    en: '/paystub',
    fr: '/bulletin'
  },
  '/team': {
    en: '/team',
    fr: '/equipe'
  },
  '/admin': {
    en: '/admin',
    fr: '/admin'
  },
  '/faq': {
    en: '/faq',
    fr: '/faq'
  }
};

export const {Link, redirect, usePathname, useRouter} =
  createLocalizedPathnamesNavigation({locales, localePrefix, pathnames});
