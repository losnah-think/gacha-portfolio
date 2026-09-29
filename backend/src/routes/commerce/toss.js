import express from 'express';
import fetch from 'node-fetch';
import { resolveTossUrl, getHttpsAgent, forwardToToss } from '../../utils/tossClient.js';
import { decryptTossUserInfo } from '../../utils/tossCrypto.js';
import { requireCredentials, logUserAction, safeNickname } from '../../utils/helpers.js';
import { claimUserPromotionInternal } from '../../services/promotionService.js';
import { applyPaidTickets } from '../../services/userService.js';

const router = express.Router();

/**
 * POST /token
 */
router.post('/token', async (req, res) => {
    const { authorizationCode, referrer } = req.body || {};
    if (!authorizationCode) return res.status(400).json({ error: 'MISSING_AUTH_CODE' });

    try {
        const clientId = process.env.TOSS_CLIENT_ID || process.env.CLIENT_ID;
        const clientSecret = process.env.TOSS_CLIENT_SECRET || process.env.CLIENT_SECRET;
        const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

        const response = await fetch(resolveTossUrl('/api-partner/v1/apps-in-toss/user/oauth2/generate-token'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${credentials}`
            },
            body: JSON.stringify({
                authorizationCode,
                referrer
            }),
            agent: getHttpsAgent()
        });

        // [Log] 유입 경로 추적을 위한 로그 추가
        if (referrer) {
            console.log(`[Toss Auth] Token request with referrer: ${referrer}`);
        }
        const text = await response.text();
        res.status(response.status).send(text);
    } catch (error) {
        res.status(500).json({ resultType: 'FAIL', error: `NETWORK_ERROR ${String(error)}` });
    }
});

/**
 * GET /userinfo
 * 토스 사용자 정보 조회 (로그인 세션 확인)
 */
const getUserInfo = async (req, res) => {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ resultType: 'FAIL', error: 'UNAUTHORIZED' });
    }

    try {
        const response = await fetch(resolveTossUrl('/api-partner/v1/apps-in-toss/user/oauth2/login-me'), {
            method: 'GET',
            headers: { 'Authorization': authHeader },
            agent: getHttpsAgent()
        });
        const text = await response.text();

        // JSON 응답인 경우 nickname 복호화
        if (response.status === 200) {
            try {
                const data = JSON.parse(text);
                if (data && typeof data === 'object') {
                    // nickname 복호화 (userKey가 없으므로 DB 갱신 없음)
                    if (data.nickname) {
                        data.nickname = await safeNickname(data.nickname);
                    }
                    // data.name도 복호화 (Toss API에서 name도 암호화될 수 있음)
                    if (data.name) {
                        data.name = await safeNickname(data.name);
                    }
                    res.status(response.status).json(data);
                } else {
                    res.status(response.status).send(text);
                }
            } catch (parseErr) {
                // JSON 파싱 실패 시 원본 반환
                res.status(response.status).send(text);
            }
        } else {
            res.status(response.status).send(text);
        }
    } catch (error) {
        console.error('UserInfo fetch failed:', error);
        res.status(500).json({ resultType: 'FAIL', error: 'INFO_FETCH_FAILED' });
    }
};

router.get('/userinfo', getUserInfo);
router.get('/login-me', getUserInfo); // Alias for compatibility

/**
 * POST /revoke
 * 토스 연동 해제 (약관 철회)
 */
router.post('/revoke', async (req, res) => {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ resultType: 'FAIL', error: 'UNAUTHORIZED' });

    try {
        const response = await fetch(resolveTossUrl('/api-partner/v1/apps-in-toss/user/oauth2/access/remove-by-access-token'), {
            method: 'POST',
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
            },
            agent: getHttpsAgent()
        });
        const text = await response.text();
        res.status(response.status).send(text);
    } catch (error) {
        res.status(500).json({ resultType: 'FAIL', error: 'REVOKE_FAILED' });
    }
});

/**
 * POST /api/v2/toss/decrypt
 * 토스 암호화 필드 복호화 API
 */
router.post('/decrypt', async (req, res) => {
    const { encryptedData } = req.body || {};

    if (!encryptedData) {
        return res.status(400).json({ resultType: 'FAIL', error: 'MISSING_ENCRYPTED_DATA' });
    }

    try {
        // [Security] Masking in logs
        const maskedInput = encryptedData.substring(0, 10) + '...';
        console.log(`[TossDecrypt] Attempting to decrypt: ${maskedInput}`);

        const decrypted = await decryptTossUserInfo(encryptedData);

        if (!decrypted) throw new Error('DECRYPT_FAILED');

        const maskedOutput = decrypted.length > 2 ? decrypted.substring(0, 1) + '*'.repeat(decrypted.length - 1) : '**';
        console.log(`[TossDecrypt] Success: ${maskedOutput}`);

        res.json({
            resultType: 'SUCCESS',
            data: {
                decryptedData: decrypted
            }
        });
    } catch (error) {
        console.error('[TossDecrypt] Error:', error.message);
        res.status(400).json({ resultType: 'FAIL', error: 'DECRYPT_FAILED' });
    }
});

/**
 * POST /promotion/claim
 */
router.post('/promotion/claim', async (req, res) => {
    const { userKey, promotionCode } = req.body;
    if (!userKey || !promotionCode) return res.status(400).json({ resultType: 'FAIL', error: 'MISSING_PARAMS' });

    try {
        const result = await claimUserPromotionInternal(userKey, promotionCode);
        res.json({ resultType: 'SUCCESS', data: result });
    } catch (error) {
        const errMsg = error.message;
        const status = errMsg === 'ALREADY_CLAIMED'
            ? 409
            : (errMsg === 'BUDGET_EXHAUSTED'
                ? 410
                : (errMsg === 'PROMOTION_PROVIDER_UNAVAILABLE' ? 503 : 400));
        res.status(status).json({ resultType: 'FAIL', error: errMsg });
    }
});

/**
 * POST /purchase/create or /create
 */
router.post(['/create', '/purchase/create'], async (req, res) => {
    if (!requireCredentials(res)) return;
    const { productId, userKey, quantity = 1 } = req.body || {};
    if (!productId || !userKey) return res.status(400).json({ resultType: 'FAIL', error: 'MISSING_PARAMS' });

    try {
        // [마케팅 로깅] 구매 시도 기록
        await logUserAction(userKey, 'PURCHASE_INTENT', { productId, quantity });

        const tossRes = await forwardToToss({
            url: resolveTossUrl('/api-partner/v1/apps-in-toss/purchase/create'),
            payload: { productId, userKey: String(userKey), quantity: Number(quantity) }
        });
        res.status(tossRes.status).send(tossRes.text);
    } catch (error) {
        console.error('[Purchase Create] Error:', error);
        res.status(500).json({ resultType: 'FAIL', error: 'PURCHASE_CREATE_FAILED' });
    }
});

/**
 * POST /purchase/verify or /verify
 */
router.post(['/verify', '/purchase/verify'], async (req, res) => {
    if (!requireCredentials(res)) return;
    const { purchaseId, userKey, productId, quantity } = req.body || {};

    if (!purchaseId || !userKey) {
        return res.status(400).json({ resultType: 'FAIL', error: 'MISSING_PARAMS', message: 'purchaseId and userKey are required' });
    }

    try {
        // ── 0. 중복 결제 방지: 이미 지급된 purchaseId인지 확인 ──
        const { firestore: db } = await import('../../lib/firebaseAdmin.js');
        const existingPurchase = await db.collection('purchases').doc(purchaseId).get();
        if (existingPurchase.exists && existingPurchase.data()?.status === 'GRANTED') {
            console.log(`[Purchase Verify] Duplicate verify for purchaseId=${purchaseId}, user=${userKey}. Already granted.`);
            const { getTicketBalance, getUserDocRef } = await import('../../utils/helpers.js');
            const userSnap = await getUserDocRef(userKey).get();
            const tickets = getTicketBalance(userSnap.data() || {});
            return res.status(200).json({
                resultType: 'SUCCESS',
                message: 'ALREADY_GRANTED',
                tickets,
                ticketsGranted: true,
                data: { tickets, ticketsGranted: true }
            });
        }

        const tossRes = await forwardToToss({
            url: resolveTossUrl('/api-partner/v1/apps-in-toss/purchase/verify'),
            payload: { purchaseId, userKey: String(userKey) }
        });

        // [DEBUG] Toss 응답 원본 캡처
        console.log(`[Purchase Verify] Toss raw response status=${tossRes.status}, body=`, JSON.stringify(tossRes.json).substring(0, 500));

        // [Fix] Toss Apps Purchase API 다양한 응답 포맷 대응
        const purchaseData = tossRes.json?.success || tossRes.json?.data || {};
        const isVerified = tossRes.status === 200
            || tossRes.json?.resultType === 'SUCCESS'
            || (purchaseData && purchaseData.purchaseId);

        if (isVerified) {
            const finalProductId = productId || purchaseData.productId || 'unknown';
            const finalQuantity = Number(quantity || purchaseData.quantity || 1) || 1;

            console.log(`[Purchase Verify] Success for user ${userKey}, product: ${finalProductId}, qty: ${finalQuantity}, purchaseId: ${purchaseId}`);

            // ── 1. 결제 성공 시 티켓 지급 (가장 중요! 반드시 먼저 실행) ──
            let ticketsGranted = false;
            let currentTickets = 0;
            try {
                await applyPaidTickets({ userKey, productId: finalProductId, quantity: finalQuantity });
                ticketsGranted = true;
                console.log(`[Purchase Verify] Tickets granted for user ${userKey}`);
            } catch (ticketErr) {
                console.error(`[Purchase Verify] CRITICAL: applyPaidTickets failed for user ${userKey}:`, ticketErr);
            }

            // ── 2. 결제 기록 저장 (purchases 컬렉션) ──
            try {
                const { firestore: fs } = await import('../../lib/firebaseAdmin.js');
                const { FieldValue: FV } = await import('firebase-admin/firestore');

                // [Config] 상품 ID별 가격 매핑 (billing_records 통계용)
                const PRODUCT_PRICE_MAP = {
                    'example-product-1': 990,
                    'example-product-2': 1980,
                    'example-product-4': 3300,
                    'example-product-3': 660,
                    // 알 수 없는 상품명인 경우 기본값 처리
                    'ticket_5_set': 990,
                    'ticket_10_set': 1980,
                    'ticket_20_set': 3300
                };
                const finalPrice = (PRODUCT_PRICE_MAP[finalProductId] || 0) * finalQuantity;

                // 2-1. 상세 결제 로그 (purchases)
                await fs.collection('purchases').doc(purchaseId || `pu_${Date.now()}`).set({
                    userKey: String(userKey),
                    purchaseId: purchaseId || null,
                    productId: finalProductId,
                    quantity: finalQuantity,
                    amount: finalPrice,
                    orderId: purchaseId || null,
                    status: ticketsGranted ? 'GRANTED' : 'GRANT_FAILED',
                    tossStatus: tossRes.status,
                    tossResponse: JSON.stringify(tossRes.json || {}).substring(0, 1000),
                    grantedAt: FV.serverTimestamp()
                }, { merge: true });

                // 2-2. 통계용 매출 기록 (billing_records) - 성공 시에만
                if (ticketsGranted && finalPrice > 0) {
                    await fs.collection('billing_records').add({
                        userKey: String(userKey),
                        purchaseId: purchaseId || `billing_${Date.now()}`,
                        productId: finalProductId,
                        amount: finalPrice,
                        type: 'IN_APP_PURCHASE',
                        status: 'SUCCESS',
                        date: FV.serverTimestamp(),
                        createdAt: FV.serverTimestamp()
                    });
                    console.log(`[Purchase Verify] Billing record saved: ${finalPrice} KRW`);
                }
            } catch (saveErr) {
                console.error(`[Purchase Verify] purchases/billing save failed:`, saveErr);
            }

            // ── 3. 마케팅 로깅 ──
            try {
                await logUserAction(userKey, ticketsGranted ? 'PURCHASE_SUCCESS' : 'PURCHASE_GRANT_FAILED', {
                    purchaseId: purchaseId || 'none',
                    productId: finalProductId,
                    quantity: finalQuantity
                });
            } catch (logErr) {
                console.error(`[Purchase Verify] logUserAction failed:`, logErr);
            }

            // ── 4. 갱신된 총 티켓 수 반환 ──
            try {
                const { getTicketBalance, getUserDocRef } = await import('../../utils/helpers.js');
                const userSnap = await getUserDocRef(userKey).get();
                currentTickets = getTicketBalance(userSnap.data() || {});
            } catch (balanceErr) {
                console.error(`[Purchase Verify] getTicketBalance failed:`, balanceErr);
            }

            // Toss 응답 객체 보정 (프론트엔드 동기화용)
            tossRes.json = {
                ...tossRes.json,
                resultType: 'SUCCESS',
                tickets: currentTickets,
                ticketsGranted,
                data: { ...(tossRes.json?.data || {}), tickets: currentTickets, ticketsGranted }
            };
            tossRes.text = JSON.stringify(tossRes.json);
            tossRes.status = 200; // 티켓 지급 성공 시 반드시 200 반환
        } else {
            console.warn(`[Purchase Verify] Failed or unverified for user ${userKey}. Status: ${tossRes.status}, body:`, JSON.stringify(tossRes.json).substring(0, 500));
        }

        res.status(tossRes.status).send(tossRes.text);
    } catch (error) {
        console.error('[Purchase Verify] Error:', error);
        res.status(500).json({ resultType: 'FAIL', error: 'PURCHASE_VERIFY_FAILED' });
    }
});

/**
 * POST /disconnect
 * 토스 서비스 연결 해제 콜백 (Webhook)
 */
router.post('/disconnect', async (req, res) => {
    const { userKey } = req.body || {};

    // Basic Auth 검증 (필요시)
    // const authHeader = req.headers.authorization;

    if (!userKey) {
        return res.status(400).json({ resultType: 'FAIL', error: 'MISSING_USER_KEY' });
    }

    try {
        console.log(`[Toss Callback] Disconnect user: ${userKey}`);

        // 1. 유저 상태 변경 또는 로그 기록
        await logUserAction(String(userKey), 'TOSS_DISCONNECT_CALLBACK', {
            timestamp: new Date().toISOString()
        });

        // 2. 필요 시 유저 데이터 비활성화
        // await db.collection('users').doc(String(userKey)).update({ isActive: false });

        res.json({ resultType: 'SUCCESS' });
    } catch (error) {
        console.error('Disconnect callback failed:', error);
        res.status(500).json({ resultType: 'FAIL', error: 'CALLBACK_FAILED' });
    }
});

export default router;
