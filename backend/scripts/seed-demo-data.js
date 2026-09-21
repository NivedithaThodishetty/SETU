#!/usr/bin/env node
/**
 * SETU demo data seeder.
 *
 * Fills MongoDB with a believable working history — research conversations,
 * mind maps, uploaded documents, and saved mode outputs — so the app can be
 * demonstrated without spending the first five minutes typing content into it.
 *
 * Everything is written under one user id (default `demo_user`) and every record
 * carries `metadata.seeded = true`, so the demo set can be removed again without
 * touching anything real.
 *
 * Usage:
 *   npm run seed                 seed under demo_user (idempotent upserts)
 *   npm run seed -- --reset      delete this user's seeded records first
 *   npm run seed -- --user=abc   seed under a specific user id
 *   npm run seed -- --clean      remove seeded records and exit
 *
 * The mind maps are imported from the web app's seed module so the browser's
 * local library and the database agree on the same content.
 */

const path = require('path');
const { pathToFileURL } = require('url');

const { connectDB, closeDB, getStatus, mongoose } = require('../config/db');
const config = require('../config');

const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const DocumentFile = require('../models/DocumentFile');
const MindMap = require('../models/MindMap');
const SavedSummary = require('../models/SavedSummary');
const UserSettings = require('../models/UserSettings');

/* -------------------------------------------------------------------------- */
/* Arguments                                                                  */
/* -------------------------------------------------------------------------- */

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(`--${name}`);
const flagValue = (name) => {
  const match = args.find((arg) => arg.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3) : null;
};

const USER_ID = flagValue('user') || process.env.SEED_USER_ID || 'demo_user';
const SHOULD_RESET = hasFlag('reset');
const CLEAN_ONLY = hasFlag('clean');

const SEED_TAG = { seeded: true, seedVersion: 1 };

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n) => new Date(Date.now() - n * DAY);
const minutesAfter = (date, minutes) => new Date(date.getTime() + minutes * 60 * 1000);

/* -------------------------------------------------------------------------- */
/* Documents                                                                  */
/* -------------------------------------------------------------------------- */

