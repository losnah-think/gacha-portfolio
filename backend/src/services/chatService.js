import { firestore, FieldValue } from '../lib/firebaseAdmin.js';
import { deductChatTicket, applyRewardActivity } from './userService.js';
import { generateChatResponse } from './aiGenerator.js';
import { generateChatResponseV3 } from './aiGeneratorV3.js';
import { loadAndSyncUserMetadata, getTicketBalance, logUserAction } from '../utils/helpers.js';
import { resolveImageUrl, CANONICAL_PERSONA_MAP, getPersonaImagePath } from '../utils/imageUrl.js';
import { checkAndClaimActivityReward } from './promotionService.js';
import { getCachedPersonasMap, getCachedPersona } from '../utils/sharedCache.js';
import { isHiddenCounselorPersona, isPersonaMissingImage } from '../utils/personaVisibility.js';

// ==========================================
// [V3] AI Chat & Suggestion Service
// ==========================================

/**
 * Get chat-enabled personas only (for Chat/Question tab)
 */
export const getChatPersonas = async (group = null) => {
    // ✅ 최적화: 공유 캐시에서 personas 읽기 (Firestore 직접 읽기 제거)
    const personasMap = await getCachedPersonasMap();
    const personas = [];

    for (const [docId, data] of Object.entries(personasMap)) {
        // Only include active personas that support chat
        if (data.isActive === false) continue;

        // [V3] Group Filtering
        if (group && data.v3Group !== group) continue;
        if (isHiddenCounselorPersona({ id: docId, ...data })) continue;
        if (isPersonaMissingImage({ id: docId, ...data })) continue;

        personas.push({
            id: docId,
            name: data.name || docId.replace(/_/g, ' '),
            icon: resolveImageUrl(data.imageUrl || getPersonaImagePath(docId)),
            imageUrl: resolveImageUrl(data.imageUrl || getPersonaImagePath(docId)),
            desc: data.description || '',
            category: data.category || 'general',
            priority: data.priority || 0,
            isRecommended: data.isRecommended || false,
            isNew: data.isNew || false
        });
    }

    // Sort by priority (higher first)
    return personas.sort((a, b) => b.priority - a.priority);
};

/**
 * Start a new chat session
 * @param {string} userKey 
 * @param {string} personaId 
 * @returns {Promise<object>} sessionInfo
 */
export const startChatSession = async (userKey, personaId, reqBody = {}) => {
    const { group } = reqBody; // [V3] Pass theme group
    // Normalize personaId if it's a Korean name or alias
    const normalizedPersonaId = CANONICAL_PERSONA_MAP[personaId] || personaId;
    const pData = await getCachedPersona(normalizedPersonaId) || {};

    if (isHiddenCounselorPersona({ id: normalizedPersonaId, ...pData })) {
        const err = new Error('PERSONA_NOT_AVAILABLE');
        err.code = 'PERSONA_NOT_AVAILABLE';
        throw err;
    }

    // 1. Get Current Ticket Balance & Initial Sync (ensure daily recharge)
    const userMetadata = await loadAndSyncUserMetadata(userKey);
    const tickets = getTicketBalance(userMetadata.raw || {});

    if (tickets <= 0) {
        const err = new Error('INSUFFICIENT_TICKETS');
        err.code = 'INSUFFICIENT_TICKETS';
        err.currentTickets = tickets;
        throw err;
    }

    // 2. Create chat session doc
    const chatRef = firestore.collection('chats').doc();
    await chatRef.set({
        userKey,
        personaId: normalizedPersonaId,
        v3Group: group || null, // [V3] Store theme information
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        isActive: true,
        messageCount: 0
    });

    const personaInfo = {
        id: normalizedPersonaId,
        name: pData.name || normalizedPersonaId.replace(/_/g, ' '),
        icon: resolveImageUrl(pData.imageUrl || getPersonaImagePath(normalizedPersonaId))
    };

    // [LOGGING] Record Session Start
    void logUserAction(userKey, 'CHAT_SESSION_START', {
        chatId: chatRef.id,
        personaId: normalizedPersonaId
    });

    return {
        chatId: chatRef.id,
        persona: personaInfo,
        remainingTurns: 3,
        turnCountInTicket: 0,
        tickets: tickets,
        willConsumeTicket: true // First message in any new session will consume a ticket
    };
};

