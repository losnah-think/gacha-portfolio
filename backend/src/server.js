import express from 'express';
import cors from 'cors';
import compression from 'compression';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { onRequest } from 'firebase-functions/v2/https';
import YAML from 'yamljs';
import swaggerUi from 'swagger-ui-express';
import { firestore, FieldValue } from './lib/firebaseAdmin.js';
import { getKstDateKey, logUserAction } from './utils/helpers.js';
import { logSystemEvent } from './utils/logger.js';

// Import Routers
import adviceV2Router from './routes/gacha/adviceV2.js';
import { setGachaContents } from './services/gachaService.js';
import adviceFamilyRouter from './routes/gacha/adviceFamily.js';
import fableRouter from './routes/gacha/fable.js';
import storageRouter from './routes/media/storage.js';
import userRouter from './routes/user/user.js';
import tossRouter from './routes/commerce/toss.js';
import discoverRouter from './routes/content/discover.js';
// import discoverV1Router from './routes/content/discoverV1.js'; // Deprecated
import chatRouter from './routes/social/chat.js';
import fortuneRouter from './routes/gacha/fortune.js';
import gachaPromotionRouter from './routes/gacha/gachaPromotion.js';
import promotionsRouter from './routes/commerce/promotions.js';
import shareImageRouter from './routes/media/shareImage.js';
import v2Router from './routes/v2/index.js';
import rewardRouterV3 from './routes/v3/reward.js';
import personasRouter from './routes/content/personas.js';
import shopRouter from './routes/commerce/shop.js';
import profileRouterV3 from './routes/user/profileV3.js';

if (process.env.SERVE_LOCALLY === 'true') {
  dotenv.config();
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const swaggerSnippet = YAML.load(path.join(__dirname, 'swagger.yaml'));

const app = express();

// Middleware & Optimization
app.use(compression());
app.use(cors({
  origin: true, // 개발/테스트 편의를 위해 true 설정
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));

// ─── API Tracking: In-memory debouncing ──────────────────────────────────────
// 요청마다 Firestore를 직접 write하면 hot-path에서 부하가 누적됨.
// 30초마다 누적 카운트를 한 번에 플러시하여 Firestore write를 최대 1/30로 줄임.
const _statsBuffer = {};
let _statsFlushTimer = null;

const flushStatsBuffer = () => {
  const keys = Object.keys(_statsBuffer);
  if (keys.length === 0) return;
  const today = getKstDateKey();
  const statsRef = firestore.collection('daily_stats').doc(today);
  const updates = { updatedAt: FieldValue.serverTimestamp() };
  keys.forEach(k => {
    updates[k] = FieldValue.increment(_statsBuffer[k]);
    delete _statsBuffer[k];
  });
  void statsRef.set(updates, { merge: true }).catch(() => { });
};

const scheduleFlush = () => {
  if (!_statsFlushTimer) {
    _statsFlushTimer = setTimeout(() => {
      _statsFlushTimer = null;
      flushStatsBuffer();
    }, 30_000); // 30초 배치
  }
};

// HIGH_FREQ_PATHS: logSystemEvent를 샘플링하지 않는 읽기 전용 고빈도 경로
const HIGH_FREQ_PATHS = new Set([
  '/api/v2/user/status',
  '/api/v2/user',
  '/api/v2/user/tickets',
  '/api/storage/summary',
  '/api/v2/storage/summary',
  '/api/v2/discover',
  '/api/v2/ranking',
]);

// API Tracking Middleware
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') && !req.path.startsWith('/api/admin/')) {
    // [V3 Detection] Path based or Logic based (group parameter)
    const isV3Path = req.path.startsWith('/api/v3/');
    const hasV3Param = (req.query && (req.query.group || req.query.v3Group)) ||
      (req.body && (req.body.group || req.body.v3Group));
    const isV3 = isV3Path || hasV3Param;
    req.isV3 = isV3;

    // 카운트를 메모리 버퍼에 누적 (30초마다 Firestore에 일괄 플러시)
    const apiName = req.path.substring(1).replace(/\//g, '_');
    _statsBuffer[`api_call_${apiName}`] = (_statsBuffer[`api_call_${apiName}`] || 0) + 1;
    _statsBuffer['total_api_calls'] = (_statsBuffer['total_api_calls'] || 0) + 1;
    if (isV3) {
      _statsBuffer['v3_total_api_calls'] = (_statsBuffer['v3_total_api_calls'] || 0) + 1;
      _statsBuffer[`v3_api_call_${apiName}`] = (_statsBuffer[`v3_api_call_${apiName}`] || 0) + 1;
    }
    scheduleFlush();
  }

  if (req.path.startsWith('/api/')) {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      const isError = res.statusCode >= 400;
      const isHighFreq = HIGH_FREQ_PATHS.has(req.path);

      // 고빈도 경로는 에러이거나 느린 경우(>2000ms)에만 기록 → Firestore write 대폭 절감
      if (!isHighFreq || isError || duration > 2000) {
        const status = isError ? 'FAIL' : 'SUCCESS';
        void logSystemEvent('API_REQUEST', status, {
          path: req.path,
          method: req.method,
          statusCode: res.statusCode,
          latencyMs: duration,
          ip: req.ip
        });
      }
    });
  }
  next();
});

