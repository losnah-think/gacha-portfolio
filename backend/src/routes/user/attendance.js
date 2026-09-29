import express from 'express';
import { firestore, FieldValue } from '../../lib/firebaseAdmin.js';
import { getUserDocRef, getKstDateKey, isActivityLogReadsEnabled } from '../../utils/helpers.js';
import { logSystemEvent } from '../../utils/logger.js';
import { processAttendanceUpdate } from '../../services/userService.js';

const router = express.Router();

/**
 * POST /api/v2/user/attendance (또는 /api/v2/attendance)
 * 오늘 출석 체크 (캘린더 마킹)
 * Body: { userKey }
 */
router.post('/', async (req, res) => {
    const userKey = req.body?.userKey || req.query?.userKey;

    if (!userKey) {
        return res.status(400).json({
            resultType: 'FAIL',
            error: { code: 'MISSING_USER_KEY', message: 'userKey는 필수입니다.' }
        });
    }

    try {
        const userRef = getUserDocRef(userKey);
        const today = getKstDateKey();

        const result = await firestore.runTransaction(async (tx) => {
            const userSnap = await tx.get(userRef);
            if (!userSnap.exists) {
                throw new Error('USER_NOT_FOUND');
            }

            const userData = userSnap.data();
            const attendanceResult = await processAttendanceUpdate(userKey, userData, tx);

            if (!attendanceResult.didAttendToday) {
                return {
                    alreadyChecked: true,
                    consecutiveDays: attendanceResult.consecutiveLoginDays,
                    attendanceCount: attendanceResult.attendanceCount,
                    date: today
                };
            }

            // 유저 문서 업데이트
            tx.update(userRef, attendanceResult.updates);

            // attendance_history 서브컬렉션에 기록 (캘린더용)
            tx.set(userRef.collection('attendance_history').doc(today), {
                date: today,
                checkedAt: FieldValue.serverTimestamp(),
                source: 'MANUAL_CHECKIN'
            });

            return {
                alreadyChecked: false,
                consecutiveDays: attendanceResult.consecutiveLoginDays,
                attendanceCount: attendanceResult.attendanceCount,
                date: today
            };
        });

        if (result.alreadyChecked) {
            return res.json({
                resultType: 'SUCCESS',
                data: {
                    ...result,
                    message: '이미 오늘 출석이 완료되었습니다.'
                }
            });
        }

        void logSystemEvent('ATTENDANCE_MANUAL_CHECKIN', 'SUCCESS', {
            userKey: String(userKey),
            consecutiveDays: result.consecutiveDays,
            attendanceCount: result.attendanceCount,
            date: today
        });

        return res.json({
            resultType: 'SUCCESS',
            data: {
                ...result,
                message: `출석 완료! 연속 ${result.consecutiveDays}일째!`
            }
        });
    } catch (error) {
        if (error.message === 'USER_NOT_FOUND') {
            return res.status(404).json({
                resultType: 'FAIL',
                error: { code: 'USER_NOT_FOUND', message: '사용자를 찾을 수 없습니다.' }
            });
        }
        console.error('[Attendance] POST check-in failed:', error);
        return res.status(500).json({
            resultType: 'FAIL',
            error: { code: 'SERVER_ERROR', message: error.message }
        });
    }
});

const ATTENDANCE_ACTIONS = new Set([
    'DAILY_TICKET_AWARDED',
    'DAILY_TICKET_AUTO_SYNC',
    'DAILY_TICKET_AWARDED_VIA_CHAT'
]);

const toDateKeyFromTimestamp = (timestamp) => {
    try {
        if (!timestamp) return null;
        let dateObj = null;
        if (typeof timestamp.toDate === 'function') {
            dateObj = timestamp.toDate();
        } else {
            const parsed = new Date(timestamp);
            if (!Number.isNaN(parsed.getTime())) dateObj = parsed;
        }
        if (!dateObj) return null;
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Seoul',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).format(dateObj);
    } catch {
        return null;
    }
};

