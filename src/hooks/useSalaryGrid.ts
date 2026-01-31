
'use client';

import { useState, useEffect } from 'react';
import { useFirestore } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import type { SalaryGridEntry } from '@/lib/types';

interface SalaryGrid {
  entries: SalaryGridEntry[];
}

const CACHE_KEY = 'salaryGridCache';
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

export function useSalaryGrid() {
  const [grid, setGrid] = useState<SalaryGridEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const firestore = useFirestore();

  useEffect(() => {
    async function fetchGrid() {
      // 1. Try to load from cache
      try {
        const cachedItemJSON = localStorage.getItem(CACHE_KEY);
        if (cachedItemJSON) {
          const { timestamp, data } = JSON.parse(cachedItemJSON);
          const isCacheStale = (new Date().getTime() - timestamp) > CACHE_DURATION_MS;
          
          if (data && Array.isArray(data)) {
            setGrid(data);
            setIsLoading(false); // We have data, stop loading UI
            if (isCacheStale && navigator.onLine) {
              // Cache is stale, fetch in background but don't set loading to true
            } else {
              // Cache is fresh, or we're offline, so we're done.
              return;
            }
          }
        }
      } catch (e) {
        console.error("Failed to read salary grid from cache", e);
      }

      // 2. If no fresh cache, or cache is stale, fetch from Firestore
      if (!firestore) {
          if(grid.length === 0) setError(new Error("Firestore not available"));
          setIsLoading(false);
          return;
      }
      
      try {
        const gridRef = doc(firestore, 'salaryGrids', 'current');
        const docSnap = await getDoc(gridRef);

        if (docSnap.exists()) {
          const newGrid = (docSnap.data() as SalaryGrid).entries;
          setGrid(newGrid);
          setError(null);
          // Save to cache
          localStorage.setItem(CACHE_KEY, JSON.stringify({
            timestamp: new Date().getTime(),
            data: newGrid
          }));
        } else {
            // Doc doesn't exist. If we have no cached data, set an error.
            if (grid.length === 0) {
                setError(new Error("Salary grid not found in database."));
            }
        }
      } catch (err: any) {
         // Firestore error. If we have no cached data, set an error.
         if (grid.length === 0) {
            setError(err);
         }
      } finally {
        // Always stop loading after the fetch attempt is complete.
        setIsLoading(false);
      }
    }

    fetchGrid();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firestore]); // Only re-run if firestore instance changes

  return { grid, isLoading, error };
}
