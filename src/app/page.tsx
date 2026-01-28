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
import { Clock, MapPin, Plus, Loader2 } from "lucide-react";
import { AppContext } from "@/context/AppContext";
import { format, differenceInMinutes } from "date-fns";
import type { TimeEntry } from "@/lib/types";
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

  const handleSubmit = () => {
    const startDateTime = new Date(`${date}T${startTime}`);
    const endDateTime = new Date(`${date}T${endTime}`);
    const duration = differenceInMinutes(endDateTime, startDateTime);

    if (duration > 0) {
      addTimeEntry({
        id: crypto.randomUUID(),
        date: format(startDateTime, "yyyy-MM-dd"),
        startTime: format(startDateTime, "HH:mm"),
        endTime: format(endDateTime, "HH:mm"),
        duration,
      });
      onOpenChange(false);
    } else {
      // Basic validation feedback
      alert("End time must be after start time.");
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

  const { toast } = useToast();
  const [isGeoLoading, setIsGeoLoading] = useState(false);
  const [suggestedLocation, setSuggestedLocation] = useState<string | null>(null);
  const [locationConfirmationOpen, setLocationConfirmationOpen] = useState(false);

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

  const handleStop = () => {
    if (startTime) {
      const endTime = new Date();
      const duration = differenceInMinutes(endTime, startTime);
      addTimeEntry({
        id: crypto.randomUUID(),
        date: format(startTime, "yyyy-MM-dd"),
        startTime: format(startTime, "HH:mm"),
        endTime: format(endTime, "HH:mm"),
        duration,
        location: suggestedLocation || "N/A",
      });
      setIsRunning(false);
      setStartTime(null);
      setSuggestedLocation(null);
      toast({
        title: "Timer Stopped",
        description: `Work session of ${duration} minutes logged.`,
      });
    }
  };

  const handleGeoClockIn = () => {
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
            {isRunning ? "Your work session is in progress." : "Start tracking your work hours."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-6xl font-bold font-mono text-primary my-8">
            {formatTime(timer)}
          </div>
          <div className="flex justify-center gap-4">
            {!isRunning ? (
              <>
                <Button size="lg" onClick={() => handleStart()}>
                  <Clock className="mr-2" /> Start Timer
                </Button>
                <Button size="lg" variant="outline" onClick={handleGeoClockIn} disabled={isGeoLoading}>
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
                <TableHead>Start Time</TableHead>
                <TableHead>End Time</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Location</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedTimeEntries.length > 0 ? (
                sortedTimeEntries.slice(0, 5).map((entry: TimeEntry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{format(new Date(entry.date), "PPP")}</TableCell>
                    <TableCell>{entry.startTime}</TableCell>
                    <TableCell>{entry.endTime}</TableCell>
                    <TableCell>{entry.duration} mins</TableCell>
                    <TableCell>{entry.location || 'N/A'}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center">
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
    </div>
  );
}
