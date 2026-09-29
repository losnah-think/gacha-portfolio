import express from 'express';
import { firestore } from '../../lib/firebaseAdmin.js';
import { resolveImageUrl } from '../../utils/imageUrl.js';

const router = express.Router();

// V1에서 보이지 말아야 할 페르소나들
const HIDDEN_IN_V1 = new Set([
    'nano_banana',
    'fortune_타로_점술가',
    'fantasy_장난꾸러기_악마',
    'fantasy_하얀_날개의_천사',
    'dog',
    'gandhi',
    'family_우리_아빠',
    'healing_단골_카페_사장님'
]);

/**
 * GET /api/discover/personas (V1)
 */
router.get('/personas', async (req, res) => {
    try {
        const snapshot = await firestore.collection('personas').get();
        const items = [];
        snapshot.forEach(doc => {
            if (HIDDEN_IN_V1.has(doc.id)) return; // V1 필터링

            const data = doc.data();
            if (data.isActive !== false) {
                const item = { id: doc.id, ...data };
                item.imageUrl = resolveImageUrl(item.imageUrl);
                items.push(item);
            }
        });

        items.sort((a, b) => (b.priority || 0) - (a.priority || 0));

        res.json({
            resultType: 'SUCCESS',
            data: items
        });
    } catch (error) {
        res.status(500).json({ resultType: 'FAIL', error: 'DB_ERROR' });
    }
});

/**
 * GET /api/discover/situations (V1)
 */
router.get('/situations', async (req, res) => {
    try {
        const snapshot = await firestore.collection('situations').get();
        let items = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.isActive !== false) {
                items.push({ id: doc.id, ...data });
            }
        });
        items.sort((a, b) => (b.priority || 0) - (a.priority || 0));
        res.json({ resultType: 'SUCCESS', data: items });
    } catch (error) {
        res.status(500).json({ resultType: 'FAIL', error: 'DB_ERROR' });
    }
});

export default router;
