"use client";

import React, { createContext, useState, ReactNode } from "react";
import type { Profile, TimeEntry, TeamMember } from "@/lib/types";
import { PlaceHolderImages } from "@/lib/placeholder-images";

interface AppContextType {
  profile: Profile;
  timeEntries: TimeEntry[];
  teamMembers: TeamMember[];
  updateProfile: (newProfile: Profile) => void;
  addTimeEntry: (newEntry: TimeEntry) => void;
}

const defaultProfile: Profile = {
  name: "Mathias Oyono",
  baseHours: 35,
  overtimeRate: 1.25,
  reminders: {
    enabled: false,
    time: "17:00",
  },
};

// Mock data for initial state
const mockTimeEntries: TimeEntry[] = [
  { id: '1', date: '2024-07-15', startTime: '09:00', endTime: '17:30', duration: 510, location: 'Main Office' },
  { id: '2', date: '2024-07-16', startTime: '09:05', endTime: '18:00', duration: 535, location: 'Client Site A' },
  { id: '3', date: '2024-07-17', startTime: '08:55', endTime: '17:00', duration: 485, location: 'Main Office' },
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

  const addTimeEntry = (newEntry: TimeEntry) => {
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
