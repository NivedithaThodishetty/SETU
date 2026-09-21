/**
 * SETU seed library.
 *
 * A first-run library that is worth reading rather than a lorem-ipsum placeholder.
 * Every map here is real, checkable content drawn from the accessibility domain
 * SETU serves, so a new visitor (or a judge opening the app cold) immediately
 * sees what a finished SETU map looks like instead of an empty state.
 *
 * These are seeded once. The moment the user researches anything of their own,
 * their maps sit above these in the Library, and any seed can be deleted.
 */

const DAY = 24 * 60 * 60 * 1000;

/** Stable, decreasing timestamps so the Library sorts sensibly on first run. */
const daysAgo = (n) => new Date(Date.now() - n * DAY).toISOString();

/* -------------------------------------------------------------------------- */
/* 1. Transformers — the hero worked example                                  */
/* -------------------------------------------------------------------------- */

export const DEFAULT_WORKED_MAP = {
  id: 'map_seed_transformers',
  title: 'Transformer neural networks',
  topic: 'How does a transformer neural network work?',
  summary:
    'Attention replaces recurrence — the whole sequence is considered at once, so training parallelises and long-range links survive.',
  keyFacts: [
    'Self-attention lets every token weigh every other token in the same step, instead of passing state along one word at a time.',
    'Positional encodings put sequence order back in, because attention on its own has no notion of first or last.',
    'Multi-head attention runs several attention patterns in parallel, each free to track a different kind of relationship.',
    'Feed-forward layers process each position independently and hold much of the model’s factual knowledge.',
    'Dropping recurrence is what made training parallelise across a whole sequence, which is what made scale affordable.'
  ],
  followUps: [
    'Why did attention beat recurrence in LSTMs?',
    'How does multi-head attention work mathematically?',
    'What do residual connections and layer norm actually fix?'
  ],
  sources: [
    { title: 'Attention Is All You Need (Vaswani et al., 2017)', url: 'https://arxiv.org/abs/1706.03762' },
    { title: 'The Illustrated Transformer (Jay Alammar)', url: 'https://jalammar.github.io/illustrated-transformer/' }
  ],
  grounded: true,
  isSeed: true,
  root: {
    id: 'tr_root',
    label: 'Transformer',
    detail: 'The architecture that replaced recurrence',
    depth: 0,
    children: [
      {
        id: 'tr_b1',
        label: 'Self-attention',
        detail: 'Every word weighs every other word, in parallel.',
        depth: 1,
        children: [
          {
            id: 'tr_b1_1',
            label: 'Query, key, value',
            detail: 'Each token emits three vectors; a query scored against every key decides how much of each value to keep.',
            depth: 2,
            children: []
          },
          {
            id: 'tr_b1_2',
            label: 'Scaled dot product',
            detail: 'Scores are divided by the square root of the key dimension, which stops softmax from saturating.',
            depth: 2,
            children: []
          },
          {
            id: 'tr_b1_3',
            label: 'Multi-head attention',
            detail: 'Several heads attend in parallel, each in its own subspace, then their outputs are concatenated.',
            depth: 2,
            children: []
          }
        ]
      },
      {
        id: 'tr_b2',
        label: 'Positional encoding',
        detail: 'Sequence order restored without reading in order.',
        depth: 1,
        children: [
          {
            id: 'tr_b2_1',
            label: 'Sinusoidal encodings',
            detail: 'Fixed sine and cosine waves at different frequencies give every position a unique, extrapolable signature.',
            depth: 2,
            children: []
          },
          {
            id: 'tr_b2_2',
            label: 'Learned embeddings',
            detail: 'Many modern models simply learn a position vector per slot, which is simpler but caps context length.',
            depth: 2,
            children: []
          }
        ]
      },
      {
        id: 'tr_b3',
        label: 'Feed-forward layers',
        detail: 'Where much of the stored knowledge actually lives.',
        depth: 1,
        children: [
          {
            id: 'tr_b3_1',
            label: 'Pointwise expansion',
            detail: 'A two-layer network widens each position roughly fourfold, applies GELU, then projects back down.',
            depth: 2,
            children: []
          },
          {
            id: 'tr_b3_2',
            label: 'Most of the parameters',
            detail: 'These layers hold the majority of a transformer’s weights, more than attention does.',
            depth: 2,
            children: []
          }
        ]
      },
      {
        id: 'tr_b4',
        label: 'Residuals and layer norm',
        detail: 'The plumbing that makes deep stacks trainable.',
        depth: 1,
        children: [
          {
            id: 'tr_b4_1',
            label: 'Skip connections',
            detail: 'Each sublayer adds to its input rather than replacing it, so gradients reach the early layers intact.',
            depth: 2,
            children: []
          },
          {
            id: 'tr_b4_2',
            label: 'Pre-norm vs post-norm',
            detail: 'Normalising before each sublayer trains more stably at depth, which is why most large models use it.',
            depth: 2,
            children: []
          }
        ]
      },
      {
        id: 'tr_b5',
        label: 'Training at scale',
        detail: 'Why this design powers foundation models.',
        depth: 1,
        children: [
          {
            id: 'tr_b5_1',
            label: 'Parallel over sequence',
            detail: 'With no step-by-step dependency, an entire sequence trains in one pass across many GPUs.',
            depth: 2,
            children: []
          },
          {
            id: 'tr_b5_2',
            label: 'Next-token prediction',
            detail: 'Predicting the following token over enormous corpora needs no hand-labelled data at all.',
            depth: 2,
            children: []
          }
        ]
      }
    ]
  },
  createdAt: daysAgo(9),
  updatedAt: daysAgo(9)
};

