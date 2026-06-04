import { useRef, useEffect, useState, useCallback } from 'react';
import { AppState } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';

export function useBiometricGate() {
  const [locked, setLocked] = useState(false);
  const authenticatedRef = useRef(false);

  const authenticate = useCallback(async () => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hasHardware || !isEnrolled) {
      authenticatedRef.current = true;
      setLocked(false);
      return;
    }
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock Protocol Tracker',
      fallbackLabel: 'Try Again',
    });
    if (result.success) {
      authenticatedRef.current = true;
      setLocked(false);
    } else {
      authenticatedRef.current = false;
      setLocked(true);
    }
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !authenticatedRef.current) {
        authenticate();
      }
    });
    return () => sub.remove();
  }, [authenticate]);

  return { locked, authenticate, authenticatedRef };
}
