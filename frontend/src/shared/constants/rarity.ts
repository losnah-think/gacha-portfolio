import type { CardRarity } from '../types';

export type RewardRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface RarityConfig {
    label: string;
    color: string;
    bgColor: string;
    borderColor: string;
    shadowColor: string;
    gradient: string;
    probability: number;
    scoreRange: [number, number];
    icon: string;
}

export const RARITY_CONFIG: Record<CardRarity, RarityConfig> = {
    diamond: {
        label: '다이아',
        color: 'text-rarity-legendary',
        bgColor: 'bg-rarity-legendary/10',
        borderColor: 'border-rarity-legendary',
        shadowColor: 'shadow-hard-sm',
        gradient: 'from-rarity-legendary via-warning to-rarity-legendary',
        probability: 0.01, // 1%
        scoreRange: [96, 100],
        icon: '💎'
    },
    platinum: {
        label: '플래티넘',
        color: 'text-rarity-epic',
        bgColor: 'bg-rarity-epic/10',
        borderColor: 'border-rarity-epic',
        shadowColor: 'shadow-hard-sm',
        gradient: 'from-rarity-epic via-toss-blue to-rarity-epic',
        probability: 0.04, // 4%
        scoreRange: [90, 95],
        icon: '💍'
    },
    gold: {
        label: '골드',
        color: 'text-rarity-rare',
        bgColor: 'bg-rarity-rare/10',
        borderColor: 'border-rarity-rare',
        shadowColor: 'shadow-hard-sm',
        gradient: 'from-rarity-rare via-toss-blue to-rarity-rare',
        probability: 0.15, // 15%
        scoreRange: [80, 89],
        icon: '✨'
    },
    silver: {
        label: '실버',
        color: 'text-rarity-uncommon',
        bgColor: 'bg-rarity-uncommon/10',
        borderColor: 'border-rarity-uncommon',
        shadowColor: 'shadow-hard-sm',
        gradient: 'from-rarity-uncommon via-success to-rarity-uncommon',
        probability: 0.30, // 30%
        scoreRange: [70, 79],
        icon: '⚪'
    },
    normal: {
        label: '노말',
        color: 'text-rarity-common',
        bgColor: 'bg-rarity-common/10',
        borderColor: 'border-rarity-common',
        shadowColor: 'shadow-hard-sm',
        gradient: 'from-rarity-common to-toss-gray-200',
        probability: 0.50, // 50%
        scoreRange: [60, 69],
        icon: '▫️'
    }
};

export const getRandomRarityAndScore = (): { rarity: CardRarity; score: number } => {
    const rand = Math.random();
    let cumulative = 0;

    // 확률이 낮은 순서대로 체크 (다이아 -> 플래티넘 -> ...)
    const rarities: CardRarity[] = ['diamond', 'platinum', 'gold', 'silver', 'normal'];

    let selectedRarity: CardRarity = 'normal';
    for (const rarity of rarities) {
        cumulative += RARITY_CONFIG[rarity].probability;
        if (rand < cumulative) {
            selectedRarity = rarity;
            break;
        }
    }

    const [min, max] = RARITY_CONFIG[selectedRarity].scoreRange;
    const score = Math.floor(Math.random() * (max - min + 1)) + min;

    return { rarity: selectedRarity, score };
};

export const getRandomRarity = (): CardRarity => {
    return getRandomRarityAndScore().rarity;
};

export const REWARD_RARITY_CONFIG: Record<RewardRarity, {
    label: string;
    color: string;
    bgColor: string;
    borderColor: string;
    gradient: string;
    particleCount: number;
}> = {
    common: {
        label: '기본 점수',
        color: 'text-rarity-common',
        bgColor: 'bg-rarity-common/10',
        borderColor: 'border-rarity-common',
        gradient: 'from-rarity-common to-toss-gray-200',
        particleCount: 0,
    },
    rare: {
        label: '좋은 점수',
        color: 'text-rarity-rare',
        bgColor: 'bg-rarity-rare/10',
        borderColor: 'border-rarity-rare',
        gradient: 'from-rarity-rare to-toss-blue',
        particleCount: 8,
    },
    epic: {
        label: '높은 점수',
        color: 'text-rarity-epic',
        bgColor: 'bg-rarity-epic/10',
        borderColor: 'border-rarity-epic',
        gradient: 'from-rarity-epic to-toss-blue',
        particleCount: 14,
    },
    legendary: {
        label: '최고 점수',
        color: 'text-rarity-legendary',
        bgColor: 'bg-rarity-legendary/10',
        borderColor: 'border-rarity-legendary',
        gradient: 'from-rarity-legendary to-warning',
        particleCount: 22,
    },
};

export const getRewardRarityByPoints = (points: number): RewardRarity => {
    if (points >= 10) return 'legendary';
    if (points >= 5) return 'epic';
    if (points >= 3) return 'rare';
    return 'common';
};