/* -------------------------------------------------------------------------- */
/* 2. WCAG 2.2                                                                */
/* -------------------------------------------------------------------------- */

const WCAG_MAP = {
  id: 'map_seed_wcag22',
  title: 'WCAG 2.2 — what actually changed',
  topic: 'What changed in WCAG 2.2 compared to 2.1?',
  summary:
    'WCAG 2.2 became a W3C Recommendation in October 2023. It adds nine success criteria aimed largely at motor and cognitive access, and retires the old Parsing rule.',
  keyFacts: [
    'WCAG 2.2 reached W3C Recommendation status on 5 October 2023 and is backwards compatible: meeting 2.2 means meeting 2.1 and 2.0.',
    'Nine new success criteria were added; six of them sit at Level A or AA, so they affect ordinary compliance targets.',
    'Success criterion 4.1.1 Parsing was removed outright — modern browsers and assistive tech no longer break on the markup errors it policed.',
    'Target Size (Minimum) asks for a 24 by 24 CSS pixel target, which is smaller than the 44 pixel figure many teams already used.',
    'Accessible Authentication bans cognitive function tests such as puzzles or transcription unless an alternative exists — a direct win for dyslexic and ADHD users.'
  ],
  followUps: [
    'How do I meet Target Size without redesigning every button?',
    'What counts as a cognitive function test under Accessible Authentication?',
    'Is WCAG 2.2 legally required where I operate?'
  ],
  sources: [
    { title: 'Web Content Accessibility Guidelines (WCAG) 2.2 — W3C', url: 'https://www.w3.org/TR/WCAG22/' },
    { title: "What's New in WCAG 2.2 — W3C WAI", url: 'https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/' }
  ],
  grounded: true,
  isSeed: true,
  root: {
    id: 'wc_root',
    label: 'WCAG 2.2',
    detail: 'The 2023 update to the web accessibility standard',
    depth: 0,
    children: [
      {
        id: 'wc_b1',
        label: 'Focus visibility',
        detail: 'Keyboard users must be able to see where they are.',
        depth: 1,
        children: [
          {
            id: 'wc_b1_1',
            label: 'Focus Not Obscured',
            detail: 'Sticky headers and cookie bars must not completely hide the element that currently has focus (2.4.11, AA).',
            depth: 2,
            children: []
          },
          {
            id: 'wc_b1_2',
            label: 'Focus Appearance',
            detail: 'The focus indicator needs a minimum area and contrast so it is genuinely noticeable (2.4.13, AAA).',
            depth: 2,
            children: []
          }
        ]
      },
      {
        id: 'wc_b2',
        label: 'Motor access',
        detail: 'Pointer actions must not demand fine control.',
        depth: 1,
        children: [
          {
            id: 'wc_b2_1',
            label: 'Dragging Movements',
            detail: 'Anything you can drag must also be operable with single taps or clicks (2.5.7, AA).',
            depth: 2,
            children: []
          },
          {
            id: 'wc_b2_2',
            label: 'Target Size (Minimum)',
            detail: 'Pointer targets need at least 24 by 24 CSS pixels, or adequate spacing around them (2.5.8, AA).',
            depth: 2,
            children: []
          }
        ]
      },
      {
        id: 'wc_b3',
        label: 'Cognitive load',
        detail: 'The criteria most relevant to SETU’s users.',
        depth: 1,
        children: [
          {
            id: 'wc_b3_1',
            label: 'Consistent Help',
            detail: 'Help mechanisms must appear in the same relative place on every page that has them (3.2.6, A).',
            depth: 2,
            children: []
          },
          {
            id: 'wc_b3_2',
            label: 'Redundant Entry',
            detail: 'Information already given in a process must not be demanded again, unless re-entry is essential (3.3.7, A).',
            depth: 2,
            children: []
          },
          {
            id: 'wc_b3_3',
            label: 'Accessible Authentication',
            detail: 'Logging in must not require remembering, transcribing, or solving a puzzle without an alternative (3.3.8, AA).',
            depth: 2,
            children: []
          }
        ]
      },
      {
        id: 'wc_b4',
        label: 'What was removed',
        detail: 'One rule left the standard entirely.',
        depth: 1,
        children: [
          {
            id: 'wc_b4_1',
            label: '4.1.1 Parsing',
            detail: 'Duplicate IDs and unclosed tags no longer break assistive technology, so the criterion was retired as obsolete.',
            depth: 2,
            children: []
          }
        ]
      },
      {
        id: 'wc_b5',
        label: 'Adopting it',
        detail: 'How the update lands on an existing product.',
        depth: 1,
        children: [
          {
            id: 'wc_b5_1',
            label: 'Backwards compatible',
            detail: 'Nothing that passed 2.1 now fails 2.2, so the work is additive rather than a re-audit.',
            depth: 2,
            children: []
          },
          {
            id: 'wc_b5_2',
            label: 'Start with authentication',
            detail: 'Login flows tend to be the single biggest new gap, and they block everything behind them.',
            depth: 2,
            children: []
          }
        ]
      }
    ]
  },
  createdAt: daysAgo(6),
  updatedAt: daysAgo(6)
};

