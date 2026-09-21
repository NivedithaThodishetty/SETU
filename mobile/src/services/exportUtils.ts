/**
 * SETU Mobile — taking work out of the app.
 *
 * Everything SETU produces is something the user then has to use somewhere
 * else: the micro-steps go in a to-do app, the meeting actions go to a team,
 * the study outline goes into notes. An accommodation you cannot get out of the
 * tool is one you end up retyping, which is precisely the cost this app exists
 * to remove.
 *
 * Two exits are offered everywhere. Copy is the fast one, and share hands the
 * file to the system sheet so it can land in Drive, WhatsApp, or email without
 * SETU needing to know about any of them.
 */

import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import { File, Paths } from 'expo-file-system';

import {
  CognitiveModeKey,
  MindMapDocument,
  MindMapNode,
  NumbersModeResult,
  GuideModeResult,
  LearnModeResult,
  MeetModeResult,
  PracticeModeResult,
  SimplifyModeResult,
  StartModeResult,
  WriteModeResult,
} from '../types';

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

export function mapToMarkdown(map: MindMapDocument): string {
  if (!map?.root) return '';

  const lines: string[] = [`# ${map.topic || 'Mind map'}`, ''];
  if (map.summary) lines.push(map.summary, '');

  const walk = (node: MindMapNode, depth: number) => {
    const indent = '  '.repeat(depth);
    lines.push(`${indent}- **${node.label}**${node.detail ? ` — ${node.detail}` : ''}`);

    for (const fact of node.keyFacts || []) lines.push(`${indent}  - ${fact}`);
    for (const child of node.children || []) walk(child, depth + 1);
  };

  walk(map.root, 0);
  lines.push('', `_Made with SETU on ${new Date().toLocaleDateString()}_`);
  return lines.join('\n');
}

/**
 * A plain indented outline.
 *
 * Offered alongside Markdown because asterisks and hashes are noise to a screen
 * reader and to anyone pasting into a plain-text field.
 */
export function mapToOutline(map: MindMapDocument): string {
  if (!map?.root) return '';

  const lines: string[] = [map.topic || 'Mind map', ''];
  const walk = (node: MindMapNode, depth: number) => {
    const indent = '    '.repeat(depth);
    lines.push(`${indent}${node.label}${node.detail ? `: ${node.detail}` : ''}`);
    for (const child of node.children || []) walk(child, depth + 1);
  };

  walk(map.root, 0);
  return lines.join('\n');
}

export function mapToJson(map: MindMapDocument): string {
  return JSON.stringify(map, null, 2);
}

