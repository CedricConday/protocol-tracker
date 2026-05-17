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
  const [overdueAlert, setOverdueAlert] = useState(false);

  // Form state
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
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
    if (rows.length > 0) {
      setOverdueAlert(daysSince(rows[0].date) > 365);
    } else {
      setOverdueAlert(false);
    }
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
      setDate(new Date().toISOString().split('T')[0]);
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
    a === 'stable' ? '#5A8A5A' : a === 'improved' ? '#4A7A9B' : '#C04040';

  const handleCameraCapture = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera permission is required to capture MRI reports.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.6, base64: true });
    if (result.canceled || !result.assets[0]?.base64) return;

    const b64 = result.assets[0].base64;
    const [provider, apiKey] = await Promise.all([
      AsyncStorage.getItem('ai_provider'),
      AsyncStorage.getItem('ai_api_key'),
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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#C96A50" />}
    >
      {overdueAlert && (
        <View style={styles.overdueAlert}>
          <Text style={styles.overdueAlertText}>⚠ It has been over 12 months since your last MRI. Consider scheduling a follow-up scan.</Text>
        </View>
      )}

      {!showForm ? (
        <View style={styles.addBtnRow}>
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm(true)} activeOpacity={0.8}>
            <Text style={styles.addBtnText}>+ Log MRI Scan</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cameraBtn} onPress={handleCameraCapture} disabled={scanning} activeOpacity={0.8}>
            {scanning
              ? <ActivityIndicator size="small" color="#FAF7F4" />
              : <Ionicons name="camera-outline" size={20} color="#FAF7F4" />}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.form}>
          <Text style={styles.formTitle}>New MRI Scan</Text>

          <Text style={styles.label}>Date</Text>
          <TextInput
            style={styles.input}
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#B0A098"
          />

          <Text style={styles.label}>Facility (optional)</Text>
          <TextInput
            style={styles.input}
            value={facility}
            onChangeText={setFacility}
            placeholder="e.g. Bethel Bielefeld"
            placeholderTextColor="#B0A098"
          />

          <Text style={styles.label}>Scan Type</Text>
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

          <Text style={styles.label}>With Contrast?</Text>
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

          <Text style={styles.label}>New Lesions</Text>
          <TextInput
            style={styles.input}
            value={newLesions}
            onChangeText={setNewLesions}
            placeholder='e.g. "None" or "2 new periventricular"'
            placeholderTextColor="#B0A098"
          />

          <Text style={styles.label}>Enhancing Lesions?</Text>
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

          <Text style={styles.label}>Overall Assessment</Text>
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

          <Text style={styles.label}>Notes (optional)</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Radiologist comments, key findings..."
            placeholderTextColor="#B0A098"
            multiline
            numberOfLines={3}
          />

          <View style={styles.formActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowForm(false)} activeOpacity={0.7}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
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
          title="No MRI scans yet"
          subtitle="Log each scan date to track lesion activity and get a 12-month overdue alert."
          actionLabel="Log First Scan"
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

      <Text style={styles.disclaimer}>Not medical advice. Share results with your neurologist.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAF7F4' },
  content: { padding: 20, paddingBottom: 48 },
  overdueAlert: { backgroundColor: '#FDF3E0', borderRadius: 10, padding: 14, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: '#C4882A' },
  overdueAlertText: { color: '#C4882A', fontSize: 13, lineHeight: 19 },
  addBtnRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  addBtn: { flex: 1, backgroundColor: '#C96A50', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  addBtnText: { color: '#FAF7F4', fontSize: 15, fontWeight: '700' },
  cameraBtn: { width: 48, height: 48, borderRadius: 10, backgroundColor: '#C96A50', alignItems: 'center', justifyContent: 'center' },
  form: { backgroundColor: '#F2EDE8', borderRadius: 12, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#D8CFC8' },
  formTitle: { color: '#2C2420', fontSize: 17, fontWeight: '700', marginBottom: 16 },
  label: { color: '#7A6A62', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: '#FAF7F4', borderRadius: 8, padding: 12, color: '#2C2420', fontSize: 14, borderWidth: 1, borderColor: '#D8CFC8' },
  multiline: { height: 80, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: '#FAF7F4', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: '#D8CFC8' },
  chipActive: { backgroundColor: '#FBF0ED', borderColor: '#C96A50' },
  chipText: { color: '#7A6A62', fontSize: 13 },
  chipTextActive: { color: '#C96A50', fontWeight: '600' },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelBtn: { flex: 1, backgroundColor: '#FAF7F4', borderRadius: 8, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#D8CFC8' },
  cancelBtnText: { color: '#7A6A62', fontSize: 14, fontWeight: '600' },
  saveBtn: { flex: 2, backgroundColor: '#C96A50', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#FAF7F4', fontSize: 14, fontWeight: '700' },
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyText: { color: '#7A6A62', fontSize: 16, fontWeight: '600' },
  emptySubtext: { color: '#B0A098', fontSize: 13, marginTop: 6, textAlign: 'center' },
  card: { backgroundColor: '#F2EDE8', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#D8CFC8' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  cardDate: { color: '#2C2420', fontSize: 15, fontWeight: '700' },
  cardType: { color: '#7A6A62', fontSize: 12, marginTop: 2 },
  assessmentBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  assessmentText: { fontSize: 12, fontWeight: '700' },
  cardFacility: { color: '#7A6A62', fontSize: 13, marginBottom: 4 },
  cardDetail: { color: '#2C2420', fontSize: 13, marginBottom: 2 },
  cardNotes: { color: '#7A6A62', fontSize: 12, marginTop: 4, fontStyle: 'italic' },
  cardAge: { color: '#B0A098', fontSize: 11, marginTop: 8 },
  disclaimer: { color: '#B0A098', fontSize: 11, textAlign: 'center', marginTop: 24 },
});
