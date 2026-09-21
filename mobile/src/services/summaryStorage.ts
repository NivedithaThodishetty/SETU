import AsyncStorage from '@react-native-async-storage/async-storage';
import { CognitiveModeKey } from '../types';

export interface SavedSummary {
  id: string;
  modeKey: CognitiveModeKey;
  modeName: string;
  input: string;
  result: any;
  createdAt: string;
}

const KEYS = {
  SUMMARIES: 'setu.mobile.summaries.v1',
};

export async function getSavedSummaries(): Promise<SavedSummary[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.SUMMARIES);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (_) {
    return [];
  }
}

export async function saveSummary(summary: SavedSummary): Promise<SavedSummary[]> {
  const current = await getSavedSummaries();
  const summaryWithId = {
    ...summary,
    id: summary.id || `sum_${Date.now()}`,
    createdAt: summary.createdAt || new Date().toISOString(),
  };

  const filtered = current.filter((s) => s.id !== summaryWithId.id);
  const updated = [summaryWithId, ...filtered];
  
  await AsyncStorage.setItem(KEYS.SUMMARIES, JSON.stringify(updated));
  return updated;
}

export async function deleteSummary(id: string): Promise<SavedSummary[]> {
  const current = await getSavedSummaries();
  const updated = current.filter((s) => s.id !== id);
  
  await AsyncStorage.setItem(KEYS.SUMMARIES, JSON.stringify(updated));
  return updated;
}

export async function clearAllSummaries(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.SUMMARIES);
}
