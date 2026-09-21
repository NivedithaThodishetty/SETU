/**
 * The server side of form filling: what it is allowed to put in a prompt, and
 * what it does with a placeholder the model made up.
 *
 * Both are silent failures. A leak here does not throw — it just quietly puts
 * somebody's home address into a third party's request logs. And a hallucinated
 * `{{profile.aadhaar}}` does not throw either — it produces a step that says it
 * will fill a field and then writes an empty string into it, which is precisely
 * the "it said it filled it and it didn't" failure the whole feature exists to
 * remove.
 *
 * No network, no key, no model. Run: node scripts/test-agent-profile.js
 */

process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const agent = require('../services/agentService');
const { sanitiseProfileFields } = require('../controllers/agentController');

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/* -------------------------------------------------------------------------- */
/* What the prompt is allowed to contain                                      */
/* -------------------------------------------------------------------------- */

console.log('\nprofile manifest -> prompt');

const FIELDS = [
  { key: 'fullName', label: 'Full name' },
  { key: 'pincode', label: 'PIN code' },
  { key: 'dob', label: 'Date of birth' }
];

const described = agent.describeProfile(FIELDS);

check('every key is offered as a placeholder', described.includes('{{profile.pincode}}'), described);
check('the human label comes along', described.includes('PIN code'));
check('the model is told it will not see values', /keys only/i.test(described));

check(
  'an empty manifest still tells the model what to do',
  /not saved any details/i.test(agent.describeProfile([])),
  agent.describeProfile([])
);
check('a missing manifest is the same as an empty one', agent.describeProfile(undefined).length > 0);

/* -------------------------------------------------------------------------- */
/* The controller will not forward a value even if one is sent                */
/* -------------------------------------------------------------------------- */

console.log('\ncontroller sanitisation');

// The shipped extension sends keys and labels. This asserts what happens when
// something else does not — an older build, a third-party caller copying the
// endpoint shape, a bug. "The client promises not to" is not a guarantee.
const hostile = sanitiseProfileFields([
  { key: 'fullName', label: 'Full name', value: 'Aarav Kumar Sharma' },
  { key: 'pincode', label: 'PIN code', value: '560102', extra: { nested: '9876543210' } },
  { key: 'fullName', label: 'Duplicate' },
  { key: '../../etc/passwd', label: 'Traversal' },
  { key: 'has spaces', label: 'Invalid' },
  { key: '', label: 'Empty' },
  null,
  'a bare string',
  { label: 'No key at all' }
]);

const serialised = JSON.stringify(hostile);

check('a supplied value is dropped', !serialised.includes('Aarav'), serialised);
check('a nested value is dropped too', !serialised.includes('9876543210'), serialised);
check('only key and label survive', hostile.every((f) => Object.keys(f).sort().join(',') === 'key,label'));
check('a duplicate key is taken once', hostile.filter((f) => f.key === 'fullName').length === 1);
check('a path-shaped key is refused', !hostile.some((f) => f.key.includes('/')));
check('a key with spaces is refused', !hostile.some((f) => f.key.includes(' ')));
check('malformed entries are skipped without throwing', hostile.length === 2, JSON.stringify(hostile));

check('a non-array body yields nothing', sanitiseProfileFields('everything').length === 0);
check('an absent body yields nothing', sanitiseProfileFields(undefined).length === 0);

const flood = sanitiseProfileFields(
  Array.from({ length: 500 }, (_, i) => ({ key: `field${i}`, label: 'x'.repeat(500) }))
);
check('the list is capped', flood.length === 120, String(flood.length));
check('labels are truncated', flood.every((f) => f.label.length <= 60), String(flood[0].label.length));

/* -------------------------------------------------------------------------- */
/* Placeholders the user cannot answer                                        */
/* -------------------------------------------------------------------------- */

console.log('\nplaceholder pruning');

const steps = [
  { stepNumber: 1, actionType: 'fill', valueToFill: '{{profile.fullName}}', tip: 'Your name.' },
  { stepNumber: 2, actionType: 'fill', valueToFill: '{{profile.aadhaar}}', tip: 'Your Aadhaar.' },
  { stepNumber: 3, actionType: 'fill', valueToFill: '{{fullName}} at {{profile.pincode}}', tip: '' },
  { stepNumber: 4, actionType: 'fill', valueToFill: '3', tip: 'A literal the user asked for.' },
  { stepNumber: 5, actionType: 'click', valueToFill: '', tip: '' }
];

const pruned = agent.pruneUnknownTokens(steps, FIELDS);

check('a known placeholder is left alone', pruned[0].valueToFill === '{{profile.fullName}}');
check('an unknown one is emptied', pruned[1].valueToFill === '', pruned[1].valueToFill);
check('and the step survives so the field stays on the list', pruned.length === steps.length);
check('the emptied step explains itself', /do not have this one saved/i.test(pruned[1].tip), pruned[1].tip);
check('the bare token form is recognised as known', pruned[2].valueToFill.includes('{{fullName}}'));
check('a literal value is untouched', pruned[3].valueToFill === '3');
check('a step with no value is untouched', pruned[4].valueToFill === '');

// The case that matters most: the user has saved nothing at all, and the model
// writes placeholders anyway. Every one of them has to go, or the extension
// silently types empty strings across a whole form.
const noProfile = agent.pruneUnknownTokens(steps, []);
check('with no saved details, every placeholder is stripped', noProfile[0].valueToFill === '' && noProfile[1].valueToFill === '');
check('and literals still survive', noProfile[3].valueToFill === '3');

/* -------------------------------------------------------------------------- */

console.log(`\n  ${passed}/${passed + failures.length} passed`);
if (failures.length) {
  console.log('\nfailures:');
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exitCode = 1;
}
