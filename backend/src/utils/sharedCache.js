import { firestore } from '../lib/firebaseAdmin.js';

/**
 * 🔄 공유 인메모리 캐시 모듈
 * 
 * personas, situations 같은 거의 변하지 않는 컬렉션을 한 번만 읽고
 * 모든 서비스에서 재사용. chatService, personalizedRecommendationService,
 * bootstrap 등에서 동일 데이터를 중복 읽기하는 것을 방지.
 * 
 * 절감 효과: ~75K ~ 120K reads/일 (DAU 4,500 기준)
 */

const CACHE_TTL_MS = 5 * 60 * 1000; // 5분

// ─── personas 캐시 ───
let _personasMap = null;      // { [docId]: docData }
let _personasArray = null;    // [{ id, ...data }]
let _personasCacheAt = 0;

// ─── situations 캐시 ───
let _situationsArray = null;
let _situationsCacheAt = 0;

/**
 * personas Map 반환 (docId → data)
 * chatService의 개별 persona doc 읽기를 캐시로 대체
 */
export async function getCachedPersonasMap() {
    const now = Date.now();
    if (_personasMap && now - _personasCacheAt < CACHE_TTL_MS) {
        return _personasMap;
    }
    const snap = await firestore.collection('personas').get();
    const map = {};
    snap.forEach(doc => {
        map[doc.id] = doc.data();
    });
    _personasMap = map;
    _personasArray = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    _personasCacheAt = now;
    return _personasMap;
}

/**
 * personas Array 반환 (active만 필터)
 * getChatPersonas, getRecommendedPersonas 등에서 사용
 */
export async function getCachedPersonasArray(activeOnly = true) {
    await getCachedPersonasMap(); // 캐시 보장
    if (activeOnly) {
        return _personasArray.filter(p => p.isActive !== false);
    }
    return _personasArray;
}

/**
 * 단일 persona 데이터 반환 (캐시에서)
 * firestore.collection('personas').doc(id).get() 대체
 */
export async function getCachedPersona(personaId) {
    const map = await getCachedPersonasMap();
    return map[personaId] || null;
}

/**
 * situations Array 반환 (active만)
 */
export async function getCachedSituations() {
    const now = Date.now();
    if (_situationsArray && now - _situationsCacheAt < CACHE_TTL_MS) {
        return _situationsArray;
    }
    const snap = await firestore.collection('situations').where('isActive', '!=', false).get();
    _situationsArray = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    _situationsCacheAt = now;
    return _situationsArray;
}

/**
 * 캐시 강제 무효화 (admin에서 personas/situations 수정 시 호출)
 */
export function invalidateSharedCache() {
    _personasMap = null;
    _personasArray = null;
    _personasCacheAt = 0;
    _situationsArray = null;
    _situationsCacheAt = 0;
}
