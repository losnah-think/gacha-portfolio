import type { Situation } from '../types';

export const DEFAULT_SITUATIONS: Situation[] = [
  { id: 'sit_1', title: "진로와 적성이 고민될 때", icon: "", priority: 1, recommendation: "새로운 시작이 필요한가요?" },
  { id: 'sit_2', title: "인간관계로 지치고 힘들 때", icon: "", priority: 2, recommendation: "마음의 평화가 필요한가요?" },
  { id: 'sit_3', title: "자존감이 낮아져 위로가 필요할 때", icon: "", priority: 3, recommendation: "당신은 충분히 빛나고 있어요" },
  { id: 'sit_4', title: "중요한 결정을 앞두고 망설여질 때", icon: "", priority: 4, recommendation: "확신이 필요한 순간인가요?" },
  { id: 'sit_5', title: "번아웃이 와서 모든 걸 내려놓고 싶을 때", icon: "", priority: 5, recommendation: "잠시 쉬어가도 괜찮아요" },
];

export const RECOMMENDED_SITUATIONS: Situation[] = [
  { id: 'rec_1', title: "오늘 하루 운세가 궁금할 때", icon: "", recommendation: "오늘 나에게 필요한 한마디는?" },
  { id: 'rec_2', title: "갑자기 우울한 기분이 들 때", icon: "", recommendation: "기분을 바꿔줄 따뜻한 조언" },
  { id: 'rec_3', title: "누군가에게 화가 나서 참기 힘들 때", icon: "", recommendation: "마음을 다스리는 지혜로운 방법" },
  { id: 'rec_4', title: "오늘 로또 번호가 궁금할 때", icon: "🎰", recommendation: "일주일의 행복, 행운의 번호" },
];

export const AGE_SPECIFIC_SITUATIONS: Record<number, Situation[]> = {
  20: [
    { id: 'age_20_1', title: "취업 준비가 너무 막막할 때", recommendation: "취준생을 위한 응원을 준비했어요" },
    { id: 'age_20_2', title: "썸 타는 사람의 마음이 궁금한가요?", recommendation: "연애 세포를 깨워줄 조언" },
    { id: 'age_20_3', title: "친구들과 나를 자꾸 비교하게 될 때", recommendation: "나만의 속도로 가도 괜찮아요" },
    { id: 'age_20_4', title: "첫 출근의 설렘과 두려움 사이에서", recommendation: "사회초년생을 위한 가이드" },
  ],
  30: [
    { id: 'age_30_1', title: "이직을 고민하고 있는 중인가요?", recommendation: "커리어 점프를 위한 결단" },
    { id: 'age_30_2', title: "내 집 마련, 재테크가 막막할 때", recommendation: "현실적인 경제 지혜" },
    { id: 'age_30_3', title: "결혼과 비혼, 선택의 갈림길에서", recommendation: "나의 행복을 위한 정답" },
    { id: 'age_30_4', title: "일과 삶의 균형이 무너졌을 때", recommendation: "워라밸을 찾아줄 한마디" },
  ],
  40: [
    { id: 'age_40_1', title: "자녀 교육이 마음처럼 되지 않을 때", recommendation: "부모님의 마음을 다독이는 시간" },
    { id: 'age_40_2', title: "내가 가고 있는 길이 맞는지 돌아볼 때", recommendation: "인생 2막을 여는 용기" },
    { id: 'age_40_3', title: "건강이 예전 같지 않아 걱정될 때", recommendation: "활기찬 내일을 위한 조언" },
    { id: 'age_40_4', title: "직장에서 책임감이 너무 무거울 때", recommendation: "리더의 어깨를 가볍게 해줄 지혜" },
  ],
  50: [
    { id: 'age_50_1', title: "은퇴 이후의 삶을 고민하고 있나요?", recommendation: "제2의 전성기를 위해" },
    { id: 'age_50_2', title: "독립하는 자녀를 보며 허전할 때", recommendation: "새로운 자유를 즐기는 법" },
    { id: 'age_50_3', title: "오랜 친구와의 우정이 예전 같지 않을 때", recommendation: "관계의 깊이를 더하는 성찰" },
    { id: 'age_50_4', title: "인생의 의미를 다시 찾고 싶을 때", recommendation: "삶의 향기를 더해줄 명언" },
  ],
  60: [
    { id: 'age_60_1', title: "지나온 세월을 아름답게 정리하고 싶을 때", recommendation: "우아하고 지혜로운 노후" },
    { id: 'age_60_2', title: "손주들이 주는 행복과 피곤함 사이에서", recommendation: "사랑 가득한 조부모의 지혜" },
    { id: 'age_60_3', title: "새로운 취미를 시작하고 싶을 때", recommendation: "나이는 숫자에 불과합니다" },
    { id: 'age_60_4', title: "오늘 하루의 작은 평화가 소중할 때", recommendation: "평온한 일상을 위한 축복" },
  ]
};