/**
 * Handle a chat message turn
 * 1. Deduct Ticket
 * 2. Save User Message
 * 3. Generate AI Response
 * 4. Save AI Response
 * @param {string} userKey 
 * @param {string} chatId 
 * @param {string} userMessage 
 * @returns {Promise<object>} { userMessage, aiMessage, remainingTickets, ...status }
 */
export const processChatTurn = async (userKey, chatId, userMessage, reqBody = {}) => {
    const { requestId } = reqBody || {};
    if (requestId) {
        const idempRef = firestore.collection('idempotency_keys').doc(String(requestId));
        const idempSnap = await idempRef.get().catch(() => null);
        if (idempSnap?.exists) {
            const data = idempSnap.data();
            if (data.status === 'SUCCESS' && data.resultType === 'CHAT_MESSAGE' && data.fullResult) {
                return {
                    ...data.fullResult,
                    alreadyProcessed: true,
                    requestId
                };
            }
        }
    }

    // 1. Validate Chat Session
    const chatRef = firestore.collection('chats').doc(chatId);
    const chatSnap = await chatRef.get();
    if (!chatSnap.exists) {
        throw new Error('CHAT_SESSION_NOT_FOUND');
    }
    const chatData = chatSnap.data();
    if (chatData.userKey !== userKey) {
        throw new Error('UNAUTHORIZED_CHAT_ACCESS');
    }

    // 2. Ticket Deduction Logic (1 Ticket = 3 Turns)
    const currentMessageCount = chatData.messageCount || 0;
    const userTurnsSoFar = Math.floor(currentMessageCount / 2); // turns already stored (User+AI)

    // [V3 PRODUCTION MODE] Ticket deduction enabled
    const V3_CHAT_TEST_MODE = false;

    let tickets = 0;
    let isTicketConsumed = false;

    if (V3_CHAT_TEST_MODE) {
        const userRef = firestore.collection('users').doc(userKey);
        const userSnap = await userRef.get();
        const userData = userSnap.data() || {};
        tickets = getTicketBalance(userData);
    } else {
        // Production mode: Strict 1 Ticket = 3 Turns
        // Deduct at Turn 0, 3, 6...
        if (userTurnsSoFar % 3 === 0) {
            isTicketConsumed = true;
            const ticketResult = await deductChatTicket(userKey, reqBody);
            tickets = ticketResult.tickets;
        } else {
            const userRef = firestore.collection('users').doc(userKey);
            const userSnap = await userRef.get();
            const userData = userSnap.data() || {};
            tickets = getTicketBalance(userData);
        }
    }

    try {
        // 3. Save User Message
        const messagesRef = chatRef.collection('messages');
        await messagesRef.add({
            sender: 'user',
            text: userMessage,
            timestamp: FieldValue.serverTimestamp(),
            createdAt: new Date().toISOString()
        });

        // 4. Load History for Context (Last 20 messages)
        const historySnap = await messagesRef.orderBy('timestamp', 'asc').limitToLast(20).get();
        const rawHistory = historySnap.docs.map(doc => {
            const data = doc.data();
            return {
                role: data.sender === 'user' ? 'user' : 'model',
                parts: [{ text: data.text }]
            };
        });

        let history = [];
        const historicalMessages = rawHistory.slice(0, -1);

        for (const msg of historicalMessages) {
            if (history.length === 0) {
                if (msg.role === 'user') history.push(msg);
            } else {
                const lastRole = history[history.length - 1].role;
                if (msg.role !== lastRole) history.push(msg);
            }
        }
        if (history.length > 0 && history[history.length - 1].role === 'user') {
            history.pop();
        }

        // 5. Generate AI Response
        const personaId = chatData.personaId;
        // ✅ 최적화: 캐시에서 persona 데이터 읽기
        const pData = await getCachedPersona(personaId) || {};
        const personaDisplayName = pData.name || personaId.replace(/_/g, ' ');

        const userMetadata = await loadAndSyncUserMetadata(userKey);

        let aiText;
        if (chatData.v3Group) {
            // [V3] Using V3 Logic
            aiText = await generateChatResponseV3(
                personaDisplayName,
                chatData.v3Group,
                history,
                userMessage,
                { personaId, userMetadata }
            );
        } else {
            // [Legacy]
            aiText = await generateChatResponse(
                personaDisplayName,
                history,
                userMessage,
                null,
                { personaId, userMetadata }
            );
        }

        // 6. Save AI Response
        const aiMessageDoc = await messagesRef.add({
            sender: 'model',
            text: aiText,
            timestamp: FieldValue.serverTimestamp(),
            createdAt: new Date().toISOString()
        });

        // Update Chat Session Metadata
        await chatRef.update({
            updatedAt: FieldValue.serverTimestamp(),
            lastMessage: aiText.substring(0, 50),
            messageCount: FieldValue.increment(2) // User + AI
        });

        // Update User Total Message Count for "Words Jackpot" (백마디 말로 오천냥받기) Mission
        const userRef = firestore.collection('users').doc(userKey);
        await userRef.set({
            totalMessages: FieldValue.increment(1), // Count user messages
            updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });

        // Fetch latest totalMessages for reward check
        const userSnapshot = await userRef.get();
        const totalMessages = userSnapshot.data()?.totalMessages || 0;

        // [LOGGING] Record Message Turn
        void logUserAction(userKey, 'CHAT_MESSAGE_SENT', {
            chatId,
            personaId: chatData.personaId,
            isTicketConsumed,
            turnCountInTicket: (Math.floor((currentMessageCount + 2) / 2) % 3 === 0) ? 3 : (Math.floor((currentMessageCount + 2) / 2) % 3)
        });

        // Calculate Turn Status for UI
        const updatedMessageCount = currentMessageCount + 2;
        const turnsDone = Math.floor(updatedMessageCount / 2);
        const turnCountInTicket = (turnsDone % 3 === 0) ? 3 : (turnsDone % 3);
        const remainingTurnsInSet = 3 - turnCountInTicket;

        // [Promotion] Check Holiday Chat Reward (3 Turns or more)
        // 한 채팅방에서 3턴 이상 대화 시 보상 지급 (이미 받은 경우 내부에서 필터링됨)
        if (turnsDone >= 3) {
            checkAndClaimActivityReward(userKey, 'HOLIDAY_CHAT_3_TURNS', turnsDone).catch(err => console.error(err));
        }

        // [Daily Mission] Update chat mission progress
        import('./promotionService.js').then(m => m.updateDailyMissionProgress(userKey, 'chat', chatData.personaId)).catch(err => console.error(err));

        // [JACKPOT] 백마디 말로 오천냥받기 (100 messages total)
        checkAndClaimActivityReward(userKey, 'JACKPOT_WORDS', totalMessages).catch(err => console.error(err));

        // [EXP/Level Up] Provide CONSULT EXP for every chat turn automatically
        // This will update characterLevel and characterExp without frontend explicit API calls
        applyRewardActivity({
            userKey,
            activityType: 'CONSULT',
            personaId: chatData.personaId
        }).catch(err => console.error('[Chat] Failed to grant CONSULT EXP automatically:', err));

        const finalResult = {
            chatId,
            userMessage: { text: userMessage, sender: 'user' },
            aiMessage: { text: aiText, sender: 'model', id: aiMessageDoc.id },
            remainingTickets: tickets,
            tickets,
            turnCountInTicket: turnCountInTicket, // 1/3, 2/3, 3/3
            remainingTurns: remainingTurnsInSet,  // 2, 1, 0
            isTicketConsumed: isTicketConsumed,    // Was a ticket deducted this turn?
            charged: isTicketConsumed,
            requestId: requestId || null,
            alreadyProcessed: false
        };

        if (requestId) {
            await firestore.collection('idempotency_keys').doc(String(requestId)).set({
                userKey,
                status: 'SUCCESS',
                resultType: 'CHAT_MESSAGE',
                fullResult: finalResult,
                createdAt: FieldValue.serverTimestamp()
            }, { merge: true }).catch(() => {});
        }

        return finalResult;
    } catch (error) {
        console.error(`[processChatTurn] Error during chat processing: ${error.message}`, error);

        // [REFUND TICKET]
        if (isTicketConsumed) {
            try {
                const userRef = firestore.collection('users').doc(userKey);
                await firestore.runTransaction(async (tx) => {
                    const doc = await tx.get(userRef);
                    if (doc.exists) {
                        const data = doc.data();
                        const currentTotal = data.ticketsTotal !== undefined ? data.ticketsTotal : (data.tickets || 0);
                        const newTotal = currentTotal + 1;
                        tx.update(userRef, {
                            ticketsTotal: newTotal,
                            tickets: newTotal,
                            ticket: newTotal,
                            updatedAt: new Date()
                        });
                    }
                });
                console.log(`[processChatTurn] Refunded ticket for ${userKey} due to error`);
            } catch (refundError) {
                console.error(`[processChatTurn] Failed to refund ticket: ${refundError}`);
            }
        }
        error.charged = false;
        error.retryable = true;
        error.requestId = requestId || null;
        throw error;
    }
};

