import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, RefreshCw, Wind, Droplets } from 'lucide-react';
import { useWeather, getWeatherInfo } from '../../../hooks/useWeather';

interface WeatherCardProps {
  compact?: boolean;
  /** 풀 컬러 배경 위에서 사용 시 true — 텍스트를 흰색으로 전환 */
  onDark?: boolean;
}

export const WeatherCard = ({ compact = false, onDark = false }: WeatherCardProps) => {
  const { status, data, error, requestWeather } = useWeather();

  const weather = data ? getWeatherInfo(data.weatherCode) : null;

  // 색상 유틸
  const txt = onDark ? 'text-white' : 'text-toss-gray-800';
  const txtSub = onDark ? 'text-white/60' : 'text-toss-gray-400';
  const txtTemp = onDark ? 'text-white' : 'text-toss-gray-900';
  const txtTempUnit = onDark ? 'text-white/50' : 'text-toss-gray-400';
  const txtFeels = onDark ? 'text-white/60' : 'text-toss-gray-500';
  const txtDetail = onDark ? 'text-white/70' : 'text-toss-gray-500';
  const iconBg = onDark ? 'bg-white/15' : 'bg-sky-50';
  const iconColor = onDark ? 'text-white/80' : 'text-sky-500';
  const btnBg = onDark ? 'bg-white/15 active:bg-white/25' : 'bg-sky-50 active:bg-sky-100';
  const btnText = onDark ? 'text-white/90' : 'text-sky-600';
  const refreshColor = onDark ? 'text-white/50' : 'text-toss-gray-400';
  const refreshSpin = onDark ? 'text-white/40' : 'text-sky-400';
  const loadingText = onDark ? 'text-white/50' : 'text-toss-gray-400';
  const retryText = onDark ? 'text-white font-bold' : 'text-sky-500 font-bold';
  const detailIcon = onDark ? 'text-white/50' : 'text-sky-400';
  const cityIcon = onDark ? 'text-white/30' : 'text-toss-gray-300';
  const cityText = onDark ? 'text-white/40' : 'text-toss-gray-400';
  const errorText = onDark ? 'text-white/60' : 'text-toss-gray-400';

  return (
    <div className={compact ? 'min-w-0' : 'rounded-[24px] border border-toss-gray-100 bg-white p-5 shadow-[0_2px_16px_rgba(0,0,0,0.04)]'}>
      <div className={`flex items-center justify-between ${compact ? 'mb-2' : 'mb-3'}`}>
        <div className="flex items-center gap-2">
          <div className={`flex items-center justify-center rounded-xl ${iconBg} ${compact ? 'h-6 w-6' : 'h-7 w-7'}`}>
            <MapPin size={13} className={iconColor} />
          </div>
          <p className={`${compact ? 'text-[12px]' : 'text-[13px]'} font-extrabold ${txt}`}>지금 날씨</p>
        </div>
        {(status === 'success' || status === 'error' || status === 'denied') && (
          <button
            onClick={requestWeather}
            className={`flex h-7 w-7 items-center justify-center rounded-full ${onDark ? 'hover:bg-white/10' : 'hover:bg-toss-gray-50'} active:scale-95 transition-all`}
            aria-label="날씨 새로고침"
          >
            <RefreshCw size={13} className={refreshColor} />
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {/* 초기 상태 — 버튼 노출 */}
        {status === 'idle' && (
          <motion.button
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={requestWeather}
            className={`w-full flex items-center justify-center gap-2 rounded-2xl ${btnBg} transition-colors ${compact ? 'py-2.5' : 'py-3'}`}
          >
            <MapPin size={14} className={iconColor} />
            <span className={`${compact ? 'text-[12px]' : 'text-[13px]'} font-bold ${btnText}`}>내 위치 날씨를 확인해요</span>
          </motion.button>
        )}

        {/* 로딩 상태 */}
        {(status === 'locating' || status === 'loading') && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`flex items-center justify-center gap-2 ${compact ? 'py-2.5' : 'py-3'}`}
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            >
              <RefreshCw size={15} className={refreshSpin} />
            </motion.div>
            <span className={`${compact ? 'text-[12px]' : 'text-[13px]'} font-medium ${loadingText}`}>
              {status === 'locating' ? '위치를 확인하고 있어요' : '날씨를 불러오고 있어요'}
            </span>
          </motion.div>
        )}

        {/* 성공 상태 */}
        {status === 'success' && data && weather && (
          <motion.div
            key="success"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className={`flex items-center ${compact ? 'gap-3' : 'gap-4'}`}>
              {/* 날씨 아이콘 + 온도 */}
              <div className={`flex items-center flex-1 min-w-0 ${compact ? 'gap-2.5' : 'gap-3'}`}>
                <span className={`${compact ? 'text-[30px]' : 'text-[38px]'} leading-none select-none`}>{weather.emoji}</span>
                <div className="min-w-0">
                  <div className="flex items-end gap-1">
                    <span className={`${compact ? 'text-[24px]' : 'text-[32px]'} font-extrabold leading-none ${txtTemp}`}>
                      {data.temperature}
                    </span>
                    <span className={`${compact ? 'text-[13px] pb-0.5' : 'text-[16px] pb-1'} font-bold ${txtTempUnit}`}>°C</span>
                  </div>
                  <p className={`${compact ? 'text-[11px]' : 'text-[12px]'} ${txtFeels} mt-0.5`}>
                    체감 {data.apparentTemperature}°C · {weather.label}
                  </p>
                </div>
              </div>

              {/* 상세 정보 */}
              <div className={`flex flex-col flex-shrink-0 ${compact ? 'gap-1' : 'gap-1.5'}`}>
                <div className="flex items-center gap-1.5">
                  <Droplets size={11} className={detailIcon} />
                  <span className={`text-[11px] ${txtDetail}`}>{data.humidity}%</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Wind size={11} className={detailIcon} />
                  <span className={`text-[11px] ${txtDetail}`}>{data.windSpeed}m/s</span>
                </div>
              </div>
            </div>

            {/* 위치명 */}
            {data.city && (
              <div className={`flex items-center gap-1 ${compact ? 'mt-2' : 'mt-2.5'}`}>
                <MapPin size={10} className={cityIcon} />
                <span className={`text-[11px] ${cityText}`}>{data.city}</span>
              </div>
            )}
          </motion.div>
        )}

        {/* 권한 거부 */}
        {status === 'denied' && (
          <motion.div
            key="denied"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`flex flex-col items-center gap-2 ${compact ? 'py-1' : 'py-2'}`}
          >
            <span className="text-[22px]">🔒</span>
            <p className={`text-[12px] ${txtSub} text-center`}>
              위치 권한을 허용하면 날씨를 볼 수 있어요
            </p>
            <button
              onClick={requestWeather}
              className={`mt-1 text-[12px] ${retryText} active:opacity-70`}
            >
              다시 시도해요
            </button>
          </motion.div>
        )}

        {/* 에러 */}
        {status === 'error' && (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-between py-1"
          >
            <span className={`text-[12px] ${errorText}`}>{error}</span>
            <button
              onClick={requestWeather}
              className={`text-[12px] ${retryText} active:opacity-70`}
            >
              다시 시도해요
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
