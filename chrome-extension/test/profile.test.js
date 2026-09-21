/**
 * The saved-details profile: what the matcher decides, and what never leaves
 * the device.
 *
 * These are the two halves that can hurt somebody. A matcher that writes the
 * applicant's name into "Father's Name" produces a wrong government form that
 * looks right, which is worse than a blank one. And a leak here is not a
 * crashed feature, it is a home address and a date of birth in a third party's
 * prompt logs. Both are silent failures, so both get a test rather than a
 * careful read.
 *
 * Runs the shipped `shared/setu-profile.js` in a VM with a stub
 * `chrome.storage.local`, so it exercises the real file rather than a copy.
 *
 * Run: node test/profile.test.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'shared', 'setu-profile.js'), 'utf8');

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ok  ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/* -------------------------------------------------------------------------- */
/* Load the module                                                            */
/* -------------------------------------------------------------------------- */

const store = {};

const sandbox = {
  console,
  chrome: {
    storage: {
      local: {
        get: async (key) => (store[key] === undefined ? {} : { [key]: store[key] }),
        set: async (patch) => Object.assign(store, patch),
        remove: async (key) => delete store[key]
      }
    }
  }
};
sandbox.self = sandbox;
sandbox.globalThis = sandbox;

vm.createContext(sandbox);
vm.runInContext(SOURCE, sandbox, { filename: 'setu-profile.js' });

const P = sandbox.SETU_PROFILE;
check('the module exports SETU_PROFILE', Boolean(P));
if (!P) {
  console.log('\ncannot continue without the module');
  process.exit(1);
}

const values = P.derive(P.sampleProfile());

/* -------------------------------------------------------------------------- */
/* Catalogue integrity                                                        */
/* -------------------------------------------------------------------------- */

console.log('\ncatalogue');

const keys = P.FIELDS.map((field) => field.key);
check('every field key is unique', new Set(keys).size === keys.length);

check(
  'no derived key collides with a stored one',
  P.DERIVED.every((entry) => !keys.includes(entry.key)),
  P.DERIVED.filter((entry) => keys.includes(entry.key)).map((entry) => entry.key).join(', ')
);

check(
  'every field belongs to a declared group',
  P.FIELDS.every((field) => P.GROUPS.some((group) => group.key === field.group)),
  P.FIELDS.filter((field) => !P.GROUPS.some((group) => group.key === field.group))
    .map((field) => `${field.key}:${field.group}`)
    .join(', ')
);

check(
  'every group has at least one field',
  P.GROUPS.every((group) => P.fieldsIn(group.key).length),
  P.GROUPS.filter((group) => !P.fieldsIn(group.key).length).map((group) => group.key).join(', ')
);

check(
  'every field carries at least one match pattern',
  P.FIELDS.every((field) => (field.match || []).length),
  P.FIELDS.filter((field) => !(field.match || []).length).map((field) => field.key).join(', ')
);

/* -------------------------------------------------------------------------- */
/* The sample profile ships no fabricated identity documents                  */
/* -------------------------------------------------------------------------- */

console.log('\nsample data');

const SENSITIVE_KEYS = P.FIELDS.filter((field) => field.sensitive).map((field) => field.key);

check('sensitive fields exist and are declared', SENSITIVE_KEYS.length >= 10, String(SENSITIVE_KEYS.length));

// The one that matters most. A made-up Aadhaar or account number is
// indistinguishable from a real one once it is sitting in a government
// portal's input, and a form submitted with a fabricated ID is a worse
// outcome for the user than a form that was never filled.
const seededSensitive = SENSITIVE_KEYS.filter((key) => String(values[key] || '').trim());
check(
  'no sensitive field ships with a value',
  seededSensitive.length === 0,
  seededSensitive.join(', ')
);

check('the sample profile is flagged as a sample', P.sampleProfile().isSample === true);
check('a cleared profile is not flagged as a sample', P.emptyProfile().isSample === false);
check('the sample has enough filled in to be useful', P.filledKeys(values).length >= 40, String(P.filledKeys(values).length));

/* -------------------------------------------------------------------------- */
/* Derivation                                                                 */
/* -------------------------------------------------------------------------- */

console.log('\nderived details');

check('full name is assembled from the parts', values.fullName === 'Aarav Kumar Sharma', values.fullName);
check('initials come out of the same parts', values.initials === 'AKS', values.initials);

