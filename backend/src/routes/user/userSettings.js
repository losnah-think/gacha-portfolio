import express from 'express';
import { firestore, FieldValue } from '../../lib/firebaseAdmin.js';
import { getUserDocRef } from '../../utils/helpers.js';
import { NOTIFICATION_CONFIG } from '../../config/notificationSettings.js';

const router = express.Router();

/**
 * GET /api/v2/user/settings
 * Retrieve user's notification settings.
 * Returns a Server-Driven list of notification settings.
 */
router.get('/settings', async (req, res) => {
    const { userKey } = req.query;
    if (!userKey) {
        return res.status(400).json({ success: false, error: 'MISSING_USER_KEY' });
    }

    try {
        const userRef = getUserDocRef(userKey);
        const snap = await userRef.get();
        const data = snap.exists ? snap.data() : {};

        // Load settings or defaults
        const settings = data.notificationSettings || {};
        const marketing = data.isMarketingAgreed !== false; // Default true if undefined (legacy)
        const notificationsEnabled = data.notificationsEnabled !== false; // Master toggle, default true

        // Build Server-Driven Notification List
        const notifications = NOTIFICATION_CONFIG.map(item => ({
            ...item,
            enabled: settings[item.key] !== false // Default true if not set
        }));

        res.json({
            success: true,
            data: {
                marketing,
                notificationsEnabled,
                notifications
            }
        });

    } catch (error) {
        console.error('[Settings] Get error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/v2/user/settings
 * Save user's notification settings.
 * Supports the legacy Map format for notifications from the frontend.
 */
router.post('/settings', async (req, res) => {
    const { userKey, marketing, notificationsEnabled, notifications } = req.body;

    if (!userKey || !notifications) {
        return res.status(400).json({ success: false, error: 'INVALID_PAYLOAD' });
    }

    try {
        const userRef = getUserDocRef(userKey);

        // Prepare dynamic notification settings updates
        const notificationSettings = {};
        NOTIFICATION_CONFIG.forEach(item => {
            if (notifications.hasOwnProperty(item.key)) {
                notificationSettings[item.key] = !!notifications[item.key];
            }
        });

        // Prepare updates object
        const updates = {
            updatedAt: FieldValue.serverTimestamp(),
            notificationSettings
        };

        // Update marketing consent if provided
        if (typeof marketing === 'boolean') {
            updates.isMarketingAgreed = marketing;
        }

        // Update master toggle if provided
        if (typeof notificationsEnabled === 'boolean') {
            updates.notificationsEnabled = notificationsEnabled;
        }

        await userRef.set(updates, { merge: true });

        // Build fresh response list
        const updatedResponseNotifications = NOTIFICATION_CONFIG.map(item => ({
            ...item,
            enabled: notificationSettings.hasOwnProperty(item.key)
                ? notificationSettings[item.key]
                : (updates.notificationSettings[item.key] !== false)
        }));

        res.json({
            success: true,
            data: {
                marketing: updates.isMarketingAgreed !== undefined ? updates.isMarketingAgreed : true,
                notificationsEnabled: updates.notificationsEnabled !== undefined ? updates.notificationsEnabled : true,
                notifications: updatedResponseNotifications
            }
        });

    } catch (error) {
        console.error('[Settings] Save error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