// Route Mounting
// ==========================================
// 🚀 [V1] Legacy API (호환성 유지 용)
// ==========================================
// ==========================================
// 🚀 [V1] Legacy API (호환성 유지 용 - Unified Logic)
// ==========================================
// ==========================================
// 🚀 [V1 -> V2] Unified API Routing
// ==========================================
// 모든 /api 요청을 V2 라우터로 연결하여 로직 일원화
// (Storage 등은 내부에서 V1/V2 데이터 통합 처리 중)

// 1. Storage: 보관함은 둘 다 보여야 함 (기존 로직 유지)
// 2. Others: V2 로직으로 통합

// Mount v2Router on /api to handle legacy paths (e.g., /api/gacha -> /api/v2/gacha logic)
app.use('/api', v2Router);

// Specific overwrites or fallbacks if needed can go here or before.
// But mostly v2Router covers: /gacha, /discover, /user, /tickets, /promotion, /storage, /toss, /share-image.
// This effectively migrates the backend to use V2 logic for all calls.

// ==========================================
// ✨ [V2] Modern API (최신 기능 및 확장)
// ==========================================
// ==========================================
// ✨ [V2] Modern API (Partitioned by Type)
// ==========================================
app.use('/api/v2', v2Router);

// ==========================================
// ✨ [V3] Conversational AI & Personas
// ==========================================
app.use('/api/v3/chat', chatRouter);
app.use('/api/v3/reward', rewardRouterV3);
app.use('/api/v3/personas', personasRouter);
app.use('/api/v3/shop', shopRouter);
app.use('/api/v3/profile', profileRouterV3);

// ==========================================
// 🛠 [ADMIN & UTILS]
// ==========================================

// [Specific Support] Toss Root Endpoint (mapped via firebase.json rewrites)
app.use('/toss', tossRouter);
app.use('/purchase', tossRouter);

// Special aliases (Legacy Compatibility)
app.get(['/api/personas', '/api/v1/personas'], (req, res, next) => { req.url = '/personas'; next(); }, discoverRouter);
app.get(['/api/situations', '/api/v1/situations', '/api/v3/situations'], (req, res, next) => { req.url = '/situations'; next(); }, discoverRouter);
app.post('/api/interactions/cta', (req, res, next) => {
  req.url = '/interactions/cta';
  next();
}, discoverRouter);
app.post('/api/situations/request', (req, res, next) => {
  req.url = '/situations/request';
  next();
}, discoverRouter);

// Swagger
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSnippet));

// Logging
// Logging
app.post(['/api/log', '/api/log/event'], async (req, res) => {
  const { userId, userKey, action, event, details, extraData } = req.body;
  const finalUserId = userId || userKey;
  const finalAction = action || event;

  if (!finalUserId || !finalAction) {
    return res.status(400).json({ resultType: 'FAIL', error: 'INVALID_LOG_REQUEST', message: 'userKey/userId and action/event are required.' });
  }

  await logUserAction(String(finalUserId), finalAction, { ...(details || {}), ...(extraData || {}) });
  res.json({ resultType: 'SUCCESS' });
});

app.post(['/api/sync', '/api/profile/sync'], (req, res, next) => {
  req.url = '/sync';
  next();
}, userRouter);

// Health Check
app.get(['/health', '/api/health'], async (req, res) => {
  try {
    await firestore.collection('daily_stats').limit(1).get();
    res.json({ resultType: 'SUCCESS', status: 'healthy', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(503).json({ resultType: 'FAIL', status: 'unhealthy' });
  }
});

// Operational preload jobs and cron schedules are omitted from this source showcase.

// ==========================================
// 🏗 Multi-Function Export (Classification)
// ==========================================

const commonOptions = {
  region: 'asia-northeast3',
  memory: '4GiB',
  timeoutSeconds: 300,
  minInstances: 0  // No always-on instance in this source snapshot.
};

// 1. Unified Entry Point
export const api = onRequest(commonOptions, app);

// Removed split v2 functions (v2_gacha, v2_discovery, v2_user_commerce, v2_media) as requested.
// Everything is now handled by 'api' which includes all routers.

// Local
if (process.env.SERVE_LOCALLY === 'true' && process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const PORT = process.env.PORT || 8787;
  app.listen(PORT, '127.0.0.1', () => console.log(`Server running on http://localhost:${PORT}`));
}
