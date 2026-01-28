"use client";

import React, { createContext, useState, ReactNode } from "react";
import type { Profile, TimeEntry, TeamMember } from "@/lib/types";
import { PlaceHolderImages } from "@/lib/placeholder-images";
import { shifts } from "@/lib/shifts";
import { parse, differenceInMinutes, isAfter, format, addDays } from "date-fns";

interface AppContextType {
  profile: Profile;
  timeEntries: TimeEntry[];
  teamMembers: TeamMember[];
  updateProfile: (newProfile: Profile) => void;
  addTimeEntry: (newEntry: Omit<TimeEntry, 'id' | 'duration' | 'overtimeDuration'>) => void;
}

const defaultProfile: Profile = {
  name: "Mathias Oyono",
  baseHours: 35,
  hourlyRate: 1500,
  currency: "FCFA",
  overtimeRates: {
    weekday: 1.25,
    saturday: 1.5,
    sunday: 2.0,
  },
  reminders: {
    enabled: false,
    time: "17:00",
  },
};

// Mock data for initial state
const mockTimeEntries: TimeEntry[] = [
  { id: '1', date: '2024-07-15', startTime: '06:00', endTime: '14:30', duration: 510, overtimeDuration: 15, location: 'Main Office', shiftId: 'morningA' },
  { id: '2', date: '2024-07-16', startTime: '08:05', endTime: '17:15', duration: 550, overtimeDuration: 60, location: 'Client Site A', shiftId: 'morningB' },
  { id: '3', date: '2024-07-17', startTime: '13:55', endTime: '22:15', duration: 500, overtimeDuration: 0, location: 'Main Office', shiftId: 'afternoon' },
];

const mockTeamMembers: TeamMember[] = [
    { id: '1', name: 'Mathias Oyono', avatarUrl: PlaceHolderImages.find(img => img.id === 'mathias-oyono')?.imageUrl || '', avatarHint: 'person portrait', totalHours: 42, overtimeHours: 7 },
    { id: '2', name: 'Jean Dupont', avatarUrl: PlaceHolderImages.find(img => img.id === 'jean-dupont')?.imageUrl || '', avatarHint: 'man smiling', totalHours: 38, overtimeHours: 3 },
    { id: '3', name: 'Marie Curie', avatarUrl: PlaceHolderImages.find(img => img.id === 'marie-curie')?.imageUrl || '', avatarHint: 'woman glasses', totalHours: 35, overtimeHours: 0 },
    { id: '4', name: 'Ahmed Khan', avatarUrl: PlaceHolderImages.find(img => img.id === 'ahmed-khan')?.imageUrl || '', avatarHint: 'person happy', totalHours: 40, overtimeHours: 5 },
]


export const AppContext = createContext<AppContextType>({
  profile: defaultProfile,
  timeEntries: [],
  teamMembers: [],
  updateProfile: () => {},
  addTimeEntry: () => {},
});

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [profile, setProfile] = useState<Profile>(defaultProfile);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>(mockTimeEntries);
  const [teamMembers] = useState<TeamMember[]>(mockTeamMembers);


  const updateProfile = (newProfile: Profile) => {
    setProfile(newProfile);
  };

  const addTimeEntry = (newEntryData: Omit<TimeEntry, 'id' | 'duration' | 'overtimeDuration'>) => {
    const startDateTime = parse(`${newEntryData.date}T${newEntryData.startTime}`, "yyyy-MM-dd'T'HH:mm", new Date());
    let endDateTime = parse(`${newEntryData.date}T${newEntryData.endTime}`, "yyyy-MM-dd'T'HH:mm", new Date());
    
    // Handle overnight entries
    if (isAfter(startDateTime, endDateTime)) {
      endDateTime = addDays(endDateTime, 1);
    }

    const duration = differenceInMinutes(endDateTime, startDateTime);

    const selectedShift = shifts.find(s => s.id === newEntryData.shiftId);
    let overtimeDuration = 0;

    if (selectedShift) {
        let shiftEndDateTime = parse(`${newEntryData.date}T${selectedShift.endTime}`, "yyyy-MM-dd'T'HH:mm", new Date());

        // Handle night shift crossing midnight for overtime calculation
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
    
    const newEntry: TimeEntry = {
        ...newEntryData,
        id: crypto.randomUUID(),
        duration: duration > 0 ? duration : 0,
        overtimeDuration: overtimeDuration > 0 ? overtimeDuration : 0,
        endTime: format(endDateTime, "HH:mm"),
    }

    setTimeEntries((prevEntries) => [...prevEntries, newEntry]);
  };

  return (
    <AppContext.Provider
      value={{ profile, timeEntries, teamMembers, updateProfile, addTimeEntry }}
    >
      {children}
    </AppContext.Provider>
  );
};
