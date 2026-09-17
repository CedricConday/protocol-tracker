import NetInfo from '@react-native-community/netinfo';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getDb } from '../db/schema';
import EmptyState from '../components/EmptyState';
import { t, useLanguage, locale } from '../i18n';
import { useToday } from '../hooks/useToday';
import { todayStr } from '../db/queries';

interface MriScan {
  id: number;
  date: string;
  facility: string;
  scan_type: string;
  contrast: number;
  new_lesions: string;
  enhancing_lesions: number | null;
  overall_assessment: string;
  notes: string;
}

// Values, not words: `mri_scans.scan_type` and `.overall_assessment` keep the
// English ids, so a scan logged in German still reads in English and back.
const SCAN_TYPES: { value: string; key: string }[] = [
  { value: 'Brain', key: 'mriBrain' },
  { value: 'Spine', key: 'mriSpine' },
  { value: 'Brain + Spine', key: 'mriBrainSpine' },
];
const ASSESSMENTS: { value: string; key: string }[] = [
  { value: 'Stable', key: 'mriStable' },
  { value: 'Improved', key: 'mriImproved' },
  { value: 'Progressed', key: 'mriProgressed' },
];

function scanTypeLabel(stored: string): string {
  const known = SCAN_TYPES.find((s) => s.value === stored);
  return known ? t(known.key) : stored;
}

function assessmentLabel(stored: string): string {
  const known = ASSESSMENTS.find((a) => a.value.toLowerCase() === stored.toLowerCase());
  return known ? t(known.key) : stored;
}

