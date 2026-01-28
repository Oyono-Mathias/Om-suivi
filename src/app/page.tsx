
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
import { useFirebase, useUser, useFirestore, useMemoFirebase, addDocumentNonBlocking } from "@/firebase";
import { collection } from "firebase/firestore";
import { format, parse, differenceInMinutes, addDays, isAfter, parseISO } from "date-fns";
import type { TimeEntry, Shift } from "@/lib/types";
import { shifts } from "@/lib/shifts";
import { suggestWorkLocation } from "@/ai/flows/geolocation-assisted-time-entry";
import { useToast } from "@/hooks/use-toast";
import { useCollection } from "@/firebase";
import Link from "next/link";


const ManualEntryDialog = ({
  open,
  onOpenChange,
  addTimeEntry,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  addTimeEntry: (entry: Omit<TimeEntry, 'id' | 'duration' | 'overtimeDuration'>) => void;
}) => {
  const [startTime, setStartTime] = useState(format(new Date(), "HH:mm"));
  const [endTime, setEndTime] = useState(format(new Date(), "HH:mm"));
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [shiftId, setShiftId] = useState<string | undefined>();
  const [isPublicHoliday, setIsPublicHoliday] = useState(false);

  const handleSubmit = () => {
    if (!shiftId) {
      alert("Veuillez sélectionner un poste.");
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
        // Handle overnight case
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
            alert("L'heure de fin doit être après l'heure de début.");
        }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajouter une entrée manuelle</DialogTitle>
          <DialogDescription>
            Saisissez vos heures de début et de fin pour une session de travail passée.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
           <div className="grid grid-cols-1 items-center gap-4">
            <Label htmlFor="shift">Poste</Label>
            <Select value={shiftId} onValueChange={setShiftId}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionnez un poste" />
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
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 items-center gap-4">
            <Label htmlFor="startTime">Heure de début</Label>
            <Input
              id="startTime"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 items-center gap-4">
            <Label htmlFor="endTime">Heure de fin</Label>
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
            <Label htmlFor="isPublicHoliday">C'était un jour férié</Label>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Annuler</Button>
          </DialogClose>
          <Button onClick={handleSubmit}>Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default function TimeTrackingPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

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
            title: "Poste non sélectionné",
            description: "Veuillez sélectionner votre poste avant de démarrer le compteur.",
        });
        return;
    }
    setStartTime(new Date());
    setIsRunning(true);
    setTimer(0);
    if(location) {
      toast({
        title: "Compteur Démarré",
        description: `Pointage effectué à ${location}.`,
      });
    } else {
      toast({
        title: "Compteur Démarré",
        description: "Votre session de travail a commencé.",
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
        location: onMission ? 'Mission' : (suggestedLocation || "N/A"),
        isPublicHoliday,
        userProfileId: user?.uid || ''
      });

      const duration = differenceInMinutes(endTime, startTime);
      setIsRunning(false);
      setStartTime(null);
      setSuggestedLocation(null);
      setOnMission(false);
      setConfirmStopOpen(false);
      setIsPublicHoliday(false);
      
      toast({
        title: "Compteur Arrêté",
        description: `Session de travail de ${duration} minutes enregistrée.`,
      });
    }
  };

  const handleStop = () => {
    setConfirmStopOpen(true);
  };

  const handleGeoClockIn = () => {
     if (!selectedShiftId) {
        toast({
            variant: "destructive",
            title: "Poste non sélectionné",
            description: "Veuillez sélectionner votre poste avant de démarrer le compteur.",
        });
        return;
    }
    setIsGeoLoading(true);
    if (!navigator.geolocation) {
      toast({
        variant: "destructive",
        title: "Géolocalisation non supportée",
        description: "Votre navigateur ne supporte pas la géolocalisation.",
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
            title: "Impossible de suggérer un lieu",
            description: "Retour au démarrage manuel.",
          });
          handleStart();
        } finally {
          setIsGeoLoading(false);
        }
      },
      () => {
        toast({
          variant: "destructive",
          title: "Échec de la géolocalisation",
          description: "Impossible d'obtenir votre position. Veuillez vérifier les autorisations.",
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

  if (isUserLoading || isLoadingEntries) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-16 w-16 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col justify-center items-center h-screen gap-4">
        <p className="text-xl">Veuillez vous connecter pour continuer.</p>
        <Link href="/login">
            <Button>Se connecter</Button>
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
          <CardTitle className="text-4xl font-headline">Suivi du Temps</CardTitle>
          <CardDescription>
            {isRunning
              ? onMission
                ? "Vous êtes actuellement en mission."
                : "Votre session de travail est en cours."
              : "Sélectionnez votre poste et commencez le suivi."}
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
                        <SelectValue placeholder="Sélectionnez votre poste du jour" />
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
              <Label htmlFor="holiday-mode">Jour Férié</Label>
            </div>
          )}
          <div className="flex justify-center gap-4">
            {!isRunning ? (
              <>
                <Button size="lg" onClick={() => handleStart()} disabled={!selectedShiftId}>
                  <Clock className="mr-2" /> Démarrer
                </Button>
                <Button size="lg" variant="outline" onClick={handleGeoClockIn} disabled={isGeoLoading || !selectedShiftId}>
                  {isGeoLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <MapPin className="mr-2" />
                  )}
                  Pointage avec Géolocalisation
                </Button>
              </>
            ) : (
              <Button size="lg" variant="destructive" onClick={handleStop}>
                Arrêter
              </Button>
            )}
          </div>
        </CardContent>
        <CardFooter className="justify-center">
            <Button variant="ghost" onClick={() => setManualEntryOpen(true)}>
              <Plus className="mr-2" /> Ajouter une entrée manuelle
            </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Entrées Récentes</CardTitle>
          <CardDescription>Un journal de vos récentes sessions de travail.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Poste</TableHead>
                <TableHead>Heures</TableHead>
                <TableHead>Durée</TableHead>
                <TableHead>Heures Sup.</TableHead>
                <TableHead>Lieu</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedTimeEntries.length > 0 ? (
                sortedTimeEntries.slice(0, 5).map((entry: TimeEntry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{format(parseISO(entry.date), "PPP")}{entry.isPublicHoliday ? ' (Férié)' : ''}</TableCell>
                    <TableCell>{shifts.find(s => s.id === entry.shiftId)?.name || 'N/A'}</TableCell>
                    <TableCell>{entry.startTime} - {entry.endTime}</TableCell>
                    <TableCell>{entry.duration} min</TableCell>
                    <TableCell>{entry.overtimeDuration > 0 ? `${entry.overtimeDuration} min` : '-'}</TableCell>
                    <TableCell>{entry.location || 'N/A'}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">
                    Aucune entrée de temps pour le moment.
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
            <AlertDialogTitle>Confirmer l'emplacement</AlertDialogTitle>
            <AlertDialogDescription>
              L'IA suggère que votre emplacement actuel est <strong className="text-foreground">{suggestedLocation}</strong>. Voulez-vous associer cet emplacement à votre entrée de temps ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => handleConfirmLocation(false)}>Utiliser sans emplacement</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleConfirmLocation(true)}>Confirmer et Démarrer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={confirmStopOpen} onOpenChange={setConfirmStopOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Quel est votre statut ?</DialogTitle>
                <DialogDescription>
                    Vous arrêtez le compteur. Terminez-vous votre service ou êtes-vous en mission de livraison ?
                </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:justify-end">
                <Button variant="outline" onClick={() => { setOnMission(true); setConfirmStopOpen(false); toast({ title: "Statut Mis à Jour", description: "Vous êtes maintenant en mission. Le compteur continue."}) }}>
                    <Truck className="mr-2" /> En Mission
                </Button>
                <Button variant="destructive" onClick={executeStop}>Fin de Service</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>

    </div>
  );
}
