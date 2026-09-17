import { memo, useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useWeather, aqiLabel } from '../hooks/useWeather';
import { getWeatherEnabled } from '../db/queries';
import SkeletonCard from './SkeletonCard';
import { C, space, radius, text as T, themed, useTheme } from '../theme';
import { t, useLanguage } from '../i18n';

function weatherEmoji(code: number): string {
  if (code === 0) return '☀️';
  if (code <= 3) return '⛅';
  if (code <= 48) return '🌫️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '❄️';
  if (code <= 82) return '🌦️';
  return '⛈️';
}

function uvLabel(uv: number): string {
  if (uv <= 2) return t('uvLow');
  if (uv <= 5) return t('uvModerate');
  if (uv <= 7) return t('uvHigh');
  if (uv <= 10) return t('uvVeryHigh');
  return t('uvExtreme');
}

function protocolInsight(temp: number, uv: number, peakStart: string | null, peakEnd: string | null): string {
  if (temp >= 25) return t('wxHeatAlert', { temp });
  if (uv >= 3 && peakStart && peakEnd) return t('wxSunWindow', { start: peakStart, end: peakEnd });
  if (uv < 3) return t('wxUvTooLow');
  return t('wxUvToday', { uv, label: uvLabel(uv) });
}

function WeatherCard() {
  useLanguage(); // re-render this card when the language changes
  useTheme(); // ...and when the theme tier changes
  // `null` = not read yet. Render nothing until we know, so the card cannot
  // flash on for a user who turned it off.
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    getWeatherEnabled().then((v) => { if (!cancelled) setEnabled(v); }).catch(() => { if (!cancelled) setEnabled(true); });
    return () => { cancelled = true; };
  }, []));

  const { weather, loading, error } = useWeather(enabled === true);

  if (enabled !== true) return null;

  if (loading) {
    return <SkeletonCard height={96} borderRadius={radius.lg} />;
  }

  if (error || !weather) return null;

  const insight = protocolInsight(weather.temp, weather.uvIndex, weather.uvPeakStart, weather.uvPeakEnd);
  const aqi = weather.aqi !== null ? aqiLabel(weather.aqi) : null;

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.emoji}>{weatherEmoji(weather.weatherCode)}</Text>
        <View style={styles.tempBlock}>
          <Text style={styles.temp}>{weather.temp}°</Text>
          <Text style={styles.feelsLike}>feels {weather.feelsLike}°</Text>
        </View>
        <View style={styles.rightBlock}>
          <Text style={styles.uvRow}>UV {weather.uvIndex} · {uvLabel(weather.uvIndex)}</Text>
          {aqi ? <Text style={styles.aqiRow}>Air · {aqi}</Text> : null}
        </View>
      </View>
      <Text style={styles.insight}>{insight}</Text>
    </View>
  );
}

export default memo(WeatherCard);

const styles = themed((C) => StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    borderRadius: radius.lg,
    padding: space.md,
    marginBottom: space.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: space.sm,
    gap: space.md,
  },
  emoji:      { fontSize: 30 },
  tempBlock:  { flex: 1 },
  temp:       { ...T.heading, color: C.text },
  feelsLike:  { ...T.small, color: C.textMuted, marginTop: 1 },
  rightBlock: { alignItems: 'flex-end', gap: 2 },
  uvRow:      { ...T.small, color: C.text, fontWeight: '700' },
  aqiRow:     { ...T.small, color: C.textSub },
  insight:    { ...T.small, color: C.textSub, paddingTop: space.sm },
}));
