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
  '/reports': {
    en: '/reports',
    fr: '/rapports'
  },
  '/reports/export': {
    en: '/reports/export',
    fr: '/rapports/exporter'
  },
  '/team': {
    en: '/team',
    fr: '/equipe'
  },
  '/admin': {
    en: '/admin',
    fr: '/admin'
  }
};

export const {Link, redirect, usePathname, useRouter} =
  createLocalizedPathnamesNavigation({locales, localePrefix, pathnames});
