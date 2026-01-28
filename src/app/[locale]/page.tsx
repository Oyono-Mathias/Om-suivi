
'use client';

import React from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { Skeleton } from '@/components/ui/skeleton';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import type { Course } from '@/lib/types';
import { Link } from '@/navigation';
import {
  Menu,
  BookOpen,
  TrendingUp,
  Users,
  ShieldCheck,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/ui/sheet';

// --- Helper Components ---

const MtnMoneyIcon = () => (
  <svg
    width="64"
    height="64"
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="h-8 w-auto"
  >
    <rect width="64" height="64" rx="12" fill="#FFCC00" />
    <path
      d="M21.933 43.119V20.88h-5.901L10 30.063v2.839l5.37-4.324h.183v14.541h6.38zM39.544 32.222l-6.248 10.897h-6.853l9.84-16.59L29.352 20.88h6.81l6.602 11.342zM42.23 35.793l.223-3.571-3.155-5.59L45.47 20.88h6.291L58 30.063v2.839l-5.327-4.324h-.183v14.541h-6.38v-7.307z"
      fill="#004F9F"
    />
  </svg>
);

const OrangeMoneyIcon = () => (
  <svg
    width="64"
    height="64"
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="h-8 w-auto"
  >
    <rect width="64" height="64" rx="12" fill="black" />
    <path
      d="M32 16C23.163 16 16 23.163 16 32c0 8.836 7.163 16 16 16 8.836 0 16-7.164 16-16 0-8.837-7.164-16-16-16zm-.034 4.594c6.31 0 11.406 5.097 11.406 11.406 0 6.31-5.096 11.406-11.406 11.406-6.31 0-11.406-5.096-11.406-11.406 0-6.309 5.096-11.406 11.406-11.406z"
      fill="#FF7900"
    />
  </svg>
);

const CourseCardSkeleton = () => (
  <div className="flex flex-col space-y-3">
    <Skeleton className="h-[180px] w-full rounded-xl" />
    <div className="space-y-2">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  </div>
);

const NavLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link
    href={href}
    className="text-base font-medium text-gray-600 transition-colors hover:text-primary"
  >
    {children}
  </Link>
);

// --- Page Sections ---

const Header = ({ t }: { t: any }) => (
  <header className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white/80 backdrop-blur-md">
    <div className="container mx-auto flex h-20 items-center justify-between px-4">
      <Link href="/" className="flex items-center gap-2">
        <TrendingUp className="h-8 w-8 text-primary" />
        <span className="text-2xl font-bold text-gray-900">
          {t('navTitle')}
        </span>
      </Link>

      {/* Desktop Nav */}
      <nav className="hidden items-center gap-6 md:flex">
        <NavLink href="#">{t('navCourses')}</NavLink>
        <Button variant="ghost" asChild>
          <Link href="/login">{t('navLogin')}</Link>
        </Button>
        <Button asChild>
          <Link href="/login">{t('navRegister')}</Link>
        </Button>
      </nav>

      {/* Mobile Nav */}
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden">
            <Menu className="h-6 w-6" />
            <span className="sr-only">Ouvrir le menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-full max-w-xs bg-white">
          <div className="flex h-full flex-col p-6">
            <Link href="/" className="mb-8 flex items-center gap-2">
              <TrendingUp className="h-7 w-7 text-primary" />
              <span className="text-xl font-bold text-gray-900">
                {t('navTitle')}
              </span>
            </Link>
            <nav className="flex flex-col gap-6">
              <NavLink href="#">{t('navCourses')}</NavLink>
              <NavLink href="/login">{t('navLogin')}</NavLink>
            </nav>
            <Button className="mt-auto h-12 w-full text-base" asChild>
              <Link href="/login">{t('navRegister')}</Link>
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  </header>
);

const HeroSection = ({ t }: { t: any }) => (
  <section className="bg-white py-16 sm:py-24">
    <div className="container mx-auto px-4 text-center">
      <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl md:text-6xl">
        {t('heroTitle')}
      </h1>
      <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-600">
        {t('heroSubtitle')}
      </p>
      <div className="mt-10">
        <Button size="lg" className="h-14 w-full text-lg sm:w-auto">
          {t('heroCta')}
        </Button>
      </div>
    </div>
  </section>
);

const PaymentsSection = ({ t }: { t: any }) => (
  <section className="py-12">
    <div className="container mx-auto px-4">
      <div className="mx-auto max-w-4xl text-center">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
          {t('paymentsTitle')}
        </h3>
        <div className="mt-4 flex justify-center gap-8">
          <MtnMoneyIcon />
          <OrangeMoneyIcon />
        </div>
      </div>
    </div>
  </section>
);