const DOCUMENTS = [
  {
    id: 'doc_seed_wcag_audit',
    originalName: 'Accessibility-Audit-Q3.pdf',
    mimeType: 'application/pdf',
    pageCount: 12,
    summary:
      'A third-quarter accessibility audit of the customer portal against WCAG 2.2 AA. It records 34 issues, of which 9 are blockers, and concentrates them in the login flow and the claims form.',
    keyPoints: [
      '34 issues found in total: 9 blockers, 14 major, 11 minor.',
      'The login flow fails 3.3.8 Accessible Authentication — the CAPTCHA has no non-cognitive alternative.',
      'The claims form fails 3.3.7 Redundant Entry by asking for the policy number on three separate screens.',
      'Sticky header obscures the focused field on 6 pages, failing 2.4.11 Focus Not Obscured.',
      'Colour contrast passes everywhere except the disabled-button state at 2.9:1.'
    ],
    extractedText: `ACCESSIBILITY AUDIT — CUSTOMER PORTAL
Quarter 3 · Conformance target: WCAG 2.2 Level AA

1. SCOPE
This audit covers the authenticated customer portal: sign-in, dashboard, claims
submission, document upload, and profile settings. Testing combined automated
scanning with manual keyboard and screen reader passes using NVDA 2024.1 on
Chrome and VoiceOver on Safari.

2. SUMMARY OF FINDINGS
34 distinct issues were recorded across 18 templates.
  Blockers: 9   Major: 14   Minor: 11
Blockers are defined as issues that prevent a user from completing a task at all.

3. BLOCKING ISSUES

3.1 Sign-in CAPTCHA (SC 3.3.8 Accessible Authentication, AA)
The sign-in page requires the user to transcribe distorted characters. This is a
cognitive function test with no alternative offered. Users with dyslexia and
users with memory impairments cannot reliably complete it. An email link or
passkey option would satisfy the criterion.

3.2 Claims form asks for the policy number three times (SC 3.3.7 Redundant Entry, A)
The policy number is requested on the eligibility screen, again on the details
screen, and again on the confirmation screen. Information previously entered in
the same process must be auto-populated or selectable.

3.3 Focus hidden behind sticky header (SC 2.4.11 Focus Not Obscured, AA)
On six templates, tabbing upward moves focus to an element that scrolls beneath
the fixed header. Keyboard-only users lose their place entirely. Adding
scroll-margin-top to focusable elements resolves this.

3.4 Document upload is drag-only (SC 2.5.7 Dragging Movements, AA)
The upload control accepts drag and drop but exposes no click-to-browse path.
Users with motor impairments and users on assistive pointing devices cannot
upload at all.

3.5 Session timeout with no warning (SC 2.2.1 Timing Adjustable, A)
The session expires after 15 minutes with no warning and no extension option.
Users who read slowly lose partially completed claims.

4. MAJOR ISSUES

4.1 Form errors announced only in colour (SC 1.4.1 Use of Colour, A)
Invalid fields are outlined in red with no text, icon, or programmatic
association. Screen reader users hear nothing at all.

4.2 Headings skip levels (SC 1.3.1 Info and Relationships, A)
The dashboard jumps from h1 to h4. Heading navigation is the primary way screen
reader users move around a page, so this breaks the page's structure.

4.3 Custom dropdown is a div (SC 4.1.2 Name, Role, Value, A)
The policy selector is built from divs with click handlers. It has no role, is
not focusable, and does not respond to arrow keys.

4.4 Target size on the pagination controls (SC 2.5.8 Target Size, AA)
The page number links measure 18 by 18 CSS pixels against a 24 by 24 minimum,
with no compensating spacing.

5. MINOR ISSUES
Disabled button contrast measures 2.9:1. Link text reads "click here" in four
places. The language attribute is missing on the Hindi translation of the
help page. Decorative icons lack alt="" and are announced by filename.

6. RECOMMENDED SEQUENCE
Fix the sign-in CAPTCHA first: everything else in the portal sits behind it, so
no other remediation is reachable by an affected user until it is resolved. Then
the claims form, then focus management, then the remaining major issues.`
  },
  {
    id: 'doc_seed_tenancy',
    originalName: 'Tenancy-Agreement-Clause-14.txt',
    mimeType: 'text/plain',
    pageCount: 1,
    summary:
      'Clause 14 of a residential tenancy agreement, covering the tenant’s obligation to report defects and the landlord’s repair timelines. Written in dense legal register.',
    keyPoints: [
      'Defects must be reported in writing within 14 days of occupation.',
      'The landlord must remedy hazards affecting habitability within 7 working days.',
      'Non-urgent repairs carry a 30 calendar day window.',
      'Failure to notify within the window may transfer repair costs to the tenant.'
    ],
    extractedText: `CLAUSE 14 — REPORTING OF DEFECTS AND REMEDIAL OBLIGATIONS

14.1 The Tenant shall, within fourteen (14) days of the commencement of
occupation, notify the Landlord in writing of any defect, deficiency, or
disrepair subsisting in the Premises at the date of such commencement, and any
failure by the Tenant so to notify shall, save in respect of latent defects not
reasonably discoverable upon inspection, be deemed an acknowledgement that the
Premises were delivered in good and tenantable repair.

14.2 Upon receipt of a notification pursuant to sub-clause 14.1, or upon receipt
at any time during the Term of a notification of a defect materially affecting
the habitability, safety, or sanitary condition of the Premises, the Landlord
shall cause such defect to be remedied within seven (7) working days of receipt,
and shall bear the entirety of the costs thereof.

14.3 In respect of defects not falling within sub-clause 14.2, the Landlord shall
effect remediation within thirty (30) calendar days of notification, provided
always that where such remediation is contingent upon the availability of parts
or specialist contractors, the said period shall be extended by such further
period as is reasonable in the circumstances.

14.4 Where the Tenant fails to notify the Landlord of a defect within a
reasonable period of the Tenant becoming aware of the same, and such failure
causes or materially contributes to an aggravation of the defect, the Tenant
shall be liable for so much of the cost of remediation as is attributable to
such aggravation.

14.5 Nothing in this Clause shall derogate from any statutory obligation imposed
upon the Landlord in respect of the repair and maintenance of the Premises.`
  },
  {
    id: 'doc_seed_standup',
    originalName: 'Sprint-24-Planning-Transcript.md',
    mimeType: 'text/markdown',
    pageCount: 1,
    summary:
      'Transcript of a 40-minute sprint planning call covering the accessibility remediation backlog, the offline fallback engine, and the demo cut for the hackathon submission.',
    keyPoints: [
      'The sign-in CAPTCHA replacement was pulled into this sprint as the top blocker.',
      'Priya owns the passkey spike, due Thursday.',
      'The offline rule engine ships behind the existing fallback flag — no new flag.',
      'Demo cut is frozen on Friday at 17:00; anything not merged by then waits.'
    ],
    extractedText: `# Sprint 24 Planning — Transcript

**Ravi:** Right, everyone here? Let's start with the audit backlog because that
drives most of this sprint.

**Priya:** The blocker list is nine items. Realistically we can land four.

**Ravi:** Which four?

**Priya:** Sign-in CAPTCHA, redundant entry on the claims form, focus obscured,
and the drag-only upload. Those four unblock the most users.

**Sam:** The CAPTCHA one is not a small change. We are replacing a cognitive
test, so we need an alternative auth path. That is a spike before it is a story.

**Priya:** Agreed. I'll take the spike. Passkeys first, email magic link as the
fallback if the passkey library fights us. I can have a recommendation by
Thursday.

**Ravi:** Thursday works. Sam, focus management?

**Sam:** Straightforward. scroll-margin-top on focusable elements plus a check on
the six templates. Half a day, maybe a day with testing.

**Ravi:** And the upload?

**Meera:** I'll do that one. Adding a real file input behind the drop zone, so
the drag path stays and the click path appears. Should be quick.

**Ravi:** Good. Now the engine side. Where are we on the offline fallback?

**Sam:** It works. Every mode degrades to the deterministic rules when the model
is unreachable. The question was whether it goes behind a new flag.

**Ravi:** Does it need one?

**Sam:** No. It reuses the existing fallback path. A new flag is just another
thing to forget to turn on.

**Ravi:** Then no new flag. Last thing — the demo.

**Meera:** We freeze the demo cut Friday at five. Anything not merged waits for
the next one. I would rather show four things that work than seven that might.

**Ravi:** Agreed, freeze Friday 17:00. Priya, spike Thursday. Sam, focus fix.
Meera, upload plus the demo cut. Anything blocking anyone?

**Priya:** Only that I need the staging keys for the passkey provider.

**Ravi:** I'll get those to you today.`
  }
];

