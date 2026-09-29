import { getTossSavedUserKey } from '../../toss-auth';
import { apiUrl } from '../api/client';

/**
 * 스마트 발송용 템플릿 코드 정의 (PUSH_TEMPLATES.md 기준)
 */
export const MESSENGER_TEMPLATES = {
    DAILY_LUCKY: 'gacha_daily_lucky',       // 매일 행운권 (광고성/콘솔관리)
    PAYMENT_SUCCESS: 'gacha_payment_success', // 결제 완료 (기능성)
    REWARD_BONUS: 'gacha_reward_bonus',       // 보너스 티켓 도착 (기능성)
};

/**
 * 스마트 발송 (Push/Inbox) 트리거 함수
 * 실제 전송은 파트너 API(mTLS)가 필요하므로 백엔드 프록시를 통해 호출합니다.
 */
export const triggerSmartMessage = async (
    templateSetCode: string,
    context: Record<string, string> = {}
) => {
    try {
        const userKey = await getTossSavedUserKey();
        if (!userKey) {
            console.log('[Messenger] User not logged in, skipping message trigger.');
            return;
        }

        // 알림 차단 모드 확인 (로컬 설정)
        const isMuted = localStorage.getItem('notifications_muted') === 'true';
        if (isMuted) {
            console.log('[Messenger] Notifications are muted by user.');
            return;
        }

        console.log(`[Messenger] Triggering message: ${templateSetCode}`, context);

        const res = await fetch(apiUrl('/messenger/send-message'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userKey: String(userKey),
                templateSetCode,
                context: {
                    date: new Date().toLocaleDateString('ko-KR'),
                    ...context
                }
            })
        });

        if (!res.ok) {
            const err = await res.text();
            console.error('[Messenger] Failed to trigger message:', err);
        }
    } catch (error) {
        console.error('[Messenger] Error in triggerSmartMessage:', error);
    }
};
