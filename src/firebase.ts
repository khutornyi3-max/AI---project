import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import type { DecisionRecord, FrameworkType } from './types/decision';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();

export function mapFirebaseAuthError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: string }).code)
      : '';

  switch (code) {
    case 'auth/popup-closed-by-user':
      return 'Вікно входу через Google було закрито до завершення авторизації.';
    case 'auth/cancelled-popup-request':
      return 'Запит на вхід скасовано. Спробуйте натиснути кнопку ще раз.';
    case 'auth/popup-blocked':
      return 'Браузер заблокував спливаюче вікно Google. Дозвольте спливаючі вікна для цього сайту й повторіть спробу.';
    case 'auth/network-request-failed':
      return 'Помилка мережі під час підключення до Google. Перевірте інтернет-з’єднання.';
    case 'auth/unauthorized-domain':
      return 'Цей домен ще не додано до дозволених у налаштуваннях Firebase Authentication.';
    default:
      return 'Не вдалося виконати вхід через Google. Спробуйте ще раз.';
  }
}

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

// Blueprint-aligned defensive sanitization helpers (matching firebase-blueprint.json & firestore.rules)
const VALID_ID_REGEX = /^[a-zA-Z0-9_-]+$/;
type FirestoreFrameworkType = 'pros-cons' | 'comparison' | 'swot' | 'chat';
const FIRESTORE_FRAMEWORKS: FirestoreFrameworkType[] = [
  'pros-cons',
  'comparison',
  'swot',
  'chat',
];

function sanitizeDocId(rawId: string): string {
  const cleaned = rawId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
  if (cleaned && VALID_ID_REGEX.test(cleaned)) {
    return cleaned;
  }
  return `dec-${Date.now().toString(36)}`;
}

function truncateText(value: string | null | undefined, maxLength: number): string {
  return String(value ?? '').slice(0, maxLength);
}

export async function syncUserPrivateProfile(user: User): Promise<void> {
  if (!user.emailVerified) return;
  const profilePath = `users/${user.uid}/private/profile`;
  const ref = doc(db, 'users', user.uid, 'private', 'profile');

  const payload = {
    displayName: truncateText(user.displayName || 'Користувач Google', 120),
    email: truncateText(user.email || '', 254),
    photoURL: truncateText(user.photoURL || '', 500),
    updatedAt: serverTimestamp(),
  };

  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, payload);
    } else {
      await setDoc(ref, {
        uid: user.uid,
        ...payload,
        createdAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, profilePath);
  }
}

function buildFirestoreDecisionFields(decision: DecisionRecord, ownerId: string) {
  const framework: FirestoreFrameworkType =
    decision.activeFramework === 'voice' || decision.activeFramework === 'maps'
      ? 'chat'
      : FIRESTORE_FRAMEWORKS.includes(
            decision.activeFramework as FirestoreFrameworkType,
          )
        ? (decision.activeFramework as FirestoreFrameworkType)
        : 'pros-cons';

  return {
    ownerId,
    title: truncateText(decision.title.trim() || 'Без назви', 200),
    context: truncateText(decision.context, 2000),
    options: (decision.options ?? []).slice(0, 4),
    prosCons: (decision.prosCons ?? []).slice(0, 4),
    comparisonCriteria: (decision.comparisonCriteria ?? []).slice(0, 15),
    swot: (decision.swot ?? []).slice(0, 4),
    aiTakeaway: truncateText(decision.aiTakeaway, 1500),
    tiebreakerQuestion: truncateText(decision.tiebreakerQuestion, 500),
    challenges: (decision.challenges ?? []).slice(0, 20),
    chosenOptionId: truncateText(decision.chosenOptionId ?? '', 128),
    activeFramework: framework,
  };
}

function timestampToIso(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  return new Date().toISOString();
}

export function subscribeUserDecisions(
  userId: string,
  onData: (decisions: DecisionRecord[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const decisionsPath = 'decisions';
  const q = query(
    collection(db, decisionsPath),
    where('ownerId', '==', userId),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const records: DecisionRecord[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        const rawFramework = String(data.activeFramework ?? 'pros-cons');
        const activeFramework: FrameworkType = FIRESTORE_FRAMEWORKS.includes(
          rawFramework as FirestoreFrameworkType,
        )
          ? (rawFramework as FrameworkType)
          : 'pros-cons';

        return {
          id: docSnap.id,
          title: String(data.title ?? ''),
          context: String(data.context ?? ''),
          options: Array.isArray(data.options) ? data.options : [],
          prosCons: Array.isArray(data.prosCons) ? data.prosCons : [],
          comparisonCriteria: Array.isArray(data.comparisonCriteria)
            ? data.comparisonCriteria
            : [],
          swot: Array.isArray(data.swot) ? data.swot : [],
          aiTakeaway: String(data.aiTakeaway ?? ''),
          tiebreakerQuestion: String(data.tiebreakerQuestion ?? ''),
          challenges: Array.isArray(data.challenges) ? data.challenges : [],
          chosenOptionId:
            typeof data.chosenOptionId === 'string' && data.chosenOptionId.length > 0
              ? data.chosenOptionId
              : null,
          activeFramework,
          createdAt: timestampToIso(data.createdAt),
          updatedAt: timestampToIso(data.updatedAt),
        };
      });

      records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      onData(records);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, decisionsPath);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    },
  );
}

export async function saveDecisionToCloud(
  decision: DecisionRecord,
  ownerId: string,
): Promise<void> {
  const docId = sanitizeDocId(decision.id);
  const path = `decisions/${docId}`;
  const ref = doc(db, 'decisions', docId);
  const baseFields = buildFirestoreDecisionFields(decision, ownerId);

  try {
    const existingSnap = await getDoc(ref);
    if (existingSnap.exists()) {
      const { ownerId: _ignoredOwner, ...updatableFields } = baseFields;
      await updateDoc(ref, {
        ...updatableFields,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ...baseFields,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteDecisionFromCloud(decisionId: string): Promise<void> {
  const docId = sanitizeDocId(decisionId);
  const path = `decisions/${docId}`;
  const ref = doc(db, 'decisions', docId);

  try {
    await deleteDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
