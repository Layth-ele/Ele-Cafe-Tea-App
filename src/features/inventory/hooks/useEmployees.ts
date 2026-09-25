/**
 * useEmployees.ts — Live list of inventory employees.
 *
 * Subscribes to /employees_access via onSnapshot so the admin sees
 * employee changes in real time (useful when two admins are managing
 * codes simultaneously).
 *
 * Returns a sorted list: active employees first (alphabetical),
 * inactive at the bottom. This puts the day-to-day operational set
 * at the top and pushes "on leave" or "former" to the bottom without
 * hiding them entirely.
 *
 * The doc shape from /employees_access (defined by the Turn 1 schema):
 *   { name: string, codeHash: string, active: boolean,
 *     createdAt: Timestamp, updatedAt: Timestamp }
 *
 * We intentionally do NOT expose `codeHash` through this hook. The
 * admin UI has no use for it — admins set codes via the callable,
 * which round-trips through scrypt server-side. Surfacing the hash
 * would be a defense-in-depth regression.
 */

import { useEffect, useState } from 'react';
import { collection, onSnapshot, Timestamp } from 'firebase/firestore';
import { inventoryDb } from '@/features/inventory/lib/inventorySession';
import type { EmployeeRole } from '@/features/inventory/schemas/inventory.schema';

export interface Employee {
  id:         string;
  name:       string;
  active:     boolean;
  /** Edit (default) vs read-only. Legacy docs lacking this field
   *  read as 'edit' for safety. */
  role:       EmployeeRole;
  createdAt:  Date | null;
  updatedAt:  Date | null;
}

interface UseEmployeesResult {
  employees: Employee[];
  loading:   boolean;
  error:     string | null;
}

export function useEmployees(): UseEmployeesResult {
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [error,     setError]     = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(inventoryDb(), 'employees_access'),
      (snap) => {
        const list: Employee[] = [];
        snap.forEach((d) => {
          const raw = d.data() as Record<string, unknown>;
          list.push({
            id:        d.id,
            name:      String(raw.name ?? ''),
            active:    raw.active !== false, // default true if missing
            role:      raw.role === 'readonly' ? 'readonly' : 'edit',
            createdAt: raw.createdAt instanceof Timestamp ? raw.createdAt.toDate() : null,
            updatedAt: raw.updatedAt instanceof Timestamp ? raw.updatedAt.toDate() : null,
          });
        });
        // Active first (alphabetical), inactive at the bottom.
        list.sort((a, b) => {
          if (a.active !== b.active) return a.active ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        setEmployees(list);
        setError(null);
      },
      (err) => {
        console.error('useEmployees: subscription error', err);
        setError('Could not load employees. Try refreshing.');
      },
    );
    return () => {
      try { unsub(); } catch (e) { console.error('useEmployees: unsub error', e); }
    };
  }, []);

  return {
    employees: employees ?? [],
    loading:   employees === null,
    error,
  };
}
