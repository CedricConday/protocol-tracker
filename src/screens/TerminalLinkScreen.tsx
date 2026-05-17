import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getProfile } from '../db/queries';

// Firebase project config — matches CoimbraTerminal web app
const FB_PROJECT = 'gen-lang-client-0719787050';
const FB_DATABASE = 'ai-studio-8708e25b-567e-4159-b470-9cc499f24464';
const FB_API_KEY = 'FIREBASE_KEY_ROTATED';
const FB_BASE = `https://firestore.googleapis.com/v1/projects/${FB_PROJECT}/databases/${FB_DATABASE}/documents`;

function firestorePatch(path: string, fields: Record<string, { stringValue?: string; integerValue?: string }>) {
  const fieldPaths = Object.keys(fields).map(k => `updateMask.fieldPaths=${k}`).join('&');
  return fetch(`${FB_BASE}/${path}?key=${FB_API_KEY}&${fieldPaths}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
}

function generateUserId(): string {
  return 'patient_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36);
}

interface QRPayload {
  sessionId: string;
  challenge: string;
  timestamp: number;
  expiresIn: number;
}

export default function TerminalLinkScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [status, setStatus] = useState<'scanning' | 'linking' | 'success' | 'error'>('scanning');
  const [errorMsg, setErrorMsg] = useState('');
  const scannedRef = useRef(false);

  const handleBarcodeScan = useCallback(async ({ data }: { data: string }) => {
    if (scannedRef.current) return;
    scannedRef.current = true;

    let payload: QRPayload;
    try {
      payload = JSON.parse(data);
    } catch {
      setErrorMsg('Invalid QR code. Open Coimbra Terminal and scan its login QR.');
      setStatus('error');
      return;
    }

    if (!payload.sessionId || !payload.timestamp) {
      setErrorMsg('QR code is not from Coimbra Terminal.');
      setStatus('error');
      return;
    }

    const ageMs = Date.now() - payload.timestamp;
    if (ageMs > (payload.expiresIn ?? 120) * 1000) {
      setErrorMsg('QR code expired. Refresh the terminal and scan again.');
      setStatus('error');
      return;
    }

    setStatus('linking');

    try {
      // Get or create a stable user ID for this patient
      let userId = await AsyncStorage.getItem('terminal_user_id');
      if (!userId) {
        userId = generateUserId();
        await AsyncStorage.setItem('terminal_user_id', userId);
      }

      // Promote the web session
      const sessionRes = await firestorePatch(`sessions/${payload.sessionId}`, {
        status: { stringValue: 'authenticated' },
        userId: { stringValue: userId },
      });

      if (!sessionRes.ok) {
        throw new Error(`Session update failed: ${sessionRes.status}`);
      }

      // Sync patient profile to Firestore so terminal can display it
      const profile = await getProfile();
      if (profile) {
        await firestorePatch(`users/${userId}`, {
          name: { stringValue: profile.name ?? 'Patient' },
          complianceSummary: { stringValue: 'Synced from Coimbra app' },
          language: { stringValue: 'EN' },
        });
      }

      setStatus('success');
    } catch (err: any) {
      setErrorMsg(err.message ?? 'Connection failed. Check your internet and try again.');
      setStatus('error');
    }
  }, []);

  const reset = () => {
    scannedRef.current = false;
    setStatus('scanning');
    setErrorMsg('');
  };

  if (!permission) return <View style={styles.container} />;

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.heading}>Camera Access Needed</Text>
        <Text style={styles.subtitle}>Required to scan the Coimbra Terminal QR code.</Text>
        <TouchableOpacity style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Allow Camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (status === 'success') {
    return (
      <View style={styles.container}>
        <View style={styles.successIcon}>
          <Text style={styles.successCheck}>✓</Text>
        </View>
        <Text style={styles.heading}>Terminal Linked</Text>
        <Text style={styles.subtitle}>Your Coimbra Terminal session is now active.{'\n'}Return to the browser to continue.</Text>
        <TouchableOpacity style={[styles.btn, styles.btnOutline]} onPress={reset}>
          <Text style={[styles.btnText, styles.btnTextOutline]}>Scan Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.container}>
        <Text style={styles.errorIcon}>✕</Text>
        <Text style={styles.heading}>Link Failed</Text>
        <Text style={styles.errorMsg}>{errorMsg}</Text>
        <TouchableOpacity style={styles.btn} onPress={reset}>
          <Text style={styles.btnText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Link to Terminal</Text>
      <Text style={styles.subtitle}>Point your camera at the QR code on{'\n'}coimbra.app or your local terminal.</Text>

      <View style={styles.cameraWrapper}>
        {status === 'scanning' ? (
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={handleBarcodeScan}
          />
        ) : (
          <View style={[styles.camera, styles.linkingOverlay]}>
            <ActivityIndicator size="large" color="#22c55e" />
            <Text style={styles.linkingText}>Linking session…</Text>
          </View>
        )}
        {/* Corner guides */}
        <View style={[styles.corner, styles.cornerTL]} />
        <View style={[styles.corner, styles.cornerTR]} />
        <View style={[styles.corner, styles.cornerBL]} />
        <View style={[styles.corner, styles.cornerBR]} />
      </View>

      <Text style={styles.hint}>QR code refreshes every 2 minutes.{'\n'}If expired, click "Regenerate" on the terminal.</Text>
    </View>
  );
}

const CORNER = 24;
const BORDER = 3;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  heading: { color: '#ffffff', fontSize: 22, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  subtitle: { color: '#888888', fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 32 },
  cameraWrapper: { width: 260, height: 260, borderRadius: 20, overflow: 'hidden', position: 'relative', marginBottom: 32 },
  camera: { width: '100%', height: '100%' },
  linkingOverlay: { backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', gap: 12 },
  linkingText: { color: '#22c55e', fontSize: 13, fontWeight: '600' },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: '#22c55e', borderWidth: 0 },
  cornerTL: { top: 0, left: 0, borderTopWidth: BORDER, borderLeftWidth: BORDER, borderTopLeftRadius: 4 },
  cornerTR: { top: 0, right: 0, borderTopWidth: BORDER, borderRightWidth: BORDER, borderTopRightRadius: 4 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: BORDER, borderLeftWidth: BORDER, borderBottomLeftRadius: 4 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: BORDER, borderRightWidth: BORDER, borderBottomRightRadius: 4 },
  hint: { color: '#444', fontSize: 12, textAlign: 'center', lineHeight: 18 },
  btn: { backgroundColor: '#22c55e', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 40, marginTop: 8 },
  btnOutline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#22c55e' },
  btnText: { color: '#0d0d0d', fontSize: 16, fontWeight: '800' },
  btnTextOutline: { color: '#22c55e' },
  successIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#22c55e20', borderWidth: 2, borderColor: '#22c55e', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  successCheck: { color: '#22c55e', fontSize: 32, fontWeight: '700' },
  errorIcon: { color: '#ef4444', fontSize: 40, marginBottom: 12 },
  errorMsg: { color: '#888', fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
});