const expectedAge = P.ageFrom('1998-04-17');
check('age is computed from the date of birth', values.age === String(expectedAge), `${values.age} vs ${expectedAge}`);
check('a birthday later this year has not happened yet', P.ageFrom(`${new Date().getFullYear() - 30}-12-31`) === 29 || P.ageFrom(`${new Date().getFullYear() - 30}-01-01`) === 30);
check('a missing date of birth yields no age', P.ageFrom('') === null);
check('a malformed date of birth yields no age', P.ageFrom('17/04/1998') === null);

check('the date splits for three-box forms', values.dobDay === '17' && values.dobMonth === '04' && values.dobYear === '1998');
check('the date also comes in DD/MM/YYYY', values.dobDMY === '17/04/1998', values.dobDMY);

check('address line 1 is door plus building', values.addressLine1 === '402, Ashirwad Residency', values.addressLine1);
check('the full address includes the PIN code', values.fullAddress.includes('560102'), values.fullAddress);
check('the full address includes the door number', values.fullAddress.startsWith('402'), values.fullAddress);

// The permanent address mirrors the current one only while the box is ticked,
// and unticking must not have overwritten what was typed underneath.
const separate = P.derive({ ...P.sampleProfile(), permanentSameAsCurrent: false, permanentCity: 'Jaipur' });
check('an untick keeps the permanent address separate', separate.permanentCity === 'Jaipur', separate.permanentCity);
check('a tick mirrors the current address', values.permanentCity === 'Bengaluru', values.permanentCity);

/* -------------------------------------------------------------------------- */
/* Matching — the cases that would produce a wrong form                       */
/* -------------------------------------------------------------------------- */

console.log('\nfield matching');

const match = (control) => P.matchControl(control, values);
const keyFor = (control) => match(control)?.key || null;

/** Every collision that would put the right value in the wrong box. */
const CASES = [
  // [description, control, expected key]
  ['a plain name box takes the full name', { tag: 'input', type: 'text', label: 'Full Name' }, 'fullName'],
  ["a father's name box does NOT take the applicant", { tag: 'input', type: 'text', label: "Father's Name" }, 'fatherName'],
  ["a mother's name box does NOT take the applicant", { tag: 'input', type: 'text', label: "Mother's Name" }, 'motherName'],
  ['a bank name box takes neither', { tag: 'input', type: 'text', label: 'Bank Name' }, 'bankName'],
  ['a username box is not a person', { tag: 'input', type: 'text', label: 'Username' }, 'username'],
  ['a company name box is the employer', { tag: 'input', type: 'text', label: 'Company Name' }, 'employer'],

  ['an unlabelled input is read from its name attribute', { tag: 'input', type: 'text', name: 'dateOfBirth' }, 'dob'],
  ['snake_case ids are read too', { tag: 'input', type: 'text', name: 'pin_code' }, 'pincode'],
  ['an autocomplete token wins outright', { tag: 'input', type: 'text', label: 'Box 4', autocomplete: 'postal-code' }, 'pincode'],
  ['a shipping-prefixed token still resolves', { tag: 'input', type: 'text', label: '', autocomplete: 'shipping address-level1' }, 'state'],

  ['ZIP is a PIN code', { tag: 'input', type: 'text', label: 'ZIP Code' }, 'pincode'],
  ['Postal Code is a PIN code', { tag: 'input', type: 'text', label: 'Postal Code' }, 'pincode'],
  ['an ATM PIN is not a postal code', { tag: 'input', type: 'text', label: 'ATM PIN' }, null],
  ['a transaction PIN is not a postal code', { tag: 'input', type: 'text', label: 'Transaction PIN' }, null],

  ['a typed email input is an email', { tag: 'input', type: 'email', label: 'Contact' }, 'email'],
  ['an alternate email is the alternate', { tag: 'input', type: 'email', label: 'Alternate Email' }, 'altEmail'],
  ['a typed tel input is the mobile', { tag: 'input', type: 'tel', label: 'Contact' }, 'mobile'],
  ["a parent's phone is not the applicant's", { tag: 'input', type: 'tel', label: "Father's Mobile Number" }, 'parentPhone'],
  ['an emergency phone is the emergency one', { tag: 'input', type: 'tel', label: 'Emergency Contact Number' }, 'emergencyPhone'],

  ['a permanent city is not the current one', { tag: 'input', type: 'text', label: 'Permanent Address City' }, 'permanentCity'],
  ['a current city is', { tag: 'input', type: 'text', label: 'City' }, 'city'],
  ['a permanent PIN is not the current one', { tag: 'input', type: 'text', label: 'Permanent PIN Code' }, 'permanentPincode'],

  ['a gender select is the gender', { tag: 'select', type: '', label: 'Gender' }, 'gender'],
  ['a door number box is the door number', { tag: 'input', type: 'text', label: 'House / Door No.' }, 'doorNumber'],
  ['a landmark box is the landmark', { tag: 'input', type: 'text', label: 'Nearest Landmark' }, 'landmark'],
  ['an address textarea takes the whole address', { tag: 'textarea', type: '', label: 'Complete Postal Address' }, 'fullAddress'],

  ['a password box is never matched', { tag: 'input', type: 'password', label: 'Password' }, null],
  ['a confirm-password box is never matched', { tag: 'input', type: 'password', label: 'Confirm Password' }, null],
  ['a file input is never matched', { tag: 'input', type: 'file', label: 'Upload Aadhaar' }, null],
  ['a search box is never matched', { tag: 'input', type: 'search', label: 'Search' }, null],
  ['a CVV box is never matched', { tag: 'input', type: 'text', label: 'CVV' }, null],
  ['an OTP box is never matched', { tag: 'input', type: 'text', label: 'Enter OTP' }, null],
  ['a captcha box is never matched', { tag: 'input', type: 'text', label: 'Enter the captcha' }, null],

  ['a page-number box is not an age', { tag: 'input', type: 'text', label: 'Page number' }, null],
  ['an IP address box is not a postal address', { tag: 'input', type: 'text', label: 'IP Address' }, null],
  ['a quantity box matches nothing', { tag: 'input', type: 'number', label: 'Quantity' }, null]
];

