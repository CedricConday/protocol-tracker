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
import EmptyState from '../components/EmptyState';

interface LabResult {
  id: number;
  date: string;
  vit_d_ngml: number | null;
  pth_pgml: number | null;
  calcium_serum_mgdl: number | null;
  calcium_urine_mg_g_cr: number | null;
  creatinine_mgdl: number | null;
  sulkowitch: string | null;
  notes: string;
}

// Coimbra Protocol target ranges
const TARGETS = {
  vit_d: { min: 150, max: 280, unit: 'ng/mL', label: 'Vit D 25-OH' },
  pth: { min: 10, max: 30, unit: 'pg/mL', label: 'PTH' },
  calcium_serum: { min: 8.5, max: 10.2, unit: 'mg/dL', label: 'Calcium (serum)' },
  calcium_urine: { min: 0, max: 300, unit: 'mg/g Cr', label: 'Calcium (urine)' },
  creatinine: { min: 0.5, max: 1.2, unit: 'mg/dL', label: 'Creatinine' },
};

const SULKOWITCH = ['None', 'Slight', 'Moderate', 'Heavy'];

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatDate(d: string) {
  const dt = new Date(d + 'T00:00:00');
  return `${MONTHS[dt.getMonth()]} ${dt.getDate()}, ${dt.getFullYear()}`;
}

function valueStatus(val: number | null, min: number, max: number): 'ok' | 'low' | 'high' | 'unknown' {
  if (val === null) return 'unknown';
  if (val < min) return 'low';
  if (val > max) return 'high';
  return 'ok';
}

function statusColor(s: 'ok' | 'low' | 'high' | 'unknown') {
  if (s === 'ok') return '#22c55e';
  if (s === 'low') return '#3b82f6';
  if (s === 'high') return '#ef4444';
  return '#555555';
}

function statusLabel(s: 'ok' | 'low' | 'high' | 'unknown') {
  if (s === 'ok') return '✓';
  if (s === 'low') return '↓ Low';
  if (s === 'high') return '↑ High';
  return '—';
}

