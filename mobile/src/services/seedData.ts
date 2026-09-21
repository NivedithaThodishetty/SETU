/**
 * SETU Reference & Seed Mind Map Library
 * --------------------------------------
 * Provides rich, checkable worked examples covering Accessibility,
 * Neurodiversity, Dyslexia, ADHD, and AI architectures.
 */

import { MindMapDocument } from '../types';

export const SEED_MIND_MAPS: MindMapDocument[] = [
  {
    id: 'map_seed_transformers',
    topic: 'How does a transformer neural network work?',
    summary:
      'Attention replaces recurrence — the whole sequence is considered at once, so training parallelises and long-range links survive.',
    totalTopics: 14,
    sourceType: 'seed',
    createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    root: {
      id: 'tr_root',
      label: 'Transformer',
      detail: 'The architecture that replaced recurrence in machine learning',
      children: [
        {
          id: 'tr_b1',
          label: 'Self-attention',
          detail: 'Every word weighs every other word in parallel.',
          children: [
            {
              id: 'tr_b1_1',
              label: 'Query, key, value',
              detail: 'Each token emits 3 vectors; query scored against keys decides attention weight.',
            },
            {
              id: 'tr_b1_2',
              label: 'Scaled dot product',
              detail: 'Scores divided by sqrt(d_k) to prevent gradient saturation.',
            },
            {
              id: 'tr_b1_3',
              label: 'Multi-head attention',
              detail: 'Runs several attention heads in parallel to capture distinct relationships.',
            },
          ],
        },
        {
          id: 'tr_b2',
          label: 'Positional encoding',
          detail: 'Sequence order restored without sequential reading.',
          children: [
            {
              id: 'tr_b2_1',
              label: 'Sinusoidal waves',
              detail: 'Sine and cosine waves give each position an extrapolable signature.',
            },
            {
              id: 'tr_b2_2',
              label: 'Learned embeddings',
              detail: 'Direct position vectors learned per slot during training.',
            },
          ],
        },
        {
          id: 'tr_b3',
          label: 'Feed-forward layers',
          detail: 'Holds the majority of the model factual parameters.',
          children: [
            {
              id: 'tr_b3_1',
              label: 'Pointwise expansion',
              detail: 'Widens each position 4x, applies GELU activation, projects back.',
            },
            {
              id: 'tr_b3_2',
              label: 'Knowledge storage',
              detail: 'Acts as associative memory storing relational knowledge.',
            },
          ],
        },
        {
          id: 'tr_b4',
          label: 'Residuals & LayerNorm',
          detail: 'Plumbing that enables training ultra-deep neural networks.',
          children: [
            {
              id: 'tr_b4_1',
              label: 'Skip connections',
              detail: 'Adds input directly to sublayer output preventing vanishing gradients.',
            },
            {
              id: 'tr_b4_2',
              label: 'Pre-normalization',
              detail: 'Normalizes input before sublayers for stable gradient propagation.',
            },
          ],
        },
      ],
    },
  },
  {
    id: 'map_seed_adhd',
    topic: 'ADHD, Dopamine & Executive Function',
    summary:
      'ADHD is a neurodevelopmental variation in dopamine regulation impacting working memory, task initiation, and time perception.',
    totalTopics: 12,
    sourceType: 'seed',
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    root: {
      id: 'adhd_root',
      label: 'ADHD Cognition',
      detail: 'Dopamine transport regulation and executive pathways',
      children: [
        {
          id: 'adhd_b1',
          label: 'Dopamine & Interest',
          detail: 'Interest-based nervous system rather than importance-based.',
          children: [
            {
              id: 'adhd_b1_1',
              label: 'Receptor availability',
              detail: 'Lower baseline dopamine in prefrontal cortex causes stimulation seeking.',
            },
            {
              id: 'adhd_b1_2',
              label: 'Hyperfocus state',
              detail: 'Deep immersion when high interest or urgency floods dopamine.',
            },
          ],
        },
        {
          id: 'adhd_b2',
          label: 'Executive Freeze',
          detail: 'Why starting a task feels like an insurmountable barrier.',
          children: [
            {
              id: 'adhd_b2_1',
              label: 'Task ambiguity',
              detail: 'Undefined scope triggers working memory overload and paralysis.',
            },
            {
              id: 'adhd_b2_2',
              label: '10-minute micro-steps',
              detail: 'SETU Start mode converts mountain tasks into one tiny physical action.',
            },
          ],
        },
        {
          id: 'adhd_b3',
          label: 'Time Agnosia',
          detail: 'Perceiving time primarily as "Now" and "Not Now".',
          children: [
            {
              id: 'adhd_b3_1',
              label: 'Visual countdowns',
              detail: 'External timers make passage of time visible and tangible.',
            },
            {
              id: 'adhd_b3_2',
              label: '25-minute focus intervals',
              detail: 'Structured intervals prevent cognitive exhaustion and burnout.',
            },
          ],
        },
      ],
    },
  },
  {
    id: 'map_seed_dyslexia',
    topic: 'Dyslexia, Phonology & Accessible Typography',
    summary:
      'Dyslexia involves alternative phonological processing where tailored typography and bionic anchor fixation significantly improve reading speed.',
    totalTopics: 11,
    sourceType: 'seed',
    createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    root: {
      id: 'dys_root',
      label: 'Dyslexia Support',
      detail: 'Visual & phonological accessibility mechanisms',
      children: [
        {
          id: 'dys_b1',
          label: 'Letterform Confusion',
          detail: 'Symmetrical letter crowding (b/d/p/q and n/u).',
          children: [
            {
              id: 'dys_b1_1',
              label: 'Atkinson Hyperlegible',
              detail: 'Distinct glyph shapes designed to prevent letter collapse.',
            },
            {
              id: 'dys_b1_2',
              label: 'Heavier baselines',
              detail: 'Asymmetric glyph weight grounds letters to the baseline.',
            },
          ],
        },
        {
          id: 'dys_b2',
          label: 'Bionic Anchor Reading',
          detail: 'Bolding the initial fixation anchor of each word.',
          children: [
            {
              id: 'dys_b2_1',
              label: 'Fixation guiding',
              detail: 'Guides saccadic eye jumps directly to word recognition points.',
            },
            {
              id: 'dys_b2_2',
              label: 'Reduced visual crowding',
              detail: 'Allows rapid context prediction with 40% less eye strain.',
            },
          ],
        },
        {
          id: 'dys_b3',
          label: 'Reading Ruler',
          detail: 'Narrowing the visual window to single lines.',
          children: [
            {
              id: 'dys_b3_1',
              label: 'Eliminates line jumps',
              detail: 'Prevents unintentional skipping or repeating of paragraph lines.',
            },
            {
              id: 'dys_b3_2',
              label: 'High contrast tint',
              detail: 'Light paper background with 4.5:1+ WCAG AA contrast ratio.',
            },
          ],
        },
      ],
    },
  },
  {
    id: 'map_seed_wcag22',
    topic: 'WCAG 2.2 Cognitive Accessibility Guidelines',
    summary:
      'WCAG 2.2 emphasizes accessible authentication, consistent navigation, target sizes >= 24x24px, and dragging alternatives.',
    totalTopics: 10,
    sourceType: 'seed',
    createdAt: new Date(Date.now() - 4 * 86400000).toISOString(),
    root: {
      id: 'wcag_root',
      label: 'WCAG 2.2 Standard',
      detail: 'Core criteria for cognitive and physical accessibility',
      children: [
        {
          id: 'wcag_b1',
          label: 'Cognitive Access',
          detail: 'Removing cognitive memory hurdles.',
          children: [
            {
              id: 'wcag_b1_1',
              label: 'Accessible auth (3.3.8)',
              detail: 'No cognitive function tests (memorizing passwords, CAPTCHAs).',
            },
            {
              id: 'wcag_b1_2',
              label: 'Redundant entry (3.3.7)',
              detail: 'Information previously entered is auto-populated or available.',
            },
          ],
        },
        {
          id: 'wcag_b2',
          label: 'Motor & Touch',
          detail: 'Precise interaction without accidental touches.',
          children: [
            {
              id: 'wcag_b2_1',
              label: 'Target size minimum (2.5.8)',
              detail: 'Touch targets must be at least 24x24 CSS pixels with spacing.',
            },
            {
              id: 'wcag_b2_2',
              label: 'Dragging movements (2.5.7)',
              detail: 'Single-pointer tap alternatives for any drag-and-drop feature.',
            },
          ],
        },
      ],
    },
  },
];
