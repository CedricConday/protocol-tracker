import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Sharing from 'expo-sharing';
import { getDb } from '../db/schema';
import { getMiscFlag, setMiscFlag } from '../db/queries';

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

interface FamilyMember {
  id: number;
  name: string;
  joined_at: string;
}

export default function FamilySyncScreen() {
  const [syncCode, setSyncCode] = useState('');
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const code = await getMiscFlag('family_sync_code');
    if (!code) {
      const newCode = generateCode();
      await setMiscFlag('family_sync_code', newCode);
      setSyncCode(newCode);
    } else {
      setSyncCode(code);
    }
    const db = await getDb();
    const m = await db.getAllAsync<FamilyMember>('SELECT * FROM family_members ORDER BY joined_at ASC');
    setMembers(m);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleShare = async () => {
    try {
      await Sharing.shareAsync(`data:text/plain;base64,${btoa('Join my MS Central family view. Code: ' + syncCode)}`, {
        mimeType: 'text/plain',
        dialogTitle: 'Share Family Code',
      });
    } catch {
      // user cancelled
    }
  };

  const handleRemove = (id: number, name: string) => {
    Alert.alert('Remove Family Member', `Remove ${name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          const db = await getDb();
          await db.runAsync('DELETE FROM family_members WHERE id = ?', [id]);
          await load();
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#C96A50" />}
    >
      <Text style={styles.heading}>Family Sync</Text>

      <View style={styles.codeCard}>
        <Text style={styles.codeLabel}>Share Code</Text>
        <Text style={styles.codeValue}>{syncCode}</Text>
        <TouchableOpacity style={styles.shareBtn} onPress={handleShare} activeOpacity={0.8}>
          <Text style={styles.shareBtnText}>Share</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Connected Family Members</Text>
      {members.length === 0 ? (
        <Text style={styles.emptyText}>No family members connected yet. Share your code to invite them.</Text>
      ) : (
        members.map((m) => (
          <View key={m.id} style={styles.memberCard}>
            <View style={styles.memberInfo}>
              <Text style={styles.memberName}>{m.name}</Text>
              <Text style={styles.memberDate}>Joined {new Date(m.joined_at).toLocaleDateString()}</Text>
            </View>
            <TouchableOpacity style={styles.removeBtn} onPress={() => handleRemove(m.id, m.name)} activeOpacity={0.7}>
              <Text style={styles.removeBtnText}>Remove</Text>
            </TouchableOpacity>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAF7F4' },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  heading: { color: '#2C2420', fontSize: 24, fontWeight: '800', marginBottom: 20 },
  codeCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 24, shadowColor: '#2C2420', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  codeLabel: { color: '#7A6A62', fontSize: 13, fontWeight: '600', marginBottom: 12 },
  codeValue: { color: '#2C2420', fontSize: 36, fontWeight: '800', letterSpacing: 6, marginBottom: 16 },
  shareBtn: { backgroundColor: '#C96A50', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 32 },
  shareBtnText: { color: '#FAF7F4', fontSize: 15, fontWeight: '700' },
  sectionTitle: { color: '#7A6A62', fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: 8, marginLeft: 4 },
  emptyText: { color: '#B0A098', fontSize: 14, textAlign: 'center', marginTop: 20 },
  memberCard: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  memberInfo: { flex: 1, marginRight: 12 },
  memberName: { color: '#2C2420', fontSize: 15, fontWeight: '700' },
  memberDate: { color: '#7A6A62', fontSize: 12, marginTop: 2 },
  removeBtn: { backgroundColor: '#FDF5F5', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#C04040' },
  removeBtnText: { color: '#C04040', fontSize: 12, fontWeight: '700' },
});
