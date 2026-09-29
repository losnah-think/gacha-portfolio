import { initializeApp, getApps } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getAnalytics } from 'firebase/analytics'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

const secondaryMeasurementId = import.meta.env.VITE_FIREBASE_MEASUREMENT_ID_2

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
const app2 = secondaryMeasurementId && secondaryMeasurementId !== firebaseConfig.measurementId
  ? getApps().find((firebaseApp) => firebaseApp.name === 'SecondaryApp') ?? initializeApp({
    ...firebaseConfig,
    measurementId: secondaryMeasurementId,
  }, 'SecondaryApp')
  : null

export const auth = getAuth(app)
export const db = getFirestore(app)
let _analytics: ReturnType<typeof getAnalytics> | null = null;
let _analytics2: ReturnType<typeof getAnalytics> | null = null;

const shouldInitializeAnalytics =
  typeof window !== 'undefined' &&
  import.meta.env.VITE_ENABLE_FIREBASE_ANALYTICS === 'true' &&
  Boolean(firebaseConfig.apiKey) &&
  Boolean(firebaseConfig.measurementId);

if (shouldInitializeAnalytics) {
  try {
    _analytics = getAnalytics(app);
  } catch (e) {
    console.error('[Firebase] Failed to init primary analytics:', e);
  }

  if (app2) {
    try {
      _analytics2 = getAnalytics(app2);
    } catch (e) {
      console.error('[Firebase] Failed to init secondary analytics:', e);
    }
  }
}

export const analytics = _analytics;
export const analytics2 = _analytics2;
