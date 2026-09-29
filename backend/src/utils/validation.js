/**
 * User input validation utilities
 */

const FORBIDDEN_WORDS = [
    'admin', '관리자', '운영자', 'toss', '토스', 'gacha', '갓챠', 'system', '시스템',
    'fucker', 'shit', 'bitch', 'asshole', 'cunt', 'dick', 'pussy', 'whore', 'slut',
    'fuck', 'sex', 'penis', 'vagina', 'rape', 'incest', 'nigger', 'faggot', 'retard',
    '시발', '씨발', '개새끼', '병신', '지랄', '좆', '씹', '창녀', '걸레', '니미', '애미', '느금마',
    '보지', '자지', '섹스', '강간', '변태', '야동', '망가', '게이', '레즈', '페미', '한남',
    // Add more as needed
];

/**
 * Validate nickname format and content
 * @param {string} nickname 
 * @returns {object} { isValid: boolean, code: string, message: string }
 */
export const validateNickname = (nickname) => {
    if (!nickname) {
        return { isValid: false, code: 'INVALID_NICKNAME', message: '닉네임을 입력해주세요.' };
    }

    const trimmed = nickname.trim();

    // 1. Length check
    if (trimmed.length < 2 || trimmed.length > 12) {
        return {
            isValid: false,
            code: 'INVALID_NICKNAME',
            message: '닉네임은 2~12자의 한글, 영문, 숫자만 사용할 수 있어요.'
        };
    }

    // 2. Regex check (Korean, English, Number, Space only)
    const regex = /^[a-zA-Z0-9가-힣\s]+$/;
    if (!regex.test(trimmed)) {
        return {
            isValid: false,
            code: 'INVALID_NICKNAME',
            message: '닉네임은 2~12자의 한글, 영문, 숫자만 사용할 수 있어요.'
        };
    }

    // 3. Profanity / Banned words check
    const lower = trimmed.toLowerCase();
    for (const word of FORBIDDEN_WORDS) {
        if (lower.includes(word)) {
            return {
                isValid: false,
                code: 'BANNED_WORD',
                message: '사용할 수 없는 닉네임이 포함되어 있어요.'
            };
        }
    }

    return { isValid: true, trimmedNickname: trimmed };
};

