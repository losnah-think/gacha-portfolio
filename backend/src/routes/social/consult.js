import express from 'express';
import { getChatSessions, getChatHistory } from '../../services/chatService.js';

const router = express.Router();

/**
 * GET /api/v2/consult/sessions?userKey=...
 * 대화방 세션 목록 조회 (프론트엔드 대화방 리스트용)
 */
router.get('/sessions', async (req, res) => {
    const userKey = req.query.userKey || req.query.userkey;

    if (!userKey) {
        return res.status(400).json({
            resultType: 'FAIL',
            error: { code: 'MISSING_USER_KEY', message: 'userKey는 필수입니다.' }
        });
    }

    try {
        const sessions = await getChatSessions(userKey);

        return res.json({
            resultType: 'SUCCESS',
            data: {
                sessions,
                total: sessions.length
            }
        });
    } catch (error) {
        console.error('[Consult/Sessions] Error:', error);
        return res.status(500).json({
            resultType: 'FAIL',
            error: { code: 'SERVER_ERROR', message: error.message }
        });
    }
});

/**
 * GET /api/v2/consult/sessions/:sessionId?userKey=...
 * 대화방 세션 상세 조회 (메시지 목록 포함)
 */
router.get('/sessions/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    const userKey = req.query.userKey || req.query.userkey;

    if (!userKey) {
        return res.status(400).json({
            resultType: 'FAIL',
            error: { code: 'MISSING_USER_KEY', message: 'userKey는 필수입니다.' }
        });
    }

    if (!sessionId) {
        return res.status(400).json({
            resultType: 'FAIL',
            error: { code: 'MISSING_SESSION_ID', message: 'sessionId는 필수입니다.' }
        });
    }

    try {
        const result = await getChatHistory(userKey, sessionId);

        return res.json({
            resultType: 'SUCCESS',
            data: result
        });
    } catch (error) {
        if (error.message === 'CHAT_NOT_FOUND') {
            return res.status(404).json({
                resultType: 'FAIL',
                error: { code: 'NOT_FOUND', message: '세션을 찾을 수 없습니다.' }
            });
        }
        if (error.message === 'UNAUTHORIZED') {
            return res.status(403).json({
                resultType: 'FAIL',
                error: { code: 'UNAUTHORIZED', message: '접근 권한이 없습니다.' }
            });
        }
        console.error('[Consult/Sessions/:id] Error:', error);
        return res.status(500).json({
            resultType: 'FAIL',
            error: { code: 'SERVER_ERROR', message: error.message }
        });
    }
});

export default router;