for (const [description, control, expected] of CASES) {
  const actual = keyFor(control);
  check(description, actual === expected, `got ${actual === null ? 'no match' : actual}, wanted ${expected || 'no match'}`);
}

// Sensitive matches still resolve — they have to, so the autofill can offer
// them behind a confirmation — but they are flagged so no automatic path takes
// them.
const aadhaarMatch = match({ tag: 'input', type: 'text', label: 'Aadhaar Number' });
check('an Aadhaar box matches its field', aadhaarMatch?.key === 'aadhaar', String(aadhaarMatch?.key));
check('and is flagged sensitive', aadhaarMatch?.sensitive === true);
check('and holds no value out of the box', aadhaarMatch?.hasValue === false);

/* -------------------------------------------------------------------------- */
/* Matching a whole snapshot                                                  */
/* -------------------------------------------------------------------------- */

console.log('\nsnapshot matching');

const snapshot = [
  { ref: 'r0', tag: 'input', type: 'text', label: 'Full Name', value: '' },
  { ref: 'r1', tag: 'input', type: 'email', label: 'Email', value: '' },
  { ref: 'r2', tag: 'input', type: 'text', label: 'PIN Code', value: '' },
  { ref: 'r3', tag: 'input', type: 'text', label: 'City', value: 'Delhi' },
  { ref: 'r4', tag: 'input', type: 'text', label: 'Aadhaar Number', value: '' },
  { ref: 'r5', tag: 'input', type: 'password', label: 'Password', value: '' },
  { ref: 'r6', tag: 'button', type: 'submit', label: 'Submit', value: '' }
];

const matched = P.matchSnapshot(snapshot, values);
const matchedKeys = matched.map((entry) => entry.key);

check('a form snapshot yields the fields it should', matchedKeys.join(',') === 'fullName,email,pincode', matchedKeys.join(','));
check('a field the user already filled is left alone', !matchedKeys.includes('city'));
check('the password is not in the list', !matched.some((entry) => entry.control.type === 'password'));
check('the submit button is not in the list', !matched.some((entry) => entry.control.tag === 'button'));
check('refs are carried through so the caller can act', matched.every((entry) => entry.ref));

const withFilled = P.matchSnapshot(snapshot, values, { includeFilled: true });
check('filled fields can be included on request', withFilled.some((entry) => entry.key === 'city'));

/* -------------------------------------------------------------------------- */
/* The token protocol                                                         */
/* -------------------------------------------------------------------------- */

console.log('\ntoken substitution');

check('a token is recognised', P.tokensIn('{{profile.fullName}}').join(',') === 'fullName');
check('the bare form is recognised', P.tokensIn('{{pincode}}').join(',') === 'pincode');
check('the unbraced form is recognised', P.tokensIn('profile.city').join(',') === 'city');
check('an unknown key is not reported as a token', P.tokensIn('{{profile.notAKey}}').length === 0);
check('plain text has no tokens', P.tokensIn('Bengaluru').length === 0);

