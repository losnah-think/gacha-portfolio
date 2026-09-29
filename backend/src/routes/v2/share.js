import express from 'express';
import { firestore } from '../../lib/firebaseAdmin.js';
import { PERSONA_NAME_MAP } from '../../utils/imageUrl.js';

const router = express.Router();

/**
 * POST /generate-image
 * [DEPRECATED] Now simply returns metadata for frontend-side rendering.
 */
router.post('/generate-image', async (req, res) => {
    try {
        const { resultId, personaName, content, grade, score } = req.body;
        let imageData = { resultId, personaName, content, grade, score };

        if (resultId && (!content || !personaName)) {
            const doc = await firestore.collection('contents').doc(resultId).get();
            if (doc.exists) {
                const data = doc.data();
                imageData = {
                    ...imageData,
                    personaName: personaName || PERSONA_NAME_MAP[data.personaId] || data.personaName || '조언가',
                    content: content || data.content || data.quote || '',
                    grade: grade || data.grade || 'GOLD',
                    score: score || data.score || 80
                };
            }
        }

        res.json({
            resultType: 'SUCCESS',
            message: 'Backend rendering is disabled. Please render on client-side.',
            data: imageData
        });

    } catch (error) {
        console.error('Image data prep failed:', error);
        res.status(500).json({ resultType: 'FAIL', error: 'PREPARATION_FAILED' });
    }
});

/**
 * GET /preview/:id
 * Simplified preview page that relies on client-side rendering for image.
 */
router.get('/preview/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const doc = await firestore.collection('contents').doc(id).get();

        if (!doc.exists) {
            return res.status(404).send('Content not found');
        }

        const data = doc.data();
        const personaName = PERSONA_NAME_MAP[data.personaId] || data.personaName || '조언가';
        const quote = data.content || data.quote || '오늘의 조언을 확인하세요.';

        // Note: No more server-generated imageUrl here. 
        // Real-world implementation would use a generic OG image or the persona's image.
        const ogImageUrl = data.imageUrl ? `https://example.invalid/${data.imageUrl}` : '';

        const html = `
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${personaName}의 조언 - 가차</title>
    <meta property="og:title" content="${personaName}의 조언">
    <meta property="og:description" content="${quote}">
    <meta property="og:image" content="${ogImageUrl}">
    <style>
        body { background: #0f0f0f; color: #efefef; font-family: sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; text-align: center; }
        .container { max-width: 400px; width: 100%; }
        .card { background: #1a1a1a; padding: 40px; border-radius: 24px; margin-bottom: 30px; border: 1px solid #333; }
        .quote { font-size: 20px; font-style: italic; line-height: 1.6; margin: 20px 0; }
        .btn { display: block; padding: 16px; background: #8A2BE2; color: white; border-radius: 12px; font-weight: bold; text-decoration: none; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="card">
            <h2 style="color: #8A2BE2;">${personaName}</h2>
            <p class="quote">"${quote}"</p>
            <p style="color: #888;">점수: ${data.score || 0}점</p>
        </div>
        <a href="https://example.invalid/?step=result&id=${id}" class="btn">가차 앱에서 자세히 보기</a>
        <p style="margin-top: 20px; font-size: 13px; color: #666;">* 이미지 저장은 가차 앱 내 기능을 이용해 주세요.</p>
    </div>
</body>
</html>
        `;

        res.set('Content-Type', 'text/html');
        res.send(html);

    } catch (error) {
        console.error('Preview page failed:', error);
        res.status(500).send('Error loading preview');
    }
});

/**
 * GET /download/:id
 * [REMOVED] Backend rendering is disabled.
 */
router.get('/download/:id', async (req, res) => {
    res.status(410).json({
        resultType: 'FAIL',
        error: 'DEPRECATED',
        message: 'Server-side image generation is no longer supported. Please use client-side rendering.'
    });
});

export default router;