/* -------------------------------------------------------------------------- */
/* 3. ADHD and executive function                                             */
/* -------------------------------------------------------------------------- */

const ADHD_MAP = {
  id: 'map_seed_adhd_executive',
  title: 'ADHD and executive function',
  topic: 'How does ADHD affect executive function and task initiation?',
  summary:
    'ADHD is better understood as a difficulty regulating attention and action than as a shortage of attention. The cost shows up most sharply at the moment a task has to begin.',
  keyFacts: [
    'Barkley’s influential model recasts ADHD as a disorder of self-regulation and executive function rather than of attention alone.',
    'Working memory limits mean a multi-step instruction can evaporate before step two, which is why written checklists help so much.',
    'Time blindness — weak internal sense of duration — makes deadlines feel abstract until they are suddenly imminent.',
    'Task initiation, not task completion, is usually the hardest moment; the "Wall of Awful" describes the emotional barrier built from past failures.',
    'Interest, novelty, urgency, and challenge reliably mobilise attention, which is why the same person can hyperfocus for hours and stall on a form.'
  ],
  followUps: [
    'What actually helps with task initiation in practice?',
    'Why does body doubling work?',
    'How is executive dysfunction different from procrastination?'
  ],
  sources: [
    { title: 'ADHD and Executive Function — CHADD', url: 'https://chadd.org/about-adhd/executive-function-skills/' },
    { title: 'Executive Function & Self-Regulation — Harvard Center on the Developing Child', url: 'https://developingchild.harvard.edu/science/key-concepts/executive-function/' }
  ],
  grounded: true,
  isSeed: true,
  root: {
    id: 'ad_root',
    label: 'ADHD executive function',
    detail: 'Regulation, not attention shortage',
    depth: 0,
    children: [
      {
        id: 'ad_b1',
        label: 'Working memory',
        detail: 'Holding the steps while doing the steps.',
        depth: 1,
        children: [
          {
            id: 'ad_b1_1',
            label: 'Instructions evaporate',
            detail: 'A four-step verbal instruction often survives only to step two, which reads as not listening.',
            depth: 2,
            children: []
          },
          {
            id: 'ad_b1_2',
            label: 'Externalise everything',
            detail: 'Written steps, visible timers, and open checklists move the load out of the head and onto the page.',
            depth: 2,
            children: []
          }
        ]
      },
      {
        id: 'ad_b2',
        label: 'Task initiation',
        detail: 'The hardest moment is the first one.',
        depth: 1,
        children: [
          {
            id: 'ad_b2_1',
            label: 'The Wall of Awful',
            detail: 'Each past failure adds a brick, so the emotional barrier grows larger than the task behind it.',
            depth: 2,
            children: []
          },
          {
            id: 'ad_b2_2',
            label: 'Shrink the first step',
            detail: 'A physically concrete ten-minute action — open the file, write one heading — is small enough to clear the wall.',
            depth: 2,
            children: []
          }
        ]
      },
      {
        id: 'ad_b3',
        label: 'Time perception',
        detail: 'Duration is hard to feel from the inside.',
        depth: 1,
        children: [
          {
            id: 'ad_b3_1',
            label: 'Time blindness',
            detail: 'Only "now" and "not now" feel real, so a deadline three weeks out carries almost no weight.',
            depth: 2,
            children: []
          },
          {
            id: 'ad_b3_2',
            label: 'Make time visible',
            detail: 'A running clock or a physical timer converts an abstract deadline into something perceivable.',
            depth: 2,
            children: []
          }
        ]
      },
      {
        id: 'ad_b4',
        label: 'Attention regulation',
        detail: 'Not too little attention — badly steered attention.',
        depth: 1,
        children: [
          {
            id: 'ad_b4_1',
            label: 'Hyperfocus',
            detail: 'Interest and novelty can lock attention on for hours, which is the same mechanism failing in the other direction.',
            depth: 2,
            children: []
          },
          {
            id: 'ad_b4_2',
            label: 'Dense text repels',
            detail: 'Unstructured walls of text offer nothing for attention to grip, so the eye slides off before meaning forms.',
            depth: 2,
            children: []
          }
        ]
      },
      {
        id: 'ad_b5',
        label: 'What design can do',
        detail: 'Where an interface carries the load instead.',
        depth: 1,
        children: [
          {
            id: 'ad_b5_1',
            label: 'One thing at a time',
            detail: 'Progressive disclosure means working memory only ever holds the branch currently open.',
            depth: 2,
            children: []
          },
          {
            id: 'ad_b5_2',
            label: 'Structure over summary',
            detail: 'Reshaping text into a hierarchy keeps every fact while removing the density that blocked it.',
            depth: 2,
            children: []
          }
        ]
      }
    ]
  },
  createdAt: daysAgo(4),
  updatedAt: daysAgo(4)
};

