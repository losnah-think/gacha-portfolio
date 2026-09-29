import express from 'express';
import { logUserAction } from '../../utils/helpers.js';

const router = express.Router();

// [Config] Removed hardcoded list in favor of DB
// const PRODUCTS = [
// ];

/**
 * GET /api/v3/shop/products
 * 상점 아이템 리스트 조회 (DB 연동)
 */
router.get('/products', async (req, res) => {
    const { userKey } = req.query;

    // Log intent if userKey provided
    if (userKey) {
        await logUserAction(userKey, 'SHOP_LIST_VIEW', { timestamp: new Date().toISOString() });
    }

    try {
        const { firestore } = await import('../../lib/firebaseAdmin.js');
        const snapshot = await firestore.collection('products')
            .where('isActive', '==', true)
            .get();

        const products = [];
        snapshot.forEach(doc => {
            products.push(doc.data());
        });

        // In-memory sorting to avoid composite index requirement
        products.sort((a, b) => (b.priority || 0) - (a.priority || 0));

        res.status(200).json({
            resultType: 'SUCCESS',
            data: products
        });
    } catch (error) {
        console.error('[Shop] Failed to fetch products:', error);
        res.status(500).json({ resultType: 'FAIL', error: 'PRODUCT_FETCH_FAILED' });
    }
});

export default router;
