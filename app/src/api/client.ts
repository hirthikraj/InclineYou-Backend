import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

export const TOKEN_KEY = 'xrep_jwt';

// Set per environment via .env / EAS build profile. Falls back to the Android
// emulator's alias for the host machine so a fresh clone works with no config.
// A real phone on the same wifi needs your machine's LAN IP, not 10.0.2.2.
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:8080';

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config) => {
  // An explicit header wins. Sign-in's 7a path carries a pending token that is
  // deliberately not in the keychain yet, and the stored one must not shadow it.
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
