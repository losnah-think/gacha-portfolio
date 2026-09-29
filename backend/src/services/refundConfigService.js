import { firestore } from '../lib/firebaseAdmin.js';
import { PROMOTION_CONFIG } from '../config/promotion.js';

const DEFAULT_REFUND_CONFIG = {
    minPoints: 10,
    maxPoints: null,
    pointUnit: 10,
    promotionCode: null,
    enabled: true,
    updatedAt: null
};

const CONFIG_FILE_PROMOTION_CODE =
    typeof PROMOTION_CONFIG.REFUND_PROMOTION_CODE === 'string' && PROMOTION_CONFIG.REFUND_PROMOTION_CODE.trim()
        ? PROMOTION_CONFIG.REFUND_PROMOTION_CODE.trim()
        : null;

const normalizePositiveInt = (value, fallback) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) return fallback;
    return parsed;
};

const toIso = (value) => {
    if (!value) return null;
    if (typeof value?.toDate === 'function') {
        return value.toDate().toISOString();
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
};

export const normalizeRefundConfig = (rawConfig = {}) => {
    const minPoints = normalizePositiveInt(rawConfig.minPoints, DEFAULT_REFUND_CONFIG.minPoints);
    const maxPointsRaw = rawConfig.maxPoints;
    const maxPoints = maxPointsRaw === null || maxPointsRaw === undefined
        ? DEFAULT_REFUND_CONFIG.maxPoints
        : normalizePositiveInt(maxPointsRaw, DEFAULT_REFUND_CONFIG.maxPoints);
    const pointUnit = normalizePositiveInt(rawConfig.pointUnit, DEFAULT_REFUND_CONFIG.pointUnit);

    const promotionCode =
        typeof rawConfig.promotionCode === 'string' && rawConfig.promotionCode.trim()
            ? rawConfig.promotionCode.trim()
            : CONFIG_FILE_PROMOTION_CODE;

    return {
        minPoints,
        maxPoints: (Number.isInteger(maxPoints) && maxPoints >= minPoints) ? maxPoints : null,
        pointUnit,
        promotionCode,
        enabled: rawConfig.enabled !== undefined ? Boolean(rawConfig.enabled) : DEFAULT_REFUND_CONFIG.enabled,
        updatedAt: toIso(rawConfig.updatedAt) || new Date().toISOString()
    };
};

export const getRefundConfig = async () => {
    try {
        const docRef = firestore.collection('app_configs').doc('refund_config');
        const snap = await docRef.get();

        if (!snap.exists) {
            return {
                ...DEFAULT_REFUND_CONFIG,
                promotionCode: CONFIG_FILE_PROMOTION_CODE,
                updatedAt: new Date().toISOString()
            };
        }

        return normalizeRefundConfig(snap.data() || {});
    } catch (error) {
        console.error('[getRefundConfig] Failed to fetch config, using defaults:', error.message);
        return {
            ...DEFAULT_REFUND_CONFIG,
            promotionCode: CONFIG_FILE_PROMOTION_CODE,
            updatedAt: new Date().toISOString()
        };
    }
};

export const REFUND_DEFAULTS = DEFAULT_REFUND_CONFIG;
