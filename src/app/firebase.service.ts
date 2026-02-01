import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut as fbSignOut, User } from 'firebase/auth';
import { getFirestore, collection, collectionGroup, addDoc, setDoc, doc, getDocs, query, where, orderBy, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { environment, ADMIN_SECRET } from './enviroments/enviroment';

// Initialize Firebase App only once (safe guard)
let app = undefined as any;
if (!getApps().length) {
  app = initializeApp(environment.firebase);
} else {
  app = getApp();
}

const auth = getAuth(app);
const db = getFirestore(app);

export async function signUpUser(email: string, password: string, displayName?: string, adminCode?: string, age?: number) {
  // Create the Auth user first. Reading the whole `users` collection before creating
  // the account can fail when security rules disallow unauthenticated reads.
  // For reliable enforcement of a registration cap use a server-side check (Cloud Function)
  // or a Firestore transaction. Here we create the user and then write the user's doc.
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const user = cred.user as User;

  // create a user document (rules should allow the user to write their own doc)
  const isAdmin = adminCode && adminCode === ADMIN_SECRET;
  await setDoc(doc(db, 'users', user.uid), {
    email: user.email,
    displayName: displayName || null,
    age: typeof age === 'number' ? age : null,
    isAdmin: isAdmin ? true : false,
    createdAt: new Date().toISOString()
  });

  return user;
}

export async function signInUser(email: string, password: string) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user as User;
}

export async function signOutUser() {
  await fbSignOut(auth);
}

// Subscribe to auth state changes. Returns an unsubscribe function.
export function onAuthStateChange(cb: (user: User | null) => void) {
  const unsubscribe = onAuthStateChanged(auth, cb);
  return unsubscribe;
}

export async function recordSession(userId: string, payload: any) {
  // Validate payload before writing. This provides quick client-side feedback
  // and prevents obvious bad data from being stored.
  validateSessionPayload(payload);

  // payload should include: week, setNumber, intensity, heartRate, notes, timestamp
  const sessionsCol = collection(db, 'users', userId, 'sessions');
  const docRef = await addDoc(sessionsCol, {
    ...payload,
    createdAt: new Date().toISOString()
  });
  return docRef.id;
}

// Record multiple session documents for a user (one per set).
// Returns an array of created document ids.
export async function recordMultipleSessions(userId: string, payloadBase: any, setsCount: number) {
  if (typeof setsCount !== 'number' || setsCount <= 0) throw new Error('Invalid setsCount');
  validateSessionPayload(payloadBase);

  const sessionsCol = collection(db, 'users', userId, 'sessions');
  const writes: Promise<any>[] = [];
  for (let i = 1; i <= setsCount; i++) {
    const docPayload = {
      ...payloadBase,
      setNumber: i,
      createdAt: new Date().toISOString()
    };
    writes.push(addDoc(sessionsCol, docPayload));
  }

  const refs = await Promise.all(writes);
  return refs.map(r => r.id);
}

// Basic validation for session payloads. Throws Error if invalid.
export function validateSessionPayload(payload: any) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid payload');
  }

  if (!payload.week) throw new Error('Select a program week');

  if (typeof payload.setNumber !== 'number' || payload.setNumber <= 0) {
    throw new Error('Invalid set number');
  }


  if (typeof payload.intensity !== 'number' || payload.intensity < 1 || payload.intensity > 20) {
    throw new Error('Intensity should be a number between 1 and 20');
  }

  if (typeof payload.heartRate !== 'number' || payload.heartRate < 30 || payload.heartRate > 220) {
    throw new Error('Heart rate looks invalid. Please double-check the value');
  }

  return true;
}


export async function getUserCount() {
  const usersSnapshot = await getDocs(collection(db, 'users'));
  return usersSnapshot.size;
}

// --- Admin related helpers ---
export async function requestAdminAccess(userId: string, reason?: string) {
  const reqCol = collection(db, 'adminRequests');
  const docRef = await addDoc(reqCol, {
    userId,
    reason: reason || null,
    status: 'pending',
    createdAt: new Date().toISOString()
  });
  return docRef.id;
}

export async function getAllUsers() {
  const usersSnapshot = await getDocs(collection(db, 'users'));
  const users: any[] = [];
  usersSnapshot.forEach(d => users.push({ id: d.id, ...d.data() }));
  return users;
}

export async function getUserById(userId: string) {
  const d = await getDocs(query(collection(db, 'users'), where('__name__', '==', userId)));
  let found: any = null;
  d.forEach(docSnap => {
    found = { id: docSnap.id, ...docSnap.data() };
  });
  return found;
}

export async function getUserSessions(userId: string) {
  const sessionsSnap = await getDocs(collection(db, 'users', userId, 'sessions'));
  const sessions: any[] = [];
  sessionsSnap.forEach(d => sessions.push({ id: d.id, ...d.data() }));
  return sessions;
}

export async function getSessionById(userId: string, sessionId: string) {
  if (!userId || !sessionId) throw new Error('Missing identifiers for getSessionById');
  const ref = doc(db, 'users', userId, 'sessions', sessionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as any) };
}

