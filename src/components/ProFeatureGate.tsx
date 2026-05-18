import { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { getHighComplianceDaysCount } from '../db/queries';

interface Props {
  children: React.ReactNode;
  featureName?: string;
}

export default function ProFeatureGate({ children, featureName = 'Advanced Settings' }: Props) {
  const [days, setDays] = useState<number | null>(null);
  const unlocked = days !== null && days >= 30;

  useEffect(() => {
    getHighComplianceDaysCount().then(setDays);
  }, []);

  if (days === null) return null;

  if (unlocked) return <>{children}</>;

  return (
    <View style={styles.gate}>
      <View style={styles.lockRow}>
        <Text style={styles.lockIcon}>🔒</Text>
        <Text style={styles.gateTitle}>{featureName}</Text>
      </View>
      <Text style={styles.gateSub}>
        Complete 30 days of full compliance to unlock {featureName.toLowerCase()}.
      </Text>
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${Math.min((days / 30) * 100, 100)}%` as `${number}%` }]} />
      </View>
      <Text style={styles.progressLabel}>{days} / 30 days</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  gate: {
    backgroundColor: '#F2EDE8',
    borderRadius: 12,
    padding: 16,
    marginTop: 24,
    opacity: 0.85,
    borderWidth: 1,
    borderColor: '#D8CFC8',
  },
  lockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  lockIcon: {
    fontSize: 16,
  },
  gateTitle: {
    color: '#2C2420',
    fontSize: 14,
    fontWeight: '700',
  },
  gateSub: {
    color: '#7A6A62',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  progressBar: {
    height: 6,
    backgroundColor: '#E8E0D8',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: 6,
    backgroundColor: '#C4882A',
    borderRadius: 3,
  },
  progressLabel: {
    color: '#B0A098',
    fontSize: 12,
    textAlign: 'right',
  },
});
