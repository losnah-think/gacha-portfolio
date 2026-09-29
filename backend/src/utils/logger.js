import { firestore, FieldValue } from '../lib/firebaseAdmin.js';

// 시스템 이벤트 로깅 (성공/실패 이력)
export const logSystemEvent = async (type, status, details = {}) => {
    try {
        const logData = {
            type,       // e.g., 'AI_GENERATION', 'API_REQUEST'
            status,     // 'SUCCESS', 'FAIL', 'WARNING'
            details: details || {},
            createdAt: FieldValue.serverTimestamp()
        };

        // UI 표기를 위한 요약 처리
        if (logData.details.content && logData.details.content.length > 50) {
            logData.details.contentSummary = logData.details.content.substring(0, 50) + '...';
        }

        console.log(`[${type}] ${status}`, details); // Enable real-time logging
        await firestore.collection('system_logs').add(logData);
    } catch (e) {
        console.error('Failed to log system event:', e);
    }
};
