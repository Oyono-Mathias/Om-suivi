
export type Shift = {
  id: string;
  name: string;
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
};

export type Profession = 'machinist' | 'storekeeper' | 'deliveryDriver' | 'chauffeur' | 'securityAgent' | 'other';

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
  profession: Profession;
  modified_manually?: boolean;
  modification_reason?: 'admin_edit';
}

export interface Profile {
  id: string;
  email: string;
  name: string;
  role?: 'admin' | 'user';
  profession: Profession;
  monthlyBaseSalary: number;
  currency: string;
  createdAt: any; // serverTimestamp
  reminders?: {
    enabled: boolean;
    time: string; // e.g., "17:00"
  };
  workLatitude?: number;
  workLongitude?: number;
  workRadius?: number;
}

export interface TeamMember {
  id: string;
  name: string;
  avatarUrl: string;
  avatarHint: string;
  totalHours: number;
  overtimeHours: number;
}

export interface GlobalSettings {
    id: string;
    autoClockInEnabled: boolean;
    breakDuration?: number;
}
