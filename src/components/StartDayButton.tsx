import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
} from 'react-native';

interface Props {
  onPress: () => void;
  loading: boolean;
}

export default function StartDayButton({ onPress, loading }: Props) {
  return (
    <TouchableOpacity
      style={[styles.button, loading && styles.buttonDisabled]}
      onPress={onPress}
      disabled={loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color="#0d0d0d" size="small" />
      ) : (
        <Text style={styles.text}>Start My Day</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#22c55e',
    borderRadius: 16,
    paddingHorizontal: 48,
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 220,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  text: {
    color: '#0d0d0d',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
