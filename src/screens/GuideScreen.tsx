import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDb } from '../db/schema';

const ARXIV_RSS = 'https://export.arxiv.org/rss/q-bio.NC+cs.AI?search_query=multiple+sclerosis';
const FETCH_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface NewsItem {
  title: string;
  summary: string;
  url: string;
  published_date: string;
}

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

function extractFirstTwoSentences(text: string): string {
  const clean = text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const sentences = clean.match(/[^.!?]+[.!?]+/g) || [];
  return sentences.slice(0, 2).join(' ').trim() || clean.slice(0, 200);
}

function parseRssItems(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null && items.length < 20) {
    const block = match[1];
    const title = (/<title>([\s\S]*?)<\/title>/.exec(block)?.[1] ?? '').replace(/<!\[CDATA\[|\]\]>/g, '').trim();
    const link = (/<link>([\s\S]*?)<\/link>/.exec(block)?.[1] ?? '').trim();
    const desc = (/<description>([\s\S]*?)<\/description>/.exec(block)?.[1] ?? '').replace(/<!\[CDATA\[|\]\]>/g, '').trim();
    const pubDate = (/<pubDate>([\s\S]*?)<\/pubDate>/.exec(block)?.[1] ?? '').trim();
    if (title && link) {
      items.push({
        title,
        summary: extractFirstTwoSentences(desc),
        url: link,
        published_date: pubDate,
      });
    }
  }
  return items;
}

