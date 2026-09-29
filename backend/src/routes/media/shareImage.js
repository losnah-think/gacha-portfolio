import express from 'express';
import { firestore } from '../../lib/firebaseAdmin.js';
import { resolveImageUrl } from '../../utils/imageUrl.js';


const router = express.Router();

// Firebase Storage에서 배경 이미지 URL
const BACKGROUND_URL_RAW = 'https://example.invalid/v0/b/example-project.firebasestorage.app/o/share%2Fnano_banana_bg.png?alt=media';
const BACKGROUND_URL = resolveImageUrl(BACKGROUND_URL_RAW);

/**
 * GET /background
 * 공유용 배경 이미지 URL 제공
 */
router.get('/background', (req, res) => {
    res.json({
        resultType: 'SUCCESS',
        backgroundUrl: BACKGROUND_URL
    });
});

/**
 * POST /prepare
 * 공유용 데이터 준비 (클라이언트에서 이미지 생성용)
 */
router.post('/prepare', async (req, res) => {
    try {
        const { contentId, userKey } = req.body;

        if (!contentId) {
            return res.status(400).json({ resultType: 'FAIL', error: 'MISSING_CONTENT_ID' });
        }

        // Firestore에서 콘텐츠 가져오기
        let content = null;

        // contents 컬렉션에서 먼저 찾기
        const contentDoc = await firestore.collection('contents').doc(contentId).get();
        if (contentDoc.exists) {
            content = { id: contentDoc.id, ...contentDoc.data() };
        } else {
            // fables 컬렉션에서 찾기
            const fableDoc = await firestore.collection('fables').doc(contentId).get();
            if (fableDoc.exists) {
                content = { id: fableDoc.id, ...fableDoc.data(), type: 'fable' };
            }
        }

        if (!content) {
            return res.status(404).json({ resultType: 'FAIL', error: 'CONTENT_NOT_FOUND' });
        }

        // 공유용 데이터 구성
        const shareData = {
            backgroundUrl: BACKGROUND_URL,
            personaName: content.personaName || content.personaId?.replace(/_/g, ' ') || '조언가',
            title: content.title || '오늘의 조언',
            content: content.content || '',
            type: content.type || 'advice',
            watermark: '가차 - AI 조언 서비스'
        };

        res.json({
            resultType: 'SUCCESS',
            data: shareData
        });

    } catch (error) {
        console.error('Share data preparation failed:', error);
        res.status(500).json({ resultType: 'FAIL', error: 'PREPARATION_FAILED' });
    }
});

export default router;
