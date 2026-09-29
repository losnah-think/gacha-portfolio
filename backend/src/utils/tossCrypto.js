
import crypto from 'crypto';

/**
 * Decrypts Toss user data using AES-256-GCM
 * Based on official Toss documentation (AES-256-GCM, 12-byte IV prefix, AAD support)
 * @param {string} encryptedText - Base64 encoded encrypted string (contains IV + ciphertext + tag)
 * @returns {string|null} Decrypted string
 */
export const decryptTossUserInfo = async (encryptedText) => {
    try {
        const base64Key = process.env.TOSS_DECRYPTION_KEY || process.env.TOSS_ENCRYPTION_KEY; // Base64 encoded AES key
        const aad = process.env.TOSS_DECRYPTION_AAD || process.env.TOSS_ENCRYPTION_AAD || 'TOSS'; // AAD

        if (!base64Key) {
            console.error('[TossCrypto] Missing TOSS_ENCRYPTION_KEY');
            return null;
        }

        const decoded = Buffer.from(encryptedText, 'base64');
        const key = Buffer.from(base64Key, 'base64');

        const IV_LENGTH = 12;
        const TAG_LENGTH = 16;

        // 1. Extract IV (first 12 bytes)
        const iv = decoded.subarray(0, IV_LENGTH);

        // 2. Extract Ciphertext and Tag
        // The tag is at the end (last 16 bytes)
        const ciphertextWithTag = decoded.subarray(IV_LENGTH);
        const ciphertext = ciphertextWithTag.subarray(0, ciphertextWithTag.length - TAG_LENGTH);
        const tag = ciphertextWithTag.subarray(ciphertextWithTag.length - TAG_LENGTH);

        // 3. Create Decipher
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);

        decipher.setAuthTag(tag);
        decipher.setAAD(Buffer.from(aad));

        // 4. Decrypt
        const decrypted = Buffer.concat([
            decipher.update(ciphertext),
            decipher.final()
        ]);

        return decrypted.toString('utf8');

    } catch (error) {
        console.error('[TossCrypto] Decryption failed:', error);
        throw new Error('DECRYPTION_FAILED');
    }
};
