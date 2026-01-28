
export type Shift = {
  id: string;
  name: string;
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
};

export interface TimeEntry {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: number; // in minutes
  overtimeDuration: number; // in minutes
  location?: string;
  shiftId: string;
  isPublicHoliday?: boolean;
  userProfileId: string;
}

export interface Profile {
  id: string;
  email: string;
  name: string;
  monthlyBaseSalary: number;
  currency: string;
  reminders: {
    enabled: boolean;
    time: string; // e.g., "17:00"
  };
  workplace?: {
    latitude: number;
    longitude: number;
    radius: number;
  };
}

export interface TeamMember {
  id: string;
  name: string;
  avatarUrl: string;
  avatarHint: string;
  totalHours: number;
  overtimeHours: number;
}
