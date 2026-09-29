import admin, { firestore } from '../lib/firebaseAdmin.js';
import { sendPushMessage } from '../utils/tossClient.js';

/**
 * Send a generic push notification to a user
 */
export const sendPushNotification = async (userKey, title, body, data = {}, category = 'DEFAULT') => {
    try {
        const userRef = firestore.collection('users').doc(String(userKey));
        const userSnap = await userRef.get();

        if (!userSnap.exists) {
            throw new Error('USER_NOT_FOUND');
        }

        const userData = userSnap.data();

        // --- Permission Check Logic ---
        const settings = userData.notificationSettings || {};
        const marketing = userData.isMarketingAgreed !== false; // Default true
        const notificationsEnabled = userData.notificationsEnabled !== false; // Master toggle

        if (!notificationsEnabled) {
            console.log(`[Push] Skipped ${category} push for ${userKey} (Master toggle OFF).`);
            return { sent: false, reason: 'MASTER_TOGGLE_OFF' };
        }

        let isAllowed = true;
        let templateCode = 'gacha_default'; // Fallback

        switch (category) {
            case 'ATTENDANCE': // Marketing + Toggle
                isAllowed = marketing && (settings.attendance !== false);
                templateCode = 'gacha_attendance_3day';
                break;
            case 'ADVICE': // Marketing + Toggle
                isAllowed = marketing && (settings.advice !== false);
                templateCode = 'gacha_advice_5pull';
                break;
            case 'SCRATCH_LOTTERY': // Marketing + Toggle
                isAllowed = marketing && (settings.scratchLottery !== false);
                templateCode = 'gacha-reward_received';
                break;
            case 'MORNING': // Functional (Toggle only)
            case 'EVENING': // Functional (Toggle only)
                // [Disabled] 기능성 스마트 발송 중단 요청에 의한 차단
                isAllowed = false;
                break;
            case 'DEFAULT':
            default:
                isAllowed = true;
                break;
        }

        if (!isAllowed) {
            console.log(`[Push] Skipped ${category} push for ${userKey} (Settings blocked).`);
            return { sent: false, reason: 'USER_OPT_OUT' };
        }
        // -----------------------------

        // Use Toss Smart Message API
        // Context variables depend on the template. 
        // We ensure standard variables (title, body, link) and user-requested variables (logoUrl, date) are present.
        const kstDate = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
        const formattedDate = kstDate.toISOString().slice(0, 16).replace('T', ' ');

        const context = {
            title: title || '',
            body: body || '',
            link: data?.link || 'toss://example-app',
            date: formattedDate,
            logoUrl: 'https://example.invalid/example-project.firebasestorage.app/images/logo.png',
            logo: 'https://example.invalid/example-project.firebasestorage.app/images/logo.png', // [Fix] Toss Template Compatibility
            storeName: '가차', // [Fix] Toss Template Compatibility
            imageUrl: data?.imageUrl || '', // Pass imageUrl if provided
            ...(data || {})
        };

        const response = await sendPushMessage(userKey, templateCode, context);

        if (response.success) {
            console.log(`[Push] Sent to ${userKey} via Toss API:`, response.data);
            return { sent: true, messageId: 'TOSS_API', detail: response.data };
        } else {
            console.error(`[Push] Toss API Failed:`, response.error);
            return { sent: false, reason: 'API_FAIL', error: response.error };
        }

    } catch (error) {
        console.error(`[Push] Error sending to ${userKey}:`, error);
        throw error;
    }
};

/**
 * Send Morning Daily Ticket Push
 */
export const sendDailyTicketPush = async (userKey) => {
    // Dynamic import to avoid circular dependency issues if any
    const { GACHA_PROMOTION_CONFIG } = await import('../config/gachaPromotion.js');
    const config = GACHA_PROMOTION_CONFIG.ACTIVITY_PROMOTIONS.DAILY_TICKET_REMINDER;

    const title = config?.title || "오늘의 무료 티켓이 도착했어요";
    const body = config?.description || "하루 한 번, 무료로 조언을 확인해보세요.";
    const imageUrl = config?.imageUrl || "https://example.invalid/example-project.firebasestorage.app/images/promotions/daily_ticket.png";

    return sendPushNotification(userKey, title, body, { type: 'gacha-DAILY_REMINDER', imageUrl }, 'MORNING');
};

/**
 * Send 3-Day Attendance Reward Push
 */
export const sendAttendanceRewardPush = async (userKey) => {
    // Dynamic import to avoid circular dependency issues if any
    const { GACHA_PROMOTION_CONFIG } = await import('../config/gachaPromotion.js');
    const config = GACHA_PROMOTION_CONFIG.ACTIVITY_PROMOTIONS.ATTENDANCE_3_DAYS;

    const title = config?.title || "3일 연속 접속하면 포인트를 받아요";
    const body = config?.description || "가차를 통해 오늘의 조언을 뽑아보세요.";
    const imageUrl = config?.imageUrl;

    return sendPushNotification(userKey, title, body, { type: 'gacha-PROMO_ATTENDANCE', imageUrl }, 'ATTENDANCE');
};

