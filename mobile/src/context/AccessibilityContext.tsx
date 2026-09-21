/**
 * SETU Mobile — reading and accessibility preferences.
 *
 * The single place a preference is written, and the single place the rest of the
 * app is told about it. Language, voice, speaking pace, backend address and the
 * rewards switch all live in stateless service modules that cannot read storage
 * themselves — the alternative, letting each of them reach into AsyncStorage,
 * is how you end up with the API answering in Tamil while the voice still reads
 * English.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

import {
  UserPreferences,
  FontStyleOption,
  TextSizeOption,
  MotionOption,
  ReadingProfile,
  ThemeOption,
  SpacingOption,
  LetterSpacingOption,
} from '../types';
import {
  getStoredPreferences,
  saveStoredPreferences,
  DEFAULT_PREFERENCES,
} from '../services/storage';
import { SIZE_SCALE } from '../constants/theme';
import { SPACING_SCALE } from '../constants/themes';
import { DEFAULT_LANGUAGE } from '../constants/languages';
import { tts } from '../services/tts';
import { setApiBaseUrl, setApiLanguage } from '../services/api';
import { initIdentity } from '../services/identity';
import { initProgress, setRewardsAnnounced } from '../services/progress';

interface AccessibilityContextValue {
  preferences: UserPreferences;

  font: FontStyleOption;
  size: TextSizeOption;
  sizeScale: number;
  theme: ThemeOption;
  spacing: SpacingOption;
  /** Line-height multiplier derived from `spacing`. Read by every Text. */
  spacingScale: number;
  letterSpacing: LetterSpacingOption;
  motion: MotionOption;
  reduceMotion: boolean;
  bionic: boolean;
  readingRuler: boolean;
  speechRate: number;
  speechPitch: number;
  language: string;
  voice: string | null;
  speakOnTap: boolean;
  rewards: boolean;
  colorOverlay: string;
  colorOverlayOpacity: number;
  profile: ReadingProfile[];
  hasCompletedOnboarding: boolean;
  customApiUrl: string;
  isLoading: boolean;

  updatePreferences: (updates: Partial<UserPreferences>) => Promise<void>;
  setFont: (font: FontStyleOption) => Promise<void>;
  setSize: (size: TextSizeOption) => Promise<void>;
  setTheme: (theme: ThemeOption) => Promise<void>;
  setSpacing: (spacing: SpacingOption) => Promise<void>;
  setLetterSpacing: (letterSpacing: LetterSpacingOption) => Promise<void>;
  setMotion: (motion: MotionOption) => Promise<void>;
  toggleBionic: () => Promise<void>;
  toggleReadingRuler: () => Promise<void>;
  setSpeechRate: (rate: number) => Promise<void>;
  setSpeechPitch: (pitch: number) => Promise<void>;
  setLanguage: (code: string) => Promise<void>;
  setVoice: (speakerId: string | null) => Promise<void>;
  toggleSpeakOnTap: () => Promise<void>;
  toggleRewards: () => Promise<void>;
  setColorOverlay: (overlay: string, opacity?: number) => Promise<void>;
  setProfile: (profile: ReadingProfile[]) => Promise<void>;
  setCustomApiUrl: (url: string) => Promise<void>;
  completeOnboarding: () => Promise<void>;
}

const AccessibilityContext = createContext<AccessibilityContextValue | null>(null);

/**
 * Push preference values into the stateless service layer.
 *
 * Called once on load and again on every change, rather than having each
 * service reach back into storage on demand — which would make every API call
 * and every utterance await a disk read.
 */
function applyPreferences(prefs: UserPreferences): void {
  setApiBaseUrl(prefs.customApiUrl);
  setApiLanguage(prefs.language || DEFAULT_LANGUAGE);

  tts.setRate(prefs.speechRate);
  tts.setPitch(prefs.speechPitch);
  tts.setLanguage(prefs.language || DEFAULT_LANGUAGE);
  tts.setSpeaker(prefs.voice);

  setRewardsAnnounced(prefs.rewards !== false);
}