const FeaturesSection = ({ t }: { t: any }) => {
  const features = [
    {
      icon: BookOpen,
      title: t('feature1Title'),
      description: t('feature1Desc'),
    },
    {
      icon: ShieldCheck,
      title: t('feature2Title'),
      description: t('feature2Desc'),
    },
    {
      icon: Users,
      title: t('feature3Title'),
      description: t('feature3Desc'),
    },
  ];
  return (
    <section className="bg-white py-16 sm:py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-extrabold text-gray-900">
            {t('featuresTitle')}
          </h2>
        </div>
        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {features.map((feature, index) => (
            <div key={index} className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <feature.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="mt-6 text-lg font-medium text-gray-900">
                {feature.title}
              </h3>
              <p className="mt-2 text-base text-gray-600">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const CoursesSection = ({ t }: { t: any }) => {
  const firestore = useFirestore();
  const coursesQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'courses'), orderBy('title')) : null),
    [firestore]
  );
  const { data: courses, isLoading } = useCollection<Course>(coursesQuery);

  return (
    <section className="py-16 sm:py-24">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl font-extrabold text-gray-900 sm:text-center">
          {t('popularCoursesTitle')}
        </h2>
        <div className="mt-12">
          <Carousel
            opts={{
              align: 'start',
              loop: true,
            }}
            className="w-full"
          >
            <CarouselContent className="-ml-4">
              {isLoading &&
                Array.from({ length: 3 }).map((_, index) => (
                  <CarouselItem
                    key={index}
                    className="basis-full pl-4 md:basis-1/2 lg:basis-1/3"
                  >
                    <CourseCardSkeleton />
                  </CarouselItem>
                ))}
              {!isLoading &&
                courses?.map((course) => (
                  <CarouselItem
                    key={course.id}
                    className="basis-full pl-4 md:basis-1/2 lg:basis-1/3"
                  >
                    <Card className="overflow-hidden transition-shadow hover:shadow-xl">
                      <Image
                        src={course.imageUrl}
                        alt={course.title}
                        width={600}
                        height={400}
                        className="h-48 w-full object-cover"
                        data-ai-hint={course.imageHint}
                      />
                      <CardContent className="p-6">
                        <p className="text-sm font-medium text-primary">
                          {course.category}
                        </p>
                        <h3 className="mt-2 text-lg font-bold text-gray-900">
                          {course.title}
                        </h3>
                        <p className="mt-2 h-20 text-sm text-gray-600">
                          {course.description}
                        </p>
                        <div className="mt-4 flex items-center justify-between">
                          <p className="text-lg font-bold text-gray-900">
                            {course.price.toLocaleString('fr-FR')} {course.currency}
                          </p>
                          <p className="text-sm text-gray-500">
                            {course.duration}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </CarouselItem>
                ))}
            </CarouselContent>
            <CarouselPrevious className="ml-14 hidden sm:flex" />
            <CarouselNext className="mr-14 hidden sm:flex" />
          </Carousel>
        </div>
      </div>
    </section>
  );
};

const FaqSection = ({ t }: { t: any }) => {
    const faqs = [
        {
          id: 'faq1',
          title: t('faq1Title'),
          answer: t('faq1Answer'),
        },
        {
          id: 'faq2',
          title: t('faq2Title'),
          answer: t('faq2Answer'),
        },
        {
          id: 'faq3',
          title: t('faq3Title'),
          answer: t('faq3Answer'),
        },
      ];
  return (
    <section className="bg-white py-16 sm:py-24">
      <div className="container mx-auto max-w-3xl px-4">
        <h2 className="text-center text-3xl font-extrabold text-gray-900">
          {t('faqTitle')}
        </h2>
        <Accordion type="single" collapsible className="mt-12 w-full">
          {faqs.map(faq => (
            <AccordionItem key={faq.id} value={faq.id}>
              <AccordionTrigger className="text-left text-lg font-medium hover:no-underline">
                {faq.title}
              </AccordionTrigger>
              <AccordionContent className="text-base text-gray-600">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
};

const FinalCtaSection = ({ t }: { t: any }) => (
    <section className="py-16 sm:py-24">
        <div className="container mx-auto px-4">
            <div className="mx-auto max-w-3xl rounded-2xl bg-primary/10 p-8 text-center sm:p-12">
                 <h2 className="text-3xl font-extrabold text-gray-900">
                    {t('finalCtaTitle')}
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-lg text-gray-600">
                    {t('finalCtaDescription')}
                </p>
                <div className="mt-8">
                     <Button size="lg" className="h-14 w-full text-lg sm:w-auto">
                        {t('finalCtaButton')}
                    </Button>
                </div>
            </div>
        </div>
    </section>
);

const Footer = ({t}:{t:any}) => (
    <footer className="border-t border-gray-200">
        <div className="container mx-auto px-4 py-6 text-center text-sm text-gray-500">
            <p>{t('footerRights')}</p>
        </div>
    </footer>
);


export default function NdaraLandingPage() {
  const t = useTranslations('NdaraLanding');

  return (
    <div className="min-h-screen bg-gray-50 font-body text-gray-800">
      <Header t={t} />
      <main>
        <HeroSection t={t} />
        <PaymentsSection t={t} />
        <FeaturesSection t={t} />
        <CoursesSection t={t} />
        <FaqSection t={t} />
        <FinalCtaSection t={t} />
      </main>
      <Footer t={t} />
    </div>
  );
}
