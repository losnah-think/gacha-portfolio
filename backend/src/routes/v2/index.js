import express from 'express';

// Import existing routers
import adviceV2Router from '../gacha/adviceV2.js';
import adviceFamilyRouter from '../gacha/adviceFamily.js';
import discoverRouter from '../content/discover.js';
import userRouter from '../user/user.js';
import userSettingsRouter from '../user/userSettings.js';
import fableRouter from '../gacha/fable.js';
import fortuneRouter from '../gacha/fortune.js';
import gachaPromotionRouter from '../gacha/gachaPromotion.js';
import promotionsRouter from '../commerce/promotions.js';
import eventsRouter from '../commerce/events.js';
import storageRouter from '../media/storage.js';
import attendanceRouter from '../user/attendance.js';
import shareImageRouter from '../media/shareImage.js';
import tossRouter from '../commerce/toss.js';
import rankingRouter from '../content/ranking.js';
import personaPreferenceRouter from '../content/personaPreference.js';
import personalizedRouter from '../content/personalized.js';
import shopRouter from '../commerce/shop.js';
import messengerRouter from '../social/messenger.js';
import consultRouter from '../social/consult.js';
import detailedAnalysisRouter from '../gacha/detailedAnalysis.js'; // [New] 뽑기 결과 상세 AI 해석
import authRouter from './auth.js'; // [Auth] V2 Login Router
import shareRouter from './share.js'; // [New] Server-side Image Generation
import rewardRouter from './reward.js'; // [Phase 2] 리워드 활동/프로필
import scratchRouter from './scratch.js'; // [New] 복권 긁기 (Scratch Lottery)
import lottoRouter from './lotto.js'; // [New] 로또 머신 (Lotto Machine)
import bootstrapRouter from './bootstrap.js'; // [#4] 앱 초기화 통합 API
import configRouter from './config.js'; // [#5] 동적 설정 (광고 ID, 프로모션 코드)
import rewardGachaRouter from './rewardGacha.js'; // [New] 캡슐 뽑기 머신
import quizRouter from './quiz.js'; // [New] O/X 퀴즈
import spellRouter from './spell.js'; // [New] 오늘의 주문
import talismanRouter from './talisman.js'; // [New] 오늘의 부적
import rouletteRouter from './roulette.js'; // [New] 룰렛 코멘트
import ladderRouter from './ladder.js'; // [New] 사다리타기 게임
import crosswordRouter from './crossword.js'; // [New] 단어찾기 퍼즐
import idiomQuizRouter from './idiomQuiz.js'; // [New] 사자성어/속담 퀴즈

const v2Router = express.Router();

// 모든 V2 라우터 요청에 대해 V2 플래그 설정
v2Router.use((req, res, next) => {
    req.isV2 = true;
    next();
});

/**
 * ✨ V2 API Branching by Type
 */

// 1. 뽑기 및 AI 상담 (Gacha & AI Advice)
v2Router.use('/gacha/fable', fableRouter); // [Alias] Fix for client calling /gacha/fable
v2Router.use('/gacha', detailedAnalysisRouter); // [New] 상세 해석 (POST /gacha/detailed-analysis)
v2Router.use('/gacha', adviceV2Router);
v2Router.use('/gacha/family', adviceFamilyRouter);

// 2. 발견 및 캐릭터 정보 (Discovery & Personas)
v2Router.use('/discover', discoverRouter);
v2Router.use('/interactions', discoverRouter);
v2Router.get('/personas', (req, res, next) => { req.url = '/personas'; next(); }, discoverRouter);
v2Router.get('/situations', (req, res, next) => { req.url = '/situations'; next(); }, discoverRouter);

// 3. 사용자 및 티켓 정보 (User & Tickets)
v2Router.use('/user', userSettingsRouter);
v2Router.use('/user', userRouter);
v2Router.use('/tickets', userRouter);
v2Router.use('/status', userRouter);

// 4. 운세 및 동화 콘텐츠 (Fortune & Fables)
v2Router.use('/fable', fableRouter);
v2Router.use('/fortune', fortuneRouter);

// 5. 프로모션 및 보상 (Rewards & Events)
v2Router.use('/promotion', gachaPromotionRouter);
v2Router.use('/promotions', promotionsRouter);
v2Router.use('/events', eventsRouter);

// 6. 결제 및 금융 (Billing & Toss & Auth)
v2Router.use('/toss', tossRouter);
v2Router.use('/purchase', tossRouter);
v2Router.use('/shop', shopRouter);
v2Router.use('/auth', authRouter); // [New] Server-side Login
v2Router.use('/messenger', messengerRouter);
v2Router.use('/consult', consultRouter);

// 7. 저장소 및 이미지 (Media & History)
v2Router.use('/storage', storageRouter);
v2Router.use('/history', storageRouter);
v2Router.use('/attendance', attendanceRouter);
v2Router.use('/user/attendance', attendanceRouter);
v2Router.use('/share-image', shareImageRouter);
v2Router.use('/share', shareRouter);
v2Router.get('/download/:id', (req, res, next) => { req.url = `/download/${req.params.id}`; next(); }, shareRouter);

// 8. 랭킹 및 개인화 (Rankings & Personalization)
v2Router.use('/ranking', rankingRouter);
v2Router.use('/persona-preference', personaPreferenceRouter);
v2Router.use('/personalized', personalizedRouter);

// 9. 리워드 활동 (Phase 2)
v2Router.use('/reward', rewardRouter);

// 10. 복권 긁기 (Scratch Lottery)
v2Router.use('/scratch', scratchRouter);

// 11. 로또 머신 (Lotto Machine)
v2Router.use('/lotto', lottoRouter);

// 12. 통합 초기화 & 설정 (#4 #5)
v2Router.use('/bootstrap', bootstrapRouter);
v2Router.use('/config', configRouter);

// 13. 캡슐 뽑기 머신 (Reward Gacha)
v2Router.use('/reward-gacha', rewardGachaRouter);

// 14. O/X 퀴즈 (Quiz)
v2Router.use('/quiz', quizRouter);

// 15. 오늘의 주문 (Spell)
v2Router.use('/spell', spellRouter);

// 16. 오늘의 부적 (Talisman)
v2Router.use('/talisman', talismanRouter);

// 17. 룰렛 코멘트 (Roulette)
v2Router.use('/roulette', rouletteRouter);

// 17-1. 사다리타기 게임 (Ladder)
v2Router.use('/ladder', ladderRouter);

// 18. 단어찾기 퍼즐 (Crossword / Word Search)
v2Router.use('/crossword', crosswordRouter);

// 19. 사자성어/속담 퀴즈 (Idiom Quiz)
v2Router.use('/idiom-quiz', idiomQuizRouter);

// 11. 관리자용 통계 (Alias for V2 Dashboard)

export default v2Router;
