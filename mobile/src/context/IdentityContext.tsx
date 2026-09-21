/**
 * SETU Mobile — Identity & System Health Context
 * -----------------------------------------------
 * Manages anonymous per-device x-user-id token, background health probes,
 * and MongoDB synchronization status. Exposes granular engine state matching
 * the web frontend's `engine` signal: 'checking' | 'ok' | 'nokey' | 'down'.
 *
 * The same backend serves all three SETU clients (web, mobile, extension).
 * This context handles the mobile side of the x-user-id persistence model.
 */

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { getUserId, resetUserId } from '../services/identity';
import { api } from '../services/api';
import { SystemHealthStatus } from '../types';

export type EngineState = 'checking' | 'ok' | 'nokey' | 'down';

interface IdentityContextValue {
  userId: string;
  engineState: EngineState;
  isEngineReady: boolean;
  isAiConfigured: boolean;
  isDbConnected: boolean;
  healthInfo: SystemHealthStatus | null;
  isLoading: boolean;
  checkHealth: () => Promise<void>;
  resetIdentity: () => Promise<string>;
}

const IdentityContext = createContext<IdentityContextValue | null>(null);

/** Polling interval for health checks (30s) */
const HEALTH_POLL_MS = 30000;

export const IdentityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [userId, setUserId] = useState<string>('');
  const [engineState, setEngineState] = useState<EngineState>('checking');
  const [isDbConnected, setIsDbConnected] = useState(false);
  const [isAiConfigured, setIsAiConfigured] = useState(false);
  const [healthInfo, setHealthInfo] = useState<SystemHealthStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkHealth = useCallback(async () => {
    try {
      const data = await api.health();
      if (!data) {
        // soft mode returned null — engine is unreachable
        setEngineState('down');
        setIsDbConnected(false);
        setIsAiConfigured(false);
        return;
      }
      setHealthInfo(data);
      setIsDbConnected(Boolean(data.database?.connected));
      setIsAiConfigured(Boolean(data.aiConfigured));

      if (data.status === 'healthy') {
        setEngineState(data.aiConfigured ? 'ok' : 'nokey');
      } else {
        setEngineState('down');
      }
    } catch (_) {
      setEngineState('down');
      setIsDbConnected(false);
      setIsAiConfigured(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const id = await getUserId();
        if (!cancelled) setUserId(id);
        await checkHealth();
      } catch (_) {
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    init();

    // Periodic health probes
    intervalRef.current = setInterval(checkHealth, HEALTH_POLL_MS);

    // Pause health checks when app is backgrounded, resume on foreground
    const handleAppState = (state: AppStateStatus) => {
      if (state === 'active') {
        checkHealth();
        if (!intervalRef.current) {
          intervalRef.current = setInterval(checkHealth, HEALTH_POLL_MS);
        }
      } else {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppState);

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
      subscription.remove();
    };
  }, [checkHealth]);

  const handleResetIdentity = useCallback(async () => {
    const newId = await resetUserId();
    setUserId(newId);
    return newId;
  }, []);

  return (
    <IdentityContext.Provider
      value={{
        userId,
        engineState,
        isEngineReady: engineState === 'ok',
        isAiConfigured,
        isDbConnected,
        healthInfo,
        isLoading,
        checkHealth,
        resetIdentity: handleResetIdentity,
      }}
    >
      {children}
    </IdentityContext.Provider>
  );
};

export function useIdentity(): IdentityContextValue {
  const context = useContext(IdentityContext);
  if (!context) {
    throw new Error('useIdentity must be used within an IdentityProvider');
  }
  return context;
}
