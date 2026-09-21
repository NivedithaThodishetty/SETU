/**
 * SETU Mobile — device-only stores.
 *
 * Two small collections that deliberately never leave the phone, unlike every
 * other artefact in SETU:
 *
 *  - The parking lot, the direct accommodation for the one memory finding from
 *    the clinical review — long-term memory in this group is intact, working
 *    memory is not. The problem is never "I forgot how to do this", it is "I
 *    cannot hold that while I finish this". Offloading beats any amount of
 *    reminding, and it only works if writing a note costs nothing.
 *  - The check-in journal, which holds what somebody wrote on their worst day.
 *    There is no server mirror for it and there never should be.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { JournalEntry, ParkedNote } from '../types';

const PARKED_KEY = 'setu.mobile.parked.v1';
const JOURNAL_KEY = 'setu.mobile.journal.v1';

const MAX_NOTES = 40;
const MAX_ENTRIES = 30;

/* ---------------------------- Parking lot ---------------------------- */

export async function getParkedNotes(): Promise<ParkedNote[]> {
  try {
    const raw = await AsyncStorage.getItem(PARKED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

async function writeNotes(notes: ParkedNote[]): Promise<ParkedNote[]> {
  const capped = notes.slice(0, MAX_NOTES);
  try {
    await AsyncStorage.setItem(PARKED_KEY, JSON.stringify(capped));
  } catch (_) {
    /* memory-only for this session */
  }
  return capped;
}

export async function parkNote(text: string): Promise<ParkedNote[]> {
  const clean = text.trim();
  if (!clean) return getParkedNotes();

  const notes = await getParkedNotes();
  return writeNotes([
    { id: `p_${Date.now()}`, text: clean, at: new Date().toISOString(), done: false },
    ...notes,
  ]);
}

export async function toggleParkedNote(id: string): Promise<ParkedNote[]> {
  const notes = await getParkedNotes();
  return writeNotes(notes.map((note) => (note.id === id ? { ...note, done: !note.done } : note)));
}

export async function deleteParkedNote(id: string): Promise<ParkedNote[]> {
  const notes = await getParkedNotes();
  return writeNotes(notes.filter((note) => note.id !== id));
}

export async function clearDoneNotes(): Promise<ParkedNote[]> {
  const notes = await getParkedNotes();
  return writeNotes(notes.filter((note) => !note.done));
}

/* ------------------------------ Journal ------------------------------ */

export async function getJournal(): Promise<JournalEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(JOURNAL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

export async function addJournalEntry(entry: JournalEntry): Promise<JournalEntry[]> {
  const journal = await getJournal();
  const next = [entry, ...journal].slice(0, MAX_ENTRIES);
  try {
    await AsyncStorage.setItem(JOURNAL_KEY, JSON.stringify(next));
  } catch (_) {}
  return next;
}

export async function clearJournal(): Promise<void> {
  try {
    await AsyncStorage.removeItem(JOURNAL_KEY);
  } catch (_) {}
}
