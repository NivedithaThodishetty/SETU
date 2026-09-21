/**
 * SETU Mobile — a navigation handle usable from outside the tree.
 *
 * The side menu, the quick-actions sheet and the reward toasts all sit *above*
 * the navigator rather than inside a screen — that is the only way they can
 * survive a tab change — which means `useNavigation()` is not available to
 * them. They route through this ref instead.
 */

import { createNavigationContainerRef } from '@react-navigation/native';

export type RootRouteName =
  | 'Onboarding'
  | 'MainTabs'
  | 'ModeWorkspace'
  | 'Listen'
  | 'Momentum'
  | 'Breathe'
  | 'CameraOCR'
  | 'DocumentReader'
  | 'Settings'
  | 'About';

export const navigationRef = createNavigationContainerRef<any>();

/**
 * Navigate if the tree is mounted; a no-op before first render.
 *
 * The cast is unavoidable: `navigate` is overloaded on a param-list type that
 * only exists once the navigator is typed statically, and this module is
 * deliberately not — its whole job is to be callable from code that knows
 * nothing about the navigation tree.
 */
export function navigate(name: string, params?: object): void {
  if (!navigationRef.isReady()) return;
  (navigationRef.navigate as (...args: any[]) => void)(name, params);
}

/** Jump to one of the four bottom tabs, optionally with params for its screen. */
export function navigateTab(tab: string, params?: object): void {
  navigate('MainTabs', params ? { screen: tab, params } : { screen: tab });
}

/** The route name currently on screen, or null before the tree is ready. */
export function currentRouteName(): string | null {
  if (!navigationRef.isReady()) return null;
  return navigationRef.getCurrentRoute()?.name ?? null;
}

export function goBack(): void {
  if (navigationRef.isReady() && navigationRef.canGoBack()) {
    navigationRef.goBack();
  }
}
