'use client';

import React, { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useUser, useFirestore, useCollection, useDoc, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy, doc, setDoc, addDoc, deleteDoc } from 'firebase/firestore';
import { Loader2, PlusCircle, Edit, Trash2 } from 'lucide-react';
import type { FaqItem as FaqItemType, Profile } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';

// Form schema for adding/editing FAQ items
const faqSchema = z.object({
  question: z.string().min(1, "La question est requise."),
  answer: z.string().min(1, "La réponse est requise."),
});

type FaqFormValues = z.infer<typeof faqSchema>;

function FaqForm({
  item,
  onSave,
  onCancel,
  isSaving,
}: {
  item?: Partial<FaqItemType>;
  onSave: (data: FaqFormValues) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const t = useTranslations('FaqPage');
  const form = useForm<FaqFormValues>({
    resolver: zodResolver(faqSchema),
    defaultValues: {
      question: item?.question || '',
      answer: item?.answer || '',
    },
  });

  return (
    <form onSubmit={form.handleSubmit(onSave)} className="space-y-4 p-4 border rounded-md bg-muted/20 my-2">
      <h3 className="font-semibold">{item?.id ? t('editButton') : t('newFaqTitle')}</h3>
      <div>
        <label htmlFor="question" className="text-sm font-medium">{t('questionLabel')}</label>
        <Textarea id="question" {...form.register('question')} className="mt-1" />
        {form.formState.errors.question && (
          <p className="text-sm text-destructive mt-1">{form.formState.errors.question.message}</p>
        )}
      </div>
      <div>
        <label htmlFor="answer" className="text-sm font-medium">{t('answerLabel')}</label>
        <Textarea id="answer" {...form.register('answer')} className="mt-1" rows={5} />
        {form.formState.errors.answer && (
          <p className="text-sm text-destructive mt-1">{form.formState.errors.answer.message}</p>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
          {t('cancelButton')}
        </Button>
        <Button type="submit" disabled={isSaving}>
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('saveButton')}
        </Button>
      </div>
    </form>
  );
}

export default function FaqPage() {
  const t = useTranslations('FaqPage');
  const locale = useLocale();
  const firestore = useFirestore();
  const { user } = useUser();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
  const { data: profile } = useDoc<Profile>(userProfileRef);
  const isAdmin = profile?.role === 'admin';

  const faqQuery = useMemoFirebase(() => 
    query(collection(firestore, 'faq'), where('locale', '==', locale), orderBy('order')),
    [firestore, locale]
  );
  const { data: faqItems, isLoading } = useCollection<FaqItemType>(faqQuery);

  const handleSave = async (data: FaqFormValues) => {
    setIsSaving(true);
    if (editingId) {
      // Update existing item
      const itemRef = doc(firestore, 'faq', editingId);
      await setDoc(itemRef, { ...data }, { merge: true });
      setEditingId(null);
    } else {
      // Add new item
      const newOrder = faqItems ? faqItems.length + 1 : 1;
      await addDoc(collection(firestore, 'faq'), {
        ...data,
        locale,
        order: newOrder,
      });
      setIsAdding(false);
    }
    setIsSaving(false);
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    setIsSaving(true);
    const itemRef = doc(firestore, 'faq', deletingId);
    await deleteDoc(itemRef);
    setDeletingId(null);
    setIsSaving(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-headline font-bold">{t('title')}</h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
        {isAdmin && !isAdding &&(
          <Button onClick={() => setIsAdding(true)}>
            <PlusCircle className="mr-2 h-4 w-4" />
            {t('addButton')}
          </Button>
        )}
      </div>

      {isAdding && (
        <FaqForm
          onSave={handleSave}
          onCancel={() => setIsAdding(false)}
          isSaving={isSaving}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('mainTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            <Accordion type="single" collapsible className="w-full">
              {faqItems && faqItems.map((item) => (
                editingId === item.id ? (
                  <FaqForm
                    key={item.id}
                    item={item}
                    onSave={handleSave}
                    onCancel={() => setEditingId(null)}
                    isSaving={isSaving}
                  />
                ) : (
                  <AccordionItem value={item.id} key={item.id} className="group/item border-b">
                    <AccordionTrigger className="py-4 text-base hover:no-underline">
                      <div className="flex-1 text-left">{item.question}</div>
                      {isAdmin && (
                        <div className="flex items-center gap-1 pl-4 opacity-0 group-hover/item:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); setEditingId(item.id); }}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive" onClick={(e) => { e.stopPropagation(); setDeletingId(item.id); }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </AccordionTrigger>
                    <AccordionContent>
                      <p className="text-base leading-relaxed whitespace-pre-line pb-4">{item.answer}</p>
                    </AccordionContent>
                  </AccordionItem>
                )
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('deleteConfirmDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletingId(null)}>{t('cancelButton')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isSaving} className="bg-destructive hover:bg-destructive/90">
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('deleteButton')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
