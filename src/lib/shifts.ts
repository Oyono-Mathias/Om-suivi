import type { Shift } from './types';

export const shifts: Shift[] = [
  { id: 'morningA', name: 'Morning A', startTime: '06:00', endTime: '14:15' },
  { id: 'morningB', name: 'Morning B', startTime: '08:00', endTime: '16:15' },
  { id: 'afternoon', name: 'Afternoon', startTime: '14:00', endTime: '22:15' },
  { id: 'night', name: 'Night', startTime: '22:00', endTime: '06:15' },
];
