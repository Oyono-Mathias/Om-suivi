export interface TimeEntry {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: number; // in minutes
  location?: string;
}

export interface Profile {
  name: string;
  baseHours: number; // weekly
  overtimeRate: number; // multiplier
  reminders: {
    enabled: boolean;
    time: string; // e.g., "17:00"
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