/* -------------------------------------------------------------------------- */
/* Conversations & messages                                                   */
/* -------------------------------------------------------------------------- */

const CONVERSATIONS = [
  {
    id: 'conv_seed_wcag',
    title: 'What changed in WCAG 2.2',
    currentTopic: 'WCAG 2.2 — what actually changed',
    mindMapId: 'map_seed_wcag22',
    documentIds: ['doc_seed_wcag_audit'],
    startedDaysAgo: 6,
    messages: [
      { role: 'user', content: 'What actually changed in WCAG 2.2 compared to 2.1?' },
      {
        role: 'assistant',
        content: 'Looking into WCAG 2.2 now — I will lay out what was added and what was removed.',
        intent: 'research_topic'
      },
      {
        role: 'assistant',
        content: "Here's your map of **WCAG 2.2 — what actually changed**.",
        intent: 'research_topic',
        sources: [
          { title: 'Web Content Accessibility Guidelines (WCAG) 2.2 — W3C', url: 'https://www.w3.org/TR/WCAG22/' },
          { title: "What's New in WCAG 2.2 — W3C WAI", url: 'https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/' }
        ]
      },
      { role: 'user', content: 'Which of the new criteria affect our login page?' },
      {
        role: 'assistant',
        content:
          'Two of them land directly on a login page. Accessible Authentication (3.3.8, AA) is the significant one: it rules out cognitive function tests such as transcribing a CAPTCHA or recalling a password from memory, unless you offer an alternative like a passkey or an email link.\n\nRedundant Entry (3.3.7, A) also applies if your flow asks for the same detail twice across steps.\n\nFocus Not Obscured (2.4.11, AA) matters if you have a sticky header — tabbing back up can hide the focused field behind it.',
        intent: 'answer'
      }
    ]
  },
  {
    id: 'conv_seed_audit_doc',
    title: 'Q3 accessibility audit review',
    currentTopic: 'Accessibility-Audit-Q3.pdf',
    mindMapId: null,
    documentIds: ['doc_seed_wcag_audit'],
    startedDaysAgo: 5,
    messages: [
      {
        role: 'user',
        content: 'Which blockers in this audit stop someone from finishing a claim?',
        fileAttachments: [{ fileId: 'doc_seed_wcag_audit' }]
      },
      {
        role: 'assistant',
        content:
          'Four of the nine blockers stop a claim outright.\n\nThe sign-in CAPTCHA (section 3.1) is the hardest stop — it sits in front of everything else, so an affected user never reaches the claims form at all.\n\nInside the flow, the drag-only document upload (3.4) blocks anyone who cannot drag, and the 15-minute session timeout with no warning (3.5) discards partially completed claims.\n\nThe repeated policy number (3.2) does not strictly block, but the audit notes it as the most common abandonment point.',
        intent: 'document_answer',
        sources: [{ title: 'Accessibility-Audit-Q3.pdf', url: '#doc-doc_seed_wcag_audit' }],
        fileAttachments: [{ fileId: 'doc_seed_wcag_audit' }]
      },
      {
        role: 'user',
        content: 'What should we fix first?',
        fileAttachments: [{ fileId: 'doc_seed_wcag_audit' }]
      },
      {
        role: 'assistant',
        content:
          'The audit answers this directly in section 6: fix the sign-in CAPTCHA first.\n\nThe reasoning is sequencing rather than severity. Every other issue lives behind the login, so no other fix is reachable by an affected user until authentication works. Remediating the claims form first would produce no measurable improvement for the users the audit is about.',
        intent: 'document_answer',
        sources: [{ title: 'Accessibility-Audit-Q3.pdf', url: '#doc-doc_seed_wcag_audit' }],
        fileAttachments: [{ fileId: 'doc_seed_wcag_audit' }]
      }
    ]
  },
  {
    id: 'conv_seed_adhd',
    title: 'ADHD and task initiation',
    currentTopic: 'ADHD and executive function',
    mindMapId: 'map_seed_adhd_executive',
    documentIds: [],
    startedDaysAgo: 4,
    messages: [
      { role: 'user', content: 'How does ADHD affect executive function and task initiation?' },
      {
        role: 'assistant',
        content: 'Researching that now — mapping out how regulation, memory, and time perception interact.',
        intent: 'research_topic'
      },
      {
        role: 'assistant',
        content: "Here's your map of **ADHD and executive function**.",
        intent: 'research_topic'
      },
      { role: 'user', content: 'Why is starting so much harder than continuing?' },
      {
        role: 'assistant',
        content:
          'Because starting is where the regulation cost is concentrated. Continuing has momentum carrying it; starting has to generate that momentum from nothing.\n\nThe emotional layer matters too. Every previous stall on a similar task adds to what Brendan Mahan named the Wall of Awful — a barrier built from past experience rather than from the task itself. That is why the wall is often tallest in front of the smallest jobs.\n\nThe practical consequence is that shrinking the first step works better than increasing motivation. "Open the document and write one heading" clears a wall that "write the report" cannot.',
        intent: 'answer'
      }
    ]
  },
  {
    id: 'conv_seed_tenancy',
    title: 'Tenancy clause in plain words',
    currentTopic: 'Tenancy-Agreement-Clause-14.txt',
    mindMapId: null,
    documentIds: ['doc_seed_tenancy'],
    startedDaysAgo: 2,
    messages: [
      {
        role: 'user',
        content: 'What does this clause actually require me to do, and by when?',
        fileAttachments: [{ fileId: 'doc_seed_tenancy' }]
      },
      {
        role: 'assistant',
        content:
          'Two deadlines apply to you, and two apply to the landlord.\n\nYours: report anything already broken in writing within 14 days of moving in. After that window, anything you could reasonably have spotted is treated as having been fine when you moved in.\n\nAlso yours: report new problems promptly. If a delay makes the damage worse, you pay for the extra damage — not the original fault.\n\nTheirs: anything affecting safety or habitability must be fixed within 7 working days, at their cost. Everything else gets 30 calendar days, extendable if parts or a specialist are genuinely unavailable.\n\nOne thing worth knowing: clause 14.5 says none of this removes their legal repair obligations, so the contract cannot sign away your statutory rights.',
        intent: 'document_answer',
        sources: [{ title: 'Tenancy-Agreement-Clause-14.txt', url: '#doc-doc_seed_tenancy' }],
        fileAttachments: [{ fileId: 'doc_seed_tenancy' }]
      }
    ]
  }
];

