import type { Persona } from '../types';

import { getStorageUrl } from './storage';
import { AppImage } from '../components/ui/AppImage';

export const PERSONA_IMAGE_MAP: Record<string, string> = {
    // Basic & Verified (ID matching)
    'socrates': 'images/personas/socrates.png',
    'einstein': 'images/personas/einstein.png',
    'king_sejong': 'images/personas/king_sejong.png',
    'marilyn_monroe': 'images/personas/marilyn_monroe.png',
    'steve_jobs': 'images/personas/steve_jobs.png',
    'yi_sun_shin': 'images/personas/yi_sun_shin.png',
    'shakespeare': 'images/personas/shakespeare.png',
    '간디': 'images/personas/gandhi.png',
    '고양이': 'images/personas/cat.png',
    '강아지': 'images/personas/dog.png',
    '나노바나나': 'images/personas/nano_banana.png',
    '외계인': 'images/personas/alien.png',
    '치킨': 'images/personas/chicken.png',
    '스마트폰': 'images/personas/smartphone.png',
    '미래로봇': 'images/personas/future_robot.png',
    'cat': 'images/personas/cat.png',

    // Firestore 페르소나 id/이름 변형 (공백 포함 이름은 언더스코어 키와 매칭되지 않음)
    'mystic_fortune_teller': 'images/personas/fortune_teller.png',
    '타로 점술가': 'images/personas/fortune_teller.png',
    'mystic_shaman': 'images/personas/shaman.png',
    '영험한 무속인': 'images/personas/shaman.png',
    'religious_monk': 'images/personas/monk.png',
    '지혜로운 스님': 'images/personas/monk.png',
    'religious_pastor': 'images/personas/pastor.png',
    '따뜻한 목사님': 'images/personas/pastor.png',
    'religious_priest': 'images/personas/priest.png',
    '자애로운 신부님': 'images/personas/priest.png',
    'love_expert': 'images/personas/v3_lucy.png',
    '연애 상담사 루시': 'images/personas/v3_lucy.png',

    // New V2 & Descriptive IDs
    '하얀_날개의_천사': 'images/personas/angel.png',
    '장난꾸러기_악마': 'images/personas/devil.png',
    '단골_카페_사장님': 'images/personas/cafe_owner.png',
    '타로_점술가': 'images/personas/fortune_teller.png',
    '무속인': 'images/personas/shaman.png',
    '목사님': 'images/personas/pastor.png',
    '신부님': 'images/personas/priest.png',
    '스님': 'images/personas/monk.png',
    '로또번호_추첨기': 'images/personas/lotto.png',
    '잔소리꾼_엄마': 'images/personas/nagging_mom.png',
    '택시기사': 'images/personas/chatty_taxi_driver.png',
    '프리드리히_니체': 'images/personas/nietzsche.png',
    '레오_톨스토이': 'images/personas/leotolstoy.png',
    '프란츠_카프카': 'images/personas/franzkafka.png',
    '제인_오스틴': 'images/personas/janeausten.png',
    '마크_트웨인': 'images/personas/marktwain.png',
    '생텍쥐페리': 'images/personas/saintexupery.png',
    '에밀리_디킨슨': 'images/personas/emilydickinson.png',
    '오스카_와일드': 'images/personas/oscarwilde.png',
    '요한_볼프강_폰_괴테': 'images/personas/goethe.png',
    '셜록_홈즈': 'images/personas/sherlockholmes.png',
    '우리_아빠': 'images/personas/dad_manager.png',

    // Additional Aliases for better matching
    '나노 바나나': 'images/personas/nano_banana.png',
    '바나나': 'images/personas/nano_banana.png',
    '길고양이': 'images/personas/cat.png',
    '진돗개': 'images/personas/dog.png',
    '택시 기사': 'images/personas/chatty_taxi_driver.png',
    '엄마': 'images/personas/nagging_mom.png',
    '로봇': 'images/personas/future_robot.png',
    '천사': 'images/personas/angel.png',
    '악마': 'images/personas/devil.png',
    'seollal_moon': 'images/personas/seollal_moon.png',
    '설날_보름달': 'images/personas/seollal_moon.png',
    '설날 보름달': 'images/personas/seollal_moon.png',
    '카페 사장님': 'images/personas/cafe_owner.png',
    '아빠': 'images/personas/dad_manager.png',
    '니체': 'images/personas/nietzsche.png',
    '프리드리히 니체': 'images/personas/nietzsche.png',
    '셰익스피어': 'images/personas/writer.png',
    '홈즈': 'images/personas/sherlockholmes.png',
    '셜록 홈즈': 'images/personas/sherlockholmes.png',
    '로또 추첨기': 'images/personas/lotto.png',
    '로또번호 추첨기': 'images/personas/lotto.png',
    'lotto_로또번호_추첨기': 'images/personas/lotto.png',

    // New counseling personas
    'dream_interpreter': 'images/personas/dream_interpreter.png',
    '꿈 해몽사 몽선생': 'images/personas/dream_interpreter.png',
    '몽선생': 'images/personas/dream_interpreter.png',
    'tarot_master': 'images/personas/tarot_master.png',
    '타로 마스터 아르카나': 'images/personas/tarot_master.png',
    '아르카나': 'images/personas/tarot_master.png',
    'finance_advisor': 'images/personas/finance_advisor.png',
    '재테크 멘토 머니킹': 'images/personas/finance_advisor.png',
    '머니킹': 'images/personas/finance_advisor.png',
    'parenting_coach': 'images/personas/parenting_coach.png',
    '육아 멘토 아이사랑': 'images/personas/parenting_coach.png',
    '아이사랑': 'images/personas/parenting_coach.png',
    'interview_coach': 'images/personas/interview_coach.png',
    '면접관 코치 합격신': 'images/personas/interview_coach.png',
    '합격신': 'images/personas/interview_coach.png',

    // Existing counseling personas
    'v3_lucy': 'images/personas/v3_lucy.png',
    '연애상담사 루시': 'images/personas/v3_lucy.png',
    '루시': 'images/personas/v3_lucy.png',
    'v3_cupid': 'images/personas/v3_cupid.png',
    '사랑의 요정 큐피트': 'images/personas/v3_cupid.png',
    '큐피트': 'images/personas/v3_cupid.png',

    // Legacy seed personas
    'grandson': 'images/personas/grandson.png',
    '손자': 'images/personas/grandson.png',
    'granddaughter': 'images/personas/granddaughter.png',
    '손녀': 'images/personas/granddaughter.png',
    'mother_teresa': 'images/personas/mother_teresa.png',
    '마더 테레사': 'images/personas/mother_teresa.png',
    'mercury': 'images/personas/mercury.png',
    '프레디 머큐리': 'images/personas/mercury.png',
    'michael_jackson': 'images/personas/michael_jackson.png',
    '마이클 잭슨': 'images/personas/michael_jackson.png',
    'bruce_lee': 'images/personas/bruce_lee.png',
    '브루스 리': 'images/personas/bruce_lee.png',
    '이소룡': 'images/personas/bruce_lee.png',
    'chanel': 'images/personas/chanel.png',
    '코코 샤넬': 'images/personas/chanel.png',
    'disney': 'images/personas/disney.png',
    '월트 디즈니': 'images/personas/disney.png',
    'lennon': 'images/personas/lennon.png',
    '존 레논': 'images/personas/lennon.png',
    'panda': 'images/personas/panda.png',
    '게으른 판다': 'images/personas/panda.png',
    'parrot': 'images/personas/parrot.png',
    '수다쟁이 앵무새': 'images/personas/parrot.png',
    'owl': 'images/personas/owl.png',
    '지혜로운 부엉이': 'images/personas/owl.png',
    'sparrow': 'images/personas/sparrow.png',
    '동네 참새': 'images/personas/sparrow.png',
    'stone': 'images/personas/stone.png',
    '말하는 돌멩이': 'images/personas/stone.png',
    'tv': 'images/personas/tv.png',
    '오래된 텔레비전': 'images/personas/tv.png',
    'box': 'images/personas/box.png',
    '텅 빈 박스': 'images/personas/box.png',
    'wind': 'images/personas/wind.png',
    '쌀쌀한 바람': 'images/personas/wind.png',
    'mirror': 'images/personas/mirror.png',
    '진실의 거울': 'images/personas/mirror.png',
    'cactus': 'images/personas/cactus.png',
    '까칠한 선인장': 'images/personas/cactus.png',
    'fridge': 'images/personas/fridge.png',
    '투덜이 냉장고': 'images/personas/fridge.png',
    'teddy': 'images/personas/teddy.png',
    '낡은 곰인형': 'images/personas/teddy.png',
    'ai_speaker': 'images/personas/ai_speaker.png',
    'AI 스피커': 'images/personas/ai_speaker.png',
    'error': 'images/personas/error.png',
    '컴퓨터 에러창': 'images/personas/error.png',
    'ghost': 'images/personas/ghost.png',
    '꼬마 유령': 'images/personas/ghost.png',
    'monster': 'images/personas/monster.png',
    '한강의 괴물': 'images/personas/monster.png',
    'genie': 'images/personas/genie.png',
    '램프의 요정 지니': 'images/personas/genie.png',
    'spirit': 'images/personas/spirit.png',
    '숲의 정령': 'images/personas/spirit.png',
    'dracula': 'images/personas/dracula.png',
    '드라큘라': 'images/personas/dracula.png',
    'boss': 'images/personas/boss.png',
    '화난 직장 상사': 'images/personas/boss.png'
};

