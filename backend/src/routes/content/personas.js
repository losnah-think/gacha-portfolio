import express from 'express';
import { firestore } from '../../lib/firebaseAdmin.js';
import { resolveImageUrl, getPersonaImagePath } from '../../utils/imageUrl.js';
import { isPersonaMissingImage } from '../../utils/personaVisibility.js';

const router = express.Router();

/**
 * [V3] Get all personas (for Gacha/Pull tab)
 * GET /api/v3/personas
 */
router.get('/', async (req, res) => {
    try {
        const snapshot = await firestore.collection('personas').get();
        const personas = [];

        snapshot.forEach(doc => {
            const data = doc.data();
            // Only include active personas
            if (data.isActive === false) return;
            if (isPersonaMissingImage({ id: doc.id, ...data })) return;

            const v3Group = data.v3Group || data.category || 'general';

            // [V3] Category Logic Mapping: Ensure all personas fall into 4 primary tabs
            let category = data.v3Group || data.category || 'general';

            // Forced mapping based on ID or Keywords
            if (doc.id.includes('lotto') || (data.name || '').includes('로또') || (data.name || '').includes('추첨기') || doc.id.includes('pachinko') || doc.id.includes('lucky7') || doc.id.includes('gachabot')) {
                category = 'lotto';
            } else if (doc.id.includes('lucy') || doc.id.includes('cupid') || doc.id.includes('love')) {
                category = 'love';
            } else if (doc.id.includes('fortune') || doc.id.includes('shaman') || doc.id.includes('tarot') || category === 'mystic') {
                category = 'fortune';
            } else {
                // Default everything else to 'advice' if it doesn't match above,
                // including 'family', 'animal', 'seasonal', 'situation', 'career', 'healing', 'general'
                category = 'advice';
            }

            // Filter by group if provided (Fortune group shows both fortune and advice themes)
            const requestedGroup = req.query.group;
            if (requestedGroup) {
                if (requestedGroup === 'fortune') {
                    if (category !== 'fortune' && category !== 'advice') return;
                } else {
                    if (category !== requestedGroup) return;
                }
            }

            personas.push({
                id: doc.id,
                name: data.name || doc.id.replace(/_/g, ' '),
                icon: resolveImageUrl(data.imageUrl || getPersonaImagePath(doc.id)),
                imageUrl: resolveImageUrl(data.imageUrl || getPersonaImagePath(doc.id)), // [V3] Add explicit imageUrl
                desc: data.description || '',
                category: category,
                v3Group: category, // Using calculated category as v3Group for consistency
                priority: data.priority || 0,
                isRecommended: data.isRecommended || false,
                isNew: data.isNew || false
            });
        });

        // Sort by priority (higher first)
        personas.sort((a, b) => b.priority - a.priority);

        // Specific personas requested by the user to be "recommended"
        const RECOMMEND_IDS = ['socrates', 'nano_banana', 'grandmother', 'grandfather', 'healing_단골_카페_사장님', 'king_sejong', 'yi_sun_shin', 'gandhi', 'einstein'];
        const checkIsRecommended = (p) => {
            // Check by ID or if it's a "wisdom/historical" figure in advice category
            return RECOMMEND_IDS.includes(p.id) || (p.category === 'advice' && p.priority >= 100);
        };

        // Group by category
        const grouped = {};
        personas.forEach(p => {
            const cat = p.category || 'general';
            if (!grouped[cat]) grouped[cat] = [];
            const isRec = checkIsRecommended(p);
            grouped[cat].push({ ...p, isRecommended: isRec });
        });

        res.status(200).json({
            resultType: 'SUCCESS',
            data: personas.map(p => ({ ...p, isRecommended: checkIsRecommended(p) })),
            grouped: grouped
        });
    } catch (error) {
        console.error('[Personas] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