/* -------------------------------------------------------------------------- */
/* 4. Screen readers                                                          */
/* -------------------------------------------------------------------------- */

const SCREEN_READER_MAP = {
  id: 'map_seed_screen_readers',
  title: 'How screen readers actually read a page',
  topic: 'How do screen readers navigate and announce a web page?',
  summary:
    'A screen reader does not read the screen. It reads the accessibility tree the browser builds from your markup, which is why semantic HTML matters more than visual layout.',
  keyFacts: [
    'The browser converts the DOM into an accessibility tree of roles, names, states, and values; that tree is what gets announced.',
    'Reading order follows DOM order, not CSS order — so a visually reordered grid can be announced in a nonsensical sequence.',
    'Most screen reader users navigate by jumping between headings rather than reading top to bottom, which makes heading structure the primary map.',
    'An image with no alt attribute may have its filename read aloud; alt="" correctly marks a decorative image as skippable.',
    'The first rule of ARIA is not to use ARIA: a native button already carries the role, focus behaviour, and keyboard handling you would otherwise rebuild.'
  ],
  followUps: [
    'When is ARIA genuinely the right tool?',
    'How should I structure headings on a dashboard?',
    'What is the difference between aria-label and aria-labelledby?'
  ],
  sources: [
    { title: 'WebAIM Screen Reader User Survey', url: 'https://webaim.org/projects/screenreadersurvey10/' },
    { title: 'ARIA Authoring Practices Guide — W3C', url: 'https://www.w3.org/WAI/ARIA/apg/' }
  ],
  grounded: true,
  isSeed: true,
  root: {
    id: 'sr_root',
    label: 'Screen readers',
    detail: 'Reading the accessibility tree, not the screen',
    depth: 0,
    children: [
      {
        id: 'sr_b1',
        label: 'The accessibility tree',
        detail: 'What the browser hands to assistive technology.',
        depth: 1,
        children: [
          {
            id: 'sr_b1_1',
            label: 'Role, name, state',
            detail: 'Every node is reduced to what it is, what it is called, and what condition it is in.',
            depth: 2,
            children: []
          },
          {
            id: 'sr_b1_2',
            label: 'CSS mostly invisible',
            detail: 'Visual position does not reach the tree, so a beautiful layout can still announce as gibberish.',
            depth: 2,
            children: []
          }
        ]
      },
      {
        id: 'sr_b2',
        label: 'How users navigate',
        detail: 'Almost nobody reads a page linearly.',
        depth: 1,
        children: [
          {
            id: 'sr_b2_1',
            label: 'Heading jumps',
            detail: 'Pressing H moves between headings, making h1 to h6 structure the table of contents.',
            depth: 2,
            children: []
          },
          {
            id: 'sr_b2_2',
            label: 'Landmark regions',
            detail: 'nav, main, and aside let a user skip straight to the part of the page they want.',
            depth: 2,
            children: []
          },
          {
            id: 'sr_b2_3',
            label: 'Element lists',
            detail: 'Users can pull up every link or form field at once, which is why link text must make sense alone.',
            depth: 2,
            children: []
          }
        ]
      },
      {
        id: 'sr_b3',
        label: 'Common breakages',
        detail: 'What silently ruins the experience.',
        depth: 1,
        children: [
          {
            id: 'sr_b3_1',
            label: 'Div as button',
            detail: 'A clickable div has no role, no focus, and no keyboard activation unless all three are rebuilt by hand.',
            depth: 2,
            children: []
          },
          {
            id: 'sr_b3_2',
            label: '"Click here" links',
            detail: 'Pulled out of context in a links list, the text describes nothing at all.',
            depth: 2,
            children: []
          },
          {
            id: 'sr_b3_3',
            label: 'Silent updates',
            detail: 'Content injected without a live region changes on screen while the user hears nothing.',
            depth: 2,
            children: []
          }
        ]
      },
      {
        id: 'sr_b4',
        label: 'The main tools',
        detail: 'What people actually run.',
        depth: 1,
        children: [
          {
            id: 'sr_b4_1',
            label: 'JAWS and NVDA',
            detail: 'The two dominant Windows readers; NVDA is free and open source, JAWS is long-established in workplaces.',
            depth: 2,
            children: []
          },
          {
            id: 'sr_b4_2',
            label: 'VoiceOver and TalkBack',
            detail: 'Built into Apple and Android platforms, so they need no installation at all.',
            depth: 2,
            children: []
          }
        ]
      }
    ]
  },
  createdAt: daysAgo(3),
  updatedAt: daysAgo(3)
};

