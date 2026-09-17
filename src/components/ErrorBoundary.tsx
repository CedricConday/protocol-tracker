import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { t } from '../i18n';

interface State { hasError: boolean; error: Error | null }
// A class component, so it cannot subscribe to the language the way the rest
// do. Deliberately left: it renders only after a crash has already taken the
// screen down, where re-reading a language switch is not the problem.
export class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false, error: null };
  static getDerivedStateFromError(error: Error): State { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return (
        <View style={s.container}>
          <Text style={s.title}>{t('somethingWentWrong')}</Text>
          <Text style={s.sub}>{t('pleaseRestart')}</Text>
          <TouchableOpacity style={s.btn} onPress={() => this.setState({ hasError: false, error: null })}>
            <Text style={s.btnText}>{t('tryAgain')}</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}
const s = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: '#FFFFFF' },
  title: { fontSize: 20, fontWeight: '700', color: '#112438', marginBottom: 8 },
  sub: { fontSize: 15, color: '#8A7A72', marginBottom: 32 },
  btn: { backgroundColor: '#22c55e', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  btnText: { color: '#fff', fontWeight: '700' },
});
