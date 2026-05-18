import { useCallback, useEffect, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { getDb } from '../db/schema';

interface Rule {
  id: number;
  drug_name: string;
  drug_aliases: string;
  severity: string;
  message: string;
  safe_alternative: string;
}

interface CheckResult {
  rule: Rule;
  matched: string;
}

export default function DrugCheckerScreen() {
  const [query, setQuery] = useState('');
  const [rules, setRules] = useState<Rule[]>([]);
  const [results, setResults] = useState<CheckResult[] | null>(null);
  const [checked, setChecked] = useState(false);

  const load = useCallback(async () => {
    const db = await getDb();
    const rows = await db.getAllAsync<Rule>(
      'SELECT * FROM contraindication_rules ORDER BY severity DESC, drug_name ASC'
    );
    setRules(rows);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCheck = () => {
    if (!query.trim()) return;
    const q = query.toLowerCase();
    const found: CheckResult[] = [];
    for (const rule of rules) {
      const names = [rule.drug_name, ...rule.drug_aliases.split(',').map(a => a.trim())].filter(Boolean);
      const match = names.find(n => q.includes(n.toLowerCase()) || n.toLowerCase().includes(q));
      if (match) found.push({ rule, matched: match });
    }
    setResults(found);
    setChecked(true);
  };

  const severityColor = (s: string) => s === 'danger' ? '#ef4444' : '#eab308';
  const severityLabel = (s: string) => s === 'danger' ? '🔴 STOP — discuss with doctor' : '🟡 Warning — monitor closely';
  const severityBg = (s: string) => s === 'danger' ? '#2a0a0a' : '#2a1a00';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <Text style={styles.subtitle}>
        Check any medication for interactions with the Coimbra Protocol (high-dose Vitamin D3).
      </Text>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={t => { setQuery(t); setChecked(false); setResults(null); }}
          placeholder="Type medication name..."
          placeholderTextColor="#B0A098"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={handleCheck}
        />
        <TouchableOpacity style={styles.checkBtn} onPress={handleCheck} activeOpacity={0.8}>
          <Text style={styles.checkBtnText}>Check</Text>
        </TouchableOpacity>
      </View>

      {checked && results !== null && (
        results.length === 0 ? (
          <View style={styles.clearResult}>
            <Text style={styles.clearTitle}>✓ No known interactions found</Text>
            <Text style={styles.clearSub}>
              This database covers Coimbra-specific contraindications only — not all possible drug interactions.
              Always confirm with your prescribing doctor.
            </Text>
          </View>
        ) : (
          results.map(({ rule, matched }) => (
            <View key={rule.id} style={[styles.resultCard, { backgroundColor: severityBg(rule.severity) }]}>
              <View style={[styles.severityBar, { backgroundColor: severityColor(rule.severity) }]} />
              <View style={styles.resultBody}>
                <Text style={[styles.severityLabel, { color: severityColor(rule.severity) }]}>
                  {severityLabel(rule.severity)}
                </Text>
                <Text style={styles.drugName}>{rule.drug_name}</Text>
                {matched.toLowerCase() !== rule.drug_name.toLowerCase() && (
                  <Text style={styles.matchedAs}>Matched as: {matched}</Text>
                )}
                <Text style={styles.message}>{rule.message}</Text>
                {rule.safe_alternative ? (
                  <View style={styles.altBox}>
                    <Text style={styles.altLabel}>Alternative</Text>
                    <Text style={styles.altText}>{rule.safe_alternative}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          ))
        )
      )}

      <Text style={styles.sectionTitle}>Known Contraindications</Text>
      {rules.map(rule => (
        <View key={rule.id} style={styles.ruleRow}>
          <View style={[styles.severityDot, { backgroundColor: severityColor(rule.severity) }]} />
          <View style={styles.ruleContent}>
            <Text style={styles.ruleName}>{rule.drug_name}</Text>
            {rule.drug_aliases ? (
              <Text style={styles.ruleAliases} numberOfLines={1}>{rule.drug_aliases}</Text>
            ) : null}
          </View>
          <Text style={[styles.ruleSeverity, { color: severityColor(rule.severity) }]}>
            {rule.severity === 'danger' ? 'Danger' : 'Warning'}
          </Text>
        </View>
      ))}

      <View style={styles.disclaimerBox}>
        <Text style={styles.disclaimerText}>
          This is not medical advice. This database covers known Coimbra Protocol contraindications only
          — it does not replace a full drug interaction check. Always consult your prescribing physician
          before making any medication decision.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAF7F4' },
  content: { padding: 20, paddingBottom: 48 },
  subtitle: { color: '#7A6A62', fontSize: 13, lineHeight: 19, marginBottom: 20 },
  searchRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  searchInput: { flex: 1, backgroundColor: '#F2EDE8', borderRadius: 10, padding: 14, color: '#FAF7F4', fontSize: 15, borderWidth: 1, borderColor: '#E8E0D8' },
  checkBtn: { backgroundColor: '#C96A50', borderRadius: 10, paddingHorizontal: 20, justifyContent: 'center', minHeight: 44 },
  checkBtnText: { color: '#FAF7F4', fontSize: 14, fontWeight: '700' },
  clearResult: { backgroundColor: '#F0F7F0', borderRadius: 14, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#C96A5044' },
  clearTitle: { color: '#C96A50', fontSize: 15, fontWeight: '700', marginBottom: 6 },
  clearSub: { color: '#7A6A62', fontSize: 13, lineHeight: 18 },
  resultCard: { borderRadius: 14, marginBottom: 16, flexDirection: 'row', overflow: 'hidden' },
  severityBar: { width: 4 },
  resultBody: { flex: 1, padding: 14 },
  severityLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  drugName: { color: '#FAF7F4', fontSize: 16, fontWeight: '700', marginBottom: 4 },
  matchedAs: { color: '#7A6A62', fontSize: 12, marginBottom: 6 },
  message: { color: '#cccccc', fontSize: 13, lineHeight: 19, marginBottom: 10 },
  altBox: { backgroundColor: '#ffffff11', borderRadius: 10, padding: 12 },
  altLabel: { color: '#C96A50', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
  altText: { color: '#cccccc', fontSize: 13, lineHeight: 18 },
  sectionTitle: { color: '#7A6A62', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12, marginTop: 8 },
  ruleRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F2EDE8', borderRadius: 14, padding: 14, marginBottom: 8, gap: 10 },
  severityDot: { width: 8, height: 8, borderRadius: 4 },
  ruleContent: { flex: 1 },
  ruleName: { color: '#FAF7F4', fontSize: 14, fontWeight: '600' },
  ruleAliases: { color: '#7A6A62', fontSize: 11, marginTop: 2 },
  ruleSeverity: { fontSize: 12, fontWeight: '700' },
  disclaimerBox: { backgroundColor: '#F2EDE8', borderRadius: 14, padding: 16, marginTop: 20 },
  disclaimerText: { color: '#7A6A62', fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
