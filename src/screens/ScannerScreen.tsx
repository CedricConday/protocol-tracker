import { useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { getDb } from '../db/schema';

interface ScanResult {
  text: string;
  severity: 'safe' | 'forbidden' | 'caution' | 'unknown';
  notes: string;
}

export default function ScannerScreen() {
  const [input, setInput] = useState('');
  const [results, setResults] = useState<ScanResult[]>([]);
  const [checked, setChecked] = useState(false);
  const [checking, setChecking] = useState(false);

  const handleCheck = async () => {
    setChecking(true);
    setChecked(false);
    try {
      const db = await getDb();
      const words = input.split(/[,;\n]+/).map(w => w.trim()).filter(Boolean);
      const unique = [...new Set(words)];

      const restrictions = await db.getAllAsync<{ ingredient: string; severity: string; notes: string; aliases: string }>(
        'SELECT ingredient, severity, notes, aliases FROM dietary_restrictions'
      );

      const scanResults: ScanResult[] = unique.map(word => {
        const match = restrictions.find(r =>
          word.toLowerCase().includes(r.ingredient.toLowerCase()) ||
          r.aliases.toLowerCase().split(',').some(a => word.toLowerCase().includes(a.trim()))
        );
        if (match) {
          return {
            text: word,
            severity: match.severity as 'forbidden' | 'caution',
            notes: match.notes || (match.severity === 'forbidden' ? 'Not allowed on protocol' : 'Limit intake'),
          };
        }
        return { text: word, severity: 'unknown', notes: 'Not in database' };
      });

      setResults(scanResults);
      setChecked(true);
    } finally {
      setChecking(false);
    }
  };

  const getResultStyle = (severity: string) => {
    switch (severity) {
      case 'safe': return { color: '#C96A50', label: '✓ Safe' };
      case 'forbidden': return { color: '#ef4444', label: '✗ AVOID' };
      case 'caution': return { color: '#eab308', label: '⚠ Caution' };
      default: return { color: '#7A6A62', label: '— Not in database' };
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.heading}>Ingredient Scanner</Text>
      <Text style={styles.subtitle}>Paste ingredient list to check against protocol restrictions</Text>

      <TextInput
        style={styles.input}
        placeholder="e.g. milk, almonds, olive oil, quinoa"
        placeholderTextColor="#B0A098"
        value={input}
        onChangeText={setInput}
        multiline
        autoCapitalize="none"
      />

      <TouchableOpacity
        style={[styles.button, checking || !input.trim() ? styles.buttonDisabled : null]}
        onPress={handleCheck}
        disabled={checking || !input.trim()}
        activeOpacity={0.8}
      >
        <Text style={styles.buttonText}>{checking ? 'Checking...' : 'Check Ingredients'}</Text>
      </TouchableOpacity>

      {checked && results.length > 0 ? (
        <View style={styles.resultContainer}>
          {results.map((r, i) => {
            const style = getResultStyle(r.severity);
            return (
              <View key={i} style={styles.resultRow}>
                <Text style={[styles.resultBadge, { color: style.color, borderColor: style.color }]}>
                  {style.label}
                </Text>
                <View style={styles.resultInfo}>
                  <Text style={styles.resultText}>{r.text}</Text>
                  <Text style={[styles.resultNotes, { color: style.color }]}>{r.notes}</Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : checked && results.length === 0 ? (
        <Text style={styles.emptyText}>Enter ingredients above to scan.</Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAF7F4' },
  content: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 40 },
  heading: { color: '#FAF7F4', fontSize: 24, fontWeight: '800', marginBottom: 6 },
  subtitle: { color: '#7A6A62', fontSize: 13, marginBottom: 20, lineHeight: 18 },
  input: { backgroundColor: '#F2EDE8', color: '#FAF7F4', borderRadius: 12, padding: 14, minHeight: 100, fontSize: 15, lineHeight: 22, textAlignVertical: 'top', marginBottom: 16 },
  button: { backgroundColor: '#C96A50', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginBottom: 24 },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#FAF7F4', fontSize: 17, fontWeight: '800' },
  resultContainer: { gap: 8 },
  resultRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#F2EDE8', borderRadius: 10, padding: 12 },
  resultBadge: { fontSize: 11, fontWeight: '700', borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginTop: 1 },
  resultInfo: { flex: 1 },
  resultText: { color: '#FAF7F4', fontSize: 14, fontWeight: '600' },
  resultNotes: { fontSize: 12, marginTop: 2 },
  emptyText: { color: '#7A6A62', fontSize: 14, textAlign: 'center', marginTop: 20 },
});
