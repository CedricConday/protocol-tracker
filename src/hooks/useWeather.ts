import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

const CACHE_KEY = 'weather_cache';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface WeatherData {
  temp: number;
  feelsLike: number;
  weatherCode: number;
  uvIndex: number;
  uvPeakStart: string | null;
  uvPeakEnd: string | null;
  aqi: number | null;
  fetchedAt: number;
}

function aqiLabel(aqi: number | null): string {
  if (aqi === null) return 'Unknown';
  if (aqi <= 20) return 'Good';
  if (aqi <= 40) return 'Fair';
  if (aqi <= 60) return 'Moderate';
  if (aqi <= 80) return 'Poor';
  return 'Very Poor';
}

function uvPeakWindow(hours: number[]): { start: string | null; end: string | null } {
  // hours[0..23] = UV index per hour starting at midnight
  const goodHours = hours
    .map((uv, h) => ({ h, uv }))
    .filter(({ uv }) => uv >= 3);
  if (!goodHours.length) return { start: null, end: null };
  const fmt = (h: number) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;
  return {
    start: fmt(goodHours[0].h),
    end: fmt(goodHours[goodHours.length - 1].h + 1),
  };
}

function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function fetchWeather(lat: number, lon: number): Promise<WeatherData> {
  const [weatherRes, aqiRes] = await Promise.all([
    fetchWithTimeout(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,apparent_temperature,weather_code,uv_index` +
      `&hourly=uv_index&timezone=auto&forecast_days=1`,
      8000
    ),
    fetchWithTimeout(
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
      `&current=european_aqi`,
      8000
    ).catch(() => null),
  ]);

  const weather = await weatherRes.json();
  const aqi = aqiRes ? await aqiRes.json().catch(() => null) : null;

  const hourlyUV: number[] = weather.hourly?.uv_index ?? [];
  const { start, end } = uvPeakWindow(hourlyUV);

  return {
    temp: Math.round(weather.current.temperature_2m),
    feelsLike: Math.round(weather.current.apparent_temperature),
    weatherCode: weather.current.weather_code,
    uvIndex: Math.round(weather.current.uv_index),
    uvPeakStart: start,
    uvPeakEnd: end,
    aqi: aqi?.current?.european_aqi ?? null,
    fetchedAt: Date.now(),
  };
}

export function useWeather() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // serve cache if fresh
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed: WeatherData = JSON.parse(cached);
          if (Date.now() - parsed.fetchedAt < CACHE_TTL_MS) {
            if (!cancelled) { setWeather(parsed); setLoading(false); }
            return;
          }
        }

        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (!cancelled) { setError('location_denied'); setLoading(false); }
          return;
        }

        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const data = await fetchWeather(loc.coords.latitude, loc.coords.longitude);
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data));
        if (!cancelled) { setWeather(data); setLoading(false); }
      } catch {
        if (!cancelled) { setError('fetch_failed'); setLoading(false); }
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return { weather, loading, error, aqiLabel };
}

export { aqiLabel };