const applyDateFilter = (dates, year, month, months) => {
    if (year && month) {
        const prefix = `${String(year)}-${String(month).padStart(2, '0')}`;
        return dates.filter(d => d.startsWith(prefix));
    }

    const monthsNumber = Number(months);
    if (!months || !Number.isFinite(monthsNumber)) return dates;

    const safeMonths = Math.max(1, Math.min(24, monthsNumber));
    const today = new Date(getKstDateKey());
    const threshold = new Date(today);
    threshold.setMonth(threshold.getMonth() - safeMonths + 1);
    const thresholdKey = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(threshold);

    return dates.filter(d => d >= thresholdKey);
};

router.get('/history', async (req, res) => {
    const userKey = req.query.userKey || req.query.userkey;
    const { year, month, months } = req.query;
    const debugMode = req.query.debug === '1' || req.query.trace === '1';
    const clientContext = {
        platform: req.query.platform || req.headers['x-platform'] || 'unknown',
        appVersion: req.query.appVersion || req.headers['x-app-version'] || 'unknown',
        clientVersion: req.query.clientVersion || req.headers['x-client-version'] || 'unknown',
        screen: req.query.screen || req.headers['x-screen'] || 'unknown'
    };

    if (!userKey) {
        return res.status(400).json({ resultType: 'FAIL', error: 'MISSING_USER_KEY' });
    }

    try {
        const userRef = getUserDocRef(userKey);
        const userSnap = await userRef.get();
        const userData = userSnap.exists ? userSnap.data() : {};

        const attendanceDates = new Set();

        // 1) Primary source: attendance history subcollection
        try {
            const historySnap = await userRef.collection('attendance_history').limit(2000).get();
            historySnap.forEach(doc => {
                const data = doc.data() || {};
                const dateKey = data.date || doc.id;
                if (typeof dateKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
                    attendanceDates.add(dateKey);
                }
            });
        } catch (e) {
            console.warn('[Attendance] attendance_history read failed:', e.message);
        }

        // 2) Fallback source: user activity logs (legacy data recovery)
        //    [Optimized] attendance_history에 충분한 데이터(30일+)가 있으면 skip
        //    → 매 요청당 4,000 reads 절약
        if (attendanceDates.size < 30 && isActivityLogReadsEnabled()) {
            try {
                let logsSnap;
                try {
                    logsSnap = await firestore.collection('user_activity_logs')
                        .where('userKey', '==', String(userKey))
                        .where('action', 'in', Array.from(ATTENDANCE_ACTIONS))
                        .limit(4000)
                        .get();
                } catch {
                    logsSnap = await firestore.collection('user_activity_logs')
                        .where('userKey', '==', String(userKey))
                        .limit(4000)
                        .get();
                }

                logsSnap.forEach(doc => {
                    const data = doc.data() || {};
                    if (!ATTENDANCE_ACTIONS.has(data.action)) return;

                    const dateFromField = typeof data.date === 'string' ? data.date : null;
                    const dateFromTs = toDateKeyFromTimestamp(data.timestamp);
                    const dateKey = dateFromField || dateFromTs;

                    if (dateKey && /^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
                        attendanceDates.add(dateKey);
                    }
                });
            } catch (e) {
                console.warn('[Attendance] user_activity_logs read failed:', e.message);
            }
        }

        // 3) Last-login safety fallback
        if (typeof userData.lastLoginDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(userData.lastLoginDate)) {
            attendanceDates.add(userData.lastLoginDate);
        }

        let dateList = Array.from(attendanceDates).sort();
        dateList = applyDateFilter(dateList, year, month, months);

        const shouldTrace = debugMode;
        if (shouldTrace) {
            void logSystemEvent('ATTENDANCE_HISTORY_TRACE', 'SUCCESS', {
                userKey: String(userKey),
                count: dateList.length,
                firstDate: dateList[0] || null,
                lastDate: dateList[dateList.length - 1] || null,
                year: year || null,
                month: month || null,
                months: months || null,
                consecutiveDays: Number(userData.consecutiveLoginDays || 0),
                ...clientContext
            });
        }

        return res.json({
            resultType: 'SUCCESS',
            data: {
                attendanceDates: dateList,
                consecutiveDays: Number(userData.consecutiveLoginDays || 0)
            }
        });
    } catch (error) {
        console.error('[Attendance] history failed:', error);
        return res.status(500).json({ resultType: 'FAIL', error: 'ATTENDANCE_HISTORY_FAILED' });
    }
});

export default router;
