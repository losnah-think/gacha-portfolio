/**
 * [Ladder] 사다리타기 게임 서비스
 *
 * 프론트 계약(src/features/reward/components/LadderClimbingPage.tsx, HEAD a325916):
 *  - POST /api/v2/ladder/play, body { userKey } (티켓 소모 없음, 무료)
 *  - 하루 3회 제한 → 초과 시 error.code 'DAILY_LIMIT_EXCEEDED'
 *  - 가중치 상품(총 1000): 10P(10) / 5P(50) / 3P(140) / 2P(300) / 1P(500)
 *  - rarity: 10P=legendary, 5P=epic, 3P=rare, 2P·1P=common
 *  - 응답 data: { points, prizeLabel, rarity, playsToday, playsLimit, newPointsTotal }
 *    (프론트는 clamp 10 적용 — REWARD_POINT_LIMITS.ladder=10)
 */
import { firestore, FieldValue } from '../lib/firebaseAdmin.js';
import { getKstDateKey, getUserDocRef } from '../utils/helpers.js';

export const LADDER_DAILY_LIMIT = 3;

// 프론트 CLIENT_PRIZES와 동일한 가중치 테이블
const PRIZES = [
    { points: 10, label: '10P', rarity: 'legendary', weight: 10 },
    { points: 5,  label: '5P',  rarity: 'epic',      weight: 50 },
    { points: 3,  label: '3P',  rarity: 'rare',      weight: 140 },
    { points: 2,  label: '2P',  rarity: 'common',    weight: 300 },
    { points: 1,  label: '1P',  rarity: 'common',    weight: 500 },
];
const TOTAL_WEIGHT = PRIZES.reduce((sum, p) => sum + p.weight, 0);

const pickPrize = () => {
    let r = Math.random() * TOTAL_WEIGHT;
    for (const prize of PRIZES) {
        if (r < prize.weight) return prize;
        r -= prize.weight;
    }
    return PRIZES[PRIZES.length - 1];
};

/**
 * 사다리 1회 플레이 (일 3회 제한, 서버 권위 포인트 적립)
 * @returns {{points, prizeLabel, rarity, playsToday, playsLimit, newPointsTotal}}
 * @throws Error(code='DAILY_LIMIT_EXCEEDED') 일일 한도 초과 시
 */
export const playLadder = async (userKey) => {
    const userRef = getUserDocRef(userKey);
    const todayKey = getKstDateKey();

    return await firestore.runTransaction(async (tx) => {
        const snap = await tx.get(userRef);
        const data = snap.exists ? snap.data() : {};

        // 일일 플레이 카운트 (KST 날짜 기준 리셋)
        const playsToday = data.ladderPlaysDate === todayKey ? (data.ladderPlaysCount || 0) : 0;
        if (playsToday >= LADDER_DAILY_LIMIT) {
            const err = new Error('DAILY_LIMIT_EXCEEDED');
            err.code = 'DAILY_LIMIT_EXCEEDED';
            throw err;
        }

        const prize = pickPrize();
        const currentPoints = data.points || 0;
        const newPointsTotal = currentPoints + prize.points;
        const newPlays = playsToday + 1;

        tx.set(userRef, {
            points: newPointsTotal,
            ladderPlaysDate: todayKey,
            ladderPlaysCount: newPlays,
            ladderPointsTotal: (data.ladderPointsTotal || 0) + prize.points,
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });

        return {
            points: prize.points,
            prizeLabel: prize.label,
            rarity: prize.rarity,
            playsToday: newPlays,
            playsLimit: LADDER_DAILY_LIMIT,
            // 적립 후 절대 잔액. 프론트는 이 값을 onPointsSync(절대)로 반영하고
            // 이중가산 방지를 위해 onWin(증분)은 생략한다. (LadderClimbingPage 수정 동반)
            newPointsTotal,
        };
    });
};