/**
 * Get Chat History with Session Metadata
 */
export const getChatHistory = async (userKey, chatId) => {
    const chatRef = firestore.collection('chats').doc(chatId);
    const chatSnap = await chatRef.get();
    if (!chatSnap.exists) throw new Error('CHAT_NOT_FOUND');

    const chatData = chatSnap.data();
    if (chatData.userKey !== userKey) throw new Error('UNAUTHORIZED');

    // Normalize and Resolve Persona Metadata
    const rawPersonaId = chatData.personaId;
    const personaId = CANONICAL_PERSONA_MAP[rawPersonaId] || rawPersonaId;
    // ✅ 최적화: 캐시에서 persona 데이터 읽기
    const pData = await getCachedPersona(personaId) || {};

    const personaInfo = {
        id: personaId,
        name: pData.name || personaId.replace(/_/g, ' '),
        icon: resolveImageUrl(pData.imageUrl || getPersonaImagePath(personaId))
    };

    // Calculate Turn Count (1 Ticket = 3 Turns)
    const currentMessageCount = chatData.messageCount || 0;
    const turnsDone = Math.floor(currentMessageCount / 2);
    // nextTurn: if 0 done -> 1, if 1 done -> 2, if 2 done -> 3, if 3 done -> 1 (new set)
    const nextTurn = (turnsDone % 3) + 1;
    const remainingInTicket = 3 - (turnsDone % 3); // 3, 2, 1 left

    // ✅ 최적화: 메시지 limit 추가 (무제한 로딩 방지, 최근 200건만)
    const messagesSnap = await chatRef.collection('messages').orderBy('timestamp', 'asc').limitToLast(200).get();
    const history = messagesSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate().toISOString()
    }));

    return {
        chatId,
        persona: personaInfo,
        messageCount: currentMessageCount,
        turnCountInTicket: nextTurn,     // This is the turn the user is about to take or just took
        remainingTurns: remainingInTicket, // Remaining turns in CURRENT ticket set
        history: history
    };
};

