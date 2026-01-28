
"use client";

import React, { useState, useEffect, useContext } from "react";
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
import { AppContext } from "@/context/AppContext";
import { format, parse, differenceInMinutes, addDays, isAfter, parseISO } from "date-fns";
import type { TimeEntry, Shift } from "@/lib/types";
import { shifts } from "@/lib/shifts";
import { suggestWorkLocation } from "@/ai/flows/geolocation-assisted-time-entry";
import { useToast } from "@/hooks/use-toast";

const ManualEntryDialog = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { addTimeEntry } = useContext(AppContext);
  const [startTime, setStartTime] = useState(format(new Date(), "HH:mm"));
  const [endTime, setEndTime] = useState(format(new Date(), "HH:mm"));
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [shiftId, setShiftId] = useState<string | undefined>();
  const [isPublicHoliday, setIsPublicHoliday] = useState(false);

  const handleSubmit = () => {
    if (!shiftId) {
      alert("Please select a shift.");
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
        location: 'Manual Entry',
        isPublicHoliday
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
                location: 'Manual Entry',
                isPublicHoliday
            });
            onOpenChange(false);
        } else {
            alert("End time must be after start time.");
        }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Manual Time Entry</DialogTitle>
          <DialogDescription>
            Enter your start and end times for a past work session.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
           <div className="grid grid-cols-1 items-center gap-4">
            <Label htmlFor="shift">Shift</Label>
            <Select value={shiftId} onValueChange={setShiftId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a shift" />
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
            <Label htmlFor="startTime">Start Time</Label>
            <Input
              id="startTime"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 items-center gap-4">
            <Label htmlFor="endTime">End Time</Label>
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
            <Label htmlFor="isPublicHoliday">This was a public holiday (Jour Férié)</Label>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={handleSubmit}>Save Entry</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default function TimeTrackingPage() {
  const { timeEntries, addTimeEntry } = useContext(AppContext);
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
            title: "Shift not selected",
            description: "Please select your shift before starting the timer.",
        });
        return;
    }
    setStartTime(new Date());
    setIsRunning(true);
    setTimer(0);
    if(location) {
      toast({
        title: "Timer Started",
        description: `Clocked in at ${location}.`,
      });
    } else {
      toast({
        title: "Timer Started",
        description: "Your work session has begun.",
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
      });

      const duration = differenceInMinutes(endTime, startTime);
      setIsRunning(false);
      setStartTime(null);
      setSuggestedLocation(null);
      setOnMission(false);
      setConfirmStopOpen(false);
      setIsPublicHoliday(false);
      
      toast({
        title: "Timer Stopped",
        description: `Work session of ${duration} minutes logged.`,
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
            title: "Shift not selected",
            description: "Please select your shift before starting the timer.",
        });
        return;
    }
    setIsGeoLoading(true);
    if (!navigator.geolocation) {
      toast({
        variant: "destructive",
        title: "Geolocation not supported",
        description: "Your browser does not support geolocation.",
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
            title: "Could not suggest location",
            description: "Falling back to manual start.",
          });
          handleStart();
        } finally {
          setIsGeoLoading(false);
        }
      },
      () => {
        toast({
          variant: "destructive",
          title: "Geolocation failed",
          description: "Could not get your location. Please check permissions.",
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

  const sortedTimeEntries = [...timeEntries].sort(
    (a, b) => new Date(`${b.date}T${b.startTime}`).getTime() - new Date(`${a.date}T${a.startTime}`).getTime()
  );

  return (
    <div className="space-y-8">
      <Card className="text-center shadow-lg">
        <CardHeader>
          <CardTitle className="text-4xl font-headline">Time Tracker</CardTitle>
          <CardDescription>
            {isRunning
              ? onMission
                ? "You are currently on a mission."
                : "Your work session is in progress."
              : "Select your shift and start tracking."}
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
                        <SelectValue placeholder="Select your shift for the day" />
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
              <Label htmlFor="holiday-mode">Public Holiday (Jour Férié)</Label>
            </div>
          )}
          <div className="flex justify-center gap-4">
            {!isRunning ? (
              <>
                <Button size="lg" onClick={() => handleStart()} disabled={!selectedShiftId}>
                  <Clock className="mr-2" /> Start Timer
                </Button>
                <Button size="lg" variant="outline" onClick={handleGeoClockIn} disabled={isGeoLoading || !selectedShiftId}>
                  {isGeoLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <MapPin className="mr-2" />
                  )}
                  Clock-in with Geolocation
                </Button>
              </>
            ) : (
              <Button size="lg" variant="destructive" onClick={handleStop}>
                Stop Timer
              </Button>
            )}
          </div>
        </CardContent>
        <CardFooter className="justify-center">
            <Button variant="ghost" onClick={() => setManualEntryOpen(true)}>
              <Plus className="mr-2" /> Add Manual Entry
            </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Entries</CardTitle>
          <CardDescription>A log of your recent work sessions.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Shift</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Overtime</TableHead>
                <TableHead>Location</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedTimeEntries.length > 0 ? (
                sortedTimeEntries.slice(0, 5).map((entry: TimeEntry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{format(parseISO(entry.date), "PPP")}{entry.isPublicHoliday ? ' (Holiday)' : ''}</TableCell>
                    <TableCell>{shifts.find(s => s.id === entry.shiftId)?.name || 'N/A'}</TableCell>
                    <TableCell>{entry.startTime} - {entry.endTime}</TableCell>
                    <TableCell>{entry.duration} mins</TableCell>
                    <TableCell>{entry.overtimeDuration > 0 ? `${entry.overtimeDuration} mins` : '-'}</TableCell>
                    <TableCell>{entry.location || 'N/A'}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">
                    No time entries yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      <ManualEntryDialog open={isManualEntryOpen} onOpenChange={setManualEntryOpen} />
      
      <AlertDialog open={locationConfirmationOpen} onOpenChange={setLocationConfirmationOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Location</AlertDialogTitle>
            <AlertDialogDescription>
              AI suggests your current location is <strong className="text-foreground">{suggestedLocation}</strong>. Do you want to associate this location with your time entry?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => handleConfirmLocation(false)}>Use without location</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleConfirmLocation(true)}>Confirm and Start</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={confirmStopOpen} onOpenChange={setConfirmStopOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>What is your status?</DialogTitle>
                <DialogDescription>
                    You are stopping the timer. Are you ending your shift, or are you on a delivery mission?
                </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:justify-end">
                <Button variant="outline" onClick={() => { setOnMission(true); setConfirmStopOpen(false); toast({ title: "Status Updated", description: "You are now on a mission. The timer continues."}) }}>
                    <Truck className="mr-2" /> On Mission
                </Button>
                <Button variant="destructive" onClick={executeStop}>End Shift</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>

    </div>
  );
}