/* -------------------------------------------------------------------------- */
/* 5. Rights of Persons with Disabilities Act, 2016 (India)                    */
/* -------------------------------------------------------------------------- */

const RPWD_MAP = {
  id: 'map_seed_rpwd_2016',
  title: 'Rights of Persons with Disabilities Act, 2016',
  topic: "What does India's Rights of Persons with Disabilities Act, 2016 actually guarantee?",
  summary:
    'The RPwD Act replaced the 1995 legislation, widened the list of recognised disabilities from seven to twenty-one, and moved the framing from welfare to enforceable rights.',
  keyFacts: [
    'The Act was passed on 16 December 2016, received assent on 27 December 2016, and came into force on 19 April 2017.',
    'It recognises 21 specified disabilities, explicitly including specific learning disabilities and intellectual disability, which the 1995 Act omitted.',
    'A "person with benchmark disability" means at least 40 percent of a specified disability, which is the threshold for several entitlements.',
    'Reservation in government posts rose from 3 to 4 percent for persons with benchmark disabilities, with 5 percent reserved in higher education institutions.',
    'It obliges establishments to provide reasonable accommodation and makes public buildings, transport, and ICT accessibility a legal duty rather than a courtesy.'
  ],
  followUps: [
    'What counts as reasonable accommodation for a dyslexic employee?',
    'How are the accessibility standards actually enforced?',
    'How does this interact with the Accessible India Campaign?'
  ],
  sources: [
    { title: 'The Rights of Persons with Disabilities Act, 2016 — India Code', url: 'https://www.indiacode.nic.in/handle/123456789/2155' },
    { title: 'Department of Empowerment of Persons with Disabilities', url: 'https://depwd.gov.in/' }
  ],
  grounded: true,
  isSeed: true,
  root: {
    id: 'rp_root',
    label: 'RPwD Act 2016',
    detail: 'From welfare framing to enforceable rights',
    depth: 0,
    children: [
      {
        id: 'rp_b1',
        label: 'Who it covers',
        detail: 'A much wider definition than the 1995 Act.',
        depth: 1,
        children: [
          {
            id: 'rp_b1_1',
            label: 'Twenty-one disabilities',
            detail: 'The schedule expanded from seven categories to twenty-one, and can be widened further by notification.',
            depth: 2,
            children: []
          },
          {
            id: 'rp_b1_2',
            label: 'Learning disabilities named',
            detail: 'Dyslexia, dysgraphia, and dyscalculia are recognised explicitly, which the earlier Act never did.',
            depth: 2,
            children: []
          },
          {
            id: 'rp_b1_3',
            label: 'Benchmark threshold',
            detail: 'Several entitlements require certification at 40 percent or more of a specified disability.',
            depth: 2,
            children: []
          }
        ]
      },
      {
        id: 'rp_b2',
        label: 'Education',
        detail: 'Inclusive schooling as the default.',
        depth: 1,
        children: [
          {
            id: 'rp_b2_1',
            label: 'Free education to 18',
            detail: 'Children with benchmark disabilities have a right to free education between the ages of 6 and 18.',
            depth: 2,
            children: []
          },
          {
            id: 'rp_b2_2',
            label: 'Five percent in higher education',
            detail: 'Government-funded institutions must reserve at least 5 percent of seats.',
            depth: 2,
            children: []
          }
        ]
      },
      {
        id: 'rp_b3',
        label: 'Employment',
        detail: 'Quota plus an accommodation duty.',
        depth: 1,
        children: [
          {
            id: 'rp_b3_1',
            label: 'Four percent reservation',
            detail: 'Government establishments reserve 4 percent of posts, up from 3 percent under the 1995 Act.',
            depth: 2,
            children: []
          },
          {
            id: 'rp_b3_2',
            label: 'Reasonable accommodation',
            detail: 'Employers must adjust the job or environment unless doing so imposes a disproportionate burden.',
            depth: 2,
            children: []
          },
          {
            id: 'rp_b3_3',
            label: 'Equal opportunity policy',
            detail: 'Establishments must publish one and register it with the appropriate authority.',
            depth: 2,
            children: []
          }
        ]
      },
      {
        id: 'rp_b4',
        label: 'Accessibility duties',
        detail: 'Physical and digital, both mandatory.',
        depth: 1,
        children: [
          {
            id: 'rp_b4_1',
            label: 'Built environment',
            detail: 'Public buildings and transport must meet notified accessibility standards within set timelines.',
            depth: 2,
            children: []
          },
          {
            id: 'rp_b4_2',
            label: 'Information and communication',
            detail: 'Websites, documents, and services must be usable by persons with disabilities, which pulls WCAG into scope.',
            depth: 2,
            children: []
          }
        ]
      },
      {
        id: 'rp_b5',
        label: 'Enforcement',
        detail: 'Who you go to when it fails.',
        depth: 1,
        children: [
          {
            id: 'rp_b5_1',
            label: 'Chief Commissioner',
            detail: 'A Chief Commissioner at the centre and State Commissioners handle complaints and inquiries.',
            depth: 2,
            children: []
          },
          {
            id: 'rp_b5_2',
            label: 'Penalties',
            detail: 'Discrimination and contravention of the Act carry fines, and repeat offences carry higher ones.',
            depth: 2,
            children: []
          }
        ]
      }
    ]
  },
  createdAt: daysAgo(2),
  updatedAt: daysAgo(2)
};

