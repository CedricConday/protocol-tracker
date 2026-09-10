import * as Haptics from 'expo-haptics';
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
import { enqueueAction } from '../db/actionQueue';
import EmptyState from '../components/EmptyState';
import { DISEASE_PROFILES, getProfileById, type DiseaseProfile } from '../data/diseaseProfiles';
import { getMiscFlag } from '../db/queries';
import { t } from '../i18n';

interface LabResult {
  id: number;
  date: string;
  vit_d_ngml: number | null;
  pth_pgml: number | null;
  calcium_serum_mgdl: number | null;
  calcium_urine_mg_g_cr: number | null;
  creatinine_mgdl: number | null;
  nfl_pgl: number | null;
  sulkowitch: string | null;
  notes: string;
}

// Units and labels for the markers. No target ranges: the app does not tell
// users what to aim for.
const TARGETS = {
  vit_d: { unit: 'ng/mL', label: 'Vit D 25-OH' },
  pth: { unit: 'pg/mL', label: 'PTH' },
  calcium_serum: { unit: 'mg/dL', label: 'Calcium (serum)' },
  calcium_urine: { unit: 'mg/g Cr', label: 'Calcium (urine)' },
  creatinine: { unit: 'mg/dL', label: 'Creatinine' },
  nfl: { unit: 'pg/mL', label: 'NfL (serum)' },
};

const SULKOWITCH = ['None', 'Slight', 'Moderate', 'Heavy'];

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatDate(d: string) {
  const dt = new Date(d + 'T00:00:00');
  return `${MONTHS[dt.getMonth()]} ${dt.getDate()}, ${dt.getFullYear()}`;
}

// Pure-tracker build: values are shown exactly as the user entered them, with
// no low / high / in-range judgement, so there is nothing to colour or label.

