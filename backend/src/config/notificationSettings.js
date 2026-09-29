/**
 * Configuration for Server-Driven Notification Settings
 * 
 * Title and Description are displayed on the frontend.
 * sortOrder determines the display sequence.
 */
export const NOTIFICATION_CONFIG = [
    {
        key: 'attendance',
        title: '3일 연속 출석',
        description: '3일 연속 접속하면 포인트를 받아요',
        sortOrder: 1
    },
    {
        key: 'advice',
        title: '조언 5회 뽑기',
        description: '조언 5회 이상 뽑으면 10원을 받아요',
        sortOrder: 2
    },
    {
        key: 'fortune_today',
        title: '오늘의 운세',
        description: '오늘의 행운을 확인하고 보상까지!',
        sortOrder: 3
    },
    {
        key: 'fortune_tomorrow',
        title: '내일의 운세',
        description: '18시 이후 내일의 운세 미리보기',
        sortOrder: 4
    },
    {
        key: 'scratchLottery',
        title: '포인트 복권',
        description: '매일 아침 포인트 복권 알림을 받아요',
        sortOrder: 5
    }
];
