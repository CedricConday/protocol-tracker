import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Print from 'expo-print';
import { getWeekSummary, getDaySummary, getAnchor } from '../db/queries';

const LAST_REPORT_KEY = 'auto_report_last_week';

function isoWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function complianceColor(pct: number): string {
  if (pct >= 80) return '#22c55e';
  if (pct >= 50) return '#eab308';
  return '#ef4444';
}

export async function checkAndGenerateWeeklyReport(): Promise<void> {
  const now = new Date();
  // Only trigger on Sunday (day 0)
  if (now.getDay() !== 0) return;

  const currentWeek = isoWeek(now);
  const lastWeek = await AsyncStorage.getItem(LAST_REPORT_KEY);
  if (lastWeek === currentWeek) return;

  const week = await getWeekSummary();
  if (week.length === 0) return;

  const enriched = await Promise.all(
    week.map(async (d) => {
      const full = await getDaySummary(d.date);
      const anchor = await getAnchor(d.date);
      return { ...d, totalDoses: full.totalDoses, waterMl: anchor?.water_ml ?? 0 };
    }),
  );

  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const todayIdx = ((now.getDay() + 6) % 7);

  const rows = enriched
    .map((d, i) => {
      const dayName = DAYS[(todayIdx - 6 + i + 7) % 7];
      const color = complianceColor(d.compliancePct);
      return `<tr style="border-bottom:1px solid #2a2a2a">
        <td style="padding:8px;color:#fff">${dayName}</td>
        <td style="padding:8px;color:${color}">${d.compliancePct}%</td>
        <td style="padding:8px;color:#fff">${d.totalDoses}</td>
        <td style="padding:8px;color:#fff">${d.waterMl}ml</td>
      </tr>`;
    })
    .join('');

  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 6);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const html = `<html><body style="background:#0d0d0d;padding:24px;font-family:sans-serif">
    <h1 style="color:#22c55e;font-size:18px">the Protocol — Weekly Report</h1>
    <p style="color:#888;font-size:13px">${fmt(weekStart)} — ${fmt(now)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr style="background:#1a1a1a">
        <th style="padding:8px;text-align:left;color:#888">Day</th>
        <th style="padding:8px;text-align:left;color:#888">Compliance</th>
        <th style="padding:8px;text-align:left;color:#888">Doses</th>
        <th style="padding:8px;text-align:left;color:#888">Water</th>
      </tr>
      ${rows}
    </table>
    <p style="color:#555;font-size:11px;margin-top:24px;text-align:center">Generated automatically by the Protocol App</p>
  </body></html>`;

  const { uri } = await Print.printToFileAsync({ html });
  await AsyncStorage.setItem(LAST_REPORT_KEY, currentWeek);
  // Store the generated URI so the user can share it manually via the banner on HomeScreen
  await AsyncStorage.setItem('auto_report_ready_uri', uri);
}
