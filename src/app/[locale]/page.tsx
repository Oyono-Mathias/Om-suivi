'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase, addDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase';
import { doc, collection, query, orderBy, limit, where, getDocs, serverTimestamp } from 'firebase/firestore';
import type { TimeEntry, Profile, Shift, GlobalSettings, Announcement } from '@/lib/types';
import { shifts } from '@/lib/shifts';
import { format, parseISO, differenceInMinutes, addHours, differenceInHours } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { Loader2, Briefcase, Megaphone } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { useShift } from '@/context/ShiftContext';
import { suggestWorkLocation } from '@/ai/flows/geolocation-assisted-time-entry';
import ManualEntryDialog from '@/components/manual-entry-dialog';
import { getDistanceFromLatLonInKm, cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from '@/navigation';
import { useAd } from '@/context/AdContext';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const LOCAL_STORAGE_KEY = 'activeShiftState_v2';

interface ActiveShiftState {
  activeTimeEntryId: string;
  startTimeISO: string;
  shiftId: string;
  lastSeenISO: string;
}

export default function TimeTrackingPage() {
  const t = useTranslations('TimeTrackingPage');
  const tShared = useTranslations('Shared');
  const locale = useLocale();
  const dateFnsLocale = locale === 'fr' ? fr : enUS;

  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const { isShiftActive, setIsShiftActive } = useShift();
  const { tryShowAd } = useAd();

  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
  const [activeTimer, setActiveTimer] = useState<NodeJS.Timeout | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [activeTimeEntryId, setActiveTimeEntryId] = useState<string | null>(null);
  
  const [isManualEntryOpen, setManualEntryOpen] = useState(false);
  const [showLocationConfirm, setShowLocationConfirm] = useState(false);
  const [suggestedLocation, setSuggestedLocation] = useState<string | null>(null);
  const [currentCoordinates, setCurrentCoordinates] = useState<{lat: number, lon: number} | null>(null);
  const [currentLocationAddress, setCurrentLocationAddress] = useState<string | null>(null);
  const [isFetchingLocation, setIsFetchingLocation] = useState<boolean>(true);
  
  const [isInWorkZone, setIsInWorkZone] = useState<boolean | null>(null);
  
  const [recoveryData, setRecoveryData] = useState<ActiveShiftState | null>(null);


  const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
  const { data: profile, isLoading: isLoadingProfile } = useDoc<Profile>(userProfileRef);

  const settingsRef = useMemoFirebase(() => doc(firestore, 'settings', 'global'), [firestore]);
  const { data: globalSettings, isLoading: isLoadingSettings } = useDoc<GlobalSettings>(settingsRef);

  const timeEntriesQuery = useMemoFirebase(
    () => user ? query(collection(firestore, 'users', user.uid, 'timeEntries'), orderBy('date', 'desc'), limit(5)) : null,
    [firestore, user]
  );
  const { data: timeEntries, isLoading: isLoadingEntries } = useCollection<TimeEntry>(timeEntriesQuery);
  
  const announcementsQuery = useMemoFirebase(
    () => user ? query(collection(firestore, 'announcements'), orderBy('createdAt', 'desc'), limit(1)) : null,
    [firestore, user]
  );
  const { data: announcements, isLoading: isLoadingAnnouncements } = useCollection<Announcement>(announcementsQuery);
  const latestAnnouncement = announcements?.[0];


  // --- Local Storage and Recovery Logic ---
  const saveActiveShiftToLocal = (data: ActiveShiftState) => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
  };

  const clearActiveShiftFromLocal = () => {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  };
  
  const restoreShift = useCallback((stateToRestore: ActiveShiftState) => {
    const now = new Date();
    const startTime = new Date(stateToRestore.startTimeISO);
    const elapsedSeconds = Math.floor((now.getTime() - startTime.getTime()) / 1000);

    setActiveTimeEntryId(stateToRestore.activeTimeEntryId);
    setSelectedShiftId(stateToRestore.shiftId);
    setStatus('in_progress');
    setIsShiftActive(true);
    setElapsedTime(elapsedSeconds);

    const timer = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);
    setActiveTimer(timer);
  }, [setIsShiftActive]);

  useEffect(() => {
    const savedStateJSON = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (savedStateJSON) {
      const savedState: ActiveShiftState = JSON.parse(savedStateJSON);
      const now = new Date();
      const lastSeen = new Date(savedState.lastSeenISO);
      const diffSeconds = (now.getTime() - lastSeen.getTime()) / 1000;

      // If the page was reloaded or tab was closed for a very short time, auto-recover.
      if (diffSeconds < 20) {
        restoreShift(savedState);
      } else {
        // Otherwise, it was a longer disconnection, so ask the user what to do.
        setRecoveryData(savedState);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoreShift]);

  const handleRecoveryEndShift = () => {
    if (!recoveryData) return;
    const effectiveEndTime = new Date(recoveryData.lastSeenISO);
    handleEndShift(effectiveEndTime);
    setRecoveryData(null);
  };

  const handleRecoveryContinue = () => {
    if (!recoveryData) return;
    restoreShift(recoveryData);
    toast({ title: "Session restaurée", description: "Votre session de travail a été reprise." });
    setRecoveryData(null);
  };


  const stopTimer = useCallback(() => {
    if (activeTimer) {
      clearInterval(activeTimer);
      setActiveTimer(null);
    }
    setIsShiftActive(false);
    setElapsedTime(0);
    setActiveTimeEntryId(null);
    clearActiveShiftFromLocal();
  }, [activeTimer, setIsShiftActive]);

  const startTimer = useCallback((entryId: string, startTime: Date, shiftId: string) => {
      setActiveTimeEntryId(entryId);
      setStatus('in_progress');
      setIsShiftActive(true);
      const elapsed = Math.floor((new Date().getTime() - startTime.getTime()) / 1000);
      setElapsedTime(elapsed);
      const timer = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
      setActiveTimer(timer);
      saveActiveShiftToLocal({
        activeTimeEntryId: entryId,
        startTimeISO: startTime.toISOString(),
        shiftId: shiftId,
        lastSeenISO: new Date().toISOString(),
      });
  }, [setIsShiftActive]);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          setCurrentCoordinates({ lat: latitude, lon: longitude });
          try {
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`);
            if (!response.ok) throw new Error('Failed to fetch address');
            const data = await response.json();
            setCurrentLocationAddress(data.display_name);
          } catch (error) {
            console.error("Reverse geocoding failed:", error);
            setCurrentLocationAddress(t('locationUnavailable'));
          } finally {
            setIsFetchingLocation(false);
          }
        },
        (error) => {
          console.error("Geolocation error:", error);
          toast({ variant: 'destructive', title: t('geoFailedTitle'), description: t('geoFailedDescription') });
          setCurrentLocationAddress(t('locationUnavailable'));
          setIsFetchingLocation(false);
          setCurrentCoordinates(null);
        },
        { enableHighAccuracy: true }
      );
    } else {
      toast({ variant: 'destructive', title: t('geoNotSupportedTitle'), description: t('geoNotSupportedDescription') });
      setIsFetchingLocation(false);
      setCurrentLocationAddress(t('locationUnavailable'));
    }
  }, [t, toast]);

  useEffect(() => {
    return () => {
      if (activeTimer) clearInterval(activeTimer);
    };
  }, [activeTimer]);
  
  useEffect(() => {
    if (isShiftActive && globalSettings) {
      if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission();
      }
    }
  }, [isShiftActive, globalSettings]);

  const startShift = useCallback(async (shift: Shift, locationString?: string) => {
    if (!user || !firestore || !profile) return null;
    if (!profile.profession || profile.profession === 'other') {
        toast({
          variant: 'destructive',
          title: tShared('pleaseSetProfessionTitle'),
          description: tShared('pleaseSetProfessionDescription'),
        });
        return null;
    }

    const now = new Date();
    const startTimeStr = format(now, 'HH:mm');

    const newEntry: Omit<TimeEntry, 'id'> = {
        date: format(now, 'yyyy-MM-dd'),
        startTime: startTimeStr,
        endTime: '',
        duration: 0,
        overtimeDuration: 0,
        location: locationString,
        shiftId: shift.id,
        userProfileId: user.uid,
        profession: profile.profession,
    };

    try {
        const docRef = await addDocumentNonBlocking(collection(firestore, 'users', user.uid, 'timeEntries'), newEntry);
        startTimer(docRef.id, now, shift.id);
        toast({ title: t('timerStartedTitle'), description: locationString ? t('timerStartedLocationDescription', {location: locationString}) : t('timerStartedDescription') });
        tryShowAd();
        return docRef.id;
    } catch (error) {
        console.error("Failed to start shift:", error);
        return null;
    }
  }, [user, firestore, profile, t, toast, tShared, tryShowAd, startTimer]);


  const handleEndShift = useCallback((manualEndTime?: Date) => {
    const entryId = activeTimeEntryId || recoveryData?.activeTimeEntryId;
    if (!entryId || !user || !profile) {
      stopTimer();
      return;
    }

    const allEntries = timeEntries || [];
    const entryToUpdate = allEntries.find(e => e.id === entryId);
    
    let shiftId = entryToUpdate?.shiftId || selectedShiftId || recoveryData?.shiftId;
    if (!shiftId) {
        stopTimer();
        return;
    }
  
    const shift = shifts.find(s => s.id === shiftId);
    if (!shift) return;

    const effectiveEndTime = manualEndTime || new Date();
    const endTimeStr = format(effectiveEndTime, 'HH:mm');
    const today = format(effectiveEndTime, 'yyyy-MM-dd');
  
    const startTimeForCalc = entryToUpdate?.startTime || format(new Date(recoveryData!.startTimeISO), 'HH:mm');
    const startDateForCalc = entryToUpdate?.date || format(new Date(recoveryData!.startTimeISO), 'yyyy-MM-dd');
  
    const startDateTime = parseISO(`${startDateForCalc}T${startTimeForCalc}:00`);
    const totalDuration = differenceInMinutes(effectiveEndTime, startDateTime);
  
    const shiftEndDateTime = parseISO(`${today}T${shift.endTime}:00`);
    let overtimeDuration = 0;
    
    const isEligibleForAutoOvertime = ['storekeeper', 'deliveryDriver', 'chauffeur', 'machinist'].includes(profile.profession);

    if (isEligibleForAutoOvertime && effectiveEndTime > shiftEndDateTime) {
      overtimeDuration = differenceInMinutes(effectiveEndTime, shiftEndDateTime);
    }
  
    const entryRef = doc(firestore, 'users', user.uid, 'timeEntries', entryId);
    updateDocumentNonBlocking(entryRef, {
      endTime: endTimeStr,
      duration: totalDuration > 0 ? totalDuration : 0,
      overtimeDuration: overtimeDuration > 0 ? overtimeDuration : 0,
      ...(entryToUpdate?.location === 'Mission' && {location: 'Mission (Terminée)'})
    });
  
    toast({ title: t('timerStoppedTitle'), description: t('timerStoppedDescription', {duration: totalDuration}) });

    if (shift.id === 'night') {
        localStorage.setItem('nightShiftJustEnded', new Date().toISOString());
    }

    if (Notification.permission === 'granted' && navigator.serviceWorker) {
        const overtimeHours = (overtimeDuration / 60).toFixed(2);
        navigator.serviceWorker.ready.then((registration) => {
            registration.showNotification('OM Suivi: Fin de Service', {
                body: `Service terminé. ${overtimeHours} heures supplémentaires enregistrées.`,
                icon: '/icons/icon-192x192.png',
            });
        });
    }

    tryShowAd();
    stopTimer();
  }, [activeTimeEntryId, user, profile, stopTimer, timeEntries, selectedShiftId, firestore, t, toast, recoveryData, tryShowAd]);


  const handleGeofenceEnter = useCallback(async () => {
    if (!globalSettings?.autoClockInEnabled) return;

    if (!isShiftActive && firestore && user && profile && profile.profession && profile.profession !== 'other') {
      const lastNightShiftEnd = localStorage.getItem('nightShiftJustEnded');
      if (lastNightShiftEnd) {
          const hoursSinceEnd = differenceInHours(new Date(), new Date(lastNightShiftEnd));
          if (hoursSinceEnd < 3) {
              return; 
          }
      }

      const now = new Date();
      const currentHour = now.getHours();
      const todayStr = format(now, 'yyyy-MM-dd');
      let shiftToStart: Shift | undefined;

      if (currentHour >= 5 && currentHour < 7) { 
          shiftToStart = shifts.find(s => s.id === 'morningA');
      } else if (currentHour >= 13 && currentHour < 15) {
          shiftToStart = shifts.find(s => s.id === 'afternoon');
      } else if (currentHour >= 21 && currentHour < 23) { 
          shiftToStart = shifts.find(s => s.id === 'night');
      }

      if (!shiftToStart) return;

      const q = query(
          collection(firestore, 'users', user.uid, 'timeEntries'),
          where('date', '==', todayStr),
          where('shiftId', '==', shiftToStart.id)
      );
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) return;

      const newEntryId = await startShift(shiftToStart, 'Usine');
      if (newEntryId && Notification.permission === 'granted' && navigator.serviceWorker) {
          navigator.serviceWorker.ready.then((registration) => {
            registration.showNotification('OM Suivi: Pointage Automatique', {
                body: `Votre service '${shiftToStart!.name}' a démarré automatiquement à ${format(now, 'HH:mm')}.`,
                icon: '/icons/icon-192x192.png',
            });
          });
      }
    }
  }, [isShiftActive, firestore, user, profile, startShift, globalSettings]);


  const handleGeofenceExit = useCallback(() => {
    if (!isShiftActive || !activeTimeEntryId || !user || !firestore || !profile) return;
    
    // Exempt professions for Mission Mode
    if (['deliveryDriver', 'chauffeur'].includes(profile.profession)) {
        const entryRef = doc(firestore, 'users', user.uid, 'timeEntries', activeTimeEntryId);
        updateDocumentNonBlocking(entryRef, { location: 'Mission' });
        if (Notification.permission === 'granted' && navigator.serviceWorker) {
            navigator.serviceWorker.ready.then((registration) => {
                registration.showNotification(t('missionMode.title'), { body: t('missionMode.body'), icon: '/icons/icon-192x192.png' });
            });
        }
        toast({ title: t('missionMode.title'), description: t('missionMode.body') });
        return;
    }
    
    // For all other professions, end the shift immediately.
    handleEndShift();
     if (Notification.permission === 'granted' && navigator.serviceWorker) {
        navigator.serviceWorker.ready.then((registration) => {
            registration.showNotification("OM Suivi: Service terminé", {
                body: "Le service a été automatiquement arrêté car vous avez quitté la zone de travail.",
                icon: '/icons/icon-192x192.png',
            });
        });
    }

  }, [isShiftActive, activeTimeEntryId, user, firestore, profile, t, toast, handleEndShift]);


  useEffect(() => {
    if (!profile || !profile.workLatitude || !profile.workLongitude || !profile.workRadius || profile.profession === 'other') {
        setIsInWorkZone(null); // No workplace configured for user
        return;
    };

    const monitorLocation = () => {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                if (!profile.workLatitude || !profile.workLongitude || !profile.workRadius) return;

                const distance = getDistanceFromLatLonInKm(
                    position.coords.latitude,
                    position.coords.longitude,
                    profile.workLatitude,
                    profile.workLongitude
                );
                const currentlyInZone = distance * 1000 <= profile.workRadius;

                // --- Geofence Transition Logic ---
                if (isInWorkZone !== null && isInWorkZone !== currentlyInZone) {
                    if (currentlyInZone) {
                        handleGeofenceEnter();
                    } else if (isShiftActive) {
                        handleGeofenceExit();
                    }
                }
                setIsInWorkZone(currentlyInZone);

                // --- Logic for when a shift is ACTIVE ---
                if (isShiftActive && activeTimeEntryId) {
                    // Update local storage state with last seen time
                    const savedStateJSON = localStorage.getItem(LOCAL_STORAGE_KEY);
                    if (savedStateJSON) {
                        const savedState: ActiveShiftState = JSON.parse(savedStateJSON);
                        savedState.lastSeenISO = new Date().toISOString();
                        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(savedState));
                    }
                }
            },
            (error) => { console.warn("Periodic location check failed. This can happen temporarily and is often not a critical issue.", error); },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    };

    const intervalId = setInterval(monitorLocation, 10000);
    monitorLocation();

    return () => clearInterval(intervalId);
  }, [profile, globalSettings, isShiftActive, isInWorkZone, activeTimeEntryId, handleGeofenceEnter, handleGeofenceExit]);
  
  
  const handleManualStart = async () => {
    const shiftIdToUse = selectedShiftId || (() => {
        const now = new Date();
        const currentHour = now.getHours();
        if (currentHour >= 5 && currentHour < 14) return 'morningA';
        if (currentHour >= 14 && currentHour < 22) return 'afternoon';
        if (currentHour >= 22 || currentHour < 5) return 'night';
        return null;
    })();

    if (!shiftIdToUse) {
        toast({ variant: 'destructive', title: t('shiftNotSelectedTitle'), description: t('shiftNotSelectedDescription') });
        return;
    }
    
    setSelectedShiftId(shiftIdToUse);

    if (!user || !firestore) return;

    if (!currentCoordinates) {
        toast({ variant: 'destructive', title: t('geoFailedTitle'), description: t('geoFailedDescription') });
        return;
    }
    
    try {
        const { suggestedLocation: aiSuggestion } = await suggestWorkLocation({
            latitude: currentCoordinates.lat,
            longitude: currentCoordinates.lon,
        });

        setSuggestedLocation(aiSuggestion);
        setShowLocationConfirm(true);

    } catch (error) {
        console.error("AI suggestion failed:", error);
        toast({ variant: 'destructive', title: t('geoSuggestErrorTitle'), description: t('geoSuggestErrorDescription') });
        const shift = shifts.find(s => s.id === shiftIdToUse);
        if (shift) {
            await startShift(shift, currentLocationAddress || `Lat: ${currentCoordinates.lat}, Lon: ${currentCoordinates.lon}`);
        }
    }
  };

  const handleLocationConfirm = async (useLocation: boolean) => {
      setShowLocationConfirm(false);
      const shift = shifts.find(s => s.id === selectedShiftId);
      if (!shift) return;

      const locationString = useLocation ? suggestedLocation ?? undefined : undefined;
      await startShift(shift, locationString);
      setSuggestedLocation(null);
  };

  const formatElapsedTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };
  
  const [status, setStatus] = useState<'idle' | 'in_progress'>('idle');

  const currentStatus = useMemo(() => {
    switch(status) {
      case 'in_progress': return t('statusInProgress');
      default: return t('statusIdle');
    }
  }, [status, t]);

  const isLoading = isUserLoading || isLoadingProfile || isLoadingSettings || isLoadingAnnouncements;
  if (isLoading) {
      return (
          <div className="space-y-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className='w-full md:w-auto'>
                      <Skeleton className="h-10 w-48 mb-2" />
                      <Skeleton className="h-5 w-64" />
                  </div>
                  <div className="flex gap-2 w-full md:w-auto">
                      <Skeleton className="h-12 flex-1" />
                  </div>
              </div>
              <Skeleton className="h-40 w-full" />
              <div className="mt-8 space-y-4">
                  <Skeleton className="h-8 w-40 mb-4" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
              </div>
          </div>
      );
  }

  if (!user) {
    return (
        <div className="flex flex-col justify-center items-center h-screen gap-4">
            <p className="text-xl">{tShared('pleaseLogin')}</p>
            <Link href="/login">
                <Button>{tShared('loginButton')}</Button>
            </Link>
        </div>
    );
  }

  if (profile && (!profile.profession || profile.profession === 'other')) {
    return (
      <div className="flex flex-col justify-center items-center h-screen gap-4 text-center p-4">
        <Briefcase className="w-16 h-16 text-muted-foreground" />
        <h2 className="text-2xl font-bold">{tShared('pleaseSetProfessionTitle')}</h2>
        <p className="text-muted-foreground max-w-sm">{tShared('pleaseSetProfessionDescription')}</p>
        <Link href="/profile">
          <Button>{tShared('goToProfileButton')}</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
       {latestAnnouncement && (
        <Alert>
          <Megaphone className="h-4 w-4" />
          <AlertTitle>{t('noticeBoardTitle', {authorName: latestAnnouncement.authorName})}</AlertTitle>
          <AlertDescription>{latestAnnouncement.message}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold">{t('title')}</h1>
          <p className="text-muted-foreground">{currentStatus}</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
           <Button
            variant="outline"
            className="flex-1 h-14"
            onClick={() => setManualEntryOpen(true)}
            disabled={isShiftActive}
          >
            {t('manualEntryButton')}
          </Button>
        </div>
      </div>

      <Card className="text-center p-6">
        <CardContent className="p-0">
          <div className="text-6xl font-bold font-mono tracking-tighter mb-4">
            {formatElapsedTime(elapsedTime)}
          </div>
          <div className="max-w-xs mx-auto">
            <Select onValueChange={setSelectedShiftId} value={selectedShiftId ?? ''} disabled={isShiftActive}>
              <SelectTrigger>
                <SelectValue placeholder={t('selectShiftPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {shifts.map(shift => (
                  <SelectItem key={shift.id} value={shift.id}>
                    {shift.name} ({shift.startTime} - {shift.endTime})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      
      <div className="space-y-2 md:relative md:left-auto md:right-auto md:bottom-auto md:z-auto bg-background/80 backdrop-blur-sm md:bg-transparent md:backdrop-blur-none rounded-t-lg">
        <div className={cn(
          "text-center text-sm mb-2 px-4 md:px-0",
          isInWorkZone === false ? 'text-destructive font-semibold' : 'text-muted-foreground'
        )}>
          <span className='font-medium'>{t('currentLocationLabel')}:</span> {isFetchingLocation ? tShared('loading') : (currentLocationAddress || t('locationUnavailable'))}
        </div>
        {!isShiftActive ? (
            <Button
                className="w-full h-20 text-xl"
                onClick={handleManualStart}
                disabled={isShiftActive || isFetchingLocation || !currentCoordinates}
            >
                {t('startShiftButton')}
            </Button>
        ) : (
            <Button
                className="w-full h-20 text-xl"
                variant="destructive"
                onClick={() => handleEndShift()}
                disabled={!isShiftActive}
            >
                {t('endShiftButton')}
            </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('recentEntriesTitle')}</CardTitle>
          <CardDescription>{t('recentEntriesDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('tableDate')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('tableShift')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('tableHours')}</TableHead>
                <TableHead>{t('tableDuration')}</TableHead>
                <TableHead>{t('tableOvertime')}</TableHead>
                <TableHead className="hidden sm:table-cell">{t('tableLocation')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingEntries ? (
                Array.from({length: 3}).map((_, i) => (
                    <TableRow key={i}>
                        <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                        <TableCell className="hidden md:table-cell"><Skeleton className="h-5 w-20" /></TableCell>
                        <TableCell className="hidden md:table-cell"><Skeleton className="h-5 w-28" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                        <TableCell className="hidden sm:table-cell"><Skeleton className="h-5 w-24" /></TableCell>
                    </TableRow>
                ))
              ) : timeEntries && timeEntries.length > 0 ? (
                timeEntries.map(entry => (
                  <TableRow key={entry.id}>
                    <TableCell>{format(parseISO(entry.date), 'PPP', { locale: dateFnsLocale })}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      {shifts.find(s => s.id === entry.shiftId)?.name || entry.shiftId}
                      {entry.isPublicHoliday ? <span className="text-xs text-primary">{t('holidaySuffix')}</span> : ''}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{entry.startTime} - {entry.endTime}</TableCell>
                    <TableCell>{entry.duration > 0 ? `${entry.duration} ${t('minutes')}` : '-'}</TableCell>
                    <TableCell className="text-destructive font-mono tabular-nums">{entry.overtimeDuration > 0 ? `${entry.overtimeDuration} ${t('minutes')}` : '-'}</TableCell>
                    <TableCell className="hidden sm:table-cell">{entry.location || t('noLocation')}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    {t('noEntries')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      <ManualEntryDialog 
        isOpen={isManualEntryOpen} 
        onOpenChange={setManualEntryOpen}
        profile={profile}
      />

       <AlertDialog open={showLocationConfirm} onOpenChange={setShowLocationConfirm}>
          <AlertDialogContent>
              <AlertDialogHeader>
                  <AlertDialogTitle>{t('locationConfirmTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>
                      {t('locationConfirmDescriptionPart1')}
                      <strong className="text-primary">{suggestedLocation}</strong>
                      {t('locationConfirmDescriptionPart2')}
                  </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => handleLocationConfirm(false)}>{t('locationConfirmCancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={() => handleLocationConfirm(true)}>{t('locationConfirmAction')}</AlertDialogAction>
              </AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>
      
      <AlertDialog open={!!recoveryData} onOpenChange={(open) => !open && setRecoveryData(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('disconnection.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('disconnection.description', { time: recoveryData ? format(new Date(recoveryData.lastSeenISO), 'p') : '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleRecoveryContinue}>{t('disconnection.cancelButton')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleRecoveryEndShift}>{t('disconnection.confirmButton')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
