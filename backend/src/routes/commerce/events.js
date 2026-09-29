import express from 'express';
import { firestore } from '../../lib/firebaseAdmin.js';
import { GACHA_PROMOTION_CONFIG } from '../../config/gachaPromotion.js';
import { resolveImageUrl } from '../../utils/imageUrl.js';
import { getTicketBalance } from '../../utils/helpers.js';

const router = express.Router();

let globalPromoCache = { data: null, expiry: 0 };
const PROMO_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * GET /api/v2/events
 * Get list of active events with user status.
 */
router.get('/', async (req, res) => {
    const { userKey } = req.query;
    if (!userKey) {
        return res.status(400).json({ success: false, error: 'MISSING_USER_KEY' });
    }

    try {
        console.log(`[Events] Fetching events for user: ${userKey}`);
        const userRef = firestore.collection('users').doc(String(userKey));
        const [userSnap, claimedSnap] = await Promise.all([
            userRef.get(),
            userRef.collection('claimed_promotions').get()
        ]);

        const userData = userSnap.exists ? userSnap.data() : {};
        const claimedCodes = new Set();
        if (!claimedSnap.empty) {
            claimedSnap.forEach(doc => claimedCodes.add(doc.id));
        }

        const activityPromos = GACHA_PROMOTION_CONFIG.ACTIVITY_PROMOTIONS || {};
        const events = [];

        // 1. Process Activity Promotions (Attendance, Pulls, etc.)
        for (const [key, config] of Object.entries(activityPromos)) {
            if (!config || !config.active) continue;

            const promoCode = config.promotionCode || '';
            const isClaimed = promoCode ? claimedCodes.has(promoCode) : false;

            // Determine current progress
            let current = 0;
            const goal = config.goal || 1;

            if (key.includes('ATTENDANCE')) {
                current = userData.consecutiveLoginDays || userData.consecutiveAttendanceCount || 0;
            } else if (key.includes('LOTTO')) {
                current = userData.lottoCount || 0;
            } else if (key.includes('PULL') || key.includes('COLLECTOR') || key.includes('ADVICE') || key.includes('GACHA') || key.includes('JACKPOT_SEOL') || key.includes('JACKPOT_LIFE')) {
                current = userData.pullCount || 0;
            } else if (key.includes('SHARE')) {
                current = userData.shareCount || 0;
            } else if (key.includes('CHAT') || key.includes('WORDS') || key.includes('MESSAGE')) {
                current = userData.chatCount || userData.totalMessages || 0;
            } else {
                current = 0;
            }

            const isGoalMet = current >= goal;

            let status = 'IN_PROGRESS';
            if (isClaimed) {
                status = 'COMPLETED'; // 이미 보상 받음
            } else if (isGoalMet) {
                status = 'CLAIMABLE'; // 보상 받기 가능
            } else if (config.isJackpot) {
                status = 'ACTIVE';    // 상시 참여 중
            }

            // Friendly status text
            let statusText = '진행 중';
            if (status === 'COMPLETED') statusText = '지급 완료';
            else if (status === 'CLAIMABLE') statusText = '보상 받기 가능';
            else if (status === 'ACTIVE') statusText = '참여 가능';

            events.push({
                id: key,
                promoCode,
                title: config.title || '이벤트',
                description: config.description || '',
                imageUrl: resolveImageUrl(config.imageUrl),
                status,
                statusText,
                progress: {
                    current,
                    goal,
                    percentage: Math.min(100, Math.round((current / (goal || 1)) * 100))
                },
                isJackpot: !!config.isJackpot,
                sortOrder: config.sortOrder || 100,
                type: config.type || 'activity',
                linkUrl: config.linkUrl || ''
            });
        }

        // 2. Fetch one-off promotions from Firestore 'promotions' collection (with cache)
        try {
            const now = Date.now();
            if (!globalPromoCache.data || globalPromoCache.expiry < now) {
                const promotionsRef = firestore.collection('promotions');
                const promoSnapshot = await promotionsRef.where('active', '==', true).get();
                const promoList = [];
                promoSnapshot.forEach(doc => {
                    promoList.push({ id: doc.id, ...doc.data() });
                });
                globalPromoCache = { data: promoList, expiry: now + PROMO_CACHE_TTL };
            }

            globalPromoCache.data.forEach(data => {
                const isClaimed = claimedCodes.has(data.id);

                events.push({
                    id: data.id,
                    title: data.title || '프로모션',
                    description: data.description || '',
                    imageUrl: resolveImageUrl(data.imageUrl),
                    status: isClaimed ? 'COMPLETED' : 'ACTIVE',
                    type: data.type || 'banner',
                    linkUrl: data.linkUrl || '',
                    sortOrder: data.priority || 0
                });
            });
        } catch (promoErr) {
            console.error('[Events] One-off promotions fetch failed:', promoErr);
            // Non-critical, continue
        }

        // Sorting: Claimable first, then In-progress, then active, then completed
        events.sort((a, b) => {
            const statusWeight = { 'CLAIMABLE': 0, 'IN_PROGRESS': 1, 'ACTIVE': 2, 'COMPLETED': 3 };
            const weightA = statusWeight[a.status] !== undefined ? statusWeight[a.status] : 10;
            const weightB = statusWeight[b.status] !== undefined ? statusWeight[b.status] : 10;

            if (weightA !== weightB) return weightA - weightB;
            return (a.sortOrder || 100) - (b.sortOrder || 100);
        });

        res.json({
            success: true,
            data: events
        });

    } catch (error) {
        console.error('[Events] Error:', error);
        res.status(500).json({ success: false, error: 'EVENTS_FETCH_FAILED', message: error.message });
    }
});

/**
 * GET /api/v2/events/history
 * Get reward history for the user.
 */
router.get('/history', async (req, res) => {
    const { userKey } = req.query;
    if (!userKey) {
        return res.status(400).json({ success: false, error: 'MISSING_USER_KEY' });
    }

    try {
        const claimedRef = firestore.collection('users').doc(String(userKey)).collection('claimed_promotions');
        const snapshot = await claimedRef.orderBy('claimedAt', 'desc').limit(50).get();

        const history = [];

        // Map promo codes to titles for better display
        const activityPromos = GACHA_PROMOTION_CONFIG.ACTIVITY_PROMOTIONS || {};
        const codeToTitle = {};
        Object.values(activityPromos).forEach(p => {
            if (p && p.promotionCode) codeToTitle[p.promotionCode] = p.title;
        });

        snapshot.forEach(doc => {
            const data = doc.data();

            // Robust Date Parsing
            let claimedAtStr = null;
            try {
                if (data.claimedAt && typeof data.claimedAt.toDate === 'function') {
                    claimedAtStr = data.claimedAt.toDate().toISOString();
                } else if (data.claimedAt) {
                    claimedAtStr = new Date(data.claimedAt).toISOString();
                }
            } catch (e) {
                claimedAtStr = new Date().toISOString();
            }

            history.push({
                id: doc.id,
                title: data.title || codeToTitle[doc.id] || '이벤트 보상',
                amount: data.amount || 0,
                claimedAt: claimedAtStr,
                status: data.status || 'SUCCESS'
            });
        });

        res.json({
            success: true,
            data: history
        });

    } catch (error) {
        console.error('[Events History] Error:', error);
        // History failure shouldn't crash the whole page if possible, but here we return 500
        res.status(500).json({ success: false, error: 'HISTORY_FETCH_FAILED', message: error.message });
    }
});

export default router;
