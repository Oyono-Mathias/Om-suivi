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
  notes?: string;
  stopContext?: 'work_zone' | 'home_zone' | 'timeout' | 'manual' | 'mission_ended' | 'admin_edit';
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
  hireDate?: string; // YYYY-MM-DD
  leaveStartDate?: string; // YYYY-MM-DD
  category?: string; // e.g., 'III'
  echelon?: string; // e.g., 'A'
  reminders?: {
    enabled: boolean;
    time: string; // e.g., "17:00"
  };
  homeLatitude?: number;
  homeLongitude?: number;
  fcmToken?: string;
}

export interface OvertimeRates {
    tier1: number;
    tier2: number;
    night: number;
    sunday: number;
    holiday: number;
}

export interface GlobalSettings {
    id: string;
    autoClockInEnabled: boolean;
    breakDuration?: number;
    overtimeRates?: OvertimeRates;
    absencePenaltyAmount?: number;
    defaultHourlyRate?: number;
    geofenceRadius?: number;
    workLatitude?: number;
    workLongitude?: number;
    workplaceName?: string;
}

export interface AttendanceOverride {
  id: string; // The date 'YYYY-MM-DD'
  status: 'unjustified_absence' | 'sick_leave';
}

export interface Announcement {
  id: string;
  message: string;
  authorName: string;
  createdAt: any; // serverTimestamp
}

export interface LeaveAnnouncement {
  id: string;
  userId: string;
  userName: string;
  leaveStartDate: string; // YYYY-MM-DD
  createdAt: any; // serverTimestamp
}

export interface LeaveRequest {
  id: string;
  userId: string;
  leaveStartDate: string; // YYYY-MM-DD
  resumeDate: string; // YYYY-MM-DD
  totalDays: number;
  baseDays: number;
  senioritySurplus: number;
  generatedAt: any; // serverTimestamp
}

export interface AbsenceJustification {
  id: string;
  userId: string;
  userName: string;
  absenceDate: string; // YYYY-MM-DD
  imageUrl: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: any; // serverTimestamp
}

export interface WorkplaceUpdateLog {
    id: string;
    userId: string;
    eventType: 'enter_work' | 'exit_work' | 'enter_home' | 'exit_home';
    timestamp: any; // serverTimestamp
    latitude: number;
    longitude: number;
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  order: number;
  locale: 'fr' | 'en';
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: 'advancement' | 'announcement' | 'generic';
  isRead: boolean;
  createdAt: any; // serverTimestamp
}
