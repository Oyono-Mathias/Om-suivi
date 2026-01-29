
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
  unpaidBreakDuration?: number; // in minutes
  location?: string;
  shiftId: string;
  isPublicHoliday?: boolean;
  userProfileId: string;
  profession?: Profession;
  modified_manually?: boolean;
  modification_reason?: 'pause_limit_exceeded';
}

export interface Workplace {
  latitude: number;
  longitude: number;
  radius: number;
  address?: string;
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
  workplace?: Workplace;
}

export interface WorkplaceUpdateLog {
  id: string;
  userProfileId: string;
  timestamp: any; // serverTimestamp
  previousWorkplace?: Workplace | null;
  newWorkplace: Workplace;
}

export interface TeamMember {
  id: string;
  name: string;
  avatarUrl: string;
  avatarHint: string;
  totalHours: number;
  overtimeHours: number;
}

export interface Course {
  id:string;
  title: string;
  category: string;
  description: string;
  price: number;
  currency: string;
  imageUrl: string;
  imageHint: string;
  duration: string; // e.g., "4 semaines"
}