/* -------------------------------------------------------------------------- */
/* Saved mode outputs                                                         */
/* -------------------------------------------------------------------------- */

const SUMMARIES = [
  {
    id: 'sum_seed_simplify_tenancy',
    mode: 'simplify',
    title: 'Tenancy clause 14, in plain words',
    content:
      'You have 14 days from moving in to tell the landlord in writing about anything already broken. If you miss that window, anything you could reasonably have seen counts as having been fine when you arrived.',
    summaryPoints: [
      'Deadline for you: 14 days from move-in, in writing.',
      'Safety problems: landlord fixes within 7 working days, at their cost.',
      'Everything else: 30 calendar days, longer only if parts or a specialist are genuinely unavailable.',
      'If you delay reporting and the damage worsens, you pay only for the extra damage.'
    ],
    daysAgo: 2,
    resultData: {
      readabilityGrade: 'Grade 6 · Plain English',
      plainLanguageRewrite:
        'You have 14 days from moving in to tell the landlord in writing about anything already broken. If you miss that window, anything you could reasonably have seen counts as having been fine when you arrived. Once you report a safety problem, they must fix it within 7 working days and pay for it themselves. Other repairs get 30 days.',
      keyTakeaways: [
        'Deadline for you: 14 days from move-in, in writing.',
        'Safety problems: 7 working days, landlord pays.',
        'Other repairs: 30 calendar days.',
        'Reporting late only costs you if the delay made things worse.'
      ],
      sensoryTips: [
        'Read one numbered sub-clause at a time and write the date beside it.',
        'Send the notice by email so the timestamp is the proof.'
      ]
    }
  },
  {
    id: 'sum_seed_meet_sprint',
    mode: 'meet',
    title: 'Sprint 24 planning — decisions and owners',
    content:
      'The team pulled four of the nine audit blockers into Sprint 24, kept the offline engine behind the existing fallback path rather than a new flag, and froze the demo cut for Friday 17:00.',
    summaryPoints: [
      'Four blockers committed: CAPTCHA, redundant entry, focus obscured, drag-only upload.',
      'Priya owns the passkey spike, due Thursday.',
      'No new feature flag for the offline engine.',
      'Demo cut frozen Friday 17:00.'
    ],
    daysAgo: 3,
    resultData: {
      summary:
        'The team committed to four of the nine audit blockers, decided against a new feature flag for the offline engine, and froze the demo cut for Friday at 17:00.',
      keyDecisions: [
        'Only four blockers enter Sprint 24 — CAPTCHA, redundant entry, focus obscured, and drag-only upload.',
        'The offline rule engine ships on the existing fallback path; no new feature flag.',
        'The demo cut is frozen Friday at 17:00, showing fewer working features rather than more unfinished ones.'
      ],
      actionItems: [
        {
          task: 'Spike passkey authentication, with email magic link as the fallback option',
          owner: 'Priya',
          deadline: 'Thursday',
          priority: 'High'
        },
        {
          task: 'Add scroll-margin-top to focusable elements and verify the six affected templates',
          owner: 'Sam',
          deadline: 'This sprint',
          priority: 'High'
        },
        {
          task: 'Add a real file input behind the drop zone so upload has a click path',
          owner: 'Meera',
          deadline: 'This sprint',
          priority: 'Medium'
        },
        {
          task: 'Send staging keys for the passkey provider',
          owner: 'Ravi',
          deadline: 'Today',
          priority: 'High'
        }
      ],
      jargonDecoded: [
        {
          term: 'Spike',
          plainMeaning: 'A short piece of investigation done before committing to build something, to find out how hard it is.'
        },
        {
          term: 'Demo cut',
          plainMeaning: 'The frozen version of the build that will be shown, so late changes cannot break it.'
        },
        {
          term: 'Feature flag',
          plainMeaning: 'A switch that turns a feature on or off without redeploying the code.'
        }
      ]
    }
  },
  {
    id: 'sum_seed_guide_screenreader',
    mode: 'guide',
    title: 'Test a page with a screen reader',
    content:
      'A five-step first pass with NVDA that catches most structural problems without needing prior screen reader experience.',
    summaryPoints: [
      'Install NVDA and learn exactly three keys before starting.',
      'Navigate by heading first — the structure fails loudest.',
      'Tab through every interactive element and listen for role and name.',
      'Trigger one form error and confirm it is announced.'
    ],
    daysAgo: 5,
    resultData: {
      workflowName: 'Run a first screen reader pass on a page',
      totalSteps: 5,
      steps: [
        {
          stepNumber: 1,
          title: 'Install NVDA and learn three keys',
          actionRequired:
            'Install NVDA, then learn only these: Insert+Q quits, H jumps to the next heading, and Tab moves to the next control.',
          tip: 'You will know it worked when NVDA reads the title bar of whatever window you focus.'
        },
        {
          stepNumber: 2,
          title: 'Navigate the page by heading',
          actionRequired: 'Press H repeatedly from the top of the page and write down the order you hear.',
          tip: 'It worked if the headings alone describe the page. If they skip levels or say nothing useful, that is your first bug.'
        },
        {
          stepNumber: 3,
          title: 'Tab through every control',
          actionRequired:
            'Press Tab from the top and listen for a role and a name on each stop — "Submit, button", not just "Submit".',
          tip: 'It worked if nothing announces as "clickable" with no role, and focus never disappears.'
        },
        {
          stepNumber: 4,
          title: 'Break one form on purpose',
          actionRequired: 'Submit a form with a required field empty and listen without looking at the screen.',
          tip: 'It worked if you hear which field failed and why. Silence here is a blocker.'
        },
        {
          stepNumber: 5,
          title: 'Write down what you heard',
          actionRequired: 'Record each problem as the sentence you actually heard, next to what you expected to hear.',
          tip: 'It worked when a developer can reproduce the issue from your note without running a screen reader themselves.'
        }
      ]
    }
  },
  {
    id: 'sum_seed_start_report',
    mode: 'start',
    title: 'Breaking the freeze on the audit write-up',
    content:
      'A ten-minute opening action for the accessibility remediation write-up, sized small enough to actually begin.',
    summaryPoints: [
      'Open the file and write only the three section headings.',
      'Paste in the four blocker titles under the first heading.',
      'Stop after ten minutes whether or not it feels finished.'
    ],
    daysAgo: 1,
    resultData: {
      supportiveMessage:
        'Starting is the only hard part here. The write-up looks like one enormous job because it has not been cut into pieces yet — and cutting it up is itself the first piece.',
      confidenceMeter: { effortLevel: 'Low', anxietyLevel: 'Moderate', estimatedTimeMinutes: 10 },
      immediateTenMinuteAction:
        'Open a blank document, save it as "Audit Remediation Plan", and type three headings: What we found, What we fix first, What waits.',
      microSteps: [
        'Open the document and save it with a real filename.',
        'Type the three headings and nothing else.',
        'Under "What we fix first", paste the four blocker titles from the audit.',
        'Close the laptop. Ten minutes was the whole commitment.'
      ],
      clarifyingQuestion:
        'Who reads this first — the engineering team who needs the sequence, or the steering group who needs the risk?'
    }
  }
];

