
import express from 'express';
import fetch from 'node-fetch';
import { firestore, FieldValue } from '../../lib/firebaseAdmin.js';
import { getHttpsAgent, resolveTossUrl } from '../../utils/tossClient.js';
import { decryptTossUserInfo } from '../../utils/tossCrypto.js';
import { generateRandomNickname } from '../../utils/nicknameGenerator.js';
import { safeNickname } from '../../utils/helpers.js';

const router = express.Router();

/**
 * POST /api/v2/auth/login
 * Handle Toss Login: Exchange Auth Code -> Access Token -> Decrypt User Info -> Sync DB
 */
router.post('/login', async (req, res) => {
    try {
        const { authorizationCode, referrer } = req.body;

        if (!authorizationCode) {
            return res.status(400).json({ resultType: 'FAIL', error: 'MISSING_AUTH_CODE' });
        }

        // 1. Exchange Auth Code for Access Token
        // URL as per docs/develop (5).md
        const tokenUrl = resolveTossUrl('/api-partner/v1/apps-in-toss/user/oauth2/generate-token');
        const tokenPayload = {
            authorizationCode,
            referrer: referrer || 'DEFAULT'
        };

        const clientId = process.env.TOSS_CLIENT_ID || process.env.CLIENT_ID;
        const clientSecret = process.env.TOSS_CLIENT_SECRET || process.env.CLIENT_SECRET;
        const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

        console.log('[Auth] Exchanging token for code:', authorizationCode);

        const tokenRes = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${credentials}`
            },
            body: JSON.stringify(tokenPayload),
            agent: getHttpsAgent()
        });

        const tokenJson = await tokenRes.json();

        if (tokenJson.resultType !== 'SUCCESS') {
            console.error('[Auth] Token Exchange Failed:', tokenJson);
            return res.status(400).json({ resultType: 'FAIL', error: 'TOKEN_EXCHANGE_FAILED', details: tokenJson.error });
        }

        const { accessToken, scope } = tokenJson.success;

        // 2. Fetch User Info (Encrypted)
        // URL as per docs/develop (5).md
        const userInfoUrl = resolveTossUrl('/api-partner/v1/apps-in-toss/user/oauth2/login-me');

        const userRes = await fetch(userInfoUrl, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${accessToken}` },
            agent: getHttpsAgent()
        });

        const userJson = await userRes.json();

        if (userJson.resultType !== 'SUCCESS') {
            console.error('[Auth] User Info Fetch Failed:', userJson);
            return res.status(400).json({ resultType: 'FAIL', error: 'USER_INFO_FAILED', details: userJson.error });
        }

        const rawUserData = userJson.success;
        const userKey = String(rawUserData.userKey);

        // 3. Decrypt Sensitive Fields
        const decryptFields = async (data) => {
            const result = { ...data };
            const fieldsToDecrypt = ['name', 'phone', 'birthday', 'gender', 'nationality', 'ci', 'email'];

            for (const field of fieldsToDecrypt) {
                if (data[field] && typeof data[field] === 'string' && data[field] !== 'null') {
                    try {
                        result[field] = await decryptTossUserInfo(data[field]);
                    } catch (e) {
                        console.warn(`[Auth] Failed to decrypt field ${field}:`, e.message);
                        // Keep original or null if decryption fails
                    }
                }
            }
            return result;
        };

        const decryptedUser = await decryptFields(rawUserData);

        // 4. Update/Create User in Firestore
        const userRef = firestore.collection('users').doc(userKey);
        const userSnap = await userRef.get();

        const updateData = {
            lastLoginAt: FieldValue.serverTimestamp(),
            // Update sensitive info
            ...(decryptedUser.name && { name: decryptedUser.name }),
            ...(decryptedUser.phone && { phone: decryptedUser.phone }),
            ...(decryptedUser.birthday && { birthday: decryptedUser.birthday }),
            ...(decryptedUser.gender && { gender: decryptedUser.gender }),
            ...(decryptedUser.nationality && { nationality: decryptedUser.nationality }),
            ...(referrer && { referrer })
        };

        if (!userSnap.exists) {
            // New User
            updateData.createdAt = FieldValue.serverTimestamp();
            updateData.nickname = generateRandomNickname();
            updateData.tickets = 5; // Welcome bonus
            updateData.ticketsTotal = 5;
            updateData.points = 0;
            console.log(`[Auth] Creating new user: ${userKey} (${updateData.nickname})`);
        } else {
            console.log(`[Auth] Logging in existing user: ${userKey}`);
        }

        await userRef.set(updateData, { merge: true });

        // 5. Response
        const resolvedNickname = await safeNickname(
            userSnap.data()?.nickname || updateData.nickname, userKey
        );
        res.json({
            resultType: 'SUCCESS',
            data: {
                userKey,
                name: decryptedUser.name || userSnap.data()?.name || 'User',
                nickname: resolvedNickname,
                scope: scope,
                accessToken // Optional according to request, helpful for client
            }
        });

    } catch (error) {
        console.error('[Auth] Login Error:', error);
        res.status(500).json({ resultType: 'FAIL', error: 'INTERNAL_SERVER_ERROR', message: error.message });
    }
});

/**
 * POST /toss/revoke
 * Manually revoke Toss Login connection
 */
router.post('/revoke', async (req, res) => {
    try {
        let accessToken = req.body.accessToken;

        // Try Authorization header if not in body
        if (!accessToken && req.headers.authorization) {
            const parts = req.headers.authorization.split(' ');
            if (parts.length === 2 && parts[0] === 'Bearer') {
                accessToken = parts[1];
            }
        }

        if (!accessToken) {
            return res.status(400).json({ resultType: 'FAIL', error: 'MISSING_ACCESS_TOKEN' });
        }

        const revokeUrl = resolveTossUrl('/api-partner/v1/apps-in-toss/user/oauth2/access/remove-by-access-token');

        const revokeRes = await fetch(revokeUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            agent: getHttpsAgent()
        });

        const revokeJson = await revokeRes.json();

        if (revokeJson.resultType === 'SUCCESS') {
            res.json({ resultType: 'SUCCESS' });
        } else {
            res.status(400).json({ resultType: 'FAIL', error: 'REVOKE_FAILED', details: revokeJson.error });
        }

    } catch (error) {
        console.error('[Auth] Revoke Error:', error);
        res.status(500).json({ resultType: 'FAIL', error: 'INTERNAL_SERVER_ERROR' });
    }
});

export default router;
