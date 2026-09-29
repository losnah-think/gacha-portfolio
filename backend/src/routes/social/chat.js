import express from 'express';
import {
    startChatSession,
    processChatTurn,
    getChatHistory,
    getSuggestedQuestions,
    getChatPersonas,
    getChatSessions
} from '../../services/chatService.js';
import { AD_CONFIG } from '../../config/adConfig.js';

const router = express.Router();

/**
 * [V3] Get all chat personas
 * GET /api/v3/chat/personas
 * Query: ?group=lotto&grouped=true
 * - grouped=true → 카테고리별 그룹화된 응답
 */
router.get('/personas', async (req, res) => {
    try {
        const { group, grouped } = req.query;
        const personas = await getChatPersonas(group);

        if (grouped === 'true') {
            // 카테고리별 그룹화
            const categories = {};
            for (const persona of personas) {
                const cat = persona.category || 'general';
                if (!categories[cat]) {
                    categories[cat] = {
                        category: cat,
                        label: getCategoryLabel(cat),
                        personas: []
                    };
                }
                categories[cat].personas.push(persona);
            }

            return res.status(200).json({
                resultType: 'SUCCESS',
                data: Object.values(categories)
            });
        }

        res.status(200).json({
            resultType: 'SUCCESS',
            data: personas
        });
    } catch (error) {
        console.error('[Chat/Personas] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Helper: 카테고리 라벨 매핑
 */
function getCategoryLabel(category) {
    const labels = {
        'general': '기본 캐릭터',
        'counseling': '전문 상담',
        'fortune': '운세/점술',
        'entertainment': '엔터테인먼트',
        'family': '가족',
        'situation': '일상 캐릭터',
        'money': '재물/복권',
        'lotto': '행운의 뽑기',
        'philosopher': '위인/철학',
        'leader': '리더/위인',
        'mystic': '점술/신비',
        'animal': '동물 친구',
        'food': '음식/캐릭터',
        'entrepreneur': '기업인'
    };
    return labels[category] || category;
}

/**
 * [V3] Get User Chat Sessions (Archive)
 * GET /api/v3/chat?userKey=...
 */
router.get('/', async (req, res) => {
    try {
        const { userKey } = req.query;
        if (!userKey) {
            return res.status(400).json({ error: 'Missing userKey' });
        }

        const sessions = await getChatSessions(userKey);
        res.status(200).json({
            resultType: 'SUCCESS',
            data: sessions
        });
    } catch (error) {
        console.error('[Chat/Sessions] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * [V3] Start a new Chat Session
 * POST /api/v3/chat/start
 * Body: { userKey, personaId, requestId }
 */
router.post('/start', async (req, res) => {
    try {
        const { userKey, personaId, requestId, group } = req.body;
        if (!userKey || !personaId) {
            return res.status(400).json({ error: 'Missing userKey or personaId' });
        }

        const sessionInfo = await startChatSession(userKey, personaId, { requestId, group });

        res.status(200).json({
            resultType: 'SUCCESS',
            ...sessionInfo,
            message: `${sessionInfo.persona.name}와의 대화가 시작되었습니다. 무엇을 도와드릴까요?`,
            adConfig: { ...AD_CONFIG, INTERSTITIAL: { ...AD_CONFIG.INTERSTITIAL, active: false } }
        });
    } catch (error) {
        console.error('[Chat/Start] Error:', error);

        if (error.code === 'INSUFFICIENT_TICKETS' || error.message === 'INSUFFICIENT_TICKETS') {
            return res.status(402).json({
                error: 'INSUFFICIENT_TICKETS',
                message: '채팅을 시작할 티켓이 부족합니다.'
            });
        }

        res.status(500).json({ error: error.message });
    }
});

/**
 * [V3] Send Message and Get AI Response
 * POST /api/v3/chat/message
 * Body: { userKey, chatId, message, requestId }
 */
router.post('/message', async (req, res) => {
    try {
        const { userKey, chatId, message, requestId } = req.body;
        console.log(`[Chat/Message] Request: user=${userKey}, chat=${chatId}, msg="${message}"`);
        if (!userKey || !chatId || !message) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const result = await processChatTurn(userKey, chatId, message, { requestId });

        res.status(200).json({
            resultType: 'SUCCESS',
            ...result,
            message: result.aiMessage.text, // Explicitly map to top-level message field
            adConfig: { ...AD_CONFIG, INTERSTITIAL: { ...AD_CONFIG.INTERSTITIAL, active: false } }
        });

    } catch (error) {
        console.error('[Chat/Message] Error:', error);

        if (error.code === 'INSUFFICIENT_TICKETS' || error.message === 'INSUFFICIENT_TICKETS') {
            return res.status(402).json({
                error: 'INSUFFICIENT_TICKETS',
                message: '티켓이 부족합니다.'
            });
        }

        res.status(500).json({ error: error.message });
    }
});

/**
 * [V3] Get suggested questions for a persona
 * GET /api/v3/chat/suggested-questions?personaId=...
 * NOTE: Must be BEFORE /:chatId to avoid route collision
 */
router.get('/suggested-questions', async (req, res) => {
    try {
        const { personaId } = req.query;

        if (!personaId) {
            return res.status(400).json({ error: 'Missing personaId' });
        }

        const result = await getSuggestedQuestions(personaId);

        res.status(200).json({
            resultType: 'SUCCESS',
            data: result
        });

    } catch (error) {
        console.error('[Chat/Questions] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * [V3] Get Chat History
 * GET /api/v3/chat/:chatId?userKey=...
 */
router.get('/:chatId', async (req, res) => {
    try {
        const { chatId } = req.params;
        const { userKey } = req.query;

        if (!userKey) {
            return res.status(400).json({ error: 'Missing userKey' });
        }

        const result = await getChatHistory(userKey, chatId);

        res.status(200).json({
            resultType: 'SUCCESS',
            ...result
        });

    } catch (error) {
        console.error('[Chat/History] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
