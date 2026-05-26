import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Pressable from './Pressable';
import { C, space, radius, text as T } from '../theme';

interface Props {
  icon: string;
  title: string;
  subtitle: string;
  actionLabel?: string;
  onAction?: () => void;
}

function EmptyState({ icon, title, subtitle, actionLabel, onAction }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      {actionLabel && onAction ? (
        <Pressable style={styles.btn} onPress={onAction}>
          <Text style={styles.btnText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default memo(EmptyState);

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.xxl,
    paddingHorizontal: space.xl,
  },
  icon:     { fontSize: 48, marginBottom: space.md },
  title:    { ...T.subheading, color: C.text, textAlign: 'center', marginBottom: space.sm },
  subtitle: { ...T.body, color: C.textSub, textAlign: 'center', marginBottom: space.lg },
  btn: {
    backgroundColor: C.primaryBg,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: space.xl,
  },
  btnText: { ...T.body, color: C.primary, fontWeight: '700' },
});