/**
 * Get all chat sessions for a user
 */
export const getChatSessions = async (userKey) => {
    const snapshot = await firestore.collection('chats')
        .where('userKey', '==', userKey)
        .orderBy('updatedAt', 'desc')
        .limit(50)
        .get();

    const sessions = [];

    // ✅ 최적화: 공유 캐시에서 personas 로드 (풀 스캔 제거)
    const personaMap = await getCachedPersonasMap();

    snapshot.forEach(doc => {
        const data = doc.data();
        const rawPersonaId = data.personaId;
        const personaId = CANONICAL_PERSONA_MAP[rawPersonaId] || rawPersonaId;
        const pData = personaMap[personaId] || {};

        const turnsDone = Math.floor((data.messageCount || 0) / 2);
        const nextTurn = (turnsDone % 3) + 1;
        const remainingInTicket = 3 - (turnsDone % 3);

        sessions.push({
            chatId: doc.id,
            personaId: personaId,
            personaName: pData.name || personaId.replace(/_/g, ' '),
            personaIcon: resolveImageUrl(pData.imageUrl || getPersonaImagePath(personaId)),
            lastMessage: data.lastMessage || '',
            updatedAt: data.updatedAt?.toDate().toISOString(),
            messageCount: data.messageCount || 0,
            turnCountInTicket: nextTurn,
            remainingTurns: remainingInTicket
        });
    });

    return sessions;
};

