import createMiddleware from 'next-intl/middleware';
import { locales, pathnames } from './navigation';
 
export default createMiddleware({
  locales,
  pathnames,
  defaultLocale: 'fr',
  localePrefix: 'always'
});
 
export const config = {
  matcher: ['/((?!api|_next|.*\\..*).*)']
};