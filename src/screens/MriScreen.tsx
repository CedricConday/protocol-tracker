import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { getDb } from '../db/schema';

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
    a === 'stable' ? '#22c55e' : a === 'improved' ? '#3b82f6' : '#ef4444';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#22c55e" />}
    >
      {overdueAlert && (
        <View style={styles.overdueAlert}>
          <Text style={styles.overdueAlertText}>⚠ It has been over 12 months since your last MRI. Consider scheduling a follow-up scan.</Text>
        </View>
      )}

      {!showForm ? (
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm(true)} activeOpacity={0.8}>
          <Text style={styles.addBtnText}>+ Log MRI Scan</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.form}>
          <Text style={styles.formTitle}>New MRI Scan</Text>

          <Text style={styles.label}>Date</Text>
          <TextInput
            style={styles.input}
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#555555"
          />

          <Text style={styles.label}>Facility (optional)</Text>
          <TextInput
            style={styles.input}
            value={facility}
            onChangeText={setFacility}
            placeholder="e.g. Bethel Bielefeld"
            placeholderTextColor="#555555"
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
            placeholderTextColor="#555555"
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
            placeholderTextColor="#555555"
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
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No MRI scans logged yet.</Text>
          <Text style={styles.emptySubtext}>Log each scan to track lesion activity over time.</Text>
        </View>
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
  container: { flex: 1, backgroundColor: '#0d0d0d' },
  content: { padding: 20, paddingBottom: 48 },
  overdueAlert: { backgroundColor: '#2a1a00', borderRadius: 10, padding: 14, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: '#eab308' },
  overdueAlertText: { color: '#eab308', fontSize: 13, lineHeight: 19 },
  addBtn: { backgroundColor: '#22c55e', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginBottom: 20 },
  addBtnText: { color: '#0d0d0d', fontSize: 15, fontWeight: '700' },
  form: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16, marginBottom: 20 },
  formTitle: { color: '#ffffff', fontSize: 17, fontWeight: '700', marginBottom: 16 },
  label: { color: '#888888', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: '#0d0d0d', borderRadius: 8, padding: 12, color: '#ffffff', fontSize: 14, borderWidth: 1, borderColor: '#2a2a2a' },
  multiline: { height: 80, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: '#0d0d0d', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: '#2a2a2a' },
  chipActive: { backgroundColor: '#22c55e22', borderColor: '#22c55e' },
  chipText: { color: '#888888', fontSize: 13 },
  chipTextActive: { color: '#22c55e', fontWeight: '600' },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelBtn: { flex: 1, backgroundColor: '#0d0d0d', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  cancelBtnText: { color: '#888888', fontSize: 14, fontWeight: '600' },
  saveBtn: { flex: 2, backgroundColor: '#22c55e', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#0d0d0d', fontSize: 14, fontWeight: '700' },
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyText: { color: '#555555', fontSize: 16, fontWeight: '600' },
  emptySubtext: { color: '#3a3a3a', fontSize: 13, marginTop: 6, textAlign: 'center' },
  card: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 14, marginBottom: 12 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  cardDate: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  cardType: { color: '#888888', fontSize: 12, marginTop: 2 },
  assessmentBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  assessmentText: { fontSize: 12, fontWeight: '700' },
  cardFacility: { color: '#888888', fontSize: 13, marginBottom: 4 },
  cardDetail: { color: '#cccccc', fontSize: 13, marginBottom: 2 },
  cardNotes: { color: '#888888', fontSize: 12, marginTop: 4, fontStyle: 'italic' },
  cardAge: { color: '#3a3a3a', fontSize: 11, marginTop: 8 },
  disclaimer: { color: '#3a3a3a', fontSize: 11, textAlign: 'center', marginTop: 24 },
});
