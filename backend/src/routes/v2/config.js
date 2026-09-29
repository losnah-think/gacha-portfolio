/**
 * GET /api/v2/config
 * 앱 구성 정보 동적 제공 API
 *
 * 프론트엔드 하드코딩 항목을 서버 설정으로 관리:
 *   - 광고 ID (fullscreen / reward / banner)
 *   - 프로모션 코드
 *   - Feature flags
 *
 * Cache: 5분 SWR — 광고 ID가 변경되어도 5분 내 전파됨
 */
import express from 'express';
import { PROMOTION_CONFIG } from '../../config/promotion.js';

const router = express.Router();

// 광고 ID 상수는 환경 변수로도 덮어쓸 수 있도록 설계
const AD_CONFIG = {
    // 전면형 광고
    fullscreenAdId: process.env.AD_FULLSCREEN_ID || 'example-ad-unit-5',
    // 리워드 광고 — 복권용 광고 지면과 분리
    rewardAdId: process.env.AD_REWARD_ID || 'example-ad-unit-6',
    rewardAdEnabled: true,
    // 배너 광고 (전용 adGroupId — Toss 콘솔에서 발급 후 env AD_BANNER_GROUP_ID로 교체 권장)
    bannerAdGroupId: process.env.AD_BANNER_GROUP_ID || 'example-ad-unit-5',
    bannerTextAdGroupId: process.env.AD_BANNER_TEXT_GROUP_ID || 'example-ad-unit-5',
    bannerEnabled: true,
    bannerRefreshInterval: 30000, // 30초 배너 갱신
};

router.get('/', (req, res) => {
    // 5분 SWR: 클라이언트는 5분 캐시, stale 동안 revalidate 허용
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');

    res.json({
        resultType: 'SUCCESS',
        data: {
            ads: AD_CONFIG,
            promotions: {
                // 포인트 → 프로모션 코드 전환 시 사용할 코드
                refundCode: PROMOTION_CONFIG.REFUND_PROMOTION_CODE || null,
                // 코드 유형 식별: 프론트에서 키워드 텍스트 매칭 대신 이 type 값 사용
                refundType: 'POINT_CONVERSION',
            },
            // 점진적 기능 활성화 플래그
            features: {
                bootstrapEnabled: true,        // /api/v2/bootstrap 사용 가능
                unifiedRewardEnabled: true,    // /api/v2/user/reward 통합 엔드포인트 사용 권장
                gradeAliasNormalized: true,    // LEGEND=PLATINUM, HERO=GOLD 정규화 적용
            },
        },
    });
});

export default router;
