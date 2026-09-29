import { useState, useEffect, useCallback } from 'react';
import { getCurrentLocation } from '@apps-in-toss/web-framework';
import { Accuracy } from '@apps-in-toss/types';

export interface WeatherData {
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  weatherCode: number;
  windSpeed: number;
  city?: string;
}

export type WeatherStatus = 'idle' | 'locating' | 'loading' | 'success' | 'denied' | 'error';

export interface WeatherState {
  status: WeatherStatus;
  data: WeatherData | null;
  error?: string;
}

// WMO Weather Interpretation Codes
// https://open-meteo.com/en/docs#weathervariables
export function getWeatherInfo(code: number): { label: string; emoji: string } {
  if (code === 0) return { label: '맑음', emoji: '☀️' };
  if (code === 1) return { label: '대체로 맑음', emoji: '🌤️' };
  if (code === 2) return { label: '구름 조금', emoji: '⛅' };
  if (code === 3) return { label: '흐림', emoji: '☁️' };
  if (code === 45 || code === 48) return { label: '안개', emoji: '🌫️' };
  if (code >= 51 && code <= 55) return { label: '이슬비', emoji: '🌦️' };
  if (code >= 56 && code <= 57) return { label: '어는 이슬비', emoji: '🌨️' };
  if (code >= 61 && code <= 65) return { label: '비', emoji: '🌧️' };
  if (code >= 66 && code <= 67) return { label: '어는 비', emoji: '🌨️' };
  if (code >= 71 && code <= 77) return { label: '눈', emoji: '❄️' };
  if (code >= 80 && code <= 82) return { label: '소나기', emoji: '🌧️' };
  if (code >= 85 && code <= 86) return { label: '눈소나기', emoji: '🌨️' };
  if (code === 95) return { label: '천둥번개', emoji: '⛈️' };
  if (code >= 96 && code <= 99) return { label: '우박 동반 천둥', emoji: '⛈️' };
  return { label: '알 수 없음', emoji: '🌡️' };
}

async function reverseGeocode(lat: number, lon: number): Promise<string | undefined> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=ko`,
      { headers: { 'Accept-Language': 'ko' } }
    );
    if (!res.ok) return undefined;
    const json = await res.json() as {
      address?: {
        city?: string;
        town?: string;
        village?: string;
        county?: string;
        state?: string;
      };
    };
    const addr = json.address;
    return addr?.city ?? addr?.town ?? addr?.village ?? addr?.county ?? addr?.state;
  } catch {
    return undefined;
  }
}

async function fetchWeather(lat: number, lon: number): Promise<WeatherData> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('current', 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m');
  url.searchParams.set('wind_speed_unit', 'ms');
  url.searchParams.set('timezone', 'auto');

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Weather API error: ${res.status}`);

  const json = await res.json() as {
    current: {
      temperature_2m: number;
      apparent_temperature: number;
      relative_humidity_2m: number;
      weather_code: number;
      wind_speed_10m: number;
    };
  };

  const c = json.current;
  const [city] = await Promise.all([reverseGeocode(lat, lon)]);

  return {
    temperature: Math.round(c.temperature_2m),
    apparentTemperature: Math.round(c.apparent_temperature),
    humidity: c.relative_humidity_2m,
    weatherCode: c.weather_code,
    windSpeed: Math.round(c.wind_speed_10m * 10) / 10,
    city,
  };
}

export function useWeather() {
  const [state, setState] = useState<WeatherState>({ status: 'idle', data: null });

  const requestWeather = useCallback(() => {
    setState({ status: 'locating', data: null });

    (async () => {
      try {
        const permission = await getCurrentLocation.getPermission();
        if (permission === 'denied') {
          setState({ status: 'denied', data: null, error: '위치 권한이 필요해요' });
          return;
        }
        if (permission === 'notDetermined') {
          const result = await getCurrentLocation.openPermissionDialog();
          if (result === 'denied') {
            setState({ status: 'denied', data: null, error: '위치 권한이 필요해요' });
            return;
          }
        }

        const location = await getCurrentLocation({ accuracy: Accuracy.Balanced });
        const { latitude, longitude } = location.coords;
        setState(prev => ({ ...prev, status: 'loading' }));
        const data = await fetchWeather(latitude, longitude);
        setState({ status: 'success', data });
      } catch {
        setState({ status: 'error', data: null, error: '위치를 가져올 수 없어요' });
      }
    })();
  }, []);

  // 성공 후 5분마다 자동 갱신
  useEffect(() => {
    if (state.status !== 'success' || !state.data) return;
    const timer = setInterval(requestWeather, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [state.status, requestWeather]);

  return { ...state, requestWeather };
}
