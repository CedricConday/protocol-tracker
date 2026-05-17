# WebAuthn Strategy — Coimbra Protocol Patient App

## Objective
To provide a secure, frictionless authentication method for medical data without relying on traditional passwords or central cloud accounts, maintaining the "Local-First" privacy mandate.

## Comparison: Passkeys vs. Local Keychain

### 1. Passkeys (WebAuthn / FIDO2)
- **Nature:** Bound to a sync provider (iCloud Keychain, Google Password Manager).
- **Pros:** Device roaming (use same passkey on new phone), phishing resistant, extremely high UX (FaceID/Fingerprint).
- **Cons:** Cloud-bound by default (violates pure offline mandate if sync is enabled), requires a registered domain/RP ID even for native apps.
- **Library:** `react-native-passkey`.

### 2. Local Keychain (Device-Bound Keys)
- **Nature:** Stored in the Secure Enclave (iOS) or Hardware-backed Keystore (Android).
- **Pros:** 100% Offline, keys never leave the device, biometric gating.
- **Cons:** If device is lost and no backup exists, data is gone.
- **Library:** `expo-secure-store`.

## Recommended Hybrid Architecture
1. **Primary Gate:** Biometric unlock using `expo-local-authentication` to gate access to the local SQLite database.
2. **Encryption:** Use `SQLCipher` with a key stored in `SecureStore`.
3. **Passkeys (Future):** Implement `react-native-passkey` only if we add a "Trust Provider" (MD app or personal cloud) to facilitate secure data recovery.

## Implementation Roadmap
- [ ] Add `expo-local-authentication`.
- [ ] Implement Biometric check on app resume.
- [ ] Research `react-native-quick-crypto` for local key derivation.
- [ ] Integrate `react-native-passkey` once a Relay/Discovery server is available.
