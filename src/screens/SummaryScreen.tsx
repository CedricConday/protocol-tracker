import { StyleSheet, Text, View } from 'react-native';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// placeholder stats
const TAKEN = 4;
const TOTAL = 6;
const WATER_ML = 1750;
const COMPLIANCE = Math.round((TAKEN / TOTAL) * 100);

function getBoxColor(compliance: number) {
  if (compliance >= 80) return '#22c55e';
  if (compliance >= 50) return '#eab308';
  return '#ef4444';
}

// placeholder per-day compliance values for 7 days
const weekData = [85, 65, 40, 90, 75, 100, 0];

export default function SummaryScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Summary</Text>

      <View style={styles.statRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            {TAKEN}/{TOTAL}
          </Text>
          <Text style={styles.statLabel}>Doses Taken</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{WATER_ML}</Text>
          <Text style={styles.statLabel}>Water (ml)</Text>
        </View>
      </View>

      <View style={styles.complianceCard}>
        <Text style={styles.complianceValue}>{COMPLIANCE}%</Text>
        <Text style={styles.complianceLabel}>Compliance</Text>
        <View style={styles.barBg}>
          <View
            style={[
              styles.barFill,
              {
                width: `${COMPLIANCE}%` as unknown as number,
                backgroundColor: getBoxColor(COMPLIANCE),
              },
            ]}
          />
        </View>
      </View>

      <Text style={styles.sectionTitle}>This Week</Text>
      <View style={styles.weekRow}>
        {weekData.map((pct, i) => (
          <View key={i} style={styles.dayCol}>
            <View
              style={[
                styles.dayBox,
                { backgroundColor: getBoxColor(pct) },
              ]}
            />
            <Text style={styles.dayLabel}>{WEEKDAYS[i]}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d0d',
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  heading: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 24,
  },
  statRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  statValue: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '800',
  },
  statLabel: {
    color: '#888888',
    fontSize: 13,
    marginTop: 4,
  },
  complianceCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 24,
  },
  complianceValue: {
    color: '#22c55e',
    fontSize: 40,
    fontWeight: '800',
  },
  complianceLabel: {
    color: '#888888',
    fontSize: 13,
    marginTop: 2,
    marginBottom: 12,
  },
  barBg: {
    width: '100%',
    height: 8,
    backgroundColor: '#333333',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayCol: {
    alignItems: 'center',
    gap: 6,
  },
  dayBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
  },
  dayLabel: {
    color: '#888888',
    fontSize: 11,
    fontWeight: '600',
  },
});