/* -------------------------------------------------------------------------- */
/* 6. Dyslexia and typeface design                                            */
/* -------------------------------------------------------------------------- */

const TYPEFACE_MAP = {
  id: 'map_seed_dyslexia_type',
  title: 'Dyslexia and typeface design',
  topic: 'Do dyslexia-friendly fonts actually work?',
  summary:
    'The evidence for special "dyslexia fonts" is weak, but the evidence for spacing, weight, and letter distinguishability is solid. What helps is legibility, not novelty.',
  keyFacts: [
    'Controlled studies have generally failed to show that OpenDyslexic outperforms a plain sans-serif such as Arial for reading speed or accuracy.',
    'Rello and Baeza-Yates found that sans-serif, monospaced, and roman styles improved reading performance, while italic made it measurably worse.',
    'Increased letter and word spacing has a more reliable effect on reading speed than swapping the typeface does.',
    'Atkinson Hyperlegible, released by the Braille Institute in 2020, targets low vision by making easily confused characters visually distinct.',
    'Letting the reader choose is the finding that actually replicates — preference and comfort vary far more than any single font ranking.'
  ],
  followUps: [
    'What line length and line height should I use?',
    'Does dark mode help or hurt dyslexic readers?',
    'How much letter spacing is too much?'
  ],
  sources: [
    { title: 'Atkinson Hyperlegible — Braille Institute', url: 'https://brailleinstitute.org/freefont' },
    { title: 'Good Fonts for Dyslexia (Rello & Baeza-Yates, ASSETS 2013)', url: 'https://dl.acm.org/doi/10.1145/2513383.2513447' }
  ],
  grounded: true,
  isSeed: true,
  root: {
    id: 'ty_root',
    label: 'Dyslexia and type',
    detail: 'Legibility beats novelty',
    depth: 0,
    children: [
      {
        id: 'ty_b1',
        label: 'The font claim',
        detail: 'What the specialist typefaces promise.',
        depth: 1,
        children: [
          {
            id: 'ty_b1_1',
            label: 'Weighted bottoms',
            detail: 'OpenDyslexic adds bottom-heavy letterforms intended to stop characters being perceived as rotating.',
            depth: 2,
            children: []
          },
          {
            id: 'ty_b1_2',
            label: 'Evidence is thin',
            detail: 'Independent trials have not found a reliable advantage over a well-set standard sans-serif.',
            depth: 2,
            children: []
          }
        ]
      },
      {
        id: 'ty_b2',
        label: 'What does help',
        detail: 'The interventions that survive testing.',
        depth: 1,
        children: [
          {
            id: 'ty_b2_1',
            label: 'Spacing',
            detail: 'Extra letter and word spacing consistently improves reading speed for dyslexic readers.',
            depth: 2,
            children: []
          },
          {
            id: 'ty_b2_2',
            label: 'Shorter lines',
            detail: 'Around 60 to 70 characters per line reduces how often the eye loses its place on return.',
            depth: 2,
            children: []
          },
          {
            id: 'ty_b2_3',
            label: 'Avoid italics',
            detail: 'Italic styling reduced reading performance in testing, so it is the one clear thing to drop.',
            depth: 2,
            children: []
          }
        ]
      },
      {
        id: 'ty_b3',
        label: 'Distinguishable letters',
        detail: 'The real design problem to solve.',
        depth: 1,
        children: [
          {
            id: 'ty_b3_1',
            label: 'The b d p q family',
            detail: 'Mirror-image letterforms are the classic confusion, so asymmetric designs genuinely help.',
            depth: 2,
            children: []
          },
          {
            id: 'ty_b3_2',
            label: 'Il1 and O0',
            detail: 'Atkinson Hyperlegible deliberately differentiates these, which matters most in codes and reference numbers.',
            depth: 2,
            children: []
          }
        ]
      },
      {
        id: 'ty_b4',
        label: 'Give the choice away',
        detail: 'Why SETU ships three typefaces.',
        depth: 1,
        children: [
          {
            id: 'ty_b4_1',
            label: 'Preference varies',
            detail: 'No single face wins for everyone, so the reader picking their own beats any default we could impose.',
            depth: 2,
            children: []
          },
          {
            id: 'ty_b4_2',
            label: 'Make it one click',
            detail: 'A setting buried three screens deep is a setting nobody changes.',
            depth: 2,
            children: []
          }
        ]
      }
    ]
  },
  createdAt: daysAgo(1),
  updatedAt: daysAgo(1)
};

/** Newest first — matches how the Library sorts. */
export const SEED_MAPS = [
  TYPEFACE_MAP,
  RPWD_MAP,
  SCREEN_READER_MAP,
  ADHD_MAP,
  WCAG_MAP,
  DEFAULT_WORKED_MAP
];