export const AccessibilityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // Identity first: everything downstream stamps `x-user-id` on requests,
        // and a boot-time progress sync that goes out anonymous would come back
        // with somebody else's streak.
        await initIdentity();

        const stored = await getStoredPreferences();
        if (cancelled) return;

        applyPreferences(stored);
        setPreferences(stored);

        // Top up local rewards from the server copy, so a streak built on
        // another device is not silently restarted here.
        initProgress().catch(() => {});
      } catch (_) {
        /* defaults are already applied */
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const updatePreferences = useCallback(async (updates: Partial<UserPreferences>) => {
    const updated = await saveStoredPreferences(updates);
    applyPreferences(updated);

    // A different engine may have a different speech configuration entirely, so
    // the "is natural voice available" answer has to be re-asked, not reused.
    if (updates.customApiUrl !== undefined) tts.resetProbe();

    setPreferences(updated);
  }, []);

  const setFont = useCallback((font: FontStyleOption) => updatePreferences({ font }), [updatePreferences]);
  const setSize = useCallback((size: TextSizeOption) => updatePreferences({ size }), [updatePreferences]);
  const setTheme = useCallback((theme: ThemeOption) => updatePreferences({ theme }), [updatePreferences]);
  const setSpacing = useCallback(
    (spacing: SpacingOption) => updatePreferences({ spacing }),
    [updatePreferences]
  );
  const setLetterSpacing = useCallback(
    (letterSpacing: LetterSpacingOption) => updatePreferences({ letterSpacing }),
    [updatePreferences]
  );
  const setMotion = useCallback((motion: MotionOption) => updatePreferences({ motion }), [updatePreferences]);
  const setSpeechRate = useCallback(
    (speechRate: number) => updatePreferences({ speechRate }),
    [updatePreferences]
  );
  const setSpeechPitch = useCallback(
    (speechPitch: number) => updatePreferences({ speechPitch }),
    [updatePreferences]
  );
  const setLanguage = useCallback(
    (language: string) => updatePreferences({ language }),
    [updatePreferences]
  );
  const setVoice = useCallback(
    (voice: string | null) => updatePreferences({ voice }),
    [updatePreferences]
  );
  const setProfile = useCallback(
    (profile: ReadingProfile[]) => updatePreferences({ profile }),
    [updatePreferences]
  );
  const setCustomApiUrl = useCallback(
    (customApiUrl: string) => updatePreferences({ customApiUrl }),
    [updatePreferences]
  );
  const setColorOverlay = useCallback(
    (colorOverlay: string, colorOverlayOpacity?: number) =>
      updatePreferences(
        colorOverlayOpacity === undefined
          ? { colorOverlay }
          : { colorOverlay, colorOverlayOpacity }
      ),
    [updatePreferences]
  );

  const toggleBionic = useCallback(
    () => updatePreferences({ bionic: !preferences.bionic }),
    [preferences.bionic, updatePreferences]
  );
  const toggleReadingRuler = useCallback(
    () => updatePreferences({ readingRuler: !preferences.readingRuler }),
    [preferences.readingRuler, updatePreferences]
  );
  const toggleSpeakOnTap = useCallback(
    () => updatePreferences({ speakOnTap: !preferences.speakOnTap }),
    [preferences.speakOnTap, updatePreferences]
  );
  const toggleRewards = useCallback(
    () => updatePreferences({ rewards: !preferences.rewards }),
    [preferences.rewards, updatePreferences]
  );
  const completeOnboarding = useCallback(
    () => updatePreferences({ hasCompletedOnboarding: true }),
    [updatePreferences]
  );

  const sizeScale = (SIZE_SCALE as Record<string, number>)[preferences.size] || 1.0;
  const spacingScale = SPACING_SCALE[preferences.spacing] || 1;

  return (
    <AccessibilityContext.Provider
      value={{
        preferences,
        font: preferences.font,
        size: preferences.size,
        sizeScale,
        theme: preferences.theme,
        spacing: preferences.spacing,
        spacingScale,
        letterSpacing: preferences.letterSpacing,
        motion: preferences.motion,
        reduceMotion: preferences.motion === 'reduced',
        bionic: preferences.bionic,
        readingRuler: preferences.readingRuler,
        speechRate: preferences.speechRate,
        speechPitch: preferences.speechPitch,
        language: preferences.language,
        voice: preferences.voice,
        speakOnTap: preferences.speakOnTap,
        rewards: preferences.rewards,
        colorOverlay: preferences.colorOverlay,
        colorOverlayOpacity: preferences.colorOverlayOpacity,
        profile: preferences.profile,
        hasCompletedOnboarding: preferences.hasCompletedOnboarding,
        customApiUrl: preferences.customApiUrl,
        isLoading,
        updatePreferences,
        setFont,
        setSize,
        setTheme,
        setSpacing,
        setLetterSpacing,
        setMotion,
        toggleBionic,
        toggleReadingRuler,
        setSpeechRate,
        setSpeechPitch,
        setLanguage,
        setVoice,
        toggleSpeakOnTap,
        toggleRewards,
        setColorOverlay,
        setProfile,
        setCustomApiUrl,
        completeOnboarding,
      }}
    >
      {children}
    </AccessibilityContext.Provider>
  );
};

export function useAccessibility(): AccessibilityContextValue {
  const context = useContext(AccessibilityContext);
  if (!context) {
    throw new Error('useAccessibility must be used within an AccessibilityProvider');
  }
  return context;
}