const MARKER_FIELDS: Record<string, { stateKey: string; dbCol: string; label: string; unit: string }> = {
  VitD: { stateKey: 'vitD', dbCol: 'vit_d_ngml', label: 'Vit D 25-OH', unit: 'ng/mL' },
  PTH: { stateKey: 'pth', dbCol: 'pth_pgml', label: 'PTH', unit: 'pg/mL' },
  Calcium: { stateKey: 'calciumSerum', dbCol: 'calcium_serum_mgdl', label: 'Calcium (serum)', unit: 'mg/dL' },
  Creatinine: { stateKey: 'creatinine', dbCol: 'creatinine_mgdl', label: 'Creatinine', unit: 'mg/dL' },
};

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
  const [nfl, setNfl] = useState('');
  const [sulkowitch, setSulkowitch] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [profile, setProfile] = useState<DiseaseProfile | null>(null);

  const load = useCallback(async () => {
    const db = await getDb();
    const rows = await db.getAllAsync<LabResult>(
      'SELECT * FROM lab_results ORDER BY date DESC'
    );
    setResults(rows);
    const profileId = await getMiscFlag('disease_profile');
    if (profileId) {
      setProfile(getProfileById(profileId) || null);
    }
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
        `INSERT INTO lab_results (date, vit_d_ngml, pth_pgml, calcium_serum_mgdl, calcium_urine_mg_g_cr, creatinine_mgdl, nfl_pgl, sulkowitch, notes)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [date, parseNum(vitD), parseNum(pth), parseNum(calciumSerum), parseNum(calciumUrine), parseNum(creatinine), parseNum(nfl), sulkowitch, notes]
      );
      await enqueueAction('lab_result_saved', { date, vit_d_ngml: vitD, calcium_serum_mgdl: calciumSerum, pth_pgml: pth });
      // Pure-tracker build: no "out of range" evaluation/alerting on lab values.
      setShowForm(false);
      setDate(new Date().toISOString().split('T')[0]);
      setVitD(''); setPth(''); setCalciumSerum(''); setCalciumUrine(''); setCreatinine(''); setNfl('');
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

  const renderMarker = (val: number | null, unit: string, label: string) => (
    <View key={label} style={styles.markerRow}>
      <Text style={styles.markerLabel}>{label}</Text>
      <View style={styles.markerRight}>
        <Text style={styles.markerValue}>{val !== null ? `${val} ${unit}` : '—'}</Text>
      </View>
    </View>
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1B58B8" />}
    >
      {/* Pure-tracker build: the "Protocol Target Ranges" card was removed — the
          app does not tell users what values to aim for. Users log their own
          numbers and see their own history below. */}

      {!showForm ? (
        <TouchableOpacity style={styles.addBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowForm(true); }} activeOpacity={0.8} accessibilityLabel="Add lab result" accessibilityRole="button">
          <Text style={styles.addBtnText}>+ Add Lab Result</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.form}>
          <Text style={styles.formTitle}>{t('enterLabValues')}</Text>

          <Text style={styles.label}>{t('date')}</Text>
          <TextInput style={styles.input} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor="#9AA3B2" />

          {(!profile || profile.keyMarkers.includes('VitD')) && (
            <>
              <Text style={styles.label}>Vit D 25-OH (ng/mL)</Text>
              <TextInput style={styles.input} value={vitD} onChangeText={setVitD} keyboardType="decimal-pad" placeholder="e.g. 180" placeholderTextColor="#9AA3B2" />
            </>
          )}

          {(!profile || profile.keyMarkers.includes('PTH')) && (
            <>
              <Text style={styles.label}>PTH (pg/mL)</Text>
              <TextInput style={styles.input} value={pth} onChangeText={setPth} keyboardType="decimal-pad" placeholder="e.g. 18" placeholderTextColor="#9AA3B2" />
            </>
          )}

          {(!profile || profile.keyMarkers.includes('Calcium')) && (
            <>
              <Text style={styles.label}>{t('calciumSerum')}</Text>
              <TextInput style={styles.input} value={calciumSerum} onChangeText={setCalciumSerum} keyboardType="decimal-pad" placeholder="e.g. 9.4" placeholderTextColor="#9AA3B2" />
            </>
          )}

          {(!profile || profile.keyMarkers.includes('Calcium')) && (
            <>
              <Text style={styles.label}>{t('calciumUrine')}</Text>
              <TextInput style={styles.input} value={calciumUrine} onChangeText={setCalciumUrine} keyboardType="decimal-pad" placeholder="e.g. 210" placeholderTextColor="#9AA3B2" />
            </>
          )}

          {(!profile || profile.keyMarkers.includes('Creatinine')) && (
            <>
              <Text style={styles.label}>{t('creatinine')}</Text>
              <TextInput style={styles.input} value={creatinine} onChangeText={setCreatinine} keyboardType="decimal-pad" placeholder="e.g. 0.8" placeholderTextColor="#9AA3B2" />
            </>
          )}

          <Text style={styles.label}>{t('nfl')}</Text>
          <TextInput style={styles.input} value={nfl} onChangeText={setNfl} keyboardType="decimal-pad" placeholder="e.g. 7.4" placeholderTextColor="#9AA3B2" />

          <Text style={styles.label}>{t('sulkowitch')}</Text>
          <View style={styles.chipRow}>
            {SULKOWITCH.map(s => (
              <TouchableOpacity
                key={s}
                style={[styles.chip, sulkowitch === s ? styles.chipActive : null]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSulkowitch(sulkowitch === s ? null : s); }}
                activeOpacity={0.7}
                accessibilityLabel={`Sulkowitch: ${s}`}
                accessibilityRole="button"
              >
                <Text style={[styles.chipText, sulkowitch === s ? styles.chipTextActive : null]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>{t('notesOptional')}</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={notes}
            onChangeText={setNotes}
            placeholder={t('labNotesPlaceholder')}
            placeholderTextColor="#9AA3B2"
            multiline
            numberOfLines={2}
          />

          <View style={styles.formActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowForm(false); }} activeOpacity={0.7} accessibilityLabel="Cancel" accessibilityRole="button">
              <Text style={styles.cancelBtnText}>{t('cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.saveBtn, saving ? styles.saveBtnDisabled : null]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); handleSave().then(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)).catch((e) => Alert.alert('Save failed', e?.message ?? 'Please try again')); }} disabled={saving} activeOpacity={0.8} accessibilityLabel={saving ? 'Saving lab result' : 'Save lab result'} accessibilityRole="button">
              <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Trend Chart */}
      {results.length >= 2 ? (
        <View style={styles.trendSection}>
          <Text style={styles.trendTitle}>Trends (last {Math.min(6, results.length)})</Text>
          <View style={{ flexDirection: 'row', gap: 8 }} accessible={true} accessibilityLabel="Lab result trend charts for Vitamin D, Calcium, PTH, and Urinary Calcium">
            {(['vit_d_ngml', 'calcium_serum_mgdl', 'pth_pgml', 'calcium_urine_mg_g_cr'] as const).map((field) => {
              const data = results.slice(0, 6).reverse();
              const values = data.map((r) => r[field]).filter((v): v is number => v !== null);
              if (values.length < 2) return null;
              const max = Math.max(...values);
              const min = Math.min(...values);
              const range = max - min || 1;
              const label = field === 'vit_d_ngml' ? 'Vit D' : field === 'calcium_serum_mgdl' ? 'Ca' : field === 'pth_pgml' ? 'PTH' : 'Ca-U';
              return (
                <View key={field} style={styles.trendChart}>
                  <Text style={styles.trendChartLabel}>{label}</Text>
                  <View style={styles.miniChart}>
                    {values.map((v, i) => {
                      const h = ((v - min) / range) * 50;
                      const isUp = i > 0 && v >= values[i - 1];
                      return (
                        <View key={i} style={{ alignItems: 'center', flex: 1 }}>
                          <View style={[styles.miniBar, { height: Math.max(4, h), backgroundColor: i === values.length - 1 ? '#22c55e' : '#22c55e88' }]} />
                          <Text style={styles.miniValue}>{v}</Text>
                          <Text style={styles.miniDate}>{data[i].date.slice(5)}</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      ) : results.length > 0 ? (
        <Text style={styles.trendHint}>{t('addMoreResults')}</Text>
      ) : null}

      {results.length === 0 && !showForm ? (
        <EmptyState
          icon="🧪"
          title={t('noLabResults')}
          subtitle={t('labEmptySub')}
          actionLabel={t('addFirstResult')}
          onAction={() => setShowForm(true)}
        />
      ) : (
        results.map(r => (
          <TouchableOpacity key={r.id} style={styles.card} onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)} onLongPress={() => handleDelete(r.id)} activeOpacity={0.85} accessibilityLabel={`Lab result from ${formatDate(r.date)}`} accessibilityRole="button">
            <Text style={styles.cardDate}>{formatDate(r.date)}</Text>
            {(!profile || profile.keyMarkers.includes('VitD')) && renderMarker(r.vit_d_ngml, TARGETS.vit_d.unit, TARGETS.vit_d.label)}
            {(!profile || profile.keyMarkers.includes('PTH')) && renderMarker(r.pth_pgml, TARGETS.pth.unit, TARGETS.pth.label)}
            {(!profile || profile.keyMarkers.includes('Calcium')) && renderMarker(r.calcium_serum_mgdl, TARGETS.calcium_serum.unit, TARGETS.calcium_serum.label)}
            {(!profile || profile.keyMarkers.includes('Calcium')) && renderMarker(r.calcium_urine_mg_g_cr, TARGETS.calcium_urine.unit, TARGETS.calcium_urine.label)}
            {(!profile || profile.keyMarkers.includes('Creatinine')) && renderMarker(r.creatinine_mgdl, TARGETS.creatinine.unit, TARGETS.creatinine.label)}
            {r.nfl_pgl !== null && r.nfl_pgl !== undefined && renderMarker(r.nfl_pgl, TARGETS.nfl.unit, TARGETS.nfl.label)}
            {r.sulkowitch ? (
              <Text style={styles.sulkowitch}>Sulkowitch: {r.sulkowitch}</Text>
            ) : null}
            {r.notes ? <Text style={styles.cardNotes} numberOfLines={2}>{r.notes}</Text> : null}
            <Text style={styles.cardHint}>{t('holdToDelete')}</Text>
          </TouchableOpacity>
        ))
      )}

      <Text style={styles.disclaimer}>{t('labDisclaimer')}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F7F2' },
  content: { padding: 20, paddingBottom: 48 },
  targetCard: { backgroundColor: '#1a2a1a', borderRadius: 14, padding: 16, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: '#1B58B8' },
  targetTitle: { color: '#1B58B8', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  targetRow: { color: '#5A6478', fontSize: 13, marginBottom: 3 },
  targetRange: { color: '#cccccc', fontWeight: '600' },
  addBtn: { backgroundColor: '#1B58B8', borderRadius: 10, paddingVertical: 16, alignItems: 'center', marginBottom: 20 },
  addBtnText: { color: '#F7F7F2', fontSize: 15, fontWeight: '700' },
  form: { backgroundColor: '#ECEDE6', borderRadius: 14, padding: 20, marginBottom: 24 },
  formTitle: { color: '#F7F7F2', fontSize: 17, fontWeight: '700', marginBottom: 4 },
  label: { color: '#5A6478', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 12 },
  targetHint: { color: '#1B58B8', textTransform: 'none', fontWeight: '400' },
  input: { backgroundColor: '#F7F7F2', borderRadius: 8, padding: 14, color: '#F7F7F2', fontSize: 16, borderWidth: 1, borderColor: '#DBDDD3' },
  multiline: { height: 64, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: '#F7F7F2', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: '#DBDDD3' },
  chipActive: { backgroundColor: '#1B58B822', borderColor: '#1B58B8' },
  chipText: { color: '#5A6478', fontSize: 13 },
  chipTextActive: { color: '#1B58B8', fontWeight: '600' },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelBtn: { flex: 1, backgroundColor: '#F7F7F2', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  cancelBtnText: { color: '#5A6478', fontSize: 14, fontWeight: '600' },
  saveBtn: { flex: 2, backgroundColor: '#1B58B8', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#F7F7F2', fontSize: 14, fontWeight: '700' },
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyText: { color: '#5A6478', fontSize: 16, fontWeight: '600' },
  emptySubtext: { color: '#CFD2C6', fontSize: 13, marginTop: 6, textAlign: 'center' },
  card: { backgroundColor: '#ECEDE6', borderRadius: 14, padding: 16, marginBottom: 14 },
  cardDate: { color: '#F7F7F2', fontSize: 15, fontWeight: '700', marginBottom: 10 },
  markerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#222222' },
  markerLabel: { color: '#5A6478', fontSize: 13 },
  markerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  markerValue: { fontSize: 15, fontWeight: '600' },
  sulkowitch: { color: '#eab308', fontSize: 12, marginTop: 8 },
  cardNotes: { color: '#5A6478', fontSize: 12, marginTop: 6, fontStyle: 'italic' },
  cardHint: { color: '#DBDDD3', fontSize: 11, marginTop: 8 },
  disclaimer: { color: '#CFD2C6', fontSize: 11, textAlign: 'center', marginTop: 24 },
  trendSection: { backgroundColor: '#ECEDE6', borderRadius: 14, padding: 16, marginBottom: 20 },
  trendTitle: { color: '#14213D', fontSize: 14, fontWeight: '700', marginBottom: 12 },
  trendChart: { flex: 1, alignItems: 'center' },
  trendChartLabel: { color: '#5A6478', fontSize: 11, fontWeight: '700', marginBottom: 8 },
  miniChart: { flexDirection: 'row', alignItems: 'flex-end', height: 80, gap: 2 },
  miniBar: { width: '100%', borderRadius: 2, minWidth: 6 },
  miniValue: { color: '#5A6478', fontSize: 8, marginTop: 2 },
  miniDate: { color: '#9AA3B2', fontSize: 7 },
  trendHint: { color: '#9AA3B2', fontSize: 13, textAlign: 'center', marginBottom: 16 },
});
