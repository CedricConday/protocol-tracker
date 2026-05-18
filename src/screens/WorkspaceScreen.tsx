import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildHealthContext } from '../utils/buildHealthContext';
import { getDb } from '../db/schema';

const QUICK_PROMPTS = [
  'Why did I feel worse this week?',
  "What's my compliance trend?",
  'Which supplement do I miss most?',
  'Summarize my last 2 weeks',
];

type Message = {
  role: 'user' | 'assistant';
  text: string;
};

async function callLLM(messages: { role: string; content: string }[], apiKey: string, provider: string): Promise<string> {
  if (provider === 'groq' || provider === 'openai') {
    const baseUrl = provider === 'groq' ? 'https://api.groq.com/openai/v1' : 'https://api.openai.com/v1';
    const model = provider === 'groq' ? 'llama3-8b-8192' : 'gpt-4o-mini';
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, max_tokens: 500 }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message ?? 'API error');
    return data.choices[0].message.content;
  }
  if (provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-3-haiku-20240307', messages, max_tokens: 500 }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message ?? 'API error');
    return data.content[0].text;
  }
  throw new Error('Unknown provider');
}

export default function WorkspaceScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState('groq');
  const [apiKey, setApiKey] = useState('');
  const [context, setContext] = useState('');
  const [contextReady, setContextReady] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const loadSettings = async () => {
      const p = await AsyncStorage.getItem('ai_provider');
      const k = await AsyncStorage.getItem('ai_api_key');
      if (p) setProvider(p);
      if (k) setApiKey(k);
    };
    loadSettings();
  }, []);

  const loadContext = useCallback(async () => {
    const ctx = await buildHealthContext();
    setContext(ctx);
    setContextReady(true);
  }, []);

  useEffect(() => { loadContext(); }, [loadContext]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    if (!apiKey) {
      Alert.alert('API Key Required', 'Groq is free — add your key in Settings to activate.');
      return;
    }

    const userMsg: Message = { role: 'user', text: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const systemMsg = { role: 'system', content: `You are a health assistant for the Coimbra Protocol. Use this context:\n\n${context}` };
      const apiMessages = [systemMsg, ...newMessages.map((m) => ({ role: m.role, content: m.text }))];
      const reply = await callLLM(apiMessages, apiKey, provider);
      setMessages((prev) => [...prev, { role: 'assistant', text: reply }]);
    } catch (e) {
      setMessages((prev) => [...prev, { role: 'assistant', text: `Error: ${e instanceof Error ? e.message : 'Request failed'}` }]);
    } finally {
      setLoading(false);
    }
  }, [messages, loading, apiKey, provider, context]);

  const saveToJournal = async (text: string) => {
    try {
      const db = await getDb();
      const today = new Date().toISOString().split('T')[0];
      await db.runAsync(
        "INSERT INTO journal_entries (date, mood, note) VALUES (?, 'neutral', ?)",
        [today, `[Workspace AI] ${text}`]
      );
      Alert.alert('Saved', 'Response saved to journal.');
    } catch {
      Alert.alert('Error', 'Could not save to journal.');
    }
  };

  if (!apiKey) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.title}>Health Workspace</Text>
        <Text style={styles.emptyText}>Groq is free — add your key in Settings to activate.</Text>
        <TouchableOpacity style={styles.settingsBtn} onPress={() => Alert.alert('Settings', 'Navigate to Settings tab to add key.')} activeOpacity={0.7}>
          <Text style={styles.settingsBtnText}>Open Settings</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Text style={styles.title}>Health Workspace</Text>
        <View style={styles.providerChip}>
          <Text style={styles.providerText}>{provider.toUpperCase()}</Text>
        </View>
      </View>

      {contextReady && (
        <TouchableOpacity style={styles.contextCard} activeOpacity={0.7}>
          <Text style={styles.contextText}>
            Analyzing Health Data · Context Ready
          </Text>
        </TouchableOpacity>
      )}

      <ScrollView ref={scrollRef} style={styles.chat} contentContainerStyle={styles.chatContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
        {messages.length === 0 && (
          <View style={styles.quickRow}>
            {QUICK_PROMPTS.map((q) => (
              <TouchableOpacity key={q} style={styles.quickChip} onPress={() => sendMessage(q)} activeOpacity={0.7}>
                <Text style={styles.quickChipText}>{q}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {messages.map((m, i) => (
          <View key={i} style={[styles.bubble, m.role === 'user' ? styles.userBubble : styles.assistantBubble]}>
            <Text style={[styles.bubbleText, m.role === 'user' ? styles.userText : styles.assistantText]}>{m.text}</Text>
            {m.role === 'assistant' && (
              <TouchableOpacity style={styles.saveBtn} onPress={() => saveToJournal(m.text)} activeOpacity={0.7}>
                <Text style={styles.saveBtnText}>Save to Journal</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
        {loading && <ActivityIndicator color="#22c55e" style={{ marginVertical: 12 }} />}
      </ScrollView>

      <View style={styles.inputRow}>
        <TextInput style={styles.input} value={input} onChangeText={setInput}
          placeholder="Ask about your health data..." placeholderTextColor="#555555"
          onSubmitEditing={() => sendMessage(input)} returnKeyType="send" />
        <TouchableOpacity style={[styles.sendBtn, (!input.trim() || loading) ? styles.sendBtnDisabled : null]}
          onPress={() => sendMessage(input)} disabled={!input.trim() || loading} activeOpacity={0.8}>
          <Text style={styles.sendBtnText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAF7F4' },
  centered: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 60, paddingHorizontal: 20, paddingBottom: 12 },
  title: { color: '#2C2420', fontSize: 24, fontWeight: '800' },
  providerChip: { backgroundColor: '#F2EDE8', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#D8CFC8' },
  providerText: { color: '#C96A50', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  contextCard: { backgroundColor: '#F2EDE8', borderRadius: 8, padding: 10, marginHorizontal: 20, marginBottom: 8, borderWidth: 1, borderColor: '#E8E0D8' },
  contextText: { color: '#7A6A62', fontSize: 12, textAlign: 'center' },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  quickChip: { backgroundColor: '#F2EDE8', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#D8CFC8' },
  quickChipText: { color: '#C96A50', fontSize: 12, fontWeight: '600' },
  chat: { flex: 1, paddingHorizontal: 20 },
  chatContent: { paddingBottom: 12, paddingTop: 10 },
  bubble: { borderRadius: 12, padding: 12, marginBottom: 12, maxWidth: '85%' },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#C96A50' },
  assistantBubble: { alignSelf: 'flex-start', backgroundColor: '#F2EDE8', borderWidth: 1, borderColor: '#E8E0D8' },
  bubbleText: { fontSize: 15, lineHeight: 20 },
  userText: { color: '#FAF7F4', fontWeight: '500' },
  assistantText: { color: '#2C2420' },
  saveBtn: { marginTop: 8, borderTopWidth: 1, borderTopColor: '#E8E0D8', paddingTop: 8 },
  saveBtnText: { color: '#C96A50', fontSize: 12, fontWeight: '600' },
  inputRow: { flexDirection: 'row', alignItems: 'center', padding: 16, borderTopWidth: 1, borderTopColor: '#E8E0D8', backgroundColor: '#FAF7F4' },
  input: { flex: 1, backgroundColor: '#F2EDE8', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: '#2C2420', fontSize: 15, marginRight: 10, borderWidth: 1, borderColor: '#D8CFC8' },
  sendBtn: { backgroundColor: '#C96A50', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10 },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { color: '#FAF7F4', fontSize: 14, fontWeight: '700' },
  emptyText: { color: '#7A6A62', textAlign: 'center', marginTop: 12, marginBottom: 24, fontSize: 15, lineHeight: 22 },
  settingsBtn: { backgroundColor: '#F2EDE8', borderWidth: 1, borderColor: '#C96A50', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24 },
  settingsBtnText: { color: '#C96A50', fontWeight: '700' },
});
