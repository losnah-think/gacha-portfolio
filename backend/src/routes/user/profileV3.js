
import express from 'express';
import { updateUserNickname } from '../../services/userService.js';

const router = express.Router();

/**
 * POST /api/v3/profile/nickname
 * 유저 닉네임 변경 API
 */
router.post('/nickname', async (req, res) => {
    const { userKey, nickname } = req.body || {};

    if (!userKey || !nickname) {
        return res.status(400).json({
            resultType: 'FAIL',
            error: {
                code: 'INVALID_PARAMS',
                message: 'userKey와 nickname은 필수입니다.'
            }
        });
    }

    try {
        const result = await updateUserNickname(userKey, nickname);

        return res.status(200).json({
            resultType: 'SUCCESS',
            data: {
                userKey: result.userKey,
                nickname: result.nickname,
                updatedAt: result.updatedAt
            }
        });
    } catch (error) {
        // Validation Errors (INVALID_NICKNAME, BANNED_WORD)
        if (error.code === 'INVALID_NICKNAME' || error.code === 'BANNED_WORD') {
            return res.status(400).json({
                resultType: 'FAIL',
                error: {
                    code: error.code,
                    message: error.message
                }
            });
        }

        // Potential User Not Found from Service
        if (error.message === 'USER_NOT_FOUND') {
            return res.status(404).json({
                resultType: 'FAIL',
                error: {
                    code: 'USER_NOT_FOUND',
                    message: '사용자를 찾을 수 없습니다.'
                }
            });
        }

        // Server Error
        console.error('[Nickname API V3 Error]', error);
        return res.status(500).json({
            resultType: 'FAIL',
            error: {
                code: 'SERVER_ERROR',
                message: '잠시 후 다시 시도해 주세요.'
            }
        });
    }
});

export default router;
