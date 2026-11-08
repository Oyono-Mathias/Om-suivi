import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const projectId = 'demo-om-suivi';
const rules = readFileSync('firestore.rules', 'utf8');
let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules },
  });

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'users/admin-1'), {
      id: 'admin-1',
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin',
      profession: 'other',
      monthlyBaseSalary: 0,
      currency: 'FCFA',
    });
    await setDoc(doc(db, 'users/employee-1'), {
      id: 'employee-1',
      name: 'Employé',
      email: 'employee@example.com',
      role: 'user',
      profession: 'storekeeper',
      monthlyBaseSalary: 150000,
      currency: 'FCFA',
      hireDate: '2024-01-01',
      reminders: { enabled: false, time: '17:00' },
    });
    await setDoc(doc(db, 'users/employee-2'), {
      id: 'employee-2',
      name: 'Autre employé',
      email: 'other@example.com',
      role: 'user',
      profession: 'other',
      monthlyBaseSalary: 100000,
      currency: 'FCFA',
    });
  });
});

after(async () => {
  await testEnv?.cleanup();
});

test('employee records are private and cannot be escalated', async (t) => {
  const employeeDb = testEnv.authenticatedContext('employee-1', {
    email: 'employee@example.com',
  }).firestore();
  const otherEmployeeDb = testEnv.authenticatedContext('employee-2', {
    email: 'other@example.com',
  }).firestore();
  const adminDb = testEnv.authenticatedContext('admin-1', {
    email: 'admin@example.com',
  }).firestore();

  await t.test('an employee can read only their own private profile', async () => {
    await assertSucceeds(getDoc(doc(employeeDb, 'users/employee-1')));
    await assertFails(getDoc(doc(employeeDb, 'users/employee-2')));
    await assertFails(getDocs(collection(employeeDb, 'users')));
    await assertSucceeds(getDocs(collection(adminDb, 'users')));
  });

  await t.test('an employee cannot create an administrator account', async () => {
    await assertFails(setDoc(doc(employeeDb, 'users/employee-new'), {
      id: 'employee-new',
      name: 'Escalade',
      email: 'employee@example.com',
      role: 'admin',
      profession: 'other',
      monthlyBaseSalary: 0,
      currency: 'FCFA',
      createdAt: serverTimestamp(),
    }));
  });

  await t.test('an employee can create only a basic user account', async () => {
    await assertSucceeds(setDoc(doc(employeeDb, 'users/employee-new'), {
      id: 'employee-new',
      name: 'Nouveau membre',
      email: 'employee@example.com',
      role: 'user',
      profession: 'other',
      monthlyBaseSalary: 0,
      currency: 'FCFA',
      createdAt: serverTimestamp(),
    }));
  });

  await t.test('an employee cannot change payroll, seniority or role', async () => {
    const ownProfile = doc(employeeDb, 'users/employee-1');
    await assertSucceeds(updateDoc(ownProfile, { name: 'Nom modifié' }));
    await assertSucceeds(updateDoc(ownProfile, {
      reminders: { enabled: true, time: '18:00' },
    }));
    await assertFails(updateDoc(ownProfile, { role: 'admin' }));
    await assertFails(updateDoc(ownProfile, { monthlyBaseSalary: 900000 }));
    await assertFails(updateDoc(ownProfile, { hireDate: '2000-01-01' }));
    await assertFails(updateDoc(ownProfile, { leaveStartDate: '2000-01-01' }));
    await assertFails(updateDoc(ownProfile, { currency: 'USD' }));
  });

  await t.test('the public directory exposes only limited profile fields', async () => {
    await assertSucceeds(setDoc(doc(employeeDb, 'publicProfiles/employee-1'), {
      id: 'employee-1',
      name: 'Employé',
      profession: 'storekeeper',
    }));
    await assertFails(setDoc(doc(employeeDb, 'publicProfiles/employee-1'), {
      id: 'employee-1',
      name: 'Employé',
      profession: 'storekeeper',
      email: 'private@example.com',
    }));
    await assertFails(setDoc(doc(otherEmployeeDb, 'publicProfiles/employee-1'), {
      id: 'employee-1',
      name: 'Usurpation',
      profession: 'other',
    }));
  });

  await t.test('only administrators can change a leave request', async () => {
    const leaveRequest = doc(employeeDb, 'users/employee-1/leaveRequests/request-1');
    await assertSucceeds(setDoc(leaveRequest, {
      userId: 'employee-1',
      leaveStartDate: '2026-12-01',
      resumeDate: '2026-12-26',
      totalDays: 18,
      generatedAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(leaveRequest, { totalDays: 99 }));
    await assertFails(deleteDoc(leaveRequest));
    await assertSucceeds(updateDoc(
      doc(adminDb, 'users/employee-1/leaveRequests/request-1'),
      { totalDays: 20 },
    ));
  });
});