// 이미지 로딩 실패 시 표시할 기본 에모지 맵
const PERSONA_EMOJI_FALLBACK: Record<string, string> = {
    // People
    'socrates': '🏛️', '소크라테스': '🏛️',
    'einstein': '🧠', '아인슈타인': '🧠',
    'king_sejong': '👑', 'sejong': '👑', '세종대왕': '👑',
    'marilyn_monroe': '💋', 'monroe': '💋', '먼로': '💋',
    'steve_jobs': '🍎', 'jobs': '🍎', '잡스': '🍎',
    'yi_sun_shin': '⚔️', '이순신': '⚔️',
    'shakespeare': '✍️', '셰익스피어': '✍️',
    'gandhi': '🕊️', '간디': '🕊️',
    'nietzsche': '🌿', '니체': '🌿',

    // Animals
    'cat': '🐱', '고양이': '🐱',
    'dog': '🐶', '강아지': '🐶', '진돗개': '🐶',

    // Fantasy/Special
    'nano_banana': '🍌', 'banana': '🍌', '바나나': '🍌',
    'angel': '😇', '천사': '😇',
    'devil': '😈', '악마': '😈',
    'alien': '👽', '외계인': '👽',
    'future_robot': '🤖', 'robot': '🤖', '로봇': '🤖',
    'fortune_teller': '🔮', '점술가': '🔮', '타로': '🔮',
    'tarot': '🔮',
    'shaman': '⛩️', '무속인': '⛩️',
    'pastor': '⛪', '목사님': '⛪',
    'priest': '✝️', '신부님': '✝️',
    'monk': '🧘', '스님': '🧘',
    'lotto': '🎰', '로또': '🎰',
    'seollal_moon': '🌕', '설날_보름달': '🌕', '보름달': '🌕',

    // Situations
    'nagging_mom': '👩', 'mom': '👩', '엄마': '�',
    'dad_manager': '👨', 'dad': '👨', '아빠': '👨',
    'taxi': '�', '택시기사': '🚕',
    'cafe_owner': '☕', 'cafe': '☕', '카페': '☕',
    'chicken': '🍗', '치킨': '🍗',
    'smartphone': '📱', '스마트폰': '📱',

    // Counseling personas
    'dream_interpreter': '🔮', '몽선생': '🔮', '해몽': '🔮',
    'tarot_master': '🃏', '아르카나': '🃏',
    'finance_advisor': '💰', '머니킹': '💰',
    'parenting_coach': '👶', '아이사랑': '👶',
    'interview_coach': '🎯', '합격신': '🎯',
    'v3_lucy': '💕', '루시': '💕',
    'v3_cupid': '💘', '큐피트': '💘',
};