export default function LabResultsScreen() {
  const [results, setResults] = useState<LabResult[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [vitD, setVitD] = useState('');
  const [pth, setPth] = useState('');
  const [calciumSerum, setCalciumSerum] = useState('');
  const [calciumUrine, setCalciumUrine] = useState('');
  const [creatinine, setCreatinine] = useState('');
  const [sulkowitch, setSulkowitch] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const load = useCallback(async () => {
    const db = await getDb();
    const rows = await db.getAllAsync<LabResult>(
      'SELECT * FROM lab_results ORDER BY date DESC'
    );
    setResults(rows);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const parseNum = (s: string) => { const n = parseFloat(s); return isNaN(n) ? null : n; };

  const handleSave = async () => {
    if (!date.trim()) return;
    setSaving(true);
    try {
      const db = await getDb();
      await db.runAsync(
        `INSERT INTO lab_results (date, vit_d_ngml, pth_pgml, calcium_serum_mgdl, calcium_urine_mg_g_cr, creatinine_mgdl, sulkowitch, notes)
         VALUES (?,?,?,?,?,?,?,?)`,
        [date, parseNum(vitD), parseNum(pth), parseNum(calciumSerum), parseNum(calciumUrine), parseNum(creatinine), sulkowitch, notes]
      );
      setShowForm(false);
      setDate(new Date().toISOString().split('T')[0]);
      setVitD(''); setPth(''); setCalciumSerum(''); setCalciumUrine(''); setCreatinine('');
      setSulkowitch(null); setNotes('');
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: number) => {
    Alert.alert('Delete result?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          const db = await getDb();
          await db.runAsync('DELETE FROM lab_results WHERE id=?', [id]);
          await load();
        }
      }
    ]);
  };

  const renderMarker = (val: number | null, min: number, max: number, unit: string, label: string) => {
    const s = valueStatus(val, min, max);
    const color = statusColor(s);
    return (
      <View key={label} style={styles.markerRow}>
        <Text style={styles.markerLabel}>{label}</Text>
        <View style={styles.markerRight}>
          <Text style={[styles.markerValue, { color }]}>
            {val !== null ? `${val} ${unit}` : '—'}
          </Text>
          <Text style={[styles.markerStatus, { color }]}>{statusLabel(s)}</Text>
        </View>
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#22c55e" />}
    >
      <View style={styles.targetCard}>
        <Text style={styles.targetTitle}>Coimbra Protocol Target Ranges</Text>
        {Object.entries(TARGETS).map(([, t]) => (
          <Text key={t.label} style={styles.targetRow}>
            {t.label}: <Text style={styles.targetRange}>{t.min}–{t.max} {t.unit}</Text>
          </Text>
        ))}
      </View>

      {!showForm ? (
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm(true)} activeOpacity={0.8}>
          <Text style={styles.addBtnText}>+ Add Lab Result</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.form}>
          <Text style={styles.formTitle}>Enter Lab Values</Text>

          <Text style={styles.label}>Date</Text>
          <TextInput style={styles.input} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor="#555555" />

          <Text style={styles.label}>Vit D 25-OH (ng/mL) <Text style={styles.targetHint}>target 150–280</Text></Text>
          <TextInput style={styles.input} value={vitD} onChangeText={setVitD} keyboardType="decimal-pad" placeholder="e.g. 180" placeholderTextColor="#555555" />

          <Text style={styles.label}>PTH (pg/mL) <Text style={styles.targetHint}>target 10–30</Text></Text>
          <TextInput style={styles.input} value={pth} onChangeText={setPth} keyboardType="decimal-pad" placeholder="e.g. 18" placeholderTextColor="#555555" />

          <Text style={styles.label}>Calcium Serum (mg/dL) <Text style={styles.targetHint}>target 8.5–10.2</Text></Text>
          <TextInput style={styles.input} value={calciumSerum} onChangeText={setCalciumSerum} keyboardType="decimal-pad" placeholder="e.g. 9.4" placeholderTextColor="#555555" />

          <Text style={styles.label}>Calcium Urine (mg/g Cr) <Text style={styles.targetHint}>target &lt;300</Text></Text>
          <TextInput style={styles.input} value={calciumUrine} onChangeText={setCalciumUrine} keyboardType="decimal-pad" placeholder="e.g. 210" placeholderTextColor="#555555" />

          <Text style={styles.label}>Creatinine (mg/dL) <Text style={styles.targetHint}>target 0.5–1.2</Text></Text>
          <TextInput style={styles.input} value={creatinine} onChangeText={setCreatinine} keyboardType="decimal-pad" placeholder="e.g. 0.8" placeholderTextColor="#555555" />

          <Text style={styles.label}>Sulkowitch Test (urine calcium turbidity)</Text>
          <View style={styles.chipRow}>
            {SULKOWITCH.map(s => (
              <TouchableOpacity
                key={s}
                style={[styles.chip, sulkowitch === s ? styles.chipActive : null]}
                onPress={() => setSulkowitch(sulkowitch === s ? null : s)}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, sulkowitch === s ? styles.chipTextActive : null]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Notes (optional)</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Lab name, fasting status, doctor comments..."
            placeholderTextColor="#555555"
            multiline
            numberOfLines={2}
          />

          <View style={styles.formActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowForm(false)} activeOpacity={0.7}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.saveBtn, saving ? styles.saveBtnDisabled : null]} onPress={handleSave} disabled={saving} activeOpacity={0.8}>
              <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {results.length === 0 && !showForm ? (
        <EmptyState
          icon="🧪"
          title="No lab results yet"
          subtitle="Add your Vitamin D, PTH, and Calcium readings to track trends against Coimbra Protocol targets."
          actionLabel="Add First Result"
          onAction={() => setShowForm(true)}
        />
      ) : (
        results.map(r => (
          <TouchableOpacity key={r.id} style={styles.card} onLongPress={() => handleDelete(r.id)} activeOpacity={0.85}>
            <Text style={styles.cardDate}>{formatDate(r.date)}</Text>
            {renderMarker(r.vit_d_ngml, TARGETS.vit_d.min, TARGETS.vit_d.max, TARGETS.vit_d.unit, TARGETS.vit_d.label)}
            {renderMarker(r.pth_pgml, TARGETS.pth.min, TARGETS.pth.max, TARGETS.pth.unit, TARGETS.pth.label)}
            {renderMarker(r.calcium_serum_mgdl, TARGETS.calcium_serum.min, TARGETS.calcium_serum.max, TARGETS.calcium_serum.unit, TARGETS.calcium_serum.label)}
            {renderMarker(r.calcium_urine_mg_g_cr, TARGETS.calcium_urine.min, TARGETS.calcium_urine.max, TARGETS.calcium_urine.unit, TARGETS.calcium_urine.label)}
            {renderMarker(r.creatinine_mgdl, TARGETS.creatinine.min, TARGETS.creatinine.max, TARGETS.creatinine.unit, TARGETS.creatinine.label)}
            {r.sulkowitch ? (
              <Text style={styles.sulkowitch}>Sulkowitch: {r.sulkowitch}</Text>
            ) : null}
            {r.notes ? <Text style={styles.cardNotes} numberOfLines={2}>{r.notes}</Text> : null}
            <Text style={styles.cardHint}>Hold to delete</Text>
          </TouchableOpacity>
        ))
      )}

      <Text style={styles.disclaimer}>Not medical advice. Discuss all results with your Coimbra practitioner.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },
  content: { padding: 20, paddingBottom: 48 },
  targetCard: { backgroundColor: '#1a2a1a', borderRadius: 10, padding: 14, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: '#22c55e' },
  targetTitle: { color: '#22c55e', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  targetRow: { color: '#888888', fontSize: 13, marginBottom: 3 },
  targetRange: { color: '#cccccc', fontWeight: '600' },
  addBtn: { backgroundColor: '#22c55e', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginBottom: 20 },
  addBtnText: { color: '#0d0d0d', fontSize: 15, fontWeight: '700' },
  form: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16, marginBottom: 20 },
  formTitle: { color: '#ffffff', fontSize: 17, fontWeight: '700', marginBottom: 4 },
  label: { color: '#888888', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 12 },
  targetHint: { color: '#22c55e', textTransform: 'none', fontWeight: '400' },
  input: { backgroundColor: '#0d0d0d', borderRadius: 8, padding: 12, color: '#ffffff', fontSize: 14, borderWidth: 1, borderColor: '#2a2a2a' },
  multiline: { height: 64, textAlignVertical: 'top' },
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
  cardDate: { color: '#ffffff', fontSize: 15, fontWeight: '700', marginBottom: 10 },
  markerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#222222' },
  markerLabel: { color: '#888888', fontSize: 13 },
  markerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  markerValue: { fontSize: 13, fontWeight: '600' },
  markerStatus: { fontSize: 11, fontWeight: '700', minWidth: 36, textAlign: 'right' },
  sulkowitch: { color: '#eab308', fontSize: 12, marginTop: 8 },
  cardNotes: { color: '#888888', fontSize: 12, marginTop: 6, fontStyle: 'italic' },
  cardHint: { color: '#2a2a2a', fontSize: 11, marginTop: 8 },
  disclaimer: { color: '#3a3a3a', fontSize: 11, textAlign: 'center', marginTop: 24 },
});