function formatDate(d: string) {
  // The locale's own order and separators rather than a hardcoded American one.
  return new Date(d + 'T00:00:00').toLocaleDateString(locale(), {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function daysSince(d: string): number {
  return Math.floor((Date.now() - new Date(d + 'T00:00:00').getTime()) / 86400000);
}

// expo-secure-store has no web implementation: the module's default export has
// no `getValueWithKeyAsync`, so every call throws there and the rejection
// escapes as an uncaught error — the audit sees it on day 3, from Settings.
// `await` sits INSIDE the try on purpose; returning a promise from a try block
// does not bring that promise's rejection into the catch. Same stance as
// `syncClient.getPatientJwt`.
export default function MriScreen() {
  useLanguage(); // re-render this screen when the language changes
  const [scans, setScans] = useState<MriScan[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  // Connectivity, read from the OS rather than by contacting anybody.
  //
  // This used to poll `clients3.google.com/generate_204` every 30 seconds for
  // as long as the screen was open. No health data went with it, but it handed
  // the device's IP address to Google on a schedule, the user was never told,
  // and onboarding's first screen promises "your information stays on your
  // device". An offline badge is not worth a third party knowing when and how
  // often this app is open.
  //
  // @react-native-community/netinfo was already a dependency. It asks the
  // platform, makes no request, and is also more accurate: the old check called
  // a captive portal "online" because the request completed.
  useEffect(() => {
    let cancelled = false;
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (cancelled) return;
      // `isInternetReachable` is null while unknown; treat only an explicit
      // false as offline so the banner does not flash on a cold start.
      setIsOffline(state.isConnected === false || state.isInternetReachable === false);
    });
    NetInfo.fetch().then((state) => {
      if (cancelled) return;
      setIsOffline(state.isConnected === false || state.isInternetReachable === false);
    });
    return () => { cancelled = true; unsubscribe(); };
  }, []);

  // Form state
  // The form's date is a DRAFT FOR A PARTICULAR DAY, so it carries that day
  // with it. `useState(todayStr())` seeded once, at mount, and the only reset
  // was after a successful save — so once the app had been open across midnight
  // (the tab stays mounted, and the app survives days backgrounded) this still
  // held YESTERDAY's date and the entry was filed under the previous day.
  // Same defect, same shape of fix as JournalScreen's event date.
  // `useToday()` rather than `todayStr()`: both answer the same on the render
  // that reads them, but only the hook re-renders this screen when the local day
  // actually rolls, so a form left open overnight prefills the new day.
  const today = useToday();
  const [dateDraft, setDateDraft] = useState<{ date: string; value: string }>({ date: today, value: today });
  const date = dateDraft.date === today ? dateDraft.value : today;
  const setDate = useCallback((value: string) => {
    // todayStr(), not the render's `today`: a keystroke can land after the roll.
    setDateDraft({ date: todayStr(), value });
  }, []);
  const [facility, setFacility] = useState('');
  const [scanType, setScanType] = useState('Brain');
  const [contrast, setContrast] = useState(false);
  const [newLesions, setNewLesions] = useState('');
  const [enhancing, setEnhancing] = useState<boolean | null>(null);
  const [assessment, setAssessment] = useState('Stable');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const db = await getDb();
    const rows = await db.getAllAsync<MriScan>(
      'SELECT * FROM mri_scans ORDER BY date DESC'
    );
    setScans(rows);
    // Pure-tracker build: the app doesn't judge whether a scan is "overdue" or
    // advise scheduling one.
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleSave = async () => {
    if (!date.trim()) return;
    setSaving(true);
    try {
      const db = await getDb();
      await db.runAsync(
        `INSERT INTO mri_scans (date, facility, scan_type, contrast, new_lesions, enhancing_lesions, overall_assessment, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [date, facility, scanType, contrast ? 1 : 0, newLesions, enhancing === null ? null : (enhancing ? 1 : 0), assessment.toLowerCase(), notes]
      );
      setShowForm(false);
      setDateDraft({ date: todayStr(), value: todayStr() });
      setFacility(''); setNewLesions(''); setNotes('');
      setContrast(false); setEnhancing(null); setAssessment('Stable'); setScanType('Brain');
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: number) => {
    Alert.alert(t('mriDeleteScan'), t('commonUndone'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'), style: 'destructive', onPress: async () => {
          const db = await getDb();
          await db.runAsync('DELETE FROM mri_scans WHERE id=?', [id]);
          await load();
        }
      }
    ]);
  };

  const assessmentColor = (a: string) =>
    a === 'stable' ? '#2F8F5B' : a === 'improved' ? '#2AA6B8' : '#C0392B';


  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1B58B8" />}
    >
      {isOffline && (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={16} color="#1B58B8" style={{ marginRight: 8 }} />
          <Text style={styles.offlineBannerText}>{t('offlineBanner')}</Text>
        </View>
      )}

      {!showForm ? (
        <View style={styles.addBtnRow}>
          {/* Pure-tracker build: the AI report-photo auto-fill was removed (see
              ROADMAP). Users log scan details manually. */}
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm(true)} activeOpacity={0.8}>
            <Text style={styles.addBtnText}>+ {t('mriLogScan')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.form}>
          <Text style={styles.formTitle}>{t('newMri')}</Text>

          <Text style={styles.label}>{t('date')}</Text>
          <TextInput
            style={styles.input}
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#9AA3B2"
          />

          <Text style={styles.label}>{t('facility')}</Text>
          <TextInput
            style={styles.input}
            value={facility}
            onChangeText={setFacility}
            placeholder={t('mriCentre')}
            placeholderTextColor="#9AA3B2"
          />

          <Text style={styles.label}>{t('scanType')}</Text>
          <View style={styles.chipRow}>
            {SCAN_TYPES.map(s => (
              <TouchableOpacity
                key={s.value}
                style={[styles.chip, scanType === s.value ? styles.chipActive : null]}
                onPress={() => setScanType(s.value)}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, scanType === s.value ? styles.chipTextActive : null]}>{t(s.key)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>{t('withContrast')}</Text>
          <View style={styles.chipRow}>
            {[[t('yes'), true], [t('no'), false]].map(([label, val]) => (
              <TouchableOpacity
                key={String(label)}
                style={[styles.chip, contrast === val ? styles.chipActive : null]}
                onPress={() => setContrast(val as boolean)}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, contrast === val ? styles.chipTextActive : null]}>{String(label)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>{t('newLesions')}</Text>
          <TextInput
            style={styles.input}
            value={newLesions}
            onChangeText={setNewLesions}
            placeholder='e.g. "None" or "2 new periventricular"'
            placeholderTextColor="#9AA3B2"
          />

          <Text style={styles.label}>{t('enhancingLesions')}</Text>
          <View style={styles.chipRow}>
            {[['Yes', true], ['No', false], ['Unknown', null]].map(([label, val]) => (
              <TouchableOpacity
                key={String(label)}
                style={[styles.chip, enhancing === val ? styles.chipActive : null]}
                onPress={() => setEnhancing(val as boolean | null)}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, enhancing === val ? styles.chipTextActive : null]}>{String(label)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>{t('overallAssessment')}</Text>
          <View style={styles.chipRow}>
            {ASSESSMENTS.map(a => (
              <TouchableOpacity
                key={a.value}
                style={[styles.chip, assessment === a.value ? styles.chipActive : null]}
                onPress={() => setAssessment(a.value)}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, assessment === a.value ? styles.chipTextActive : null]}>{t(a.key)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>{t('notesOptional')}</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={notes}
            onChangeText={setNotes}
            placeholder={t('mriNotesPlaceholder')}
            placeholderTextColor="#9AA3B2"
            multiline
            numberOfLines={3}
          />

          <View style={styles.formActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowForm(false)} activeOpacity={0.7}>
              <Text style={styles.cancelBtnText}>{t('cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.saveBtn, saving ? styles.saveBtnDisabled : null]} onPress={handleSave} disabled={saving} activeOpacity={0.8}>
              <Text style={styles.saveBtnText}>{saving ? t('saving') : t('mriSaveScan')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {scans.length === 0 && !showForm ? (
        <EmptyState
          icon="🧠"
          title={t('noMriYet')}
          subtitle={t('mriEmptySub')}
          actionLabel={t('logFirstScan')}
          onAction={() => setShowForm(true)}
        />
      ) : (
        scans.map(scan => (
          <TouchableOpacity
            key={scan.id}
            style={styles.card}
            onLongPress={() => handleDelete(scan.id)}
            activeOpacity={0.85}
          >
            <View style={styles.cardTop}>
              <View>
                <Text style={styles.cardDate}>{formatDate(scan.date)}</Text>
                <Text style={styles.cardType}>{scanTypeLabel(scan.scan_type)}{scan.contrast ? ` · ${t('mriWithContrast')}` : ''}</Text>
              </View>
              <View style={[styles.assessmentBadge, { backgroundColor: assessmentColor(scan.overall_assessment) + '22' }]}>
                <Text style={[styles.assessmentText, { color: assessmentColor(scan.overall_assessment) }]}>
                  {assessmentLabel(scan.overall_assessment)}
                </Text>
              </View>
            </View>
            {scan.facility ? <Text style={styles.cardFacility}>{scan.facility}</Text> : null}
            {scan.new_lesions ? (
              <Text style={styles.cardDetail}>{t('mriNewLesionsLine', { count: scan.new_lesions })}</Text>
            ) : null}
            {scan.enhancing_lesions !== null ? (
              <Text style={styles.cardDetail}>
                {t('mriEnhancingLine', { value: scan.enhancing_lesions ? t('yes') : t('no') })}
              </Text>
            ) : null}
            {scan.notes ? <Text style={styles.cardNotes} numberOfLines={2}>{scan.notes}</Text> : null}
            <Text style={styles.cardAge}>{t('mriCardAge', { days: daysSince(scan.date) })}</Text>
          </TouchableOpacity>
        ))
      )}

      <Text style={styles.disclaimer}>{t('mriDisclaimer')}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F7F2' },
  content: { padding: 20, paddingBottom: 48 },
  addBtnRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  addBtn: { flex: 1, backgroundColor: '#1B58B8', borderRadius: 10, paddingVertical: 16, alignItems: 'center' },
  addBtnText: { color: '#F7F7F2', fontSize: 15, fontWeight: '700' },
  cameraBtn: { width: 48, height: 48, borderRadius: 10, backgroundColor: '#1B58B8', alignItems: 'center', justifyContent: 'center' },
  form: { backgroundColor: '#ECEDE6', borderRadius: 14, padding: 20, marginBottom: 24, borderWidth: 1, borderColor: '#CFD2C6' },
  formTitle: { color: '#14213D', fontSize: 17, fontWeight: '700', marginBottom: 16 },
  label: { color: '#5A6478', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: '#F7F7F2', borderRadius: 10, padding: 14, color: '#14213D', fontSize: 14, borderWidth: 1, borderColor: '#CFD2C6' },
  multiline: { height: 80, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: '#F7F7F2', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#CFD2C6' },
  chipActive: { backgroundColor: '#E7EEFB', borderColor: '#1B58B8' },
  chipText: { color: '#5A6478', fontSize: 13 },
  chipTextActive: { color: '#1B58B8', fontWeight: '600' },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelBtn: { flex: 1, backgroundColor: '#F7F7F2', borderRadius: 10, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#CFD2C6' },
  cancelBtnText: { color: '#5A6478', fontSize: 14, fontWeight: '600' },
  saveBtn: { flex: 2, backgroundColor: '#1B58B8', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#F7F7F2', fontSize: 14, fontWeight: '700' },
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyText: { color: '#5A6478', fontSize: 16, fontWeight: '600' },
  emptySubtext: { color: '#9AA3B2', fontSize: 13, marginTop: 6, textAlign: 'center' },
  card: { backgroundColor: '#ECEDE6', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#CFD2C6' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  cardDate: { color: '#14213D', fontSize: 15, fontWeight: '700' },
  cardType: { color: '#5A6478', fontSize: 12, marginTop: 2 },
  assessmentBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  assessmentText: { fontSize: 12, fontWeight: '700' },
  cardFacility: { color: '#5A6478', fontSize: 13, marginBottom: 4 },
  cardDetail: { color: '#14213D', fontSize: 13, marginBottom: 2 },
  cardNotes: { color: '#5A6478', fontSize: 12, marginTop: 4, fontStyle: 'italic' },
  cardAge: { color: '#9AA3B2', fontSize: 11, marginTop: 8 },
  disclaimer: { color: '#9AA3B2', fontSize: 11, textAlign: 'center', marginTop: 24 },
  offlineBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F7F7F2', borderRadius: 14, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: '#1B58B8' },
  offlineBannerText: { color: '#5A6478', fontSize: 13, flex: 1, lineHeight: 18 },
});
