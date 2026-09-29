import express from 'express';
import { sendPushMessage } from '../../utils/tossClient.js';
import { logUserAction } from '../../utils/helpers.js';

const router = express.Router();

/**
 * POST /api/v2/messenger/send-message
 * 토스 스마트 발송 (Smart Messenger)
 */
router.post('/send-message', async (req, res) => {
    const { userKey, templateSetCode, context } = req.body;

    if (!userKey || !templateSetCode) {
        return res.status(400).json({ resultType: 'FAIL', error: 'MISSING_PARAMETERS', message: 'userKey and templateSetCode are required.' });
    }

    try {
        console.log(`[Messenger] Sending message to ${userKey} (${templateSetCode})`);

        // --- [Disabled] 사용자 요청에 의해 토스 스마트 발송 및 로그 비활성화 ---
        /*
        await logUserAction(userKey, 'MESSENGER_SEND_ATTEMPT', { templateSetCode });

        // Use standard sendPushMessage utility which handles X-Toss-User-Key header correctly
        const result = await sendPushMessage(userKey, templateSetCode, context || {});

        if (result.success) {
            await logUserAction(userKey, 'MESSENGER_SEND_SUCCESS', { templateSetCode });
            res.json({ resultType: 'SUCCESS', data: result.data });
        } else {
            console.error(`[Messenger] Send failed: ${result.status} - ${result.error}`);
            await logUserAction(userKey, 'MESSENGER_SEND_FAIL', { templateSetCode, error: result.error });
            res.status(result.status || 400).json({ resultType: 'FAIL', error: result.error });
        }
        */

        // 프론트엔드가 에러로 인식하지 않도록 성공(SUCCESS)으로 더미 응답
        return res.json({ resultType: 'SUCCESS', data: { status: 'DISABLED' } });

    } catch (error) {
        console.error('[Messenger] System Error:', error);
        res.status(500).json({ resultType: 'FAIL', error: error.message });
    }
});

export default router;
