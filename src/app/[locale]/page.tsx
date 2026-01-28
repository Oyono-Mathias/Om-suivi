
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
import { doc, collection, query, orderBy, limit, serverTimestamp } from 'firebase/firestore';
import type { TimeEntry, Profile, Shift } from '@/lib/types';
import { shifts } from '@/lib/shifts';
import { format, parseISO, differenceInMinutes } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { Loader2 } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { useShift } from '@/context/ShiftContext';
import { suggestWorkLocation } from '@/ai/flows/geolocation-assisted-time-entry';
import ManualEntryDialog from '@/components/manual-entry-dialog';
import { getDistanceFromLatLonInKm } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

export default function TimeTrackingPage() {
  const t = useTranslations('TimeTrackingPage');
  const tShared = useTranslations('Shared');
  const locale = useLocale();
  const dateFnsLocale = locale === 'fr' ? fr : enUS;

  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const { isShiftActive, setIsShiftActive } = useShift();

  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
  const [activeTimer, setActiveTimer] = useState<NodeJS.Timeout | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [activeTimeEntryId, setActiveTimeEntryId] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'in_progress' | 'on_mission'>('idle');
  
  const [isManualEntryOpen, setManualEntryOpen] = useState(false);
  const [showLocationConfirm, setShowLocationConfirm] = useState(false);
  const [suggestedLocation, setSuggestedLocation] = useState<string | null>(null);
  const [currentCoordinates, setCurrentCoordinates] = useState<{lat: number, lon: number} | null>(null);
  const [showGeofenceAlert, setShowGeofenceAlert] = useState(false);
  const [currentLocationAddress, setCurrentLocationAddress] = useState<string | null>(null);
  const [isFetchingLocation, setIsFetchingLocation] = useState<boolean>(true);


  const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
  const { data: profile, isLoading: isLoadingProfile } = useDoc<Profile>(userProfileRef);

  const timeEntriesQuery = useMemoFirebase(
    () => user ? query(collection(firestore, 'users', user.uid, 'timeEntries'), orderBy('date', 'desc'), limit(5)) : null,
    [firestore, user]
  );
  const { data: timeEntries, isLoading: isLoadingEntries } = useCollection<TimeEntry>(timeEntriesQuery);

  const stopTimer = useCallback(() => {
    if (activeTimer) {
      clearInterval(activeTimer);
      setActiveTimer(null);
    }
    setIsShiftActive(false);
    setStatus('idle');
    setElapsedTime(0);
    setActiveTimeEntryId(null);
  }, [activeTimer, setIsShiftActive]);

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
    // Geofencing check
    if (status === 'in_progress' && profile?.workplace && user) {
        const intervalId = setInterval(() => {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const distance = getDistanceFromLatLonInKm(
                        position.coords.latitude,
                        position.coords.longitude,
                        profile.workplace!.latitude,
                        profile.workplace!.longitude
                    );

                    if (distance * 1000 > profile.workplace!.radius) {
                        setShowGeofenceAlert(true);
                         if (Notification.permission === 'granted') {
                            new Notification(t('geoFenceAlertTitle'), {
                                body: t('geoFenceAlertDescription'),
                            });
                        }
                    }
                }
            );
        }, 30000); // Check every 30 seconds

        return () => clearInterval(intervalId);
    }
  }, [status, profile, user, t]);

  const handleStart = async () => {
    if (!selectedShiftId) {
      toast({ variant: 'destructive', title: t('shiftNotSelectedTitle'), description: t('shiftNotSelectedDescription') });
      return;
    }
    if (!user || !firestore) return;

    if (!currentCoordinates) {
        toast({ variant: 'destructive', title: t('geoFailedTitle'), description: t('geoFailedDescription') });
        return;
    }
    
    const shift = shifts.find(s => s.id === selectedShiftId);
    if (!shift) return;

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
        await startShift(shift, currentLocationAddress || `Lat: ${currentCoordinates.lat}, Lon: ${currentCoordinates.lon}`);
    }
  };

  const startShift = async (shift: Shift, locationString?: string) => {
    if (!user || !firestore) return;

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
    };

    try {
        const docRef = await addDocumentNonBlocking(collection(firestore, 'users', user.uid, 'timeEntries'), newEntry);
        setActiveTimeEntryId(docRef.id);
        setStatus('in_progress');
        setIsShiftActive(true);
        const timer = setInterval(() => {
          setElapsedTime(prev => prev + 1);
        }, 1000);
        setActiveTimer(timer);
        toast({ title: t('timerStartedTitle'), description: locationString ? t('timerStartedLocationDescription', {location: locationString}) : t('timerStartedDescription') });
    } catch (error) {
        console.error("Failed to start shift:", error);
    }
  }

  const handleLocationConfirm = async (useLocation: boolean) => {
      setShowLocationConfirm(false);
      const shift = shifts.find(s => s.id === selectedShiftId);
      if (!shift) return;

      const locationString = useLocation ? suggestedLocation ?? undefined : undefined;
      await startShift(shift, locationString);
      setSuggestedLocation(null);
  };


  const [showStopConfirm, setShowStopConfirm] = useState(false);

  const handleStopClick = () => {
    if (status === 'on_mission') {
      handleEndShift();
    } else {
      setShowStopConfirm(true);
    }
  };

  const handleGoOnMission = () => {
    if (!activeTimeEntryId || !user) return;
    setStatus('on_mission');
    setShowStopConfirm(false);
    setShowGeofenceAlert(false);

    const entryRef = doc(firestore, 'users', user.uid, 'timeEntries', activeTimeEntryId);
    updateDocumentNonBlocking(entryRef, { location: 'Mission' });

    toast({ title: t('statusUpdatedTitle'), description: t('statusUpdatedDescription') });
  };
  
  const handleEndShift = () => {
    setShowStopConfirm(false);
    setShowGeofenceAlert(false);
    if (!activeTimeEntryId || !selectedShiftId || !user) {
      stopTimer();
      return;
    }
  
    const shift = shifts.find(s => s.id === selectedShiftId);
    if (!shift) return;
  
    const now = new Date();
    const endTimeStr = format(now, 'HH:mm');
    const today = format(now, 'yyyy-MM-dd');
  
    const entryToUpdate = timeEntries?.find(e => e.id === activeTimeEntryId) || {
        date: today,
        startTime: format(new Date(now.getTime() - elapsedTime * 1000), 'HH:mm'),
    };
  
    const startDateTime = parseISO(`${entryToUpdate.date}T${entryToUpdate.startTime}:00`);
    const endDateTime = now;
    const totalDuration = differenceInMinutes(endDateTime, startDateTime);
  
    const shiftEndDateTime = parseISO(`${today}T${shift.endTime}:00`);
    let overtimeDuration = 0;
    if (endDateTime > shiftEndDateTime) {
      overtimeDuration = differenceInMinutes(endDateTime, shiftEndDateTime);
    }
  
    const entryRef = doc(firestore, 'users', user.uid, 'timeEntries', activeTimeEntryId);
    updateDocumentNonBlocking(entryRef, {
      endTime: endTimeStr,
      duration: totalDuration,
      overtimeDuration: overtimeDuration > 0 ? overtimeDuration : 0,
    });
  
    toast({ title: t('timerStoppedTitle'), description: t('timerStoppedDescription', {duration: totalDuration}) });
    stopTimer();
  };

  const formatElapsedTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  const currentStatus = useMemo(() => {
    switch(status) {
      case 'in_progress': return t('statusInProgress');
      case 'on_mission': return t('statusOnMission');
      default: return t('statusIdle');
    }
  }, [status, t]);

  const isLoading = isUserLoading || isLoadingProfile;
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
            <a href="/login">
                <Button>{tShared('loginButton')}</Button>
            </a>
        </div>
    );
  }

  return (
    <div className="space-y-6 pb-24 md:pb-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold">{t('title')}</h1>
          <p className="text-muted-foreground">{currentStatus}</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
           <Button
            variant="outline"
            className="flex-1"
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
            <Select onValueChange={setSelectedShiftId} disabled={isShiftActive}>
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
        <div className="text-center text-sm text-muted-foreground mb-2 px-4 md:px-0">
          <span className='font-medium'>{t('currentLocationLabel')}:</span> {isFetchingLocation ? tShared('loading') : (currentLocationAddress || t('locationUnavailable'))}
        </div>
        {!isShiftActive ? (
            <Button
                className="w-full h-16 text-xl"
                onClick={handleStart}
                disabled={isShiftActive || isFetchingLocation || !currentCoordinates}
            >
                {t('startShiftButton')}
            </Button>
        ) : (
            <Button
                className="w-full h-16 text-xl"
                variant="destructive"
                onClick={handleStopClick}
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
                    <TableCell className="text-destructive">{entry.overtimeDuration > 0 ? `${entry.overtimeDuration} ${t('minutes')}` : '-'}</TableCell>
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

      <AlertDialog open={showStopConfirm} onOpenChange={setShowStopConfirm}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>{t('stopConfirmTitle')}</AlertDialogTitle>
                <AlertDialogDescription>{t('stopConfirmDescription')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogAction onClick={handleGoOnMission} className="bg-blue-600 hover:bg-blue-700">{t('onMissionButton')}</AlertDialogAction>
                <AlertDialogAction onClick={handleEndShift}>{t('endShiftButtonConfirm')}</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showGeofenceAlert} onOpenChange={setShowGeofenceAlert}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>{t('geoFenceAlertTitle')}</AlertDialogTitle>
                <AlertDialogDescription>{t('geoFenceAlertDescription')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogAction onClick={handleGoOnMission} className="bg-blue-600 hover:bg-blue-700">{t('startMissionButton')}</AlertDialogAction>
                <AlertDialogAction onClick={handleEndShift}>{t('endShiftButton')}</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