/**
 * [V3] Get suggested questions for a persona
 */
export const getSuggestedQuestions = async (personaId) => {
    // Default fallback questions
    const defaultQuestions = [
        "오늘 나의 행운은 어떤가요?",
        "지금 나에게 가장 필요한 조언은 무엇인가요?",
        "로또나 연금복권 당첨 기운을 나눠주세요!",
        "요즘 스트레스를 많이 받는데, 위로 한마디 해줘.",
        "이번 달 가장 좋은 날은 언제야?",
        "나한테 숨겨진 재능이 있다면 뭘까?",
        "올해 내게 꼭 찾아올 행운은 뭐야?"
    ];

    const personaQuestions = {
        "socrates": {
            name: "소크라테스",
            questions: [
                "진정한 행복이란 무엇이라고 생각하시나요?",
                "요즘 너무 무기력한데, 어떻게 하면 좋을까요?",
                "어떻게 하면 더 나은 내가 될 수 있을까요?",
                "불안한 미래를 어떻게 대비해야 할까요?",
                "지혜로운 삶을 살기 위한 첫걸음은 무엇인가요?",
                "사랑과 우정, 어느 쪽이 더 가치 있나요?",
                "실패했을 때 다시 일어서는 힘은 어디서 나오나요?",
                "좋은 습관을 만들려면 어떤 마음가짐이 필요한가요?",
                "다른 사람의 시선이 너무 신경 쓰여요. 어떻게 해야 할까요?",
                "인생에서 후회하지 않으려면 어떤 선택을 해야 하나요?"
            ]
        },
        "king_sejong": {
            name: "세종대왕",
            questions: [
                "백성을 사랑하는 마음은 어디서 나오나요?",
                "리더로서 어려운 결정을 내려야 할 때 어떻게 하시나요?",
                "배움에 있어 가장 중요한 태도는 무엇입니까?",
                "실패를 극복하는 전하만의 비결은 무엇입니까?",
                "오늘 하루 성실히 살아갈 덕담 한 마디 부탁드립니다.",
                "한글을 만드실 때 가장 어려웠던 점은 무엇이었나요?",
                "주변 사람들의 반대를 어떻게 극복하셨나요?",
                "좋은 리더가 되려면 꼭 갖춰야 할 것 한 가지는?",
                "요즘 일이 잘 안 풀려요. 전하의 격려를 듣고 싶습니다.",
                "자녀 교육에 대한 전하의 생각이 궁금합니다."
            ]
        },
        "lotto_generator": {
            name: "lotto_로또번호_추첨기",
            questions: [
                "이번 주 로또 행운의 숫자는?",
                "연금복권 당첨 번호 추천해줘!",
                "로또 1등에 당첨될 기운을 불어넣어 줘!",
                "이번 주 재물운은 어떨 것 같아?",
                "오늘 번호 뽑기 좋은 시간은 언제야?",
                "당첨 확률을 높이는 비법 좀 알려줘!",
                "내 생년월일 기반으로 럭키넘버 뽑아줘!",
                "로또 살 때 피해야 할 번호는?",
                "복권 당첨되면 뭐부터 해야 해?",
                "오늘 금전운 지수 몇 퍼센트야?"
            ]
        },
        "cat": {
            name: "길고양이",
            questions: [
                "나랑 같이 놀아줄래? 냥!",
                "오늘따라 기분이 꾸물꾸물해.",
                "맛있는 츄르 줄 테니까 위로해 줘!",
                "너는 매일매일 어떻게 그렇게 여유로워?",
                "나한테 행운의 꾹꾹이 한 번 해줄래?",
                "비 오는 날은 뭐하면서 보내?",
                "고양이한테 배우는 인생의 지혜가 있다면?",
                "스트레스 해소법 좀 알려줄래, 냥?",
                "내일 좋은 일이 생길 것 같아? 느낌이 어때?",
                "같이 낮잠 자면서 수다 떨자!"
            ]
        },
        "seollal_moon": {
            name: "보름달",
            questions: [
                "오늘 밤 소원을 하나 들어줄 수 있어?",
                "따뜻한 덕담 한마디 해줘!",
                "올해 나의 운세는 어떨까?",
                "요즘 마음이 힘든데, 달빛으로 위로해 줘.",
                "올 한 해 대박 날 수 있도록 소원 좀 들어줘!",
                "가족들과 잘 지내는 비결이 뭐야?",
                "내 꿈을 이루려면 어떤 마음을 가져야 할까?",
                "오늘 가장 빛나는 별자리는 뭐야?",
                "미래가 불안한데 용기를 좀 줘.",
                "행운이 찾아오려면 어떤 준비를 해야 할까?"
            ]
        },
        // [V3] New Personas
        "v3_lucy": {
            name: "연애상담사 루시",
            questions: [
                "짝사랑하는 그 사람, 내 마음을 알까요?",
                "이번 주말 데이트 코스 추천해 줘!",
                "요즘 너무 외로운데 연애운이 언제쯤 들어올까?",
                "권태기를 극복하려면 어떻게 해야 할까?",
                "나의 숨겨진 연애 매력 포인트는 뭐야?",
                "썸 타는 상대에게 먼저 연락해도 될까요?",
                "이별 후에 다시 연락이 왔는데 어떻게 해야 할까요?",
                "좋아하는 사람에게 자연스럽게 호감을 표현하는 법은?",
                "연인에게 서운한 감정을 어떻게 전달하면 좋을까?",
                "나랑 잘 맞는 이상형은 어떤 사람이야?"
            ]
        },
        "v3_cupid": {
            name: "사랑의 요정 큐피트",
            questions: [
                "내 운명의 상대는 어디 있을까?",
                "사랑의 화살을 쏴줘! 💘",
                "오늘 만나는 사람과 인연이 될 수 있을까?",
                "오늘 나의 매력 포인트는 뭐야?",
                "성공적인 고백 타이밍과 멘트 좀 알려줘!",
                "내 연애 스타일은 어떤 타입이야?",
                "오늘 행운의 사랑 아이템을 추천해줘!",
                "첫 만남에서 좋은 인상을 주려면 어떻게 해야 해?",
                "연애할 때 절대 하면 안 되는 실수 TOP 3 알려줘!",
                "내 사랑 앞에 놓인 가장 큰 장애물은 뭘까?"
            ]
        },
        "v3_pachinko": {
            name: "빠찡코 로봇 파치",
            questions: [
                "오늘의 대박 운세 보여줘!",
                "연금복권 대박 번호를 하나 뽑아줘! 🎰",
                "이번 주 로또 1등 당첨 기운이 느껴져?",
                "금전운이 팡팡 터질 럭키 아이템은?",
                "지금 당장 실행해야 할 행운의 행동은?",
                "오늘 대박 터질 확률은 몇 퍼센트야?",
                "내 행운 게이지를 충전시켜줘!",
                "잭팟이 터지려면 어떤 마음가짐이 필요해?",
                "파치야, 오늘 돈 벌 수 있는 꿀팁 알려줘!",
                "이번 달 재물운 최고의 날은 언제야?"
            ]
        },
        "v3_gachabot": {
            name: "가차 마스터 가차트론",
            questions: [
                "행운의 캡슐 뽑기! 💊",
                "오늘 나에게 필요한 아이템은?",
                "랜덤 운세 한 번 뽑아줘!",
                "내일의 행운 지수는 몇 퍼센트일까?",
                "SS급 행운이 기다리고 있을까? 가챠 돌려 줘!",
                "SSR 등급 인생 아이템이 뭔지 알려줘!",
                "오늘의 히든 미션은 뭐야?",
                "내 인생 가챠 등급은 뭘까?",
                "행운 확률 UP 이벤트 발동시켜 줘!",
                "레어 아이템급 조언 하나만 뽑아줘!"
            ]
        },
        "v3_lucky7": {
            name: "잭팟 슬롯 럭키세븐",
            questions: [
                "잭팟! 777이 나올까?",
                "이번 주 로또 번호 좀 찍어줘!",
                "연금복권 1등 번호가 궁금해! 💰",
                "내 인생의 잭팟은 언제 터질까?",
                "오늘 하루를 완벽하게 만들어줄 행운 팁은?",
                "슬롯 한 판 돌려서 오늘 운세 알려줘!",
                "럭키세븐의 비밀 행운 코드를 알려줘!",
                "금전운 외에 오늘 대박 날 분야는?",
                "행운을 부르는 오늘의 컬러는?",
                "인생 역전 스토리 하나 들려줘!"
            ]
        },
        // ── 상담 전용 페르소나 ──
        "dream_interpreter": {
            name: "꿈 해몽사 몽선생",
            questions: [
                "어젯밤에 하늘을 나는 꿈을 꿨어요. 무슨 의미일까요?",
                "꿈에서 돼지가 나왔는데 복권 사도 될까요?",
                "반복적으로 같은 꿈을 꾸는데 왜 그런 걸까요?",
                "꿈에서 이빨이 빠졌어요. 불길한 꿈인가요?",
                "꿈에서 돌아가신 분을 만났는데 어떤 메시지일까요?",
                "물에 빠지는 꿈을 꿨는데 무슨 뜻이야?",
                "꿈에서 뱀을 봤어요. 행운인가요 불운인가요?",
                "시험에 떨어지는 꿈을 꿨는데 현실과 관련 있어?",
                "꿈에서 아기를 안고 있었어요. 태몽인가요?",
                "악몽을 자주 꾸는데 해결 방법이 있을까요?"
            ]
        },
        "tarot_master": {
            name: "타로 마스터 아르카나",
            questions: [
                "오늘의 타로 카드 한 장 뽑아주세요!",
                "연애운을 타로로 봐주실 수 있나요?",
                "이직을 고민 중인데, 타로가 어떤 메시지를 줄까요?",
                "올해 나의 운세를 3카드 스프레드로 봐주세요!",
                "지금 마음속에 품고 있는 고민에 대해 카드를 뽑아주세요.",
                "이번 달 금전운을 카드로 점쳐주세요!",
                "지금 내가 놓치고 있는 것은 뭘까요?",
                "나와 그 사람의 궁합을 타로로 봐주세요!",
                "현재 나의 에너지 상태를 카드로 읽어주세요.",
                "올해 하반기에 기대해도 되는 일이 있을까요?"
            ]
        },
        "finance_advisor": {
            name: "재테크 멘토 머니킹",
            questions: [
                "월급 200만원인데 어떻게 재테크를 시작해야 할까요?",
                "비상금은 얼마나 모아두는 게 좋을까요?",
                "적금과 투자, 지금 뭐가 더 유리할까요?",
                "사회초년생인데 재테크 로드맵을 짜주세요!",
                "소비 습관을 고치고 싶은데 현실적인 팁 좀 주세요.",
                "주식 vs 부동산, 지금 시작하려면 어디가 좋아?",
                "카드 사용을 줄이고 현금 위주로 바꾸고 싶은데 방법은?",
                "30대에 꼭 해야 하는 재테크 3가지 알려줘!",
                "월 30만원으로 시작할 수 있는 투자 방법은?",
                "돈 모으는 것보다 지키는 게 더 중요한 이유가 뭐야?"
            ]
        },
        "parenting_coach": {
            name: "육아 멘토 아이사랑",
            questions: [
                "아이가 자꾸 떼를 써요. 어떻게 대처해야 할까요?",
                "초등학생 아이의 스마트폰 사용 시간을 어떻게 관리할까요?",
                "사춘기 자녀와 대화하는 방법이 있을까요?",
                "아이에게 화를 내고 나서 너무 죄책감이 들어요.",
                "형제 갈등이 심한데 중재하는 좋은 방법이 있나요?",
                "아이의 자존감을 높여주는 말 습관이 궁금해요.",
                "숙제를 스스로 하게 만드는 방법이 있을까요?",
                "아이가 친구 관계에서 어려움을 겪고 있어요.",
                "워킹맘으로서 죄책감을 줄이는 방법은?",
                "아이의 재능을 발견하려면 어떻게 관찰해야 해요?"
            ]
        },
        "interview_coach": {
            name: "면접관 코치 합격신",
            questions: [
                "자기소개를 1분 안에 임팩트 있게 하는 법을 알려주세요.",
                "\"지원동기가 무엇인가요?\"에 대한 모범 답변을 코칭해주세요.",
                "면접에서 너무 긴장되는데 긴장을 푸는 팁이 있나요?",
                "모의 면접을 해보고 싶어요. 면접관이 되어주세요!",
                "면접에서 자주 묻는 압박 질문에 대처하는 법을 알려주세요.",
                "\"본인의 단점이 뭔가요?\" 이 질문에 어떻게 답해야 해요?",
                "이직 면접에서 현재 회사를 어떻게 말해야 인상이 좋을까요?",
                "면접 복장과 첫인상 관리 꿀팁 좀 주세요!",
                "\"마지막으로 하고 싶은 말\"에 뭐라고 하면 합격 확률이 올라요?",
                "연봉 협상을 면접 중에 어떻게 자연스럽게 꺼내나요?"
            ]
        },
        // ── 추가 범용 페르소나 ──
        "grandmother": {
            name: "할머니",
            questions: [
                "할머니, 오늘 기분이 좋지 않은데 위로 한마디 해줘.",
                "밥은 먹었어? 오늘 뭘 먹으면 좋을까?",
                "할머니의 인생 최고의 순간은 언제였어?",
                "건강하게 오래 사는 비결을 알려줘!",
                "연애 잘 하는 법 좀 알려줘, 할머니!",
                "할머니만의 고민 해결법이 뭐야?",
                "오늘 운수가 좋을까? 할머니 감으로 봐줘!",
                "삶이 힘들 때 어떻게 이겨내셨어요?"
            ]
        },
        "mystic_fortune_teller": {
            name: "신비의 점술사",
            questions: [
                "오늘 나의 종합 운세를 봐주세요!",
                "이번 주 조심해야 할 날이 있나요?",
                "내 사주에서 가장 강한 기운은 뭔가요?",
                "올해 전체 운의 흐름이 궁금해요.",
                "재물운이 들어올 시기를 알려주세요.",
                "건강운에 대해 조언해주세요.",
                "나의 전생은 어떤 사람이었을까요?",
                "이사 가려는데 방위가 괜찮을까요?"
            ]
        }
    };

    const config = personaQuestions[personaId] || {
        name: personaId.replace(/_/g, ' '),
        questions: defaultQuestions
    };

    return {
        personaId,
        personaName: config.name,
        questions: config.questions
    };
};
