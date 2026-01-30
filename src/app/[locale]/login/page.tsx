'use client';

import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth, useFirestore, useUser } from '@/firebase';
import { useRouter } from '@/navigation';
import { AtSign, Briefcase, Loader2, Lock, User as UserIcon, AlertCircle } from 'lucide-react';
import { FirebaseError } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useTranslations } from 'next-intl';
import type { Profession } from '@/lib/types';
import Image from 'next/image';
import { format } from 'date-fns';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';


export default function AuthPage() {
  const t = useTranslations('LoginPage');
  const tProfile = useTranslations('ProfilePage');
  const auth = useAuth();
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('login');
  
  // State for inline auth errors
  const [authError, setAuthError] = useState<string | null>(null);

  const [isResetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [resetFeedback, setResetFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const professions: { value: Profession, label: string }[] = [
    { value: 'machinist', label: tProfile('professions.machinist') },
    { value: 'storekeeper', label: tProfile('professions.storekeeper') },
    { value: 'deliveryDriver', label: tProfile('professions.deliveryDriver') },
    { value: 'chauffeur', label: tProfile('professions.chauffeur') },
    { value: 'securityAgent', label: tProfile('professions.securityAgent') },
    { value: 'other', label: tProfile('professions.other') },
  ];

  const loginSchema = z.object({
    email: z.string().email({ message: t('emailInvalidError') }),
    password: z.string().min(1, { message: t('passwordRequiredError') }),
  });

  const registerSchema = z.object({
    name: z.string().min(2, { message: t('nameMinLengthError') }),
    email: z.string().email({ message: t('emailInvalidError') }),
    password: z.string().min(6, { message: t('passwordMinLengthError') }),
    profession: z.enum(['machinist', 'storekeeper', 'deliveryDriver', 'chauffeur', 'securityAgent', 'other'], {
      required_error: t('professionRequiredError'),
    }),
  });

  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const registerForm = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  useEffect(() => {
    if (user) {
      router.replace('/');
    }
  }, [user, router]);
  
  // Reset error when tab changes
  useEffect(() => {
    setAuthError(null);
  }, [activeTab]);

  if (isUserLoading || user) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  const handleLogin = async (values: z.infer<typeof loginSchema>) => {
    if (!auth || !firestore) return;
    setIsLoading(true);
    setAuthError(null);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, values.email, values.password);
      const loggedInUser = userCredential.user;

      const userDocRef = doc(firestore, 'users', loggedInUser.uid);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists() && userDoc.data().role === 'admin') {
        router.replace('/admin');
      } else {
        router.replace('/');
      }
    } catch (error) {
      if (error instanceof FirebaseError) {
        setAuthError(
            error.code === 'auth/invalid-credential'
              ? t('loginErrorInvalid')
              : t('loginErrorGeneric')
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (values: z.infer<typeof registerSchema>) => {
    if (!auth || !firestore) return;
    setIsLoading(true);
    setAuthError(null);
    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        values.email,
        values.password
      );
      const { user: newUser } = userCredential;
      await updateProfile(newUser, {
        displayName: values.name,
      });
      
      const userDocRef = doc(firestore, 'users', newUser.uid);
      await setDoc(userDocRef, {
        id: newUser.uid,
        name: values.name,
        email: values.email,
        role: 'user',
        profession: values.profession,
        monthlyBaseSalary: 0,
        currency: 'FCFA',
        createdAt: serverTimestamp(),
        hireDate: format(new Date(), 'yyyy-MM-dd'),
      });
      
      router.replace('/');
    } catch (error) {
      if (error instanceof FirebaseError) {
        setAuthError(
          error.code === 'auth/email-already-in-use'
            ? t('registerErrorInUse')
            : t('registerErrorGeneric')
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!auth || !resetEmail) return;
    setIsResetting(true);
    setResetFeedback(null);
    try {
      await sendPasswordResetEmail(auth, resetEmail);
      setResetFeedback({ type: 'success', message: t('resetSuccessDescription')});
    } catch (error) {
      setResetFeedback({ type: 'error', message: t('resetErrorDescription') });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-background to-secondary p-4">
      <div className="flex flex-col items-center gap-6 w-full max-w-md">
        <Image src="/logo-om.png" alt="OM Suivi Logo" width={80} height={80} />
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <Card className="w-full rounded-2xl border-border/20 bg-card/60 shadow-lg shadow-black/20 backdrop-blur-lg">
            <CardHeader className="text-center">
              <CardTitle className="text-3xl font-bold">{t('title')}</CardTitle>
              <CardDescription>{t('description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 px-4 md:px-6 pb-6">
              <TabsList className="grid w-full grid-cols-2 bg-secondary/30">
                <TabsTrigger value="login" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary-foreground data-[state=active]:shadow-md">{t('loginTab')}</TabsTrigger>
                <TabsTrigger value="register" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary-foreground data-[state=active]:shadow-md">{t('registerTab')}</TabsTrigger>
              </TabsList>
              
              {authError && (
                 <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>{activeTab === 'login' ? t('loginErrorTitle') : t('registerErrorTitle')}</AlertTitle>
                    <AlertDescription>{authError}</AlertDescription>
                </Alert>
              )}

              <TabsContent value="login" className="m-0">
                <Form {...loginForm}>
                  <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
                    <FormField
                      control={loginForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('emailLabel')}</FormLabel>
                          <div className="relative">
                            <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                            <FormControl>
                              <Input placeholder={t('emailPlaceholder')} {...field} className="pl-10 h-12 text-base" />
                            </FormControl>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={loginForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('passwordLabel')}</FormLabel>
                          <div className="relative">
                             <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                            <FormControl>
                              <Input type="password" {...field} className="pl-10 h-12 text-base" />
                            </FormControl>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                     <div className="text-right">
                      <Button variant="link" type="button" onClick={() => { setResetFeedback(null); setResetEmail(''); setResetPasswordOpen(true); }} className="h-auto p-0 text-sm font-normal text-muted-foreground hover:text-primary">
                        {t('forgotPasswordLink')}
                      </Button>
                    </div>
                    <Button type="submit" className="w-full text-lg h-14" disabled={isLoading}>
                      {isLoading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                      {t('loginButton')}
                    </Button>
                  </form>
                </Form>
              </TabsContent>
              <TabsContent value="register" className="m-0">
                <Form {...registerForm}>
                  <form onSubmit={registerForm.handleSubmit(handleRegister)} className="space-y-4">
                    <FormField
                      control={registerForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('nameLabel')}</FormLabel>
                           <div className="relative">
                             <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                            <FormControl>
                              <Input placeholder={t('namePlaceholder')} {...field} className="pl-10 h-12 text-base"/>
                            </FormControl>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('emailLabel')}</FormLabel>
                          <div className="relative">
                            <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                            <FormControl>
                              <Input placeholder={t('emailPlaceholder')} {...field} className="pl-10 h-12 text-base" />
                            </FormControl>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                     <FormField
                      control={registerForm.control}
                      name="profession"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('professionLabel')}</FormLabel>
                          <div className="relative">
                             <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                             <FormControl>
                                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                                      <SelectTrigger className="pl-10 h-12 text-base">
                                          <SelectValue placeholder={t('professionPlaceholder')} />
                                      </SelectTrigger>
                                      <SelectContent>
                                          {professions.map(p => (
                                          <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                                          ))}
                                      </SelectContent>
                                  </Select>
                              </FormControl>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('passwordLabel')}</FormLabel>
                           <div className="relative">
                             <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                            <FormControl>
                              <Input type="password" {...field} className="pl-10 h-12 text-base"/>
                            </FormControl>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" className="w-full text-lg h-14" disabled={isLoading}>
                      {isLoading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                      {t('registerButton')}
                    </Button>
                  </form>
                </Form>
              </TabsContent>
            </CardContent>
          </Card>
        </Tabs>
      </div>
      <Dialog open={isResetPasswordOpen} onOpenChange={setResetPasswordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{resetFeedback?.type === 'success' ? t('resetSuccessTitle') : t('resetPasswordTitle')}</DialogTitle>
            <DialogDescription>{resetFeedback?.type === 'success' ? resetFeedback.message : t('resetPasswordDescription')}</DialogDescription>
          </DialogHeader>
          
          {resetFeedback?.type !== 'success' && (
            <div className="space-y-4 py-2">
              <Label htmlFor="reset-email">{t('emailLabel')}</Label>
              <Input
                id="reset-email"
                placeholder={t('emailPlaceholder')}
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                type="email"
              />
              {resetFeedback?.type === 'error' && (
                <p className="text-sm text-destructive">{resetFeedback.message}</p>
              )}
            </div>
          )}

          <DialogFooter>
             {resetFeedback?.type === 'success' ? (
                <DialogClose asChild>
                    <Button>Fermer</Button>
                </DialogClose>
             ) : (
                <>
                <DialogClose asChild>
                    <Button variant="outline">Annuler</Button>
                </DialogClose>
                <Button onClick={handlePasswordReset} disabled={isResetting}>
                    {isResetting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t('resetPasswordButton')}
                </Button>
                </>
             )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