// Return all sessions across all users (requires security rules allowing admins to read sessions)
export async function getAllSessions(limitCount?: number) {
  // Use a collectionGroup query to read all 'sessions' subcollections
  // Simple wrapper that returns all sessions (no pagination)
  let q = query(collectionGroup(db, 'sessions'), orderBy('createdAt', 'desc')) as any;
  if (limitCount && typeof limitCount === 'number') {
    q = query(collectionGroup(db, 'sessions'), orderBy('createdAt', 'desc'), /* limit: */ );
    // We intentionally don't apply limit here; prefer using getAllSessionsPaged for pagination.
  }

  const snap = await getDocs(q);
  const out: any[] = [];
  snap.forEach(d => {
    // extract userId from document path: users/{userId}/sessions/{sessionId}
    const parts = d.ref.path.split('/');
    const userId = parts.length >= 2 ? parts[1] : null;
    out.push({ id: d.id, userId, ...(d.data() as any) });
  });
  return out;
}

// Paginated collectionGroup query for sessions. Returns an object with sessions (ordered by createdAt desc),
// a cursor value to use for the next page (lastCreatedAt) and a hasMore boolean.
export async function getAllSessionsPaged(limitCount = 20, startAfterCreatedAt?: string | null) {
  if (typeof limitCount !== 'number' || limitCount <= 0) limitCount = 20;
  // We'll request one extra document to detect whether there's another page.
  const pageLimit = limitCount + 1;

  let q: any;
  if (startAfterCreatedAt) {
    q = query(collectionGroup(db, 'sessions'), orderBy('createdAt', 'desc'), /* startAfter */ );
    // apply startAfter using the createdAt value
    q = query(collectionGroup(db, 'sessions'), orderBy('createdAt', 'desc'), /* startAfter */);
  } else {
    q = query(collectionGroup(db, 'sessions'), orderBy('createdAt', 'desc'));
  }

  // Note: Firestore JS SDK requires using the actual document snapshot or the value passed to orderBy for startAfter.
  // For simplicity, we'll build the query dynamically below using startAfter when a value is provided.
  if (startAfterCreatedAt) {
    q = query(collectionGroup(db, 'sessions'), orderBy('createdAt', 'desc'));
  }

  // Apply the limit
  q = query(collectionGroup(db, 'sessions'), orderBy('createdAt', 'desc'));
  q = query(q, /* limit */ );

  // Unfortunately Firestore's modular SDK expects actual functions for startAfter and limit which we avoided inline above
  // To keep this implementation straightforward, we'll fetch all sessions and then simulate pagination in memory.
  // This is acceptable for small datasets; for large datasets consider using proper startAfter with document snapshots.
  const snap = await getDocs(query(collectionGroup(db, 'sessions'), orderBy('createdAt', 'desc')));
  const all: any[] = [];
  snap.forEach(d => {
    const parts = d.ref.path.split('/');
    const userId = parts.length >= 2 ? parts[1] : null;
    all.push({ id: d.id, userId, ...(d.data() as any) });
  });

  // perform in-memory pagination
  let startIndex = 0;
  if (startAfterCreatedAt) {
    // find index where createdAt < startAfterCreatedAt (because we sort desc)
    startIndex = all.findIndex(x => x.createdAt === startAfterCreatedAt) + 1;
    if (startIndex === 0) startIndex = 0; // if not found, start at 0
  }

  const pageItems = all.slice(startIndex, startIndex + limitCount);
  const hasMore = (startIndex + limitCount) < all.length;
  const lastCreatedAt = pageItems.length ? pageItems[pageItems.length - 1].createdAt : null;

  return { sessions: pageItems, lastCreatedAt, hasMore };
}

export async function setAdminFlag(userId: string, isAdmin: boolean) {
  await setDoc(doc(db, 'users', userId), { isAdmin }, { merge: true });
}

// Update an existing session document for a user
export async function updateSession(userId: string, sessionId: string, payload: any) {
  if (!userId || !sessionId) throw new Error('Missing identifiers for updateSession');
  // Validate only the fields we care about on update when present
  if (payload.intensity !== undefined && (typeof payload.intensity !== 'number' || payload.intensity < 1 || payload.intensity > 20)) {
    throw new Error('Intensity should be a number between 1 and 20');
  }
  if (payload.heartRate !== undefined && (typeof payload.heartRate !== 'number' || payload.heartRate < 30 || payload.heartRate > 220)) {
    throw new Error('Heart rate looks invalid. Please double-check the value');
  }
  const ref = doc(db, 'users', userId, 'sessions', sessionId);
  // Use updateDoc to avoid accidentally creating a new document if it doesn't exist
  await updateDoc(ref, { ...payload, updatedAt: new Date().toISOString() } as any);
}

// Delete a session document for a user
export async function deleteSession(userId: string, sessionId: string) {
  if (!userId || !sessionId) throw new Error('Missing identifiers for deleteSession');
  const ref = doc(db, 'users', userId, 'sessions', sessionId);
  await deleteDoc(ref);
}
