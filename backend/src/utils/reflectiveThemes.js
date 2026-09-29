
import { firestore } from '../lib/firebaseAdmin.js';

/**
 * 전용 서비스: 우화 성찰형 추천 생성기
 * 상황(Situations) DB를 사용하지 않고, 
 * 페르소나가 사용자에게 직접 건네는 '성찰의 주제'들을 생성합니다.
 */
export const getReflectiveThemes = (userMetadata = {}) => {
    const { nickname = '당신', birthdate = '' } = userMetadata;

    // 나이 계산을 통한 연령대별 테마 최적화
    let age = 30; // 기본값
    if (birthdate) {
        age = new Date().getFullYear() - new Date(birthdate).getFullYear() + 1;
    }

    const baseThemes = [
        { id: 'purpose', title: '삶의 목적', description: '내가 왜 지금 이 길을 걷고 있는지 돌아보는 시간' },
        { id: 'love', title: '사랑의 형태', description: '진정한 사랑이란 무엇일까에 대한 성찰' },
        { id: 'courage', title: '작은 용기', description: '두려움을 마주했을 때 필요한 나만의 무기' },
        { id: 'happiness', title: '오늘의 행복', description: '먼 미래가 아닌, 바로 지금 내 곁의 행복들' },
        { id: 'regret', title: '후회와 미련', description: '떠나보내야 할 것들과 간직해야 할 것들' },
        { id: 'silence', title: '침묵의 가치', description: '말보다 더 깊은 울림을 주는 침묵에 대하여' },
        { id: 'growth', title: '성장의 아픔', description: '흔들리며 피어나는 나 자신을 보듬는 시간' }
    ];

    // 중장년층(40대 이상)을 위한 깊이 있는 주제 추가
    if (age >= 40) {
        baseThemes.push(
            { id: 'legacy', title: '남겨질 것들', description: '내가 세상에 남기고 싶은 향기에 대하여' },
            { id: 'acceptance', title: '비움의 지혜', description: '채우기보다 비우는 것이 더 중요해지는 순간들' },
            { id: 'rest', title: '진정한 쉼', description: '멈춰야만 비로소 보이는 것들에 대한 성찰' }
        );
    } else {
        // 청년층을 위한 도전적 주제 추가
        baseThemes.push(
            { id: 'challenge', title: '새로운 도전', description: '실패가 두려워 망설이고 있는 나에게' },
            { id: 'comparison', title: '나만의 속도', description: '남들과 비교하지 않고 내 보폭으로 걷는 법' },
            { id: 'dream', title: '잊고 있던 꿈', description: '현실 속에 잠시 묻어두었던 설렘에 대하여' }
        );
    }

    // 랜덤하게 5개 추천 (닉네임 포함)
    return baseThemes
        .sort(() => 0.5 - Math.random())
        .slice(0, 5)
        .map(t => ({
            ...t,
            recommendation: `${nickname}님, '${t.title}'에 대해 함께 이야기해볼까요?`
        }));
};
