export const ADJECTIVES = [
    '기분좋은', '활기찬', '열정적인', '침착한', '긍정적인', '행복한', '씩씩한', '따뜻한',
    '용감한', '즐거운', '날쌘', '느긋한', '똑똑한', '귀여운', '튼튼한', '말랑한',
    '신비한', '상냥한', '화려한', '수줍은', '포근한', '촉촉한', '바쁜', '여유로운'
];

export const NOUNS = [
    '모험가', '여행자', '탐험가', '도전자', '행운아', '주인공', '리더', '메이커',
    '치타', '나무늘보', '사자', '돌고래', '독수리', '쿼카', '고양이', '강아지',
    '호랑이', '토끼', '다람쥐', '거북이', '판다', '펭귄', '부엉이', '해달',
    '알파카', '수달', '햄스터', '고슴도치', '물개', '비버'
];

/**
 * Generate a random nickname (Adjective + Noun + 4 Random Digits)
 * Example: "기분좋은쿼카1234"
 */
export const generateRandomNickname = () => {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    const number = Math.floor(Math.random() * 9000) + 1000; // 1000 ~ 9999
    return `${adj}${noun}${number}`;
};
