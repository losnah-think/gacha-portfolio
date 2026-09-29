import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import admin from 'firebase-admin';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';

if (process.env.SERVE_LOCALLY === 'true') {
    dotenv.config();
}

const projectId = process.env.APP_FIREBASE_PROJECT_ID;
if (!projectId) {
    throw new Error('Set APP_FIREBASE_PROJECT_ID to your own Firebase project or emulator project.');
}

let appConfig = {
    projectId,
    storageBucket: `${projectId}.firebasestorage.app`
};

// 로컬 실행 시 서비스 계정 키 파일 경로가 있으면 cert()로 인증
if (process.env.LOCAL_FIREBASE_SERVICE_ACCOUNT_KEY_PATH) {
    try {
        const serviceAccount = JSON.parse(
            readFileSync(process.env.LOCAL_FIREBASE_SERVICE_ACCOUNT_KEY_PATH, 'utf8')
        );
        appConfig.credential = cert(serviceAccount);
        console.log('[FirebaseAdmin] Service account key loaded from file.');
    } catch (e) {
        throw new Error('Unable to load the explicitly configured service-account file.');
    }
} else if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    // Base64로 인코딩된 서비스 계정 JSON 지원 (CI/CD 환경 등)
    try {
        const serviceAccount = JSON.parse(
            Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8')
        );
        appConfig.credential = cert(serviceAccount);
        console.log('[FirebaseAdmin] Service account key loaded from base64 env.');
    } catch (e) {
        throw new Error('Unable to decode the explicitly configured service account.');
    }
}

const app = getApps().length === 0 ? initializeApp(appConfig) : getApps()[0];

export const firestore = getFirestore(app);
firestore.settings({ ignoreUndefinedProperties: true });
export const storage = getStorage(app);
export const getAuth = () => getAdminAuth(app);
export { FieldValue };
export default admin;
