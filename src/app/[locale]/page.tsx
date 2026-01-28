
"use client";

import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Clock, MapPin, Plus, Loader2, Truck } from "lucide-react";
import { useUser, useFirestore, useMemoFirebase, addDocumentNonBlocking, useDoc } from "@/firebase";
import { collection, doc } from "firebase/firestore";
import { format, parse, differenceInMinutes, addDays, isAfter, parseISO } from "date-fns";
import { fr, enUS } from 'date-fns/locale';
import type { TimeEntry, Shift, Profile } from "@/lib/types";
import { shifts } from "@/lib/shifts";
import { suggestWorkLocation } from "@/ai/flows/geolocation-assisted-time-entry";
import { useToast } from "@/hooks/use-toast";
import { useCollection } from "@/firebase";
import { Link, useRouter } from "@/navigation";
import { useTranslations, useLocale } from "next-intl";
import { useShift } from "@/context/ShiftContext";
import { getDistanceFromLatLonInKm } from "@/lib/utils";

const ManualEntryDialog = ({
  open,
  onOpenChange,
  addTimeEntry,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  addTimeEntry: (entry: Omit<TimeEntry, 'id' | 'duration' | 'overtimeDuration'>) => void;
}) => {
  const t = useTranslations('ManualEntryDialog');
  const [startTime, setStartTime] = useState(format(new Date(), "HH:mm"));
  const [endTime, setEndTime] = useState(format(new Date(), "HH:mm"));
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [shiftId, setShiftId] = useState<string | undefined>();
  const [isPublicHoliday, setIsPublicHoliday] = useState(false);
  const { toast } = useToast();

  const handleSubmit = () => {
    if (!shiftId) {
      toast({
          variant: "destructive",
          title: t('shiftRequiredAlert')
      })
      return;
    }

    const startDateTime = parse(`${date}T${startTime}`, "yyyy-MM-dd'T'HH:mm", new Date());
    const endDateTime = parse(`${date}T${endTime}`, "yyyy-MM-dd'T'HH:mm", new Date());
    
    if (isAfter(endDateTime, startDateTime)) {
      addTimeEntry({
        date: format(startDateTime, "yyyy-MM-dd"),
        startTime: format(startDateTime, "HH:mm"),
        endTime: format(endDateTime, "HH:mm"),
        shiftId: shiftId,
        location: 'Entrée Manuelle',
        isPublicHoliday,
        userProfileId: '' // Will be set in addTimeEntry
      });
      onOpenChange(false);
    } else {
        const nextDayEnd = addDays(endDateTime, 1);
        if(isAfter(nextDayEnd, startDateTime)) {
            addTimeEntry({
                date: format(startDateTime, "yyyy-MM-dd"),
                startTime: format(startDateTime, "HH:mm"),
                endTime: format(nextDayEnd, "HH:mm"),
                shiftId: shiftId,
                location: 'Entrée Manuelle',
                isPublicHoliday,
                userProfileId: '' // Will be set in addTimeEntry
            });
            onOpenChange(false);
        } else {
            toast({
                variant: "destructive",
                title: t('endTimeErrorAlert')
            })
        }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {t('description')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
           <div className="grid grid-cols-1 items-center gap-4">
            <Label htmlFor="shift">{t('shiftLabel')}</Label>
            <Select value={shiftId} onValueChange={setShiftId}>
              <SelectTrigger>
                <SelectValue placeholder={t('shiftPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {shifts.map((shift) => (
                  <SelectItem key={shift.id} value={shift.id}>
                    {shift.name} ({shift.startTime} - {shift.endTime})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 items-center gap-4">
            <Label htmlFor="date">{t('dateLabel')}</Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 items-center gap-4">
            <Label htmlFor="startTime">{t('startTimeLabel')}</Label>
            <Input
              id="startTime"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 items-center gap-4">
            <Label htmlFor="endTime">{t('endTimeLabel')}</Label>
            <Input
              id="endTime"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="isPublicHoliday"
              checked={isPublicHoliday}
              onCheckedChange={(checked) => setIsPublicHoliday(!!checked)}
            />
            <Label htmlFor="isPublicHoliday">{t('isHolidayLabel')}</Label>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t('cancelButton')}</Button>
          </DialogClose>
          <Button onClick={handleSubmit}>{t('saveButton')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default function TimeTrackingPage() {
  const t = useTranslations('TimeTrackingPage');
  const tShared = useTranslations('Shared');
  const locale = useLocale();
  const dateFnsLocale = locale === 'fr' ? fr : enUS;

  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { setIsShiftActive } = useShift();

  const userProfileRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid, 'userProfiles', user.uid);
  }, [firestore, user]);
  const { data: profile, isLoading: isLoadingProfile } = useDoc<Profile>(userProfileRef);

  const timeEntriesQuery = useMemoFirebase(() => {
    if (!user) return null;
    return collection(firestore, 'users', user.uid, 'timeEntries');
  }, [firestore, user]);

  const { data: timeEntries, isLoading: isLoadingEntries } = useCollection<TimeEntry>(timeEntriesQuery);

  const [timer, setTimer] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [isManualEntryOpen, setManualEntryOpen] = useState(false);
  const [selectedShiftId, setSelectedShiftId] = useState<string | undefined>();

  const { toast } = useToast();
  const [isGeoLoading, setIsGeoLoading] = useState(false);
  const [suggestedLocation, setSuggestedLocation] = useState<string | null>(null);
  const [locationConfirmationOpen, setLocationConfirmationOpen] = useState(false);

  const [onMission, setOnMission] = useState(false);
  const [confirmStopOpen, setConfirmStopOpen] = useState(false);
  const [isPublicHoliday, setIsPublicHoliday] = useState(false);
  const [locationWatchId, setLocationWatchId] = useState<number | null>(null);
  const [outsideZoneAlertOpen, setOutsideZoneAlertOpen] = useState(false);


  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isRunning) {
      interval = setInterval(() => {
        setTimer((prevTimer) => prevTimer + 1);
      }, 1000);
    } else if (!isRunning && timer !== 0) {
      if (interval) clearInterval(interval);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning, timer]);

  useEffect(() => {
    setIsShiftActive(isRunning);
  }, [isRunning, setIsShiftActive]);

  useEffect(() => {
    if (isRunning && profile?.workplace && !onMission && !locationWatchId) {
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          if (!profile.workplace) return;
          const { latitude, longitude } = position.coords;
          const distanceInKm = getDistanceFromLatLonInKm(
            latitude,
            longitude,
            profile.workplace.latitude,
            profile.workplace.longitude
          );
          const distanceInMeters = distanceInKm * 1000;
          if (distanceInMeters > profile.workplace.radius && !outsideZoneAlertOpen) {
            setOutsideZoneAlertOpen(true);
          }
        },
        (error) => {
          console.error("Error watching position:", error);
          toast({
            variant: "destructive",
            title: t('geoFailedTitle'),
            description: "Location tracking for geofence failed.",
          });
        },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 }
      );
      setLocationWatchId(watchId);
    } else if ((!isRunning || onMission) && locationWatchId) {
      navigator.geolocation.clearWatch(locationWatchId);
      setLocationWatchId(null);
    }

    return () => {
      if (locationWatchId) {
        navigator.geolocation.clearWatch(locationWatchId);
      }
    };
  }, [isRunning, profile, onMission, locationWatchId, outsideZoneAlertOpen, t, toast]);


  const addTimeEntry = (newEntryData: Omit<TimeEntry, 'id' | 'duration' | 'overtimeDuration'>) => {
    if (!user || !timeEntriesQuery) return;
    
    const startDateTime = parse(`${newEntryData.date}T${newEntryData.startTime}`, "yyyy-MM-dd'T'HH:mm", new Date());
    let endDateTime = parse(`${newEntryData.date}T${newEntryData.endTime}`, "yyyy-MM-dd'T'HH:mm", new Date());
    
    if (isAfter(startDateTime, endDateTime)) {
      endDateTime = addDays(endDateTime, 1);
    }

    const duration = differenceInMinutes(endDateTime, startDateTime);

    const selectedShift = shifts.find(s => s.id === newEntryData.shiftId);
    let overtimeDuration = 0;

    if (selectedShift) {
        let shiftEndDateTime = parse(`${newEntryData.date}T${selectedShift.endTime}`, "yyyy-MM-dd'T'HH:mm", new Date());

        if (selectedShift.id === 'night') {
            const shiftStartDateTime = parse(`${newEntryData.date}T${selectedShift.startTime}`, "yyyy-MM-dd'T'HH:mm", new Date());
            if(isAfter(shiftStartDateTime, shiftEndDateTime)){
              shiftEndDateTime = addDays(shiftEndDateTime, 1);
            }
        }
        
        if (isAfter(endDateTime, shiftEndDateTime)) {
            overtimeDuration = differenceInMinutes(endDateTime, shiftEndDateTime);
        }
    }
    
    const newEntry: Omit<TimeEntry, 'id'> = {
        ...newEntryData,
        userProfileId: user.uid,
        duration: duration > 0 ? duration : 0,
        overtimeDuration: overtimeDuration > 0 ? overtimeDuration : 0,
        endTime: format(endDateTime, "HH:mm"),
        location: newEntryData.location === 'Entrée Manuelle' ? t('manualLocation') : newEntryData.location
    }
    
    addDocumentNonBlocking(timeEntriesQuery, newEntry);
  };

  const formatTime = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
      2,
      "0"
    )}:${String(seconds).padStart(2, "0")}`;
  };

  const handleStart = (location?: string) => {
    if (!selectedShiftId) {
        toast({
            variant: "destructive",
            title: t('shiftNotSelectedTitle'),
            description: t('shiftNotSelectedDescription'),
        });
        return;
    }
    setStartTime(new Date());
    setIsRunning(true);
    setTimer(0);
    if(location) {
      toast({
        title: t('timerStartedTitle'),
        description: t('timerStartedLocationDescription', {location}),
      });
    } else {
      toast({
        title: t('timerStartedTitle'),
        description: t('timerStartedDescription'),
      });
    }
  };

  const executeStop = () => {
    if (startTime && selectedShiftId) {
      const endTime = new Date();
      
      addTimeEntry({
        date: format(startTime, "yyyy-MM-dd"),
        startTime: format(startTime, "HH:mm"),
        endTime: format(endTime, "HH:mm"),
        shiftId: selectedShiftId,
        location: onMission ? 'Mission' : (suggestedLocation || t('noLocation')),
        isPublicHoliday,
        userProfileId: user?.uid || ''
      });

      const duration = differenceInMinutes(endTime, startTime);
      setIsRunning(false);
      setStartTime(null);
      setSuggestedLocation(null);
      setOnMission(false);
      setConfirmStopOpen(false);
      setOutsideZoneAlertOpen(false);
      setIsPublicHoliday(false);
      
      toast({
        title: t('timerStoppedTitle'),
        description: t('timerStoppedDescription', {duration}),
      });
    }
  };

  const handleStop = () => {
    if (onMission) {
      executeStop();
    } else {
      setConfirmStopOpen(true);
    }
  };

  const handleGeoClockIn = () => {
     if (!selectedShiftId) {
        toast({
            variant: "destructive",
            title: t('shiftNotSelectedTitle'),
            description: t('shiftNotSelectedDescription'),
        });
        return;
    }
    setIsGeoLoading(true);
    if (!navigator.geolocation) {
      toast({
        variant: "destructive",
        title: t('geoNotSupportedTitle'),
        description: t('geoNotSupportedDescription'),
      });
      setIsGeoLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const result = await suggestWorkLocation({ latitude, longitude });
          setSuggestedLocation(result.suggestedLocation);
          setLocationConfirmationOpen(true);
        } catch (error) {
          console.error("Error suggesting location:", error);
          toast({
            variant: "destructive",
            title: t('geoSuggestErrorTitle'),
            description: t('geoSuggestErrorDescription'),
          });
          handleStart();
        } finally {
          setIsGeoLoading(false);
        }
      },
      () => {
        toast({
          variant: "destructive",
          title: t('geoFailedTitle'),
          description: t('geoFailedDescription'),
        });
        setIsGeoLoading(false);
      }
    );
  };
  
  const handleConfirmLocation = (confirm: boolean) => {
    setLocationConfirmationOpen(false);
    if (confirm && suggestedLocation) {
      handleStart(suggestedLocation);
    } else {
      setSuggestedLocation(null);
      handleStart(); // Start without location
    }
  }

  const handleStartMission = () => {
    setOnMission(true);
    setOutsideZoneAlertOpen(false);
    toast({
      title: t('statusUpdatedTitle'),
      description: t('statusUpdatedDescription'),
    });
  };

  if (isUserLoading || isLoadingEntries || isLoadingProfile) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-16 w-16 animate-spin" />
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
  
  const sortedTimeEntries = timeEntries ? [...timeEntries].sort(
    (a, b) => new Date(`${b.date}T${b.startTime}`).getTime() - new Date(`${a.date}T${a.startTime}`).getTime()
  ) : [];

  return (
    <div className="space-y-8">
      <Card className="text-center shadow-lg">
        <CardHeader>
          <CardTitle className="text-4xl font-headline">{t('title')}</CardTitle>
          <CardDescription>
            {isRunning
              ? onMission
                ? t('statusOnMission')
                : t('statusInProgress')
              : t('statusIdle')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-6xl font-bold font-mono text-primary my-8">
            {formatTime(timer)}
          </div>
           {!isRunning ? (
            <div className="max-w-xs mx-auto mb-4">
                <Select value={selectedShiftId} onValueChange={setSelectedShiftId} >
                    <SelectTrigger>
                        <SelectValue placeholder={t('selectShiftPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                        {shifts.map((shift: Shift) => (
                            <SelectItem key={shift.id} value={shift.id}>
                                {shift.name} ({shift.startTime} - {shift.endTime})
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
          ) : (
            <div className="flex items-center justify-center space-x-2 mb-4">
              <Switch id="holiday-mode" checked={isPublicHoliday} onCheckedChange={setIsPublicHoliday} />
              <Label htmlFor="holiday-mode">{t('holidayMode')}</Label>
            </div>
          )}
          <div className="flex justify-center gap-4">
            {!isRunning ? (
              <>
                <Button size="lg" onClick={() => handleStart()} disabled={!selectedShiftId}>
                  <Clock className="mr-2" /> {t('startButton')}
                </Button>
                <Button size="lg" variant="outline" onClick={handleGeoClockIn} disabled={isGeoLoading || !selectedShiftId}>
                  {isGeoLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <MapPin className="mr-2" />
                  )}
                  {t('geoClockInButton')}
                </Button>
              </>
            ) : (
              <Button size="lg" variant="destructive" onClick={handleStop}>
                {t('stopButton')}
              </Button>
            )}
          </div>
        </CardContent>
        <CardFooter className="justify-center">
            <Button variant="ghost" onClick={() => setManualEntryOpen(true)}>
              <Plus className="mr-2" /> {t('manualEntryButton')}
            </Button>
        </CardFooter>
      </Card>

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
                <TableHead>{t('tableShift')}</TableHead>
                <TableHead>{t('tableHours')}</TableHead>
                <TableHead>{t('tableDuration')}</TableHead>
                <TableHead>{t('tableOvertime')}</TableHead>
                <TableHead>{t('tableLocation')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedTimeEntries.length > 0 ? (
                sortedTimeEntries.slice(0, 5).map((entry: TimeEntry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{format(parseISO(entry.date), "PPP", {locale: dateFnsLocale})}{entry.isPublicHoliday ? ` ${t('holidaySuffix')}` : ''}</TableCell>
                    <TableCell>{shifts.find(s => s.id === entry.shiftId)?.name || t('noLocation')}</TableCell>
                    <TableCell>{entry.startTime} - {entry.endTime}</TableCell>
                    <TableCell>{entry.duration} {t('minutes')}</TableCell>
                    <TableCell>{entry.overtimeDuration > 0 ? `${entry.overtimeDuration} ${t('minutes')}` : '-'}</TableCell>
                    <TableCell>{entry.location || t('noLocation')}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">
                    {t('noEntries')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      <ManualEntryDialog open={isManualEntryOpen} onOpenChange={setManualEntryOpen} addTimeEntry={addTimeEntry} />
      
      <AlertDialog open={locationConfirmationOpen} onOpenChange={setLocationConfirmationOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('locationConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('locationConfirmDescriptionPart1')}
              <strong className="text-foreground">{suggestedLocation}</strong>
              {t('locationConfirmDescriptionPart2')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => handleConfirmLocation(false)}>{t('locationConfirmCancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleConfirmLocation(true)}>{t('locationConfirmAction')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={confirmStopOpen} onOpenChange={setConfirmStopOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>{t('stopConfirmTitle')}</DialogTitle>
                <DialogDescription>
                    {t('stopConfirmDescription')}
                </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:justify-end">
                <Button variant="outline" onClick={() => { setOnMission(true); setConfirmStopOpen(false); toast({ title: t('statusUpdatedTitle'), description: t('statusUpdatedDescription')}) }}>
                    <Truck className="mr-2" /> {t('onMissionButton')}
                </Button>
                <Button variant="destructive" onClick={executeStop}>{t('endShiftButton')}</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    
      <AlertDialog open={outsideZoneAlertOpen} onOpenChange={setOutsideZoneAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('geoFenceAlertTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('geoFenceAlertDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setOutsideZoneAlertOpen(false); executeStop(); }}>{t('endShiftButton')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleStartMission}>{t('startMissionButton')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