/* -------------------------------------------------------------------------- */
/* Seeding                                                                    */
/* -------------------------------------------------------------------------- */

/** Load the mind maps the web app seeds locally, so both surfaces agree. */
async function loadSeedMaps() {
  const modulePath = path.resolve(__dirname, '../../frontend/src/lib/seedData.js');
  try {
    const module = await import(pathToFileURL(modulePath).href);
    return module.SEED_MAPS || [];
  } catch (error) {
    console.warn(
      `  [seed] Could not read the web app seed maps (${error.message}). Skipping mind maps.`
    );
    return [];
  }
}

function countNodes(node) {
  if (!node) return 0;
  return 1 + (node.children || []).reduce((sum, child) => sum + countNodes(child), 0);
}

/** Remove only records this script created, for this user. */
async function cleanSeeded() {
  const filter = { userId: USER_ID, 'metadata.seeded': true };

  const results = await Promise.all([
    MindMap.deleteMany(filter),
    Conversation.deleteMany(filter),
    Message.deleteMany(filter),
    DocumentFile.deleteMany(filter),
    SavedSummary.deleteMany(filter)
  ]);

  const total = results.reduce((sum, r) => sum + (r.deletedCount || 0), 0);
  console.log(`  [seed] Removed ${total} seeded record(s) for "${USER_ID}".`);
  return total;
}