async function fetchAndCacheNews(): Promise<NewsItem[]> {
  const res = await fetch(ARXIV_RSS, { headers: { Accept: 'application/rss+xml' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  const items = parseRssItems(xml);
  if (items.length === 0) throw new Error('No items parsed');

  const db = await getDb();
  await db.runAsync('DELETE FROM news_cache');
  for (const item of items) {
    await db.runAsync(
      `INSERT OR REPLACE INTO news_cache (title, summary, url, published_date) VALUES (?, ?, ?, ?)`,
      [item.title, item.summary, item.url, item.published_date],
    );
  }
  await AsyncStorage.setItem('news_last_fetched', Date.now().toString());
  return items;
}

async function loadCachedNews(): Promise<NewsItem[]> {
  const db = await getDb();
  return db.getAllAsync<NewsItem>(
    'SELECT title, summary, url, published_date FROM news_cache ORDER BY fetched_at DESC LIMIT 20',
  );
}

export default function GuideScreen() {
  const [forbidden, setForbidden] = useState<DietaryRestriction[]>([]);
  const [caution, setCaution] = useState<DietaryRestriction[]>([]);
  const [supplements, setSupplements] = useState<SupplementStackItem[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    const db = await getDb();
    const restrictions = await db.getAllAsync<DietaryRestriction>(
      'SELECT * FROM dietary_restrictions ORDER BY severity, ingredient',
    );
    setForbidden(restrictions.filter((r) => r.severity === 'forbidden'));
    setCaution(restrictions.filter((r) => r.severity === 'caution'));
    const stack = await db.getAllAsync<SupplementStackItem>(
      `SELECT s.name, s.notes, sr.dose_amount, sr.dose_unit
       FROM supplements s
       JOIN schedule_rules sr ON s.id = sr.supplement_id
       ORDER BY sr.display_order`,
    );
    setSupplements(stack);
  }, []);

  const loadNews = useCallback(async (force = false) => {
    setNewsLoading(true);
    setNewsError(false);
    try {
      const lastFetched = await AsyncStorage.getItem('news_last_fetched');
      const stale = !lastFetched || Date.now() - parseInt(lastFetched, 10) > FETCH_INTERVAL_MS;
      if (stale || force) {
        try {
          const items = await fetchAndCacheNews();
          setNews(items);
        } catch {
          const cached = await loadCachedNews();
          setNews(cached);
          if (cached.length === 0) setNewsError(true);
        }
      } else {
        const cached = await loadCachedNews();
        setNews(cached);
      }
    } finally {
      setNewsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    loadNews();
  }, [loadData, loadNews]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadData(), loadNews(true)]);
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#C96A50" />
      }
    >
      <Text style={styles.heading}>Coimbra Protocol Guide</Text>

      {/* RESEARCH NEWS */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Research Updates</Text>
        <TouchableOpacity onPress={() => loadNews(true)} activeOpacity={0.7}>
          <Ionicons name="refresh" size={18} color="#C96A50" />
        </TouchableOpacity>
      </View>

      {newsLoading && news.length === 0 ? (
        <ActivityIndicator color="#C96A50" style={{ marginBottom: 16 }} />
      ) : newsError ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>Unable to load news. Pull down to retry.</Text>
        </View>
      ) : (
        news.map((item, i) => (
          <TouchableOpacity
            key={i}
            style={styles.newsCard}
            onPress={() => Linking.openURL(item.url)}
            activeOpacity={0.8}
          >
            <Text style={styles.newsTitle}>{item.title}</Text>
            <Text style={styles.newsSummary}>{item.summary}</Text>
            <View style={styles.newsMeta}>
              <Text style={styles.newsDate}>{item.published_date?.slice(0, 16) ?? ''}</Text>
              <Text style={styles.newsLink}>Read paper →</Text>
            </View>
          </TouchableOpacity>
        ))
      )}

      {/* DIETARY RESTRICTIONS */}
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
            {r.aliases ? <Text style={styles.aliases}>{r.aliases}</Text> : null}
            {r.notes ? <Text style={styles.notes}>{r.notes}</Text> : null}
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
            {r.aliases ? <Text style={styles.aliases}>{r.aliases}</Text> : null}
            {r.notes ? <Text style={styles.notes}>{r.notes}</Text> : null}
          </View>
        ))
      )}

      {/* SUPPLEMENT STACK */}
      <Text style={styles.sectionTitle}>Supplement Stack</Text>
      {supplements.length === 0 ? (
        <Text style={styles.emptyText}>Loading...</Text>
      ) : (
        supplements.map((s, i) => (
          <View key={i} style={styles.card}>
            <Text style={styles.supplementName}>{s.name}</Text>
            <Text style={styles.supplementDose}>{s.dose_amount} {s.dose_unit}</Text>
            {s.notes ? <Text style={styles.supplementNotes}>{s.notes}</Text> : null}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAF7F4' },
  content: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 40 },
  heading: { color: '#2C2420', fontSize: 24, fontWeight: '800', marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, marginTop: 4 },
  sectionTitle: { color: '#2C2420', fontSize: 16, fontWeight: '700', marginBottom: 4 },
  subsectionTitle: { color: '#7A6A62', fontSize: 15, fontWeight: '600', marginBottom: 8, marginTop: 12, letterSpacing: 0.2 },
  newsCard: { backgroundColor: '#F2EDE8', borderRadius: 14, padding: 16, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: '#4A7A9B', borderWidth: 1, borderColor: '#E8E0D8' },
  newsTitle: { color: '#2C2420', fontSize: 15, fontWeight: '600', lineHeight: 22, marginBottom: 6 },
  newsSummary: { color: '#7A6A62', fontSize: 15, lineHeight: 22, marginBottom: 8 },
  newsMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  newsDate: { color: '#B0A098', fontSize: 11 },
  newsLink: { color: '#4A7A9B', fontSize: 11, fontWeight: '700' },
  errorCard: { backgroundColor: '#F2EDE8', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E8E0D8' },
  errorText: { color: '#7A6A62', fontSize: 15 },
  emptyText: { color: '#B0A098', fontSize: 15, marginBottom: 16 },
  card: { backgroundColor: '#F2EDE8', borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#E8E0D8' },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ingredient: { color: '#2C2420', fontSize: 16, fontWeight: '700', flex: 1, marginRight: 8 },
  chip: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  chipForbidden: { backgroundColor: '#C0404018' },
  chipCaution: { backgroundColor: '#C4882A18' },
  chipText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  chipTextForbidden: { color: '#C04040' },
  chipTextCaution: { color: '#C4882A' },
  aliases: { color: '#7A6A62', fontSize: 13, marginTop: 4 },
  notes: { color: '#7A6A62', fontSize: 15, marginTop: 2, lineHeight: 22 },
  supplementName: { color: '#2C2420', fontSize: 16, fontWeight: '700' },
  supplementDose: { color: '#C96A50', fontSize: 13, fontWeight: '600', marginTop: 2 },
  supplementNotes: { color: '#7A6A62', fontSize: 15, marginTop: 4, lineHeight: 22 },
});