export const sendAdviceRewardPush = async (userKey) => {
    const { GACHA_PROMOTION_CONFIG } = await import('../config/gachaPromotion.js');
    const config = GACHA_PROMOTION_CONFIG.ACTIVITY_PROMOTIONS.ADVICE_5_PULLS;

    const title = config?.title || "조언 5회 이상 뽑으면 10원을 받아요";
    const body = config?.description || "지금 조언을 뽑고 포인트를 획득하세요.";
    const imageUrl = config?.imageUrl;

    return sendPushNotification(userKey, title, body, { type: 'gacha-PROMO_ADVICE', imageUrl }, 'ADVICE');
};

/**
 * 복권 긁기 리마인더 푸시
 * 매일 오전 8시 발송 — 어제 활동한 유저 대상
 */
export const sendScratchLotteryPush = async (userKey) => {
    // 유저 이름 조회 (Toss 템플릿 변수용)
    const userRef = firestore.collection('users').doc(String(userKey));
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? userSnap.data() : {};
    const userName = userData.nickname || userData.name || '회원';

    const title = `${userName}님, 포인트 복권을 열 수 있어요.`;
    const body = '오늘 아침에 받은 포인트 복권을 긁어보세요.';

    return sendPushNotification(userKey, title, body, {
        type: 'gacha-reward_received',
        link: 'toss://example-app?tab=reward',
        userName,
    }, 'SCRATCH_LOTTERY');
};

/**
 * 아침 랜덤 푸시 알림
 * 4가지 템플릿 중 하나를 랜덤으로 발송
 */
const MORNING_RANDOM_TEMPLATES = [
    { title: '오늘의 운세', body: '오늘의 운세가 도착했어요.', templateCode: 'gacha-locky2' },
    { title: '무료 복권', body: '새 복권이 도착했어요.', templateCode: 'gacha-ticket2' },
    { title: '오늘의 퀴즈', body: '새 퀴즈가 도착했어요.', templateCode: 'gacha-quiz2' },
    { title: '무료 뽑기권', body: '토스에 뽑기권이 도착했어요.', templateCode: 'gacha-gacha' },
];

export const sendMorningRandomPush = async (userKey) => {
    try {
        const userRef = firestore.collection('users').doc(String(userKey));
        const userSnap = await userRef.get();

        if (!userSnap.exists) return { sent: false, reason: 'USER_NOT_FOUND' };

        const userData = userSnap.data();
        const notificationsEnabled = userData.notificationsEnabled !== false;
        const marketing = userData.isMarketingAgreed !== false;
        const settings = userData.notificationSettings || {};

        if (!notificationsEnabled || !marketing || settings.morningRandom === false) {
            console.log(`[Push] Skipped MORNING_RANDOM for ${userKey}`);
            return { sent: false, reason: 'USER_OPT_OUT' };
        }

        const pick = MORNING_RANDOM_TEMPLATES[Math.floor(Math.random() * MORNING_RANDOM_TEMPLATES.length)];

        const kstDate = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
        const formattedDate = kstDate.toISOString().slice(0, 16).replace('T', ' ');

        const context = {
            title: pick.title,
            body: pick.body,
            link: 'toss://example-app',
            date: formattedDate,
            logoUrl: 'https://example.invalid/example-project.firebasestorage.app/images/logo.png',
            logo: 'https://example.invalid/example-project.firebasestorage.app/images/logo.png',
            storeName: '가차',
        };

        const response = await sendPushMessage(userKey, pick.templateCode, context);

        if (response.success) {
            console.log(`[Push] MORNING_RANDOM (${pick.templateCode}) sent to ${userKey}`);
            return { sent: true, template: pick.templateCode };
        } else {
            console.error(`[Push] MORNING_RANDOM failed for ${userKey}:`, response.error);
            return { sent: false, reason: 'API_FAIL', error: response.error };
        }
    } catch (error) {
        console.error(`[Push] MORNING_RANDOM error for ${userKey}:`, error);
        throw error;
    }
};

/**
 * 랭킹 보상 안내 알림
 * @param {string} userKey 
 * @param {string} type - 'daily' | 'weekly' | 'monthly'
 * @param {number} rank - 최종 순위
 * @param {number} amount - 지급된 티켓 수
 */
export const sendRankingRewardPush = async (userKey, type, rank, amount) => {
    const typeNm = type === 'daily' ? '일간' : type === 'weekly' ? '주간' : '월간';
    const title = `축하합니다! ${typeNm} 랭킹 ${rank}위 보상 도착! 🎁`;
    const body = `꾸준한 뽑기로 ${rank}위를 달성하셨네요! 보상으로 티켓 ${amount}개가 지급되었어요.`;

    return sendPushNotification(userKey, title, body, {
        type: `gacha-RANK_REWARD_${type.toUpperCase()}`,
        rank,
        amount,
        link: 'toss://example-app?tab=ranking'
    }, 'RANKING');
};