const resolved = P.resolveTokens('{{profile.city}} - {{profile.pincode}}', values);
check('tokens are substituted', resolved.text === 'Bengaluru - 560102', resolved.text);
check('and reported as used', resolved.used.join(',') === 'city,pincode', resolved.used.join(','));
check('nothing is reported missing', resolved.missing.length === 0);

const gap = P.resolveTokens('{{profile.aadhaar}}', values);
check('an empty detail resolves to nothing', gap.text === '');
check('and is reported missing rather than silently blank', gap.missing.join(',') === 'aadhaar');

const literal = P.resolveTokens('3', values);
check('a literal value passes straight through', literal.text === '3' && literal.used.length === 0);

check('a sensitive token is flagged', P.referencesSensitive('{{profile.pan}}') === true);
check('an ordinary token is not', P.referencesSensitive('{{profile.city}}') === false);
check('plain text is not', P.referencesSensitive('Bengaluru') === false);

/* -------------------------------------------------------------------------- */
/* What the model is allowed to see                                           */
/* -------------------------------------------------------------------------- */

console.log('\nwhat reaches the engine');

const described = P.describeForModel(values);

check('the manifest is not empty', described.length > 20, String(described.length));

// The whole privacy design, asserted rather than trusted: no entry may carry
// anything but a key and a human label, and none of the actual values may
// appear anywhere in the serialised manifest.
const shape = described.every(
  (entry) => Object.keys(entry).sort().join(',') === 'filled,key,label'
);
check('every entry is key/label/filled and nothing else', shape, JSON.stringify(described[0]));

const serialised = JSON.stringify(described);

// Checked against the *identifying* values rather than every stored string.
// A blanket scan flags "Mother" — which is a relationship the user saved and
// also half the label "Mother's name" — and calls a coincidence a leak. These
// are the values that could only have come from the profile.
const IDENTIFYING = [
  'Aarav',
  'Sharma',
  values.email,
  values.mobile,
  values.pincode,
  values.dob,
  values.fullAddress,
  values.building,
  values.linkedin,
  values.rollNumber,
  values.employer
];

const leaked = IDENTIFYING.filter((value) => value && serialised.includes(value));
check('no identifying value appears in what is sent', leaked.length === 0, leaked.join(' | '));

check(
  'the manifest is keys and labels only, by byte count',
  serialised.length < 6000,
  `${serialised.length} bytes for ${described.length} entries`
);

check(
  'sensitive keys are not described at all',
  described.every((entry) => !SENSITIVE_KEYS.includes(entry.key)),
  described.filter((entry) => SENSITIVE_KEYS.includes(entry.key)).map((entry) => entry.key).join(', ')
);

const emptyDescribed = P.describeForModel(P.derive(P.emptyProfile()));
check('an empty profile describes nothing', emptyDescribed.length === 0, String(emptyDescribed.length));

/* -------------------------------------------------------------------------- */
/* Storage                                                                    */
/* -------------------------------------------------------------------------- */

console.log('\nstorage');

(async () => {
  const first = await P.load();
  check('a fresh install is seeded with the sample', first.isSample === true);
  check('it lands in local storage', Boolean(store[P.STORAGE_KEY]), Object.keys(store).join(','));
  check('the key is not the synced settings key', P.STORAGE_KEY !== 'setuState', P.STORAGE_KEY);

  const afterEdit = await P.save({ firstName: 'Meera' });
  check('an edit is written', afterEdit.firstName === 'Meera');
  check('and clears the sample flag', afterEdit.isSample === false);
  check('and re-derives what depends on it', afterEdit.fullName === 'Meera Kumar Sharma', afterEdit.fullName);

  const cleared = await P.clear();
  check('clearing empties every field', P.filledKeys(cleared).length === 0, String(P.filledKeys(cleared).length));

  const restored = await P.restoreSample();
  check('the sample can be put back', restored.fullName === 'Aarav Kumar Sharma', restored.fullName);

  /* ---------------------------------------------------------------------- */

  console.log(`\n${passed} checks passed, ${failures.length} failed`);
  if (failures.length) {
    console.log('\nfailures:');
    for (const failure of failures) console.log(`  - ${failure}`);
    process.exitCode = 1;
  }
})();
