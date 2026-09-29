import type { Persona } from '../types';

export const PERSONAS: Persona[] = [
    // 인물 (People)
    { id: 'socrates', name: "소크라테스", icon: "socrates.png", desc: "고대 그리스의 철학자예요. 끊임없이 질문하며 '너 자신을 알라'은 가르침을 전해줄게요", category: "philosopher", priority: 100, isRecommended: true },
    { id: 'einstein', name: "알베르트 아인슈타인", icon: "einstein.png", desc: "상대성 이론을 만든 천재 물리학자예요. 지혜로운 조언을 들려줄게요", category: "scientist", priority: 98 },
    { id: 'king_sejong', name: "세종대왕", icon: "king_sejong.png", desc: "한글을 만든 조선의 성군이에요. 백성을 사랑하는 마음으로 조언해줄게요", category: "leader", priority: 99 },
    { id: 'marilyn_monroe', name: "마릴린 먼로", icon: "marilyn_monroe.png", desc: "20세기 대중문화를 상징하는 아이콘이에요. 당당한 매력과 함께 이야기해줄게요", category: "celebrity", priority: 90 },
    { id: 'steve_jobs', name: "스티브 잡스", icon: "steve_jobs.png", desc: "혁신과 디자인의 선구자예요. 세상을 바꾸는 영감을 전해줄게요", category: "entrepreneur", priority: 97 },
    { id: 'yi_sun_shin', name: "이순신", icon: "yi_sun_shin.png", desc: "임진웨란을 승리로 이끈 조선의 명장이에요. 굳건한 용기의 말을 전해줄게요", category: "leader", priority: 99 },
    { id: 'shakespeare', name: "윌리엄 셰익스피어", icon: "writer.png", desc: "세계 최고의 극작가예요. 한 편의 시 같은 조언을 들려줄게요", category: "writer", priority: 94 },
    { id: 'gandhi', name: "마하트마 간디", icon: "writer.png", desc: "비폭력 운동의 지도자예요. 평화로운 마음을 가질 수 있게 도와줄게요", category: "activist", priority: 93 },

    // 동물 (Animals)
    { id: 'cat', name: "길고양이", icon: "cat.png", desc: "도도하고 까칠하지만 츄르 앞에서는 아주 얌전해져요", category: "animal", priority: 95 },
    { id: 'dog', name: "충직한 진돗개", icon: "dog.png", desc: "주인님만 바라봐요. 꼬리를 살랑살랑 흔들며 반겨줄게요", category: "animal", priority: 94 },

    // 스페셜/판타지
    { id: 'nano_banana', name: "나노 바나나", icon: "banana.png", desc: "나노 단위로 쪼개진 바나나예요. 작지만 달콤한 조언을 드릴게요", category: "food", priority: 110, isNew: true, isRecommended: true },
    { id: 'family_우리_아빠', name: "우리 아빠", icon: "dad.png", desc: "무뚝뚝하지만 누구보다 당신을 생각하는 아빠의 마음으로 조언해줄게요", category: "situation", priority: 90 },
    { id: 'fantasy_하얀_날개의_천사', name: "하얀 날개의 천사", icon: "angel.png", desc: "당신의 곁을 지키는 수호천사예요. 맑고 깨끗한 조언을 들려줄게요", category: "fantasy", priority: 95 },
    { id: 'fantasy_장난꾸러기_악마', name: "장난꾸러기 악마", icon: "devil.png", desc: "조금은 짓궂지만 날카로운 진실을 꿰뚫어보는 조언을 해줄게요", category: "fantasy", priority: 95 },
    { id: 'healing_단골_카페_사장님', name: "단골 카페 사장님", icon: "cafe.png", desc: "따뜻한 커피 한 잔과 함께 편안한 이야기를 나눠보아요", category: "situation", priority: 93 },
    { id: 'fortune_타로_점술가', name: "타로 점술가", icon: "fortune_teller.png", desc: "카드가 보여주는 미래와 운명의 조언을 들어보세요", category: "fantasy", priority: 96 },
    { id: 'shaman_무속인', name: "무속인", icon: "shaman.png", desc: "영험한 기운으로 당신의 앞날을 내다보고 액운을 막아줄게요", category: "fantasy", priority: 94 },
    { id: 'pastor_목사님', name: "목사님", icon: "pastor.png", desc: "따뜻한 사랑과 믿음의 말로 당신의 마음을 위로해줄게요", category: "leader", priority: 92 },
    { id: 'priest_신부님', name: "신부님", icon: "priest.png", desc: "평온한 마음으로 당신의 고민을 들어주고 기도로 함께할게요", category: "leader", priority: 92 },
    { id: 'monk_스님', name: "스님", icon: "monk.png", desc: "자비로운 마음과 지혜로 삶의 번뇌를 씻어줄 조언을 전할게요", category: "leader", priority: 92 },
    { id: 'lotto_로또번호_추첨기', name: "로또번호 추첨기", icon: "lotto.png", desc: "오늘 당신에게 행운을 가져다줄 번호를 쏙쏙 뽑아드릴게요!", category: "object", priority: 115, isNew: true, isRecommended: true },

    // 기타 상황극
    { id: 'situation_잔소리꾼_엄마', name: "잔소리꾼 엄마", icon: "nagging_mom.png", desc: "밥은 먹었니? 방 좀 치우렴!", category: "situation", priority: 94 },
    { id: 'taxi', name: "수다쟁이 택시기사", icon: "chatty_taxi_driver.png", desc: "정치 얘기는 끝이 없죠, 허허", category: "situation", priority: 86 }
];
