
import { firestore, FieldValue } from '../lib/firebaseAdmin.js';
import { getPromotionKey, executePromotion } from '../utils/tossClient.js';
import { logUserAction } from '../utils/helpers.js';
import { PROMOTION_CONFIG } from '../config/promotion.js';
import { GACHA_PROMOTION_CONFIG } from '../config/gachaPromotion.js';
import { getKstDateKey } from '../utils/helpers.js';

const normalizePromotionDate = (value) => {
    if (!value) return null;
    if (typeof value.toDate === 'function') return value.toDate();
    if (value instanceof Date) return value;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * [New] Claim a promotion by manual code (e.g., from Toss Mission or Welcome event)
 */
export const claimPromotionByCode = async (userKey, promotionCode) => {
    const promoRef = firestore.collection('promotions').doc(promotionCode);
    const userRef = firestore.collection('users').doc(String(userKey));
    const claimRef = userRef.collection('claimed_promotions').doc(promotionCode);

    try {
        // 1. Validation Logic
        const [promoSnap, claimSnap] = await Promise.all([
            promoRef.get(),
            claimRef.get()
        ]);

        if (!promoSnap.exists) throw new Error('PROMOTION_NOT_FOUND');
        const promoData = promoSnap.data();

        if (!promoData.isActive) throw new Error('INACTIVE');

        // Period Check
        const now = new Date();
        const startDate = normalizePromotionDate(promoData.startDate);
        const endDate = normalizePromotionDate(promoData.endDate);
        if (startDate && startDate > now) throw new Error('NOT_STARTED');
        if (endDate && endDate < now) throw new Error('EXPIRED');

        // Usage Limit Check
        if (promoData.maxClaims && promoData.currentClaims >= promoData.maxClaims) {
            throw new Error('MAX_CLAIMS_REACHED');
        }

        // Duplicate Check
        if (claimSnap.exists && promoData.oneTimePerUser !== false) {
            throw new Error('ALREADY_CLAIMED');
        }

        let cashReward = Number(promoData.cashReward || 0);
        let ticketsReward = Number(promoData.ticketsReward || promoData.ticketsAdded || 0);
        const isRefundCode = promotionCode === PROMOTION_CONFIG.REFUND_PROMOTION_CODE
            || promotionCode === PROMOTION_CONFIG.REFUND_LIVE_CODE;
        const shouldExecuteToss = cashReward > 0 && !isRefundCode && promoData.skipTossExecution !== true;
        const executedCashReward = shouldExecuteToss ? cashReward : 0;
        let tossKey = null;

        // 2. Execute Toss Reward if cash exists and this promotion is Toss-backed
        if (shouldExecuteToss) {
            try {
                tossKey = await getPromotionKey(userKey);
                await executePromotion(userKey, promotionCode, tossKey, cashReward);
            } catch (tossErr) {
                if (tossErr.code === 4113) throw new Error('ALREADY_CLAIMED');
                if (tossErr.code === 4109) throw new Error('MAX_CLAIMS_REACHED'); // Budget exhausted
                throw new Error('PROMOTION_PROVIDER_UNAVAILABLE');
            }
        }

        // 3. Update DB
        const batch = firestore.batch();

        // Update User
        const userUpdates = {
            lastPromotionAt: FieldValue.serverTimestamp()
        };
        if (ticketsReward > 0) {
            userUpdates.tickets = FieldValue.increment(ticketsReward);
            userUpdates.ticketsTotal = FieldValue.increment(ticketsReward);
        }
        // [FIX] 프로모션 보상 포인트도 users.points에 동기화
        if (executedCashReward > 0) {
            userUpdates.points = FieldValue.increment(executedCashReward);
        }
        batch.set(userRef, userUpdates, { merge: true });

        // Record Claim
        batch.set(claimRef, {
            claimedAt: FieldValue.serverTimestamp(),
            cashReward: executedCashReward,
            ticketsReward,
            tossKey,
            status: 'SUCCESS'
        });

        // Update Promotion Counters
        batch.update(promoRef, {
            currentClaims: FieldValue.increment(1),
            usedBudget: FieldValue.increment(executedCashReward)
        });

        await batch.commit();

        // 4. Detailed Logging
        await logUserAction(userKey, 'PROMOTION_CODE_CLAIMED', { promotionCode, cashReward, ticketsReward });

        // Get final ticket count for response
        const finalUserSnap = await userRef.get();
        const currentTickets = finalUserSnap.data()?.tickets || 0;

        return {
            tickets: currentTickets,
            ticketsAdded: ticketsReward,
            cashReward: executedCashReward,
            message: promoData.description ? `${promoData.description} 보상이 지급되었어요!` : '프로모션 보상이 지급되었어요!'
        };

    } catch (err) {
        console.error(`[PromotionService] Error for ${promotionCode} / user ${userKey}:`, err.message);
        throw err;
    }
};

/**
 * Internal logic for activity-based promotions.
 * Upgraded to use common validation where possible.
 */
export const claimUserPromotionInternal = async (userKey, promotionCode) => {
    // If it's a known "Code-based" promotion or exists in promotions collection, use the new logic
    const promoSnap = await firestore.collection('promotions').doc(promotionCode).get();
    if (promoSnap.exists) {
        return await claimPromotionByCode(userKey, promotionCode);
    }

    // Legacy / Activity Fallback Logic (if not in 'promotions' collection yet)
    const claimRef = firestore.collection('users').doc(String(userKey))
        .collection('claimed_promotions').doc(promotionCode);

    try {
        const claimSnap = await claimRef.get();
        if (claimSnap.exists) throw new Error('ALREADY_CLAIMED');

        // Activity promotions are usually hardcoded or simplified
        // Find config in GACHA_PROMOTION_CONFIG
        const configEntry = Object.values(GACHA_PROMOTION_CONFIG.ACTIVITY_PROMOTIONS).find(p => {
            if (p.promotionCode === promotionCode) return true;
            // [Daily Mission Fix] Match code with date suffix (e.g. CODE_2026-03-03)
            if (p.daily && promotionCode.startsWith(p.promotionCode + '_')) return true;
            return false;
        });

        let rewardAmount = 0;

        if (promotionCode === PROMOTION_CONFIG.DIAMOND_LIVE_CODE || promotionCode === PROMOTION_CONFIG.DIAMOND_TEST_CODE) {
            rewardAmount = Math.random() < 0.01 ? 100 : (Math.floor(Math.random() * 10) + 1);
        } else if (configEntry) {
            const dist = configEntry.rewardDistribution;
            if (dist?.type === 'jackpot') {
                // 확률 기반 잭팟 보상 (티어별 chance 판정)
                const roll = Math.random();
                let cumulative = 0;
                let matched = false;
                for (const tier of (dist.tiers || [])) {
                    cumulative += tier.chance;
                    if (roll < cumulative) {
                        rewardAmount = tier.amount;
                        matched = true;
                        console.log(`[Promotion] 🎰 JACKPOT! userKey=${userKey} amount=${tier.amount} roll=${roll.toFixed(8)}`);
                        break;
                    }
                }
                if (!matched) {
                    const fb = dist.fallback || { min: 1, max: 5 };
                    rewardAmount = Math.floor(Math.random() * (fb.max - fb.min + 1)) + fb.min;
                }
            } else if (dist?.type === 'range') {
                rewardAmount = Math.floor(Math.random() * (dist.max - dist.min + 1)) + dist.min;
            } else {
                rewardAmount = configEntry.minCashReward || PROMOTION_CONFIG.DEFAULT_AMOUNT || 5;
            }
        } else {
            rewardAmount = PROMOTION_CONFIG.DEFAULT_AMOUNT || 5;
        }


        const tossKey = await getPromotionKey(userKey);

        // [Safety] Skip Toss execution if code is a placeholder
        const isPlaceholder = promotionCode.includes('PLACEHOLDER');
        let tossCodeToExecute = configEntry ? configEntry.promotionCode : promotionCode;

        // [Daily Mission] Support TEST codes (prepend 'TEST_' to the original code for admins or test mode)
        const adminIds = (process.env.ADMIN_USER_IDS || '').split(',');
        const isTestUser = adminIds.includes(String(userKey));
        const isTestMode = process.env.USE_TEST_PROMOTION === 'true' || isTestUser;

        if (isTestMode && !tossCodeToExecute.startsWith('TEST_')) {
            tossCodeToExecute = `TEST_${tossCodeToExecute}`;
        }
        console.log(`[PromotionService] Claiming for ${userKey}: original=${promotionCode}, finalTossCode=${tossCodeToExecute}, isTestMode=${isTestMode}`);

        if (!isPlaceholder) {
            await executePromotion(userKey, tossCodeToExecute, tossKey, rewardAmount);
        } else {
            console.log(`[PromotionService] Skipping Toss execution for placeholder code: ${promotionCode}`);
        }

        await claimRef.set({
            claimedAt: FieldValue.serverTimestamp(),
            amount: rewardAmount,
            tossKey: tossKey,
            status: 'SUCCESS'
        });

        // [FIX] 프로모션 보상 포인트도 users.points에 동기화
        if (rewardAmount > 0) {
            const userRef = firestore.collection('users').doc(String(userKey));
            await userRef.set({ points: FieldValue.increment(rewardAmount) }, { merge: true });
        }

        // [FIX] 통계용 로그 추가 (가장 중요)
        await logUserAction(userKey, 'PROMOTION_CODE_CLAIMED', {
            promotionCode: tossCodeToExecute,
            cashReward: rewardAmount,
            ticketsReward: 0,
            type: 'activity_reward'
        });

        return {
            amount: rewardAmount,
            message: `${rewardAmount}원이 지급되었습니다!`
        };
    } catch (e) {
        if (e.code === 4113) throw new Error('ALREADY_CLAIMED');
        throw e;
    }
};

/**
 * Check and claim activity-based promotions (Attendance, Share, etc.)
 */
export const checkAndClaimActivityReward = async (userKey, type, currentValue = null, options = {}) => {
    try {
        const { GACHA_PROMOTION_CONFIG } = await import('../config/gachaPromotion.js');
        const config = GACHA_PROMOTION_CONFIG.ACTIVITY_PROMOTIONS[type];

        if (!config || !config.active) return null;

        if (config.goal !== undefined && currentValue !== null) {
            if (currentValue < config.goal) return null;
        }

        let promotionCode = config.promotionCode;
        if (!promotionCode) return null;

        // [Daily Mission] If it's a daily mission, append the date to the code for duplicate check
        if (config.daily) {
            const dateKey = getKstDateKey();
            promotionCode = `${promotionCode}_${dateKey}`;
        }

        try {
            const rewardResult = await claimUserPromotionInternal(userKey, promotionCode, { isDaily: config.daily });
            await logUserAction(userKey, 'ACTIVITY_REWARD_CLAIMED', {
                activityType: type,
                promotionCode,
                rewardAmount: rewardResult?.amount || rewardResult?.cashReward || 0,
                isDaily: config.daily === true,
                category: config.category || null,
                personaId: config.personaId || null,
                goal: config.goal ?? null,
                currentValue,
            });
            return rewardResult;
        } catch (e) {
            if (e.message === 'ALREADY_CLAIMED') return { alreadyClaimed: true };
            if (e.message === 'MAX_CLAIMS_REACHED' || e.message === 'BUDGET_EXHAUSTED') return { error: 'BUDGET_EXHAUSTED' };
            console.error(`[ActivityReward] Error for ${type}:`, e.message);
            return null;
        }
    } catch (err) {
        console.error(`[ActivityReward] Unexpected error for ${type}:`, err.message);
        return null;
    }
};

/**
 * [Daily Mission] Update progress and check for rewards
 * @param {string} userKey 
 * @param {'chat' | 'check'} activityType 
 * @param {string} targetId personaId or category
 */
export const updateDailyMissionProgress = async (userKey, activityType, targetId) => {
    const today = getKstDateKey();
    const missionRef = firestore.collection('users').doc(String(userKey)).collection('daily_missions').doc(today);

    try {
        await firestore.runTransaction(async (tx) => {
            const snap = await tx.get(missionRef);
            const data = snap.exists ? snap.data() : { chatted_personas: [], checked_categories: [] };

            if (activityType === 'chat') {
                // Find matching persona mission
                const missionKey = Object.keys(GACHA_PROMOTION_CONFIG.ACTIVITY_PROMOTIONS).find(k =>
                    GACHA_PROMOTION_CONFIG.ACTIVITY_PROMOTIONS[k].personaId === targetId && GACHA_PROMOTION_CONFIG.ACTIVITY_PROMOTIONS[k].daily
                );

                if (missionKey) {
                    // 1. Reward for individual chat (Async, outside transaction but we need to track if we already did it)
                    if (!data.chatted_personas.includes(targetId)) {
                        data.chatted_personas.push(targetId);
                        checkAndClaimActivityReward(userKey, missionKey).catch(err => {
                            console.error(`[DailyMission] Chat reward claim FAILED for ${userKey}, mission=${missionKey}:`, err.message);
                        });
                    }
                }
            } else if (activityType === 'check') {
                // Find matching category mission
                const missionKey = Object.keys(GACHA_PROMOTION_CONFIG.ACTIVITY_PROMOTIONS).find(k =>
                    GACHA_PROMOTION_CONFIG.ACTIVITY_PROMOTIONS[k].category === targetId && GACHA_PROMOTION_CONFIG.ACTIVITY_PROMOTIONS[k].daily
                );

                if (missionKey) {
                    if (!data.checked_categories.includes(targetId)) {
                        data.checked_categories.push(targetId);
                        checkAndClaimActivityReward(userKey, missionKey).catch(err => {
                            console.error(`[DailyMission] Check reward claim FAILED for ${userKey}, mission=${missionKey}:`, err.message);
                        });
                    }
                }
            }

            tx.set(missionRef, {
                ...data,
                updatedAt: FieldValue.serverTimestamp()
            }, { merge: true });
        });
    } catch (err) {
        console.error('[DailyMission] Update failed:', err);
    }
};
