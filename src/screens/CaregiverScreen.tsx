import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getDaySummary, getStreak } from '../db/queries';

const MOOD_OPTIONS = [
  { emoji: '😄', label: 'Great', score: 5 },
  { emoji: '🙂', label: 'Good', score: 4 },
  { emoji: '😐', label: 'Okay', score: 3 },
  { emoji: '😔', label: 'Hard', score: 2 },
  { emoji: '😞', label: 'Burned out', score: 1 },
];

const SYNC_KEY = 'caregiver_last_sync';
const CAREGIVER_MOOD_KEY = 'caregiver_mood_today';

export default function CaregiverScreen() {
  const [selectedMood, setSelectedMood] = useState<number | null>(null);
  const [moodSaved, setMoodSaved] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [patientCompliance, setPatientCompliance] = useState(0);
  const [streak, setStreak] = useState(0);
  const [showNudge, setShowNudge] = useState(false);
  const [sharingApproved, setSharingApproved] = useState(false);

  useEffect(() => {
    (async () => {
      const summary = await getDaySummary();
      setPatientCompliance(summary.compliancePct);
      const s = await getStreak();
      setStreak(s);
      const sync = await AsyncStorage.getItem(SYNC_KEY);
      setLastSync(sync);
      const todayMood = await AsyncStorage.getItem(CAREGIVER_MOOD_KEY + '_' + new Date().toISOString().split('T')[0]);
      if (todayMood) setSelectedMood(parseInt(todayMood, 10));

      const share = await AsyncStorage.getItem('info_share_approved');
      setSharingApproved(share === '1');

      // Only show nudge and schedule notifications if patient approved sharing
      if (share === '1') {
        if (sync) {
          const daysSince = Math.floor((Date.now() - new Date(sync).getTime()) / 86_400_000);
          if (daysSince >= 3) setShowNudge(true);
        } else {
          setShowNudge(true);
        }

        // Schedule a daily compliance summary notification for caregiver
        const lastNotif = await AsyncStorage.getItem('caregiver_daily_notif_date');
        const today = new Date().toISOString().split('T')[0];
        if (lastNotif !== today) {
          const compliance = summary.compliancePct;
          await Notifications.scheduleNotificationAsync({
            content: {
              title: 'Patient Daily Update',
              body: `Today's compliance: ${compliance}%${compliance < 80 ? ' — consider checking in.' : ' — great day!'}`,
            },
            trigger: null, // fire immediately
          });
          await AsyncStorage.setItem('caregiver_daily_notif_date', today);
        }
      }
    })();
  }, []);

  const handleSaveMood = async (score: number) => {
    setSelectedMood(score);
    const today = new Date().toISOString().split('T')[0];
    await AsyncStorage.setItem(CAREGIVER_MOOD_KEY + '_' + today, String(score));
    setMoodSaved(true);
    setTimeout(() => setMoodSaved(false), 2000);
  };

  const handleSync = async () => {
    const today = new Date().toISOString().split('T')[0];
    await AsyncStorage.setItem(SYNC_KEY, today);
    setLastSync(today);
    setShowNudge(false);
    Alert.alert('Synced', 'Your check-in has been recorded. Thank you for supporting your care partner.');
  };

  const caregiverMoodScore = selectedMood ?? 0;
  const complianceColor = patientCompliance >= 80 ? '#C96A50' : patientCompliance >= 50 ? '#eab308' : '#ef4444';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.heading}>Caregiver Mode</Text>
      <Text style={styles.sub}>Supporting someone on the Coimbra Protocol</Text>

      {/* Sharing approval status */}
      <View style={[styles.sharingBanner, sharingApproved ? styles.sharingOn : styles.sharingOff]}>
        <Text style={styles.sharingText}>
          {sharingApproved
            ? '✓ Patient has approved caregiver notifications'
            : '⚠ Waiting for patient approval — ask them to enable sharing in Settings'}
        </Text>
      </View>

      {/* Task 34: Dyad sync nudge */}
      {showNudge ? (
        <View style={styles.nudgeCard}>
          <Text style={styles.nudgeTitle}>Time to Check In</Text>
          <Text style={styles.nudgeText}>
            {lastSync
              ? `Your last dyad check-in was ${lastSync}. Regular check-ins help both patient and caregiver stay aligned.`
              : 'You haven\'t done a dyad check-in yet. Connecting regularly supports protocol adherence.'}
          </Text>
          <TouchableOpacity style={styles.syncBtn} onPress={handleSync} activeOpacity={0.8}>
            <Text style={styles.syncBtnText}>Confirm Check-In</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Patient status card */}
      <View style={styles.patientCard}>
        <Text style={styles.cardLabel}>PATIENT STATUS TODAY</Text>
        <View style={styles.metricsRow}>
          <View style={styles.metric}>
            <Text style={[styles.metricValue, { color: complianceColor }]}>{patientCompliance}%</Text>
            <Text style={styles.metricLabel}>Compliance</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{streak}d</Text>
            <Text style={styles.metricLabel}>Streak</Text>
          </View>
        </View>
        <Text style={styles.patientNote}>
          {patientCompliance >= 80
            ? 'Great day. Protocol adherence is on track.'
            : patientCompliance >= 50
              ? 'Some doses missed today. Consider a gentle reminder.'
              : 'Low compliance today. Check in with your care partner.'}
        </Text>
      </View>

      {/* Task 35: Caregiver wellness mood check-in */}
      <Text style={styles.sectionTitle}>YOUR WELLBEING TODAY</Text>
      <Text style={styles.sectionSub}>Caregiving is demanding. Your wellbeing matters too.</Text>
      <View style={styles.moodRow}>
        {MOOD_OPTIONS.map((m) => (
          <TouchableOpacity
            key={m.score}
            style={[styles.moodBtn, selectedMood === m.score ? styles.moodBtnActive : null]}
            onPress={() => handleSaveMood(m.score)}
            activeOpacity={0.7}
          >
            <Text style={styles.moodEmoji}>{m.emoji}</Text>
            <Text style={[styles.moodLabel, selectedMood === m.score ? styles.moodLabelActive : null]}>{m.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {moodSaved ? (
        <Text style={styles.savedText}>Mood saved ✓</Text>
      ) : null}

      {caregiverMoodScore > 0 && caregiverMoodScore <= 2 ? (
        <View style={styles.burnoutCard}>
          <Text style={styles.burnoutTitle}>Caregiver Support</Text>
          <Text style={styles.burnoutText}>
            It looks like today has been hard. Caregiver burnout is real and common. Consider taking a short break, asking for support, or speaking with your doctor about caregiver resources.
          </Text>
        </View>
      ) : null}

      {/* Tips */}
      <Text style={styles.sectionTitle}>CAREGIVER TIPS</Text>
      {[
        'Set a shared reminder time — consistency reduces daily friction for both of you.',
        'Prepare supplements in advance for the week. Blister packs reduce missed doses.',
        'Keep a note of any side effects to share with the neurologist at the next visit.',
        'Your emotional health is part of the protocol too. Rest is not optional.',
      ].map((tip, i) => (
        <View key={i} style={styles.tipCard}>
          <Text style={styles.tipText}>{tip}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAF7F4' },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  heading: { color: '#FAF7F4', fontSize: 24, fontWeight: '800', marginBottom: 6 },
  sub: { color: '#7A6A62', fontSize: 14, marginBottom: 12 },
  sharingBanner: { borderRadius: 10, padding: 12, marginBottom: 20 },
  sharingOn: { backgroundColor: '#0d1a0d', borderLeftWidth: 3, borderLeftColor: '#C96A50' },
  sharingOff: { backgroundColor: '#1a1a00', borderLeftWidth: 3, borderLeftColor: '#eab308' },
  sharingText: { color: '#aaaaaa', fontSize: 13, lineHeight: 18 },
  nudgeCard: { backgroundColor: '#1a1000', borderRadius: 14, padding: 16, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: '#eab308' },
  nudgeTitle: { color: '#eab308', fontSize: 14, fontWeight: '800', marginBottom: 6 },
  nudgeText: { color: '#aaaaaa', fontSize: 13, lineHeight: 20, marginBottom: 12 },
  syncBtn: { backgroundColor: '#eab308', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  syncBtnText: { color: '#FAF7F4', fontSize: 13, fontWeight: '800' },
  patientCard: { backgroundColor: '#F2EDE8', borderRadius: 14, padding: 18, marginBottom: 20 },
  cardLabel: { color: '#7A6A62', fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: 14 },
  metricsRow: { flexDirection: 'row', gap: 24, marginBottom: 12 },
  metric: { alignItems: 'center' },
  metricValue: { color: '#FAF7F4', fontSize: 28, fontWeight: '800' },
  metricLabel: { color: '#7A6A62', fontSize: 12, fontWeight: '600', marginTop: 4 },
  patientNote: { color: '#7A6A62', fontSize: 13, lineHeight: 18 },
  sectionTitle: { color: '#7A6A62', fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: 8, marginTop: 8 },
  sectionSub: { color: '#B0A098', fontSize: 12, marginBottom: 12 },
  moodRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  moodBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#E8E0D8', marginHorizontal: 3 },
  moodBtnActive: { borderColor: '#C96A50', backgroundColor: '#FBF0ED' },
  moodEmoji: { fontSize: 20 },
  moodLabel: { color: '#7A6A62', fontSize: 10, marginTop: 4, fontWeight: '600' },
  moodLabelActive: { color: '#C96A50' },
  savedText: { color: '#C96A50', fontSize: 13, fontWeight: '700', textAlign: 'center', marginBottom: 12 },
  burnoutCard: { backgroundColor: '#1a0d00', borderRadius: 12, padding: 14, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: '#ef4444' },
  burnoutTitle: { color: '#ef4444', fontSize: 13, fontWeight: '800', marginBottom: 6 },
  burnoutText: { color: '#aaaaaa', fontSize: 13, lineHeight: 20 },
  tipCard: { backgroundColor: '#F2EDE8', borderRadius: 10, padding: 12, marginBottom: 8 },
  tipText: { color: '#7A6A62', fontSize: 13, lineHeight: 20 },
});
