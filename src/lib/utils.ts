import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}

export function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d;
}

export const getPayrollCycle = (date: Date) => {
  const day = date.getDate();
  const month = date.getMonth();
  const year = date.getFullYear();

  let start: Date;
  let end: Date;

  if (day >= 26) {
    start = new Date(year, month, 26, 0, 0, 0);
    end = new Date(year, month + 1, 25, 23, 59, 59);
  } else {
    start = new Date(year, month - 1, 26, 0, 0, 0);
    end = new Date(year, month, 25, 23, 59, 59);
  }
  return { start, end };
};

export const formatCurrency = (amount: number) => {
  return (Math.round(amount / 100) * 100).toLocaleString('fr-FR');
};