async function seedDocuments() {
  for (const doc of DOCUMENTS) {
    const createdAt = daysAgo(7);
    await DocumentFile.findOneAndUpdate(
      { id: doc.id },
      {
        ...doc,
        userId: USER_ID,
        conversationId: null,
        size: Buffer.byteLength(doc.extractedText, 'utf8'),
        charCount: doc.extractedText.length,
        tokenCount: Math.ceil(doc.extractedText.length / 4),
        structuredSections: doc.extractedText
          .split(/\n{2,}/)
          .filter((section) => section.trim().length > 40)
          .slice(0, 12)
          .map((section, index) => ({
            heading: section.split('\n')[0].replace(/^#+\s*/, '').slice(0, 60),
            content: section.trim(),
            page: Math.min(doc.pageCount, index + 1)
          })),
        metadata: SEED_TAG,
        createdAt,
        updatedAt: createdAt
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );
  }
  console.log(`  [seed] ${DOCUMENTS.length} document(s) ready.`);
}

async function seedMindMaps(maps) {
  for (const map of maps) {
    await MindMap.findOneAndUpdate(
      { id: map.id },
      {
        id: map.id,
        userId: USER_ID,
        conversationId: null,
        documentId: null,
        title: map.title,
        topic: map.topic || map.title,
        summary: map.summary || '',
        keyFacts: map.keyFacts || [],
        followUps: map.followUps || [],
        sources: map.sources || [],
        grounded: Boolean(map.grounded),
        root: map.root,
        nodeCount: countNodes(map.root),
        isLensHandoff: false,
        metadata: SEED_TAG,
        createdAt: new Date(map.createdAt || Date.now()),
        updatedAt: new Date(map.updatedAt || Date.now())
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );
  }
  console.log(`  [seed] ${maps.length} mind map(s) ready.`);
}

async function seedConversations() {
  let messageCount = 0;

  for (const conversation of CONVERSATIONS) {
    const startedAt = daysAgo(conversation.startedDaysAgo);
    const lastMessageAt = minutesAfter(startedAt, conversation.messages.length * 2);

    await Conversation.findOneAndUpdate(
      { id: conversation.id },
      {
        id: conversation.id,
        userId: USER_ID,
        title: conversation.title,
        currentTopic: conversation.currentTopic,
        mode: 'mindmap',
        mindMapId: conversation.mindMapId,
        documentIds: conversation.documentIds,
        metadata: SEED_TAG,
        lastMessageAt,
        createdAt: startedAt,
        updatedAt: lastMessageAt
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    for (const [index, message] of conversation.messages.entries()) {
      const sentAt = minutesAfter(startedAt, index * 2);
      await Message.findOneAndUpdate(
        { id: `${conversation.id}_msg_${index}` },
        {
          id: `${conversation.id}_msg_${index}`,
          conversationId: conversation.id,
          userId: USER_ID,
          role: message.role,
          content: message.content,
          intent: message.intent || 'chat',
          stage: 'done',
          sources: message.sources || [],
          mindMapData: null,
          fileAttachments: message.fileAttachments || [],
          provider: message.role === 'assistant' ? config.primaryProvider : null,
          modelUsed: message.role === 'assistant' ? config.geminiModel || config.openAiModel : null,
          metadata: SEED_TAG,
          createdAt: sentAt,
          updatedAt: sentAt
        },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
      );
      messageCount += 1;
    }
  }

  console.log(`  [seed] ${CONVERSATIONS.length} conversation(s), ${messageCount} message(s) ready.`);
}

async function seedSummaries() {
  for (const summary of SUMMARIES) {
    const createdAt = daysAgo(summary.daysAgo);
    await SavedSummary.findOneAndUpdate(
      { id: summary.id },
      {
        id: summary.id,
        userId: USER_ID,
        title: summary.title,
        content: summary.content,
        summaryPoints: summary.summaryPoints,
        mode: summary.mode,
        resultData: summary.resultData,
        metadata: SEED_TAG,
        createdAt,
        updatedAt: createdAt
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );
  }
  console.log(`  [seed] ${SUMMARIES.length} saved mode output(s) ready.`);
}

async function seedSettings() {
  await UserSettings.findOneAndUpdate(
    { userId: USER_ID },
    {
      // UserSettings has no metadata field, so this record is not tagged and is
      // deliberately left alone by --clean: preferences are the user's, not demo data.
      userId: USER_ID,
      profile: ['adhd', 'dyslexia'],
      font: 'hyper',
      textSize: 'comfortable',
      motion: 'still',
      onboardingDone: true,
      updatedAt: new Date()
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );
  console.log('  [seed] Accessibility preferences ready.');
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                */
/* -------------------------------------------------------------------------- */

async function main() {
  console.log('\n  ======================================================');
  console.log('  SETU demo data seeder');
  console.log(`  Database : ${config.safeMongoUri}`);
  console.log(`  User id  : ${USER_ID}`);
  console.log('  ======================================================\n');

  await connectDB();

  if (mongoose.connection.readyState !== 1) {
    const { lastError } = getStatus();
    console.error(
      `  [seed] No MongoDB connection${lastError ? ` — ${lastError}` : ''}.\n` +
        '         Start MongoDB locally or set MONGODB_URI to an Atlas cluster, then run this\n' +
        '         again. The web app still seeds its own library in the browser.\n'
    );
    process.exitCode = 1;
    return;
  }

  if (CLEAN_ONLY) {
    await cleanSeeded();
    console.log('\n  Done — seeded demo records removed.\n');
    return;
  }

  if (SHOULD_RESET) await cleanSeeded();

  const maps = await loadSeedMaps();

  await seedDocuments();
  await seedMindMaps(maps);
  await seedConversations();
  await seedSummaries();
  await seedSettings();

  console.log('\n  Done. Open the web app and set this browser to the demo user with:');
  console.log(`    localStorage.setItem('setu.user.v1', '${USER_ID}'); location.reload();\n`);
}

// Datasets are exported so they can be validated against the Mongoose schemas
// without a live database; main() runs only when this file is executed directly.
module.exports = { DOCUMENTS, CONVERSATIONS, SUMMARIES, loadSeedMaps, countNodes, SEED_TAG };

if (require.main === module) {
  main()
    .catch((error) => {
      console.error('\n  [seed] Failed:', error.message);
      process.exitCode = 1;
    })
    .finally(async () => {
      await closeDB().catch(() => {});
      // Mongoose keeps the loop alive; nothing else is pending by this point.
      process.exit(process.exitCode || 0);
    });
}
