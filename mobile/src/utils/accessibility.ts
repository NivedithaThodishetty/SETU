import { AccessibilityInfo } from 'react-native';

/**
 * Generates proper accessibility labels
 */
export function getAccessibilityLabel(text: string, context?: string): string {
  if (context) {
    return `${text}, ${context}`;
  }
  return text;
}

/**
 * Wraps AccessibilityInfo.announceForAccessibility
 */
export function announceForAccessibility(message: string): void {
  AccessibilityInfo.announceForAccessibility(message);
}

/**
 * Wraps AccessibilityInfo.isScreenReaderEnabled
 */
export async function isScreenReaderEnabled(): Promise<boolean> {
  return await AccessibilityInfo.isScreenReaderEnabled();
}