/** Turn any mode result into readable Markdown for copy, share, or read-aloud. */
export function modeResultToMarkdown(
  mode: CognitiveModeKey,
  result: any,
  input: string = ''
): string {
  if (!result) return '';

  const lines: string[] = [];
  const heading = (text: string) => lines.push(`## ${text}`, '');
  const bullets = (items: string[] = []) => {
    for (const item of items) lines.push(`- ${item}`);
    lines.push('');
  };

  if (input.trim()) {
    lines.push('> ' + input.trim().replace(/\n+/g, '\n> '), '');
  }

  switch (mode) {
    case 'start': {
      const r = result as StartModeResult;
      lines.push(r.supportiveMessage, '');
      heading('The next ten minutes');
      lines.push(r.immediateTenMinuteAction, '');
      heading('Micro-steps');
      bullets(r.microSteps);
      if (r.confidenceMeter) {
        lines.push(
          `Effort: ${r.confidenceMeter.effortLevel} · Anxiety: ${r.confidenceMeter.anxietyLevel} · About ${r.confidenceMeter.estimatedTimeMinutes} minutes`,
          ''
        );
      }
      break;
    }
    case 'simplify': {
      const r = result as SimplifyModeResult;
      lines.push(`Reading level: ${r.readabilityGrade}`, '');
      heading('In plain language');
      lines.push(r.plainLanguageRewrite, '');
      heading('Key takeaways');
      bullets(r.keyTakeaways);
      if (r.sensoryTips?.length) {
        heading('If this is a lot to hold');
        bullets(r.sensoryTips);
      }
      break;
    }
    case 'learn': {
      const r = result as LearnModeResult;
      heading('Summary');
      lines.push(r.summary, '');
      if (r.mindMap?.branches?.length) {
        heading('Outline');
        for (const branch of r.mindMap.branches) {
          lines.push(`- **${branch.topic}**`);
          for (const detail of branch.details || []) lines.push(`  - ${detail}`);
        }
        lines.push('');
      }
      if (r.quiz?.length) {
        heading('Self-quiz');
        r.quiz.forEach((q, index) => {
          lines.push(`${index + 1}. ${q.question}`);
          q.options?.forEach((option, oIndex) => {
            lines.push(`   ${oIndex === q.answerIndex ? '✓' : '·'} ${option}`);
          });
          if (q.explanation) lines.push(`   _${q.explanation}_`);
          lines.push('');
        });
      }
      break;
    }
    case 'meet': {
      const r = result as MeetModeResult;
      heading('Summary');
      lines.push(r.summary, '');
      if (r.actionItems?.length) {
        heading('Action items');
        for (const item of r.actionItems) {
          lines.push(`- [ ] ${item.task} — ${item.owner}, by ${item.deadline} (${item.priority})`);
        }
        lines.push('');
      }
      if (r.keyDecisions?.length) {
        heading('Decisions');
        bullets(r.keyDecisions);
      }
      if (r.jargonDecoded?.length) {
        heading('Jargon, decoded');
        for (const entry of r.jargonDecoded) lines.push(`- **${entry.term}** — ${entry.plainMeaning}`);
        lines.push('');
      }
      break;
    }
    case 'practice': {
      const r = result as PracticeModeResult;
      heading('The situation');
      lines.push(r.scenarioContext, '');
      heading('Opening line');
      lines.push(r.openingLine, '');
      heading('If you want a different tone');
      for (const response of r.suggestedResponses || []) {
        lines.push(`- **${response.tone}** — ${response.text}`);
      }
      lines.push('');
      if (r.coachingTip) lines.push(`_${r.coachingTip}_`, '');
      break;
    }
    case 'write': {
      const r = result as WriteModeResult;
      lines.push(`Reading level: ${r.originalGradeLevel}`, '');
      heading('Rewritten');
      lines.push(r.improvedText, '');
      if (r.clarityFixes?.length) {
        heading('Clarity fixes');
        for (const fix of r.clarityFixes) {
          lines.push(`- ~~${fix.originalSnippet}~~ → ${fix.suggestedSnippet}`);
          if (fix.reason) lines.push(`  _${fix.reason}_`);
        }
        lines.push('');
      }
      break;
    }
    case 'guide': {
      const r = result as GuideModeResult;
      lines.push(`# ${r.workflowName}`, '');
      for (const step of r.steps || []) {
        lines.push(`### ${step.stepNumber}. ${step.title}`);
        lines.push(step.actionRequired, '');
        if (step.tip) lines.push(`You will know it worked when: ${step.tip}`, '');
      }
      break;
    }
    case 'numbers': {
      const r = result as NumbersModeResult;
      heading('The question, in plain words');
      lines.push(r.plainQuestion, '');
      lines.push(r.story, '');
      heading('Step by step');
      for (const step of r.steps || []) {
        lines.push(`- ${step.narration} (running total: ${step.runningTotal})`);
      }
      lines.push('');
      heading('Answer');
      lines.push(`**${r.answer}**`, '');
      if (r.checkIt) lines.push(`Check it: ${r.checkIt}`, '');
      if (r.realLife) lines.push(`Where this shows up: ${r.realLife}`, '');
      break;
    }
    default:
      lines.push(JSON.stringify(result, null, 2));
  }

  lines.push(`_Made with SETU on ${new Date().toLocaleDateString()}_`);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

/* -------------------------------------------------------------------------- */
/* Exits                                                                      */
/* -------------------------------------------------------------------------- */

export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    await Clipboard.setStringAsync(text);
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (_) {}
    return true;
  } catch (_) {
    return false;
  }
}

/** Filesystem-safe name derived from a title, so shared files are recognisable. */
function safeFileName(title: string, extension: string): string {
  const base =
    String(title || 'setu-export')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'setu-export';
  return `${base}.${extension}`;
}

/**
 * Hand a text document to the system share sheet.
 *
 * Falls back to the clipboard when sharing is unavailable — on a device with no
 * share targets the user should still end up holding their work rather than an
 * error dialog.
 */
export async function shareText(
  content: string,
  title: string,
  extension: 'md' | 'txt' | 'json' = 'md'
): Promise<{ ok: boolean; fellBackToClipboard: boolean }> {
  if (!content) return { ok: false, fellBackToClipboard: false };

  const mimeTypes = {
    md: 'text/markdown',
    txt: 'text/plain',
    json: 'application/json',
  } as const;

  try {
    if (!(await Sharing.isAvailableAsync())) {
      return { ok: await copyToClipboard(content), fellBackToClipboard: true };
    }

    const file = new File(Paths.cache, safeFileName(title, extension));
    if (file.exists) file.delete();
    file.create();
    file.write(content);

    await Sharing.shareAsync(file.uri, {
      mimeType: mimeTypes[extension],
      dialogTitle: title,
      UTI: extension === 'json' ? 'public.json' : 'public.plain-text',
    });
    return { ok: true, fellBackToClipboard: false };
  } catch (_) {
    return { ok: await copyToClipboard(content), fellBackToClipboard: true };
  }
}
