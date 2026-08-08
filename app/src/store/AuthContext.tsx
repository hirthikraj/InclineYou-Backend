import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { TOKEN_KEY } from '../api/client';

interface AuthState {
  token: string | null;
  trainerId: string | null;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  signIn: (token: string, trainerId: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    token: null,
    trainerId: null,
    isLoading: true,
  });

  useEffect(() => {
    SecureStore.getItemAsync(TOKEN_KEY).then((token) => {
      SecureStore.getItemAsync('trainx_trainer_id').then((trainerId) => {
        setState({ token, trainerId, isLoading: false });
      });
    });
  }, []);

  const signIn = async (token: string, trainerId: string) => {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await SecureStore.setItemAsync('trainx_trainer_id', trainerId);
    setState({ token, trainerId, isLoading: false });
  };

  const signOut = async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync('trainx_trainer_id');
    setState({ token: null, trainerId: null, isLoading: false });
  };

  return (
    <AuthContext.Provider value={{ ...state, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