import { useState } from 'react';

const PersonaIcon = ({ personaName, personas }: { personaName: string; personas: Persona[] }) => {
    const [hasError, setHasError] = useState(false);

    const persona = personas.find(p =>
        p.name === personaName ||
        p.id === personaName ||
        (p.id.includes('_') && p.id.split('_').pop() === personaName)
    );

    const getFallbackEmoji = () => {
        const id = persona?.id?.toLowerCase() || '';
        const name = personaName.toLowerCase();

        // 1. Try to match by ID
        const matchById = Object.entries(PERSONA_EMOJI_FALLBACK).find(([key]) => id.includes(key.toLowerCase()));
        if (matchById) return matchById[1];

        // 2. Try to match by Name
        const matchByName = Object.entries(PERSONA_EMOJI_FALLBACK).find(([key]) => name.includes(key.toLowerCase()));
        if (matchByName) return matchByName[1];

        return '✨';
    };

    if (hasError) {
        return <span className="text-3xl animate-fade-in">{getFallbackEmoji()}</span>;
    }

    // 1. 이미 페르소나 객체의 imageUrl 필드가 있는 경우 (백엔드 API 연동 시)
    if (persona?.imageUrl) {
        return <AppImage src={getStorageUrl(persona.imageUrl)} width={112} className="w-full h-full object-contain" alt={personaName} onError={() => setHasError(true)} />;
    }

    // 2. 통합 이미지 맵(PERSONA_IMAGE_MAP)에서 먼저 찾기 (ID 또는 정확한 이름 매칭)
    const mappedPath = PERSONA_IMAGE_MAP[personaName] || (persona?.id ? PERSONA_IMAGE_MAP[persona.id] : null);
    if (mappedPath) {
        return <AppImage src={getStorageUrl(mappedPath)} width={112} className="w-full h-full object-contain" alt={personaName} onError={() => setHasError(true)} />;
    }

    // 3. 페르소나 객체의 icon 필드에 이미지 파일명이 있는 경우 (하위 호환성)
    if (persona?.icon && (persona.icon.endsWith('.png') || persona.icon.endsWith('.jpg') || persona.icon.endsWith('.svg'))) {
        const iconPath = persona.icon.includes('/') ? persona.icon : `images/personas/${persona.icon}`;
        return <AppImage src={getStorageUrl(iconPath)} width={112} className="w-full h-full object-contain" alt={personaName} onError={() => setHasError(true)} />;
    }

    if (persona) {
        const category = persona.category?.toLowerCase();
        if (category === 'digital') return <AppImage src={getStorageUrl('images/personas/digital.png')} width={112} className="w-full h-full object-contain" alt={category} onError={() => setHasError(true)} />;
        if (category === 'writer') return <AppImage src={getStorageUrl('images/personas/writer.png')} width={112} className="w-full h-full object-contain" alt={category} onError={() => setHasError(true)} />;
        if (category === 'philosopher') return <AppImage src={getStorageUrl('images/personas/socrates.png')} width={112} className="w-full h-full object-contain opacity-50 grayscale" alt={category} onError={() => setHasError(true)} />;
        if (category === 'musician') return <AppImage src={getStorageUrl('images/personas/musician.png')} width={112} className="w-full h-full object-contain" alt={category} onError={() => setHasError(true)} />;
        if (category === 'leader') return <AppImage src={getStorageUrl('images/personas/king_sejong.png')} width={112} className="w-full h-full object-contain opacity-50 grayscale" alt={category} onError={() => setHasError(true)} />;
        if (category === 'celebrity') return <AppImage src={getStorageUrl('images/ui/star-premium.png')} width={112} className="w-full h-full object-contain scale-125" alt={category} onError={() => setHasError(true)} />;
        if (category === 'object') return <AppImage src={getStorageUrl('images/ui/box-premium.png')} width={112} className="w-full h-full object-contain scale-110" alt={category} onError={() => setHasError(true)} />;
        return persona.icon ? <span className="text-3xl">{persona.icon}</span> : <span className="text-3xl">✨</span>;
    }

    return <span className="text-3xl">{getFallbackEmoji()}</span>;
};

export const getPersonaIcon = (personaName: string, personas: Persona[]) => {
    return <PersonaIcon personaName={personaName} personas={personas} />;
};
