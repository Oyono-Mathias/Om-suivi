'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

type FaqItem = {
  question: string;
  answer: string;
};

export default function FaqPage() {
  const t = useTranslations('FaqPage');
  
  const faqItems: FaqItem[] = [
    {
      question: t('q1_question'),
      answer: t('q1_answer'),
    },
    {
      question: t('q2_question'),
      answer: t('q2_answer'),
    },
    {
      question: t('q3_question'),
      answer: t('q3_answer'),
    },
    {
      question: t('q4_question'),
      answer: t('q4_answer'),
    },
     {
      question: t('q5_question'),
      answer: t('q5_answer'),
    },
    {
      question: t('q6_question'),
      answer: t('q6_answer'),
    },
    {
        question: t('q7_question'),
        answer: t('q7_answer'),
    },
    {
        question: t('q8_question'),
        answer: t('q8_answer'),
    }
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-headline font-bold">{t('title')}</h1>
      <p className="text-muted-foreground">{t('description')}</p>

      <Card>
        <CardHeader>
          <CardTitle>{t('mainTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {faqItems.map((item, index) => (
              <AccordionItem value={`item-${index}`} key={index}>
                <AccordionTrigger>{item.question}</AccordionTrigger>
                <AccordionContent>
                  <p className="text-base leading-relaxed">{item.answer}</p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
