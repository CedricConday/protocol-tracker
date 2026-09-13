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
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDb } from '../db/schema';
import EmptyState from '../components/EmptyState';
import { t } from '../i18n';
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

const SCAN_TYPES = ['Brain', 'Spine', 'Brain + Spine'];
const ASSESSMENTS = ['Stable', 'Improved', 'Progressed'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatDate(d: string) {
  const dt = new Date(d + 'T00:00:00');
  return `${MONTHS[dt.getMonth()]} ${dt.getDate()}, ${dt.getFullYear()}`;
}

function daysSince(d: string): number {
  return Math.floor((Date.now() - new Date(d + 'T00:00:00').getTime()) / 86400000);
}

export default function MriScreen() {
  const [scans, setScans] = useState<MriScan[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 5000);
        await fetch('https://clients3.google.com/generate_204', { method: 'HEAD', signal: controller.signal });
        clearTimeout(id);
        setIsOffline(false);
      } catch { setIsOffline(true); }
    };
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, []);

  // Form state
  const [date, setDate] = useState(todayStr());
  const [facility, setFacility] = useState('');
  const [scanType, setScanType] = useState('Brain');
  const [contrast, setContrast] = useState(false);
  const [newLesions, setNewLesions] = useState('');
  const [enhancing, setEnhancing] = useState<boolean | null>(null);
  const [assessment, setAssessment] = useState('Stable');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);

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
      setDate(todayStr());
      setFacility(''); setNewLesions(''); setNotes('');
      setContrast(false); setEnhancing(null); setAssessment('Stable'); setScanType('Brain');
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: number) => {
    Alert.alert('Delete scan?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          const db = await getDb();
          await db.runAsync('DELETE FROM mri_scans WHERE id=?', [id]);
          await load();
        }
      }
    ]);
  };

  const assessmentColor = (a: string) =>
    a === 'stable' ? '#2F8F5B' : a === 'improved' ? '#2AA6B8' : '#C0392B';

  const handleCameraCapture = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera permission is required to capture MRI reports.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.6, base64: true });
    if (result.canceled || !result.assets[0]?.base64) return;

    const b64 = result.assets[0].base64;
    const { getItemAsync } = await import('expo-secure-store');
    const [provider, apiKey] = await Promise.all([
      AsyncStorage.getItem('ai_provider'),
      getItemAsync('ai_api_key'),
    ]);

    if (!apiKey) {
      Alert.alert(
        'AI key required',
        'Go to Settings → Advanced → AI Workspace and add your API key to enable auto-fill.',
      );
      return;
    }

    setScanning(true);
    try {
      const extracted = await callVisionApi(provider ?? 'groq', apiKey, b64);
      if (extracted) {
        if (extracted.date) setDate(extracted.date);
        if (extracted.facility) setFacility(extracted.facility);
        if (extracted.scan_type && SCAN_TYPES.includes(extracted.scan_type)) setScanType(extracted.scan_type);
        if (extracted.new_lesions) setNewLesions(extracted.new_lesions);
        if (extracted.enhancing_lesions != null) setEnhancing(extracted.enhancing_lesions);
        if (extracted.assessment && ASSESSMENTS.map(a => a.toLowerCase()).includes(extracted.assessment.toLowerCase())) {
          setAssessment(extracted.assessment.charAt(0).toUpperCase() + extracted.assessment.slice(1).toLowerCase());
        }
        setShowForm(true);
      } else {
        Alert.alert('Could not parse', 'The image could not be read automatically. Fill in the fields manually.');
        setShowForm(true);
      }
    } catch {
      Alert.alert('Scan failed', 'Could not connect to AI service. Fill in manually.');
      setShowForm(true);
    } finally {
      setScanning(false);
    }
  };

  async function callVisionApi(
    provider: string,
    apiKey: string,
    base64: string,
  ): Promise<{ date?: string; facility?: string; scan_type?: string; new_lesions?: string; enhancing_lesions?: boolean; assessment?: string } | null> {
    const PROMPT = `Extract from this MRI report image. Return ONLY valid JSON with these keys (omit any you cannot find): date (YYYY-MM-DD), facility (string), scan_type (one of: "Brain", "Spine", "Brain + Spine"), new_lesions (string, e.g. "none" or "2"), enhancing_lesions (boolean), assessment (one of: "stable", "improved", "progressed").`;

    let responseText: string;

    if (provider === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 256,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
              { type: 'text', text: PROMPT },
            ],
          }],
        }),
      });
      const json = await res.json();
      responseText = json.content?.[0]?.text ?? '';
    } else {
      // OpenAI-compatible (openai or groq)
      const baseUrl = provider === 'groq'
        ? 'https://api.groq.com/openai/v1/chat/completions'
        : 'https://api.openai.com/v1/chat/completions';
      const model = provider === 'groq' ? 'meta-llama/llama-4-scout-17b-16e-instruct' : 'gpt-4o-mini';
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          max_tokens: 256,
          messages: [{
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } },
              { type: 'text', text: PROMPT },
            ],
          }],
        }),
      });
      const json = await res.json();
      responseText = json.choices?.[0]?.message?.content ?? '';
    }

    const match = responseText.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try { return JSON.parse(match[0]); } catch { return null; }
  }

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
            <Text style={styles.addBtnText}>+ Log MRI Scan</Text>
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
            placeholder="e.g. Bethel Bielefeld"
            placeholderTextColor="#9AA3B2"
          />

          <Text style={styles.label}>{t('scanType')}</Text>
          <View style={styles.chipRow}>
            {SCAN_TYPES.map(t => (
              <TouchableOpacity
                key={t}
                style={[styles.chip, scanType === t ? styles.chipActive : null]}
                onPress={() => setScanType(t)}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, scanType === t ? styles.chipTextActive : null]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>{t('withContrast')}</Text>
          <View style={styles.chipRow}>
            {[['Yes', true], ['No', false]].map(([label, val]) => (
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
                key={a}
                style={[styles.chip, assessment === a ? styles.chipActive : null]}
                onPress={() => setAssessment(a)}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, assessment === a ? styles.chipTextActive : null]}>{a}</Text>
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
              <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Scan'}</Text>
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
                <Text style={styles.cardType}>{scan.scan_type}{scan.contrast ? ' · with contrast' : ''}</Text>
              </View>
              <View style={[styles.assessmentBadge, { backgroundColor: assessmentColor(scan.overall_assessment) + '22' }]}>
                <Text style={[styles.assessmentText, { color: assessmentColor(scan.overall_assessment) }]}>
                  {scan.overall_assessment.charAt(0).toUpperCase() + scan.overall_assessment.slice(1)}
                </Text>
              </View>
            </View>
            {scan.facility ? <Text style={styles.cardFacility}>{scan.facility}</Text> : null}
            {scan.new_lesions ? (
              <Text style={styles.cardDetail}>New lesions: {scan.new_lesions}</Text>
            ) : null}
            {scan.enhancing_lesions !== null ? (
              <Text style={styles.cardDetail}>
                Enhancing: {scan.enhancing_lesions ? 'Yes' : 'No'}
              </Text>
            ) : null}
            {scan.notes ? <Text style={styles.cardNotes} numberOfLines={2}>{scan.notes}</Text> : null}
            <Text style={styles.cardAge}>{daysSince(scan.date)} days ago · hold to delete</Text>
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
