import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useWeather, aqiLabel } from '../hooks/useWeather';
import SkeletonCard from './SkeletonCard';
import { C, space, radius, text as T } from '../theme';

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
  if (uv <= 2) return 'Low';
  if (uv <= 5) return 'Moderate';
  if (uv <= 7) return 'High';
  if (uv <= 10) return 'Very high';
  return 'Extreme';
}

function protocolInsight(temp: number, uv: number, peakStart: string | null, peakEnd: string | null): string {
  if (temp >= 25) return `Heat alert · ${temp}°C — plan activity for early morning or evening.`;
  if (uv >= 3 && peakStart && peakEnd) return `Sun window ${peakStart}–${peakEnd} — good time for exposure.`;
  if (uv < 3) return 'UV too low for synthesis today — your supplement covers it.';
  return `UV ${uv} · ${uvLabel(uv)} today.`;
}

function WeatherCard() {
  const { weather, loading, error } = useWeather();

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

const styles = StyleSheet.create({
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
});
