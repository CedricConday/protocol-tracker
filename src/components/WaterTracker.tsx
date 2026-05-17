import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Props {
  waterMl: number;
  onAdd: () => void;
}

export default function WaterTracker({ waterMl, onAdd }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Water</Text>
      <Text style={styles.amount}>{waterMl} ml</Text>
      <TouchableOpacity style={styles.button} onPress={onAdd}>
        <Text style={styles.buttonText}>+250 ml</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  label: {
    color: '#888888',
    fontSize: 14,
    fontWeight: '600',
    marginRight: 12,
  },
  amount: {
    color: '#22c55e',
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
  },
  button: {
    backgroundColor: '#22c55e',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  buttonText: {
    color: '#0d0d0d',
    fontSize: 14,
    fontWeight: '700',
  },
});
