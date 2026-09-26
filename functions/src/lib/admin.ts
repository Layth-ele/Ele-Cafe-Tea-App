/**
 * admin.ts — the firebase-admin surface this codebase uses, in the shape
 * of the old namespaced API (`admin.firestore()`, `admin.firestore.FieldValue`,
 * `admin.auth()`, …), built on the modular imports that firebase-admin v14
 * requires (the namespaced API was removed in v14).
 *
 * Every module imports `* as admin from './lib/admin'` (or '../lib/admin')
 * instead of 'firebase-admin', so the upgrade didn't need touching every
 * call site — and new code can use the modular imports directly.
 */
import { initializeApp as _initializeApp, getApps, applicationDefault } from 'firebase-admin/app';
import {
  getFirestore,
  FieldValue as _FieldValue,
  FieldPath as _FieldPath,
  Timestamp as _Timestamp,
  type DocumentData as _DocumentData,
  type DocumentReference as _DocumentReference,
  type QueryDocumentSnapshot as _QueryDocumentSnapshot,
  type Transaction as _Transaction,
} from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { getMessaging, type MulticastMessage as _MulticastMessage } from 'firebase-admin/messaging';

/** Idempotent: safe to call from several modules. */
export function initializeApp(): void {
  if (!getApps().length) _initializeApp();
}

export function firestore() { return getFirestore(); }
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace firestore {
  export const FieldValue = _FieldValue;
  export const FieldPath  = _FieldPath;
  export const Timestamp  = _Timestamp;
  export type FieldValue  = _FieldValue;
  export type Timestamp   = _Timestamp;
  export type DocumentData = _DocumentData;
  export type DocumentReference<T extends _DocumentData = _DocumentData> = _DocumentReference<T>;
  export type QueryDocumentSnapshot<T extends _DocumentData = _DocumentData> = _QueryDocumentSnapshot<T>;
  export type Transaction = _Transaction;
}

export function auth() { return getAuth(); }
export function storage() { return getStorage(); }

export function messaging() { return getMessaging(); }
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace messaging {
  export type MulticastMessage = _MulticastMessage;
}

export const credential = { applicationDefault };
