import { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { getDb } from '../db/schema';

interface DietaryRestriction {
  id: number;
  ingredient: string;
  aliases: string;
  severity: string;
  notes: string;
  source: string;
}

interface SupplementStackItem {
  name: string;
  notes: string;
  dose_amount: string;
  dose_unit: string;
}

export default function GuideScreen() {
  const [forbidden, setForbidden] = useState<DietaryRestriction[]>([]);
  const [caution, setCaution] = useState<DietaryRestriction[]>([]);
  const [supplements, setSupplements] = useState<SupplementStackItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    const db = await getDb();

    const restrictions = await db.getAllAsync<DietaryRestriction>(
      'SELECT * FROM dietary_restrictions ORDER BY severity, ingredient'
    );
    setForbidden(restrictions.filter((r) => r.severity === 'forbidden'));
    setCaution(restrictions.filter((r) => r.severity === 'caution'));

    const stack = await db.getAllAsync<SupplementStackItem>(
      `SELECT s.name, s.notes, sr.dose_amount, sr.dose_unit
       FROM supplements s
       JOIN schedule_rules sr ON s.id = sr.supplement_id
       ORDER BY sr.display_order`
    );
    setSupplements(stack);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#22c55e" />
      }
    >
      <Text style={styles.heading}>Coimbra Protocol Guide</Text>

      <Text style={styles.sectionTitle}>Dietary Restrictions</Text>

      <Text style={styles.subsectionTitle}>Forbidden</Text>
      {forbidden.length === 0 ? (
        <Text style={styles.emptyText}>Loading...</Text>
      ) : (
        forbidden.map((r) => (
          <View key={r.id} style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.ingredient}>{r.ingredient}</Text>
              <View style={[styles.chip, styles.chipForbidden]}>
                <Text style={[styles.chipText, styles.chipTextForbidden]}>forbidden</Text>
              </View>
            </View>
            {r.aliases ? (
              <Text style={styles.aliases}>{r.aliases}</Text>
            ) : null}
            {r.notes ? (
              <Text style={styles.notes}>{r.notes}</Text>
            ) : null}
          </View>
        ))
      )}

      <Text style={styles.subsectionTitle}>Use With Caution</Text>
      {caution.length === 0 ? (
        <Text style={styles.emptyText}>None listed</Text>
      ) : (
        caution.map((r) => (
          <View key={r.id} style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.ingredient}>{r.ingredient}</Text>
              <View style={[styles.chip, styles.chipCaution]}>
                <Text style={[styles.chipText, styles.chipTextCaution]}>caution</Text>
              </View>
            </View>
            {r.aliases ? (
              <Text style={styles.aliases}>{r.aliases}</Text>
            ) : null}
            {r.notes ? (
              <Text style={styles.notes}>{r.notes}</Text>
            ) : null}
          </View>
        ))
      )}

      <Text style={styles.sectionTitle}>Supplement Stack</Text>
      {supplements.length === 0 ? (
        <Text style={styles.emptyText}>Loading...</Text>
      ) : (
        supplements.map((s, i) => (
          <View key={i} style={styles.card}>
            <Text style={styles.supplementName}>{s.name}</Text>
            <Text style={styles.supplementDose}>{s.dose_amount} {s.dose_unit}</Text>
            {s.notes ? (
              <Text style={styles.supplementNotes}>{s.notes}</Text>
            ) : null}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d0d',
  },
  content: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  heading: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 20,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    marginTop: 4,
  },
  subsectionTitle: {
    color: '#888888',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyText: {
    color: '#666666',
    fontSize: 13,
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ingredient: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  chip: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  chipForbidden: {
    backgroundColor: '#ef444430',
  },
  chipCaution: {
    backgroundColor: '#eab30830',
  },
  chipText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chipTextForbidden: {
    color: '#ef4444',
  },
  chipTextCaution: {
    color: '#eab308',
  },
  aliases: {
    color: '#888888',
    fontSize: 12,
    marginTop: 4,
  },
  notes: {
    color: '#999999',
    fontSize: 13,
    marginTop: 2,
    lineHeight: 18,
  },
  supplementName: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  supplementDose: {
    color: '#22c55e',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  supplementNotes: {
    color: '#999999',
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
});
