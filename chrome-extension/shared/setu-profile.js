/**
 * SETU — Your Details (the on-device profile the Copilot fills forms from).
 * =========================================================================
 *
 * The Copilot could always *find* the right field. It could not fill it,
 * because it had nothing true to put there and the one thing it must never do
 * is invent personal data on somebody's real application form. So it stopped
 * and asked — every field, every time — which for a reader with ADHD or
 * dyslexia is precisely the wall the form was already putting in front of them.
 *
 * This file closes that gap. It is three things:
 *
 *   1. A **catalogue** of the fields Indian forms actually ask for — identity,
 *      contact, both addresses down to the door number, parents, education,
 *      employment, official IDs, access needs, emergency contact — each with
 *      the label patterns and `autocomplete` tokens real pages use for it.
 *   2. A **store** in `chrome.storage.local`.
 *   3. A **matcher** that reads one control off the page snapshot and says
 *      which detail belongs in it, with a confidence, deterministically and
 *      with no model in the loop.
 *
 * Three rules hold everywhere and are the reason the rest is safe:
 *
 *   - **Local only.** `chrome.storage.local`, never `chrome.storage.sync`.
 *     Sync would push a home address and a date of birth through a Google
 *     account to every machine that account touches. The reading preferences
 *     in `setu-core` sync; this does not, and the two must not be merged.
 *   - **Values never reach the model.** The planner is told which *keys* exist
 *     and writes `{{profile.pincode}}`; the substitution happens in the page,
 *     after the plan comes back. The engine, and whatever model is behind it,
 *     sees the shape of a person and never the person.
 *   - **Sensitive details are never filled without a deliberate click.** Every
 *     government ID and bank detail carries `sensitive: true`, which no
 *     automatic path will write — not the one-click autofill, not Auto-Run.
 *
 * On the sample data: everything here is invented and it is meant to be
 * replaced. The ID and bank fields ship *empty* on purpose. A plausible-looking
 * Aadhaar or account number is indistinguishable from a real one once it is
 * sitting in a government portal's input, and a form submitted with a made-up
 * ID is a worse outcome than a form that was never filled.
 *
 * Loaded by the service worker (importScripts), the popup, the options page,
 * and every content script — same pattern as `setu-config.js`, so there is one
 * catalogue rather than four that drift.
 */

(() => {
  /** Local storage key. Deliberately not the synced `setuState`. */
  const STORAGE_KEY = 'setuProfile';

  /** Bumped when the stored shape changes in a way `migrate` has to handle. */
  const SCHEMA_VERSION = 1;

  /* ---------------------------------------------------------------------- */
  /* Groups                                                                 */
  /* ---------------------------------------------------------------------- */

  /**
   * The order these appear in the editor, and the order the review list uses.
   *
   * Grouped the way a form asks rather than the way a database would store it:
   * somebody checking their own details before a submission is reading down a
   * page, not querying a schema.
   */
  const GROUPS = [
    { key: 'identity', label: 'Identity', hint: 'The name and details most forms open with.' },
    { key: 'contact', label: 'Contact', hint: 'How you are reached.' },
    { key: 'address', label: 'Current address', hint: 'Where you live now, down to the door number.' },
    {
      key: 'permanent',
      label: 'Permanent address',
      hint: 'Indian forms ask for both. Tick the box if it is the same as above.'
    },
    { key: 'family', label: 'Family', hint: "Parents and guardians — asked for on almost every official form." },
    { key: 'work', label: 'Education & work', hint: 'For applications, admissions, and job forms.' },
    {
      key: 'ids',
      label: 'Official IDs & bank',
      hint: 'Left empty on purpose. Nothing here is ever filled without you clicking it first.',
      sensitive: true
    },
    { key: 'support', label: 'Access needs', hint: 'What you want a form to know about how you read and work.' },
    { key: 'emergency', label: 'Emergency contact', hint: 'Asked for by hospitals, schools, and travel forms.' }
  ];

  /* ---------------------------------------------------------------------- */
  /* Field catalogue                                                        */
  /* ---------------------------------------------------------------------- */

  /**
   * One entry per detail SETU can fill.
   *
   * `match` is the working part. Page labels are wildly inconsistent — the same
   * box is "PIN Code", "Pincode", "Postal Code", "ZIP", or just `name="zip"` on
   * an unlabelled input — so each field carries the patterns that actually
   * occur, tested against a normalised haystack built from the label, `name`,
   * `id`, `placeholder` and `autocomplete` together.
   *
   * `avoid` is the half that stops the matcher being dangerous. "Name" appears
   * in "Father's Name", "Bank Name", "Company Name" and "Username", and a
   * matcher that writes the applicant's name into all four is worse than one
   * that fills nothing. Every generic field carries the list of contexts that
   * disqualify it, and `require` does the same job from the other side for
   * fields that are only ever correct in one context (the permanent address).
   *
   * `inputTypes` lets a typed input settle a tie the words could not: an
   * `<input type="email">` is an email field whatever its label says.
   */
  const FIELDS = [
    /* -- identity ---------------------------------------------------------- */
    {
      key: 'firstName',
      group: 'identity',
      label: 'First name',
      type: 'text',
      autocomplete: 'given-name',
      sample: 'Aarav',
      match: [/\bfirst ?name\b/, /\bgiven ?name\b/, /\bfore ?name\b/, /\bfname\b/],
      avoid: /father|mother|spouse|guardian|nominee|company|bank/
    },
    {
      key: 'middleName',
      group: 'identity',
      label: 'Middle name',
      type: 'text',
      autocomplete: 'additional-name',
      sample: 'Kumar',
      match: [/\bmiddle ?name\b/, /\bmname\b/, /\badditional ?name\b/]
    },
    {
      key: 'lastName',
      group: 'identity',
      label: 'Last name / surname',
      type: 'text',
      autocomplete: 'family-name',
      sample: 'Sharma',
      match: [/\blast ?name\b/, /\bsur ?name\b/, /\bfamily ?name\b/, /\blname\b/],
      avoid: /father|mother|spouse|guardian|nominee|maiden/
    },
    {
      key: 'preferredName',
      group: 'identity',
      label: 'Preferred name',
      type: 'text',
      sample: 'Aarav',
      hint: 'What you would rather be called, when a form offers the choice.',
      match: [/\bpreferred ?name\b/, /\bnick ?name\b/, /\bknown as\b/, /\bcalled\b/]
    },
    {
      key: 'dob',
      group: 'identity',
      label: 'Date of birth',
      type: 'date',
      autocomplete: 'bday',
      sample: '1998-04-17',
      inputTypes: ['date'],
      typeFallback: true,
      match: [/\bdate of birth\b/, /\bd\.? ?o\.? ?b\b/, /\bbirth ?date\b/, /\bbirthday\b/, /\bdob\b/]
    },
    {
      key: 'gender',
      group: 'identity',
      label: 'Gender',
      type: 'select',
      autocomplete: 'sex',
      options: ['Male', 'Female', 'Non-binary', 'Transgender', 'Prefer not to say'],
      sample: 'Male',
      match: [/\bgender\b/, /\bsex\b/]
    },
    {
      key: 'maritalStatus',
      group: 'identity',
      label: 'Marital status',
      type: 'select',
      options: ['Single', 'Married', 'Divorced', 'Widowed', 'Prefer not to say'],
      sample: 'Single',
      match: [/\bmarital\b/, /\bmarried\b/, /\bmarital ?status\b/]
    },
    {
      key: 'nationality',
      group: 'identity',
      label: 'Nationality',
      type: 'text',
      sample: 'Indian',
      match: [/\bnationality\b/, /\bcitizenship\b/]
    },
    {
      key: 'bloodGroup',
      group: 'identity',
      label: 'Blood group',
      type: 'select',
      options: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
      sample: 'O+',
      match: [/\bblood ?group\b/, /\bblood ?type\b/]
    },
    {
      key: 'category',
      group: 'identity',
      label: 'Category',
      type: 'select',
      options: ['General', 'OBC', 'SC', 'ST', 'EWS', 'Prefer not to say'],
      sample: 'General',
      hint: 'Asked for by Indian government and admission forms.',
      match: [/\bcategory\b/, /\bcaste\b/, /\breservation\b/],
      avoid: /product|item|job|course|blood|expense/
    },
    {
      key: 'religion',
      group: 'identity',
      label: 'Religion',
      type: 'text',
      sample: 'Hindu',
      match: [/\breligion\b/]
    },
    {
      key: 'motherTongue',
      group: 'identity',
      label: 'Mother tongue',
      type: 'text',
      sample: 'Hindi',
      match: [/\bmother ?tongue\b/, /\bnative language\b/, /\bfirst language\b/]
    },
    {
      key: 'placeOfBirth',
      group: 'identity',
      label: 'Place of birth',
      type: 'text',
      sample: 'Jaipur, Rajasthan',
      match: [/\bplace of birth\b/, /\bbirth ?place\b/, /\bborn (in|at)\b/]
    },

    /* -- contact ----------------------------------------------------------- */
    {
      key: 'email',
      group: 'contact',
      label: 'Email address',
      type: 'email',
      autocomplete: 'email',
      sample: 'aarav.sharma@example.com',
      inputTypes: ['email'],
      // The field a bare `type="email"` falls back to when the label says
      // nothing useful ("Contact", "Enter here"). Exactly one field per input
      // type carries this, or the fallback would be a coin toss between two
      // equally plausible answers.
      typeFallback: true,
      match: [/\be-?mail\b/, /\bemail ?(id|address)\b/],
      avoid: /alternate|secondary|other e-?mail|parent|father|mother|company e-?mail/
    },
    {
      key: 'altEmail',
      group: 'contact',
      label: 'Alternate email',
      type: 'email',
      sample: 'aarav.work@example.com',
      inputTypes: ['email'],
      require: /alternate|secondary|other|second|work|office/,
      match: [/\be-?mail\b/]
    },
    {
      key: 'countryCode',
      group: 'contact',
      label: 'Country dialling code',
      type: 'text',
      autocomplete: 'tel-country-code',
      sample: '+91',
      match: [/\bcountry ?code\b/, /\bisd ?code\b/, /\bdial(ling)? ?code\b/, /\bstd ?code\b/]
    },
    {
      key: 'mobile',
      group: 'contact',
      label: 'Mobile number',
      type: 'tel',
      autocomplete: 'tel-national',
      sample: '9876543210',
      inputTypes: ['tel'],
      typeFallback: true,
      match: [
        /\bmobile( ?(no|number|phone))?\b/,
        /\bcell( ?phone)?\b/,
        /\bphone( ?(no|number))?\b/,
        /\bcontact ?(no|number)\b/,
        /\btelephone\b/
      ],
      avoid: /alternate|secondary|land ?line|emergency|parent|father|mother|guardian|office|work|company|otp|country ?code|whatsapp ?business/
    },
    {
      key: 'altPhone',
      group: 'contact',
      label: 'Alternate phone',
      type: 'tel',
      sample: '9876543211',
      inputTypes: ['tel'],
      require: /alternate|secondary|other|land ?line|second/,
      match: [/\b(phone|mobile|number|contact)\b/]
    },
    {
      key: 'username',
      group: 'contact',
      label: 'Preferred username',
      type: 'text',
      autocomplete: 'username',
      sample: 'aarav_sharma',
      hint: 'Used for sign-up forms. SETU never stores or fills passwords.',
      match: [/\buser ?name\b/, /\blogin ?id\b/, /\bhandle\b/, /\buser ?id\b/],
      avoid: /password|employee|customer|aadhaar|pan/
    },
    {
      key: 'website',
      group: 'contact',
      label: 'Website / portfolio',
      type: 'url',
      autocomplete: 'url',
      sample: 'https://aarav-sharma.example.com',
      inputTypes: ['url'],
      typeFallback: true,
      match: [/\bwebsite\b/, /\bportfolio\b/, /\bpersonal ?(site|url)\b/, /\bblog\b/, /\bhomepage\b/],
      avoid: /linked ?in|github|twitter|company/
    },
    {
      key: 'linkedin',
      group: 'contact',
      label: 'LinkedIn profile',
      type: 'url',
      sample: 'https://www.linkedin.com/in/aarav-sharma-demo',
      inputTypes: ['url'],
      match: [/\blinked ?in\b/]
    },

    /* -- current address --------------------------------------------------- */
    {
      key: 'doorNumber',
      group: 'address',
      label: 'Door / flat / house number',
      type: 'text',
      sample: '402',
      match: [
        /\bdoor ?(no|number)\b/,
        /\bhouse ?(no|number)\b/,
        /\bflat ?(no|number)\b/,
        /\bplot ?(no|number)\b/,
        /\bpremises? ?(no|number)\b/,
        /\bh\.? ?no\b/
      ],
      avoid: /permanent|office/
    },
    {
      key: 'building',
      group: 'address',
      label: 'Building / apartment / society',
      type: 'text',
      sample: 'Ashirwad Residency',
      match: [/\bbuilding\b/, /\bapartment\b/, /\bsociety\b/, /\btower\b/, /\bblock\b/, /\bpremises\b/],
      avoid: /permanent|office|block ?(list|user)/
    },
    {
      key: 'street',
      group: 'address',
      label: 'Street / road',
      type: 'text',
      autocomplete: 'address-line2',
      sample: '12th Cross Road',
      match: [/\bstreet\b/, /\broad\b/, /\blane\b/, /\baddress ?(line ?)?2\b/, /\bavenue\b/],
      avoid: /permanent|office/
    },
    {
      key: 'locality',
      group: 'address',
      label: 'Area / locality / village',
      type: 'text',
      sample: 'HSR Layout, Sector 2',
      match: [
        /\blocality\b/,
        /\barea\b/,
        /\bcolony\b/,
        /\bvillage\b/,
        /\bsector\b/,
        /\bneighbou?rhood\b/,
        /\baddress ?(line ?)?3\b/
      ],
      avoid: /permanent|text ?area|service ?area/
    },
    {
      key: 'landmark',
      group: 'address',
      label: 'Landmark',
      type: 'text',
      sample: 'Opposite Sindhu Bhavan Park',
      match: [/\blandmark\b/, /\bnear ?by\b/, /\bnearest landmark\b/],
      avoid: /permanent/
    },
    {
      key: 'city',
      group: 'address',
      label: 'City / town',
      type: 'text',
      autocomplete: 'address-level2',
      sample: 'Bengaluru',
      match: [/\bcity\b/, /\btown\b/],
      avoid: /permanent|birth|capacity/
    },
    {
      key: 'district',
      group: 'address',
      label: 'District',
      type: 'text',
      sample: 'Bengaluru Urban',
      match: [/\bdistrict\b/, /\btaluk\b/, /\btehsil\b/, /\bmandal\b/],
      avoid: /permanent|birth/
    },
    {
      key: 'state',
      group: 'address',
      label: 'State',
      type: 'text',
      autocomplete: 'address-level1',
      sample: 'Karnataka',
      match: [/\bstate\b/, /\bprovince\b/],
      avoid: /permanent|birth|united states|statement/
    },
    {
      key: 'pincode',
      group: 'address',
      label: 'PIN code',
      type: 'text',
      autocomplete: 'postal-code',
      sample: '560102',
      match: [/\bpin ?code\b/, /\bpostal ?code\b/, /\bzip( ?code)?\b/, /\bpost ?code\b/, /\bpin\b/],
      // A banking "PIN" is not a postal code, and typing one into the other is
      // exactly the kind of quiet mistake this matcher exists to not make.
      avoid: /permanent|atm|security|secret|login|transaction|\bmpin\b|\botp\b/
    },
    {
      key: 'country',
      group: 'address',
      label: 'Country',
      type: 'text',
      autocomplete: 'country-name',
      sample: 'India',
      match: [/\bcountry\b/],
      avoid: /permanent|code|birth/
    },

    /* -- permanent address ------------------------------------------------- */
    {
      key: 'permanentSameAsCurrent',
      group: 'permanent',
      label: 'Same as current address',
      type: 'checkbox',
      sample: true,
      hint: 'When ticked, the permanent fields below follow the current address.',
      match: [/\bsame as (current|present|above|residential)\b/, /\bpermanent.*same\b/]
    },
    {
      key: 'permanentDoorNumber',
      group: 'permanent',
      label: 'Door / flat number',
      type: 'text',
      require: /permanent/,
      match: [/\b(door|house|flat|plot) ?(no|number)\b/, /\bh\.? ?no\b/]
    },
    {
      key: 'permanentBuilding',
      group: 'permanent',
      label: 'Building / society',
      type: 'text',
      require: /permanent/,
      match: [/\bbuilding\b/, /\bapartment\b/, /\bsociety\b/, /\bpremises\b/]
    },
    {
      key: 'permanentStreet',
      group: 'permanent',
      label: 'Street / road',
      type: 'text',
      require: /permanent/,
      match: [/\bstreet\b/, /\broad\b/, /\blane\b/, /\baddress ?(line ?)?2\b/]
    },
    {
      key: 'permanentLocality',
      group: 'permanent',
      label: 'Area / locality / village',
      type: 'text',
      require: /permanent/,
      match: [/\blocality\b/, /\barea\b/, /\bcolony\b/, /\bvillage\b/, /\bsector\b/]
    },
    {
      key: 'permanentCity',
      group: 'permanent',
      label: 'City / town',
      type: 'text',
      require: /permanent/,
      match: [/\bcity\b/, /\btown\b/]
    },
    {
      key: 'permanentDistrict',
      group: 'permanent',
      label: 'District',
      type: 'text',
      require: /permanent/,
      match: [/\bdistrict\b/, /\btaluk\b/, /\btehsil\b/, /\bmandal\b/]
    },
    {
      key: 'permanentState',
      group: 'permanent',
      label: 'State',
      type: 'text',
      require: /permanent/,
      match: [/\bstate\b/, /\bprovince\b/]
    },
    {
      key: 'permanentPincode',
      group: 'permanent',
      label: 'PIN code',
      type: 'text',
      require: /permanent/,
      match: [/\bpin ?code\b/, /\bpostal ?code\b/, /\bzip( ?code)?\b/, /\bpin\b/]
    },
    {
      key: 'permanentCountry',
      group: 'permanent',
      label: 'Country',
      type: 'text',
      require: /permanent/,
      match: [/\bcountry\b/],
      avoid: /code/
    },

    /* -- family ------------------------------------------------------------ */
    {
      key: 'fatherName',
      group: 'family',
      label: "Father's name",
      type: 'text',
      sample: 'Rajesh Kumar Sharma',
      match: [/\bfather'?s? ?(full )?name\b/, /\bfather\b/, /\bs\/o\b/, /\bson of\b/],
      avoid: /occupation|mobile|phone|income|qualification/
    },
    {
      key: 'fatherOccupation',
      group: 'family',
      label: "Father's occupation",
      type: 'text',
      sample: 'Retired Bank Manager',
      require: /father|parent/,
      match: [/\boccupation\b/, /\bprofession\b/]
    },
    {
      key: 'motherName',
      group: 'family',
      label: "Mother's name",
      type: 'text',
      sample: 'Sunita Sharma',
      match: [/\bmother'?s? ?(full |maiden )?name\b/, /\bmother\b/, /\bd\/o\b/],
      avoid: /occupation|mobile|phone|income|tongue|qualification/
    },
    {
      key: 'motherOccupation',
      group: 'family',
      label: "Mother's occupation",
      type: 'text',
      sample: 'Homemaker',
      require: /mother|parent/,
      match: [/\boccupation\b/, /\bprofession\b/]
    },
    {
      key: 'spouseName',
      group: 'family',
      label: "Spouse's name",
      type: 'text',
      sample: '',
      match: [/\bspouse\b/, /\bhusband\b/, /\bwife\b/, /\bpartner'?s? name\b/]
    },
    {
      key: 'guardianName',
      group: 'family',
      label: "Guardian's name",
      type: 'text',
      sample: 'Rajesh Kumar Sharma',
      match: [/\bguardian\b/, /\bcare ?taker\b/],
      avoid: /occupation|mobile|phone|relation/
    },
    {
      key: 'parentPhone',
      group: 'family',
      label: "Parent / guardian's phone",
      type: 'tel',
      sample: '9876543212',
      inputTypes: ['tel'],
      require: /parent|father|mother|guardian/,
      match: [/\b(phone|mobile|contact) ?(no|number)?\b/]
    },

    /* -- education & work -------------------------------------------------- */
    {
      key: 'occupation',
      group: 'work',
      label: 'Occupation / job title',
      type: 'text',
      autocomplete: 'organization-title',
      sample: 'Software Engineer',
      match: [/\boccupation\b/, /\bprofession\b/, /\bjob ?title\b/, /\bdesignation\b/, /\bcurrent role\b/, /\bposition\b/],
      avoid: /father|mother|parent|spouse|guardian/
    },
    {
      key: 'employer',
      group: 'work',
      label: 'Employer / organisation',
      type: 'text',
      autocomplete: 'organization',
      sample: 'Nimbus Technologies Pvt Ltd',
      match: [/\bemployer\b/, /\bcompany( ?name)?\b/, /\borgani[sz]ation\b/, /\bfirm\b/, /\bcurrent company\b/],
      avoid: /bank|insurance provider|father|mother/
    },
    {
      key: 'workExperienceYears',
      group: 'work',
      label: 'Years of experience',
      type: 'text',
      sample: '4',
      inputTypes: ['number'],
      match: [/\b(years? of )?experience\b/, /\btotal experience\b/, /\bwork ?ex\b/]
    },
    {
      key: 'annualIncome',
      group: 'work',
      label: 'Annual income (₹)',
      type: 'text',
      sample: '850000',
      inputTypes: ['number'],
      match: [/\bannual income\b/, /\bincome\b/, /\bsalary\b/, /\bctc\b/],
      avoid: /father|mother|parent|household|family income/
    },
    {
      key: 'highestQualification',
      group: 'work',
      label: 'Highest qualification',
      type: 'text',
      sample: 'B.E. Computer Science',
      match: [
        /\bqualification\b/,
        /\bhighest (degree|education|qualification)\b/,
        /\beducation ?(level|qualification)\b/,
        /\bdegree\b/
      ],
      avoid: /father|mother|parent|spouse/
    },
    {
      key: 'institution',
      group: 'work',
      label: 'College / university',
      type: 'text',
      sample: 'Visvesvaraya Technological University',
      match: [/\bcollege\b/, /\buniversity\b/, /\binstitute\b/, /\binstitution\b/, /\bschool ?name\b/, /\balma mater\b/]
    },
    {
      key: 'yearOfPassing',
      group: 'work',
      label: 'Year of passing',
      type: 'text',
      sample: '2020',
      inputTypes: ['number'],
      match: [/\byear of (passing|completion|graduation)\b/, /\bpassing ?year\b/, /\bgraduation ?year\b/, /\byop\b/]
    },
    {
      key: 'rollNumber',
      group: 'work',
      label: 'Roll / enrolment number',
      type: 'text',
      sample: '1VE16CS004',
      match: [
        /\broll ?(no|number)\b/,
        /\benrol?l?ment ?(no|number)\b/,
        /\bregistration ?(no|number)\b/,
        /\bstudent ?id\b/,
        /\badmission ?(no|number)\b/
      ]
    },

    /* -- official IDs & bank ----------------------------------------------- */
    {
      key: 'aadhaar',
      group: 'ids',
      label: 'Aadhaar number',
      type: 'text',
      sensitive: true,
      sample: '',
      placeholder: '12 digits',
      match: [/\baadhaar\b/, /\baadhar\b/, /\buid ?(no|number)\b/, /\buidai\b/]
    },
    {
      key: 'pan',
      group: 'ids',
      label: 'PAN',
      type: 'text',
      sensitive: true,
      sample: '',
      placeholder: 'ABCDE1234F',
      match: [/\bpan\b/, /\bpermanent account number\b/],
      avoid: /company|pan ?card ?upload|panel/
    },
    {
      key: 'passport',
      group: 'ids',
      label: 'Passport number',
      type: 'text',
      sensitive: true,
      sample: '',
      match: [/\bpassport\b/]
    },
    {
      key: 'voterId',
      group: 'ids',
      label: 'Voter ID (EPIC)',
      type: 'text',
      sensitive: true,
      sample: '',
      match: [/\bvoter ?(id|card)?\b/, /\bepic ?(no|number)\b/, /\belection ?card\b/]
    },
    {
      key: 'drivingLicence',
      group: 'ids',
      label: 'Driving licence number',
      type: 'text',
      sensitive: true,
      sample: '',
      match: [/\bdriving ?licen[cs]e\b/, /\bdl ?(no|number)\b/, /\bdriver'?s? licen[cs]e\b/]
    },
    {
      key: 'abhaId',
      group: 'ids',
      label: 'ABHA / health ID',
      type: 'text',
      sensitive: true,
      sample: '',
      match: [/\babha\b/, /\bhealth ?id\b/, /\bhealth account\b/]
    },
    {
      key: 'udid',
      group: 'ids',
      label: 'UDID / disability certificate',
      type: 'text',
      sensitive: true,
      sample: '',
      match: [/\budid\b/, /\bdisability certificate\b/, /\bdivyang ?(id|card)\b/]
    },
    {
      key: 'gstin',
      group: 'ids',
      label: 'GSTIN',
      type: 'text',
      sensitive: true,
      sample: '',
      match: [/\bgstin\b/, /\bgst ?(no|number)\b/]
    },
    {
      key: 'bankName',
      group: 'ids',
      label: 'Bank name',
      type: 'text',
      sensitive: true,
      sample: '',
      match: [/\bbank ?name\b/, /\bname of (the )?bank\b/]
    },
    {
      key: 'bankAccount',
      group: 'ids',
      label: 'Bank account number',
      type: 'text',
      sensitive: true,
      sample: '',
      match: [/\baccount ?(no|number)\b/, /\bbank ?a\/c\b/, /\ba\/c ?(no|number)\b/]
    },
    {
      key: 'ifsc',
      group: 'ids',
      label: 'IFSC code',
      type: 'text',
      sensitive: true,
      sample: '',
      match: [/\bifsc\b/]
    },
    {
      key: 'upiId',
      group: 'ids',
      label: 'UPI ID',
      type: 'text',
      sensitive: true,
      sample: '',
      match: [/\bupi ?(id)?\b/, /\bvpa\b/, /\bvirtual payment address\b/]
    },

    /* -- access needs ------------------------------------------------------ */
    {
      key: 'disabilityStatus',
      group: 'support',
      label: 'Disability status',
      type: 'text',
      sensitive: true,
      sample: '',
      hint: 'Health data. Empty by default, and never filled without a click.',
      match: [/\bdisability\b/, /\bdivyang\b/, /\bpwd\b/, /\bdifferently abled\b/, /\bhandicap\b/]
    },
    {
      key: 'accommodations',
      group: 'support',
      label: 'Accommodations you need',
      type: 'textarea',
      sample: 'Extra time for reading. Instructions in plain language.',
      match: [
        /\baccommodation\b/,
        /\bspecial (assistance|requirement|need)\b/,
        /\bsupport (needed|required)\b/,
        /\baccessibility (need|requirement)\b/
      ],
      avoid: /hotel|room|stay|booking/
    },
    {
      key: 'preferredLanguage',
      group: 'support',
      label: 'Preferred language',
      type: 'text',
      sample: 'English',
      match: [/\bpreferred language\b/, /\bcorrespondence language\b/, /\blanguage preference\b/]
    },

    /* -- emergency contact ------------------------------------------------- */
    {
      key: 'emergencyName',
      group: 'emergency',
      label: 'Emergency contact name',
      type: 'text',
      sample: 'Sunita Sharma',
      require: /emergency|next of kin|in case of/,
      match: [/\bname\b/, /\bcontact\b/],
      avoid: /relation|phone|mobile|number/
    },
    {
      key: 'emergencyRelation',
      group: 'emergency',
      label: 'Relationship to you',
      type: 'text',
      sample: 'Mother',
      match: [/\brelation(ship)?\b/, /\brelation to\b/],
      avoid: /nominee ?relation ?code/
    },
    {
      key: 'emergencyPhone',
      group: 'emergency',
      label: 'Emergency contact phone',
      type: 'tel',
      sample: '9876543213',
      inputTypes: ['tel'],
      require: /emergency|next of kin|in case of/,
      match: [/\b(phone|mobile|contact|number)\b/]
    }
  ];

  const FIELD_BY_KEY = new Map(FIELDS.map((field) => [field.key, field]));

  /* ---------------------------------------------------------------------- */
  /* Derived details                                                        */
  /* ---------------------------------------------------------------------- */

  /**
   * Details assembled from stored ones rather than typed.
   *
   * Two reasons they are computed and not fields. Storing both "first name"
   * and "full name" guarantees they eventually disagree, and the page will ask
   * for whichever one is stale. And a date of birth is asked for in at least
   * five different shapes — one `<input type="date">`, three separate selects,
   * a `DD/MM/YYYY` text box — which is a formatting problem, not five facts.
   */
  const DERIVED = [
    {
      key: 'fullName',
      label: 'Full name',
      group: 'identity',
      autocomplete: 'name',
      match: [
        /\bfull ?name\b/,
        /\bapplicant'?s? name\b/,
        /\bcandidate'?s? name\b/,
        /\bstudent'?s? name\b/,
        /\byour name\b/,
        /\bname of (the )?(applicant|candidate|student|person)\b/,
        /\bname\b/
      ],
      // "Name" is the single most overloaded label on the web. Everything that
      // is a name but not *this person's* name has to be ruled out here, or the
      // matcher writes the applicant into the bank name box.
      avoid:
        /father|mother|spouse|guardian|nominee|emergency|user ?name|login|bank|company|organi[sz]ation|institut|college|university|school|file|domain|product|card ?holder|account ?name|first|last|middle|sur ?name|display|host|folder|device|beneficiary/,
      from: (v) => [v.firstName, v.middleName, v.lastName].filter(Boolean).join(' ')
    },
    {
      key: 'initials',
      label: 'Initials',
      group: 'identity',
      match: [/\binitials\b/],
      from: (v) =>
        [v.firstName, v.middleName, v.lastName]
          .filter(Boolean)
          .map((part) => part.trim().charAt(0).toUpperCase())
          .join('')
    },
    {
      key: 'age',
      label: 'Age',
      group: 'identity',
      inputTypes: ['number'],
      match: [/\bage\b/, /\byears? old\b/],
      avoid: /average|page|message|storage|usage/,
      from: (v) => {
        const age = ageFrom(v.dob);
        return age === null ? '' : String(age);
      }
    },
    {
      key: 'dobDay',
      label: 'Birth day',
      group: 'identity',
      require: /birth|dob/,
      match: [/\bday\b/, /\bdd\b/],
      from: (v) => datePart(v.dob, 2)
    },
    {
      key: 'dobMonth',
      label: 'Birth month',
      group: 'identity',
      require: /birth|dob/,
      match: [/\bmonth\b/, /\bmm\b/],
      from: (v) => datePart(v.dob, 1)
    },
    {
      key: 'dobYear',
      label: 'Birth year',
      group: 'identity',
      require: /birth|dob/,
      match: [/\byear\b/, /\byyyy\b/],
      from: (v) => datePart(v.dob, 0)
    },
    {
      key: 'dobDMY',
      label: 'Date of birth (DD/MM/YYYY)',
      group: 'identity',
      from: (v) => {
        const [y, m, d] = String(v.dob || '').split('-');
        return y && m && d ? `${d}/${m}/${y}` : '';
      }
    },
    {
      key: 'mobileFull',
      label: 'Mobile with country code',
      group: 'contact',
      autocomplete: 'tel',
      match: [/\bmobile with (country )?code\b/, /\bfull (phone|mobile)\b/, /\bwhatsapp\b/],
      from: (v) => [v.countryCode, v.mobile].filter(Boolean).join(' ').trim()
    },
    {
      key: 'addressLine1',
      label: 'Address line 1',
      group: 'address',
      autocomplete: 'address-line1',
      match: [/\baddress ?(line ?)?1\b/, /\bstreet address\b/],
      avoid: /permanent|email|ip ?address|wallet/,
      from: (v) => [v.doorNumber, v.building].filter(Boolean).join(', ')
    },
    {
      key: 'addressLine2',
      label: 'Address line 2',
      group: 'address',
      match: [/\baddress ?(line ?)?2\b/],
      avoid: /permanent/,
      from: (v) => [v.street, v.locality].filter(Boolean).join(', ')
    },
    {
      key: 'fullAddress',
      label: 'Full postal address',
      group: 'address',
      match: [
        /\bfull address\b/,
        /\bcomplete address\b/,
        /\bpostal address\b/,
        /\bcorrespondence address\b/,
        /\bresidential address\b/,
        /\bcurrent address\b/,
        /\bpresent address\b/,
        /\baddress\b/
      ],
      // "Address" is a longer word than "City", so on a label reading
      // "Permanent Address City" the whole-address field outscored the field
      // the box actually wanted and pasted a full postal address into a city
      // input. Naming any *component* of an address disqualifies the whole.
      avoid:
        /permanent|e-?mail|ip ?address|wallet|mac ?address|line ?[123]|proof|type of address|\b(door|house|flat|plot|building|society|street|road|lane|locality|area|colony|village|sector|landmark|city|town|district|taluk|state|province|pin|postal ?code|zip|country)\b/,
      from: (v) =>
        [
          [v.doorNumber, v.building].filter(Boolean).join(', '),
          v.street,
          v.locality,
          v.landmark,
          [v.city, v.district].filter(Boolean).join(', '),
          [v.state, v.pincode].filter(Boolean).join(' - '),
          v.country
        ]
          .filter(Boolean)
          .join(', ')
    },
    {
      key: 'permanentFullAddress',
      label: 'Full permanent address',
      group: 'permanent',
      require: /permanent/,
      match: [/\baddress\b/],
      avoid:
        /line ?[123]|proof|\b(door|house|flat|plot|building|society|street|road|lane|locality|area|colony|village|sector|landmark|city|town|district|taluk|state|province|pin|postal ?code|zip|country)\b/,
      from: (v) =>
        [
          [v.permanentDoorNumber, v.permanentBuilding].filter(Boolean).join(', '),
          v.permanentStreet,
          v.permanentLocality,
          [v.permanentCity, v.permanentDistrict].filter(Boolean).join(', '),
          [v.permanentState, v.permanentPincode].filter(Boolean).join(' - '),
          v.permanentCountry
        ]
          .filter(Boolean)
          .join(', ')
    }
  ];

  const DERIVED_BY_KEY = new Map(DERIVED.map((entry) => [entry.key, entry]));

  /** Every key SETU can fill, stored or computed. */
  const ALL_KEYS = [...FIELDS.map((f) => f.key), ...DERIVED.map((d) => d.key)];

  /** Whole-year age, or null when the date is missing or in the future. */
  function ageFrom(iso) {
    const value = String(iso || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

    const born = new Date(`${value}T00:00:00`);
    if (Number.isNaN(born.getTime())) return null;

    const now = new Date();
    let age = now.getFullYear() - born.getFullYear();
    const monthDelta = now.getMonth() - born.getMonth();
    if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < born.getDate())) age -= 1;

    return age >= 0 && age < 130 ? age : null;
  }

  /** One segment of an ISO date, kept zero-padded as forms expect. */
  function datePart(iso, index) {
    const parts = String(iso || '').split('-');
    return parts.length === 3 && parts[index] ? parts[index] : '';
  }

  /* ---------------------------------------------------------------------- */
  /* The sample profile                                                     */
  /* ---------------------------------------------------------------------- */

  /**
   * What a fresh install starts with.
   *
   * Deliberately complete for everything that is merely personal and
   * deliberately empty for everything that is an identity document, so the
   * Copilot can demonstrate what it does on a signup or contact form the
   * moment it is installed, and cannot put a fabricated ID number into a
   * government portal.
   *
   * `isSample` is what the options page reads to keep the "these are not your
   * details yet" banner up. It is cleared by the first edit.
   */
  function sampleProfile() {
    const values = {};
    for (const field of FIELDS) {
      values[field.key] = field.sample === undefined ? (field.type === 'checkbox' ? false : '') : field.sample;
    }
    return { ...values, isSample: true, schemaVersion: SCHEMA_VERSION, updatedAt: 0 };
  }

  /** An entirely blank profile, for "clear everything". */
  function emptyProfile() {
    const values = {};
    for (const field of FIELDS) values[field.key] = field.type === 'checkbox' ? false : '';
    return { ...values, isSample: false, schemaVersion: SCHEMA_VERSION, updatedAt: Date.now() };
  }

  /* ---------------------------------------------------------------------- */
  /* Normalising and deriving                                               */
  /* ---------------------------------------------------------------------- */

  /**
   * Coerce whatever is in storage into the current shape.
   *
   * Unknown keys are dropped rather than carried: a profile is the one place
   * in this extension where stale keys would be someone's old address quietly
   * outliving the edit that replaced it.
   */
  function normalise(raw) {
    const stored = raw && typeof raw === 'object' ? raw : {};
    const values = {};

    for (const field of FIELDS) {
      const value = stored[field.key];
      if (field.type === 'checkbox') {
        values[field.key] = value === true || value === 'true';
      } else {
        values[field.key] = value === undefined || value === null ? '' : String(value).trim();
      }
    }

    return {
      ...values,
      isSample: stored.isSample === true,
      schemaVersion: SCHEMA_VERSION,
      updatedAt: Number(stored.updatedAt) || 0
    };
  }

  /**
   * Stored values plus everything computed from them.
   *
   * The permanent-address mirror happens here rather than at save time, so
   * unticking the box restores whatever was typed before instead of having
   * overwritten it.
   */
  function derive(profile) {
    const values = normalise(profile);

    if (values.permanentSameAsCurrent) {
      values.permanentDoorNumber = values.doorNumber;
      values.permanentBuilding = values.building;
      values.permanentStreet = values.street;
      values.permanentLocality = values.locality;
      values.permanentCity = values.city;
      values.permanentDistrict = values.district;
      values.permanentState = values.state;
      values.permanentPincode = values.pincode;
      values.permanentCountry = values.country;
    }

    for (const entry of DERIVED) {
      try {
        values[entry.key] = String(entry.from(values) || '');
      } catch (_) {
        values[entry.key] = '';
      }
    }

    return values;
  }

  /** Keys that actually hold something. */
  function filledKeys(values) {
    return ALL_KEYS.filter((key) => {
      const value = values[key];
      return value !== '' && value !== false && value !== undefined && value !== null;
    });
  }

  /** How complete the non-sensitive part of the profile is, 0..1. */
  function completeness(values) {
    const relevant = FIELDS.filter((field) => !field.sensitive && field.type !== 'checkbox');
    if (!relevant.length) return 0;
    const filled = relevant.filter((field) => String(values[field.key] || '').trim()).length;
    return filled / relevant.length;
  }

  /* ---------------------------------------------------------------------- */
  /* Storage                                                                */
  /* ---------------------------------------------------------------------- */

  const listeners = new Set();

  /**
   * Read the profile, seeding the sample on first run.
   *
   * Returns derived values, because every caller wants `fullName` and `age`
   * and none of them should be recomputing those themselves.
   */
  async function load() {
    let stored = null;
    try {
      const res = await chrome.storage.local.get(STORAGE_KEY);
      stored = res?.[STORAGE_KEY] || null;
    } catch (_) {
      /* private mode, quota, or no extension context — fall through to sample */
    }

    if (!stored) {
      const seeded = sampleProfile();
      // Best-effort: an install that cannot write storage should still get a
      // working profile in memory rather than an empty one.
      try {
        await chrome.storage.local.set({ [STORAGE_KEY]: seeded });
      } catch (_) {
        /* ignore */
      }
      return derive(seeded);
    }

    return derive(stored);
  }

  /** The raw stored values, without the computed ones. For the editor. */
  async function loadRaw() {
    try {
      const res = await chrome.storage.local.get(STORAGE_KEY);
      if (res?.[STORAGE_KEY]) return normalise(res[STORAGE_KEY]);
    } catch (_) {
      /* ignore */
    }
    return sampleProfile();
  }

  /**
   * Merge a patch into the stored profile.
   *
   * Any real edit clears `isSample`, because from that point the profile is a
   * mix of the person's details and the demo's, and the banner warning that
   * none of it is theirs would be a lie in the more dangerous direction.
   */
  async function save(patch) {
    const current = await loadRaw();
    const next = normalise({ ...current, ...patch });

    const touchedRealField = Object.keys(patch || {}).some((key) => FIELD_BY_KEY.has(key));
    next.isSample = current.isSample && !touchedRealField;
    next.updatedAt = Date.now();

    await chrome.storage.local.set({ [STORAGE_KEY]: next });

    const derived = derive(next);
    listeners.forEach((fn) => {
      try {
        fn(derived);
      } catch (error) {
        console.warn('[SETU] profile listener failed:', error);
      }
    });

    return derived;
  }

  /** Wipe every value. Used by the options page's "Clear my details". */
  async function clear() {
    const blank = emptyProfile();
    await chrome.storage.local.set({ [STORAGE_KEY]: blank });
    const derived = derive(blank);
    listeners.forEach((fn) => {
      try {
        fn(derived);
      } catch (_) {
        /* ignore */
      }
    });
    return derived;
  }

  /** Put the demo details back, for someone who cleared them and wants a look. */
  async function restoreSample() {
    const seeded = sampleProfile();
    await chrome.storage.local.set({ [STORAGE_KEY]: seeded });
    return derive(seeded);
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  /* ---------------------------------------------------------------------- */
  /* Matching a page control to a detail                                    */
  /* ---------------------------------------------------------------------- */

  /**
   * Everything we know about a control, flattened into one searchable string.
   *
   * camelCase and snake_case are split first: an unlabelled `name="dateOfBirth"`
   * or `id="pin_code"` is extremely common and carries the whole meaning of the
   * field, and neither survives a naive lowercase.
   */
  function haystack(control) {
    const raw = [
      control.label,
      control.name,
      // The snapshot calls it `fieldId` so it cannot be confused with the `ref`
      // handle; a caller passing a raw DOM descriptor uses `id`. Accept both.
      control.fieldId || control.id,
      control.placeholder,
      control.ariaLabel,
      control.autocomplete,
      control.title
    ]
      .filter(Boolean)
      .join(' ');

    return raw
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_\-.[\]]+/g, ' ')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * The `autocomplete` token, stripped of its section and billing/shipping
   * prefixes. `autocomplete="shipping address-line1"` is still address line 1.
   */
  function autocompleteToken(control) {
    const raw = String(control.autocomplete || '').toLowerCase().trim();
    if (!raw || raw === 'off' || raw === 'on') return '';
    return raw
      .split(/\s+/)
      .filter((token) => !/^(section-|shipping|billing|home|work|mobile|fax|pager)$/.test(token))
      .pop() || '';
  }

  /** Longest text a field's patterns match in the haystack, or ''. */
  function bestPatternHit(patterns, hay) {
    let best = '';
    for (const pattern of patterns || []) {
      const hit = hay.match(pattern);
      if (hit && hit[0].length > best.length) best = hit[0];
    }
    return best;
  }

  /** Controls SETU refuses to write to under any circumstances. */
  const NEVER_FILL_TYPES = new Set(['password', 'file', 'hidden', 'submit', 'button', 'image', 'reset']);

  /** Controls that are almost never a personal detail, whatever they are called. */
  const NEVER_FILL_PATTERNS = /\b(password|passcode|captcha|otp|cvv|card ?number|search|coupon|promo)\b/;

  const MIN_SCORE = 45;

  /**
   * Which stored detail belongs in this control?
   *
   * Scoring rather than first-match: the same box can plausibly match three
   * fields, and the specific one has to win. An `autocomplete` token is worth
   * far more than any label guess because it is the page telling us outright;
   * beyond that, the longer the matched phrase the more specific it is, so
   * "father's name" beats "name" without needing a hand-written ordering.
   *
   * @param {object} control  from `Page.snapshot` — label/name/id/placeholder/type
   * @param {object} values   derived profile values
   * @returns {{key:string,label:string,value:string,score:number,sensitive:boolean}|null}
   */
  function matchControl(control, values) {
    if (!control) return null;

    const type = String(control.type || '').toLowerCase();
    if (NEVER_FILL_TYPES.has(type)) return null;
    if (type === 'search') return null;

    const hay = haystack(control);
    if (!hay || NEVER_FILL_PATTERNS.test(hay)) return null;

    const token = autocompleteToken(control);
    const candidates = [];

    for (const entry of [...FIELDS, ...DERIVED]) {
      if (entry.require && !entry.require.test(hay)) continue;
      if (entry.avoid && entry.avoid.test(hay)) continue;

      let score = 0;

      if (token && entry.autocomplete && entry.autocomplete.split(/\s+/).includes(token)) {
        score += 120;
      }

      const hit = bestPatternHit(entry.match, hay);
      if (hit) score += 45 + Math.min(35, hit.length * 2);

      // A typed input is the page being explicit, and sometimes it is the only
      // thing the page says at all: `<input type="email">` labelled "Contact"
      // is unmistakably an email box, and matching nothing there was leaving a
      // trivially fillable field for the user to type by hand.
      //
      // So agreement adds to a word match and, for the one canonical field per
      // type, can stand alone. Disagreement is close to disqualifying, because
      // `type="email"` really does outrank whatever the surrounding words say.
      const declared = ['email', 'tel', 'url', 'date', 'number'].includes(type);
      if (declared) {
        if ((entry.inputTypes || []).includes(type)) {
          score += score ? 25 : entry.typeFallback ? 50 : 0;
        } else if (score) {
          score -= 55;
        }
      }

      if (score <= 0) continue;

      // A `select` can only take one of its own options, so a field with a
      // known option list is a better fit for one than a free-text field is.
      if (control.tag === 'select' && entry.options) score += 15;

      // An unticked checkbox is "nothing saved", not the string "false".
      // Without this the autofill would build a step whose whole effect is to
      // untick a box the page had already left unticked.
      const stored = values ? values[entry.key] : undefined;
      const value = stored === undefined || stored === null || stored === false ? '' : String(stored);

      candidates.push({
        key: entry.key,
        label: entry.label,
        value,
        score,
        sensitive: Boolean(entry.sensitive),
        hasValue: Boolean(value)
      });
    }

    if (!candidates.length) return null;

    // A detail we actually hold outranks a marginally better-matching one we do
    // not: proposing an empty "middle name" over a filled "full name" would be
    // technically defensible and useless to the person waiting on the form.
    candidates.sort((a, b) => Number(b.hasValue) - Number(a.hasValue) || b.score - a.score);

    const best = candidates[0];
    return best.score >= MIN_SCORE ? best : null;
  }

  /**
   * Match every control in a page snapshot.
   *
   * @returns {Array} one entry per control that maps to a detail we hold,
   *   in page order, each carrying the control ref so the caller can act on it.
   */
  function matchSnapshot(controls, values, { includeSensitive = false, includeFilled = false } = {}) {
    const matches = [];

    for (const control of controls || []) {
      if (!includeFilled && String(control.value || '').trim()) continue;

      const match = matchControl(control, values);
      if (!match || !match.hasValue) continue;
      if (match.sensitive && !includeSensitive) continue;

      matches.push({ ...match, ref: control.ref, control });
    }

    return matches;
  }

  /* ---------------------------------------------------------------------- */
  /* The token protocol                                                     */
  /* ---------------------------------------------------------------------- */

  /**
   * `{{profile.pincode}}` — what the planner writes instead of a value.
   *
   * The bare `{{pincode}}` and unbraced `profile.pincode` forms are accepted
   * too. Models drop syntax under load, and a plan that fails because the
   * braces went missing would look to the user like the agent simply refusing
   * to fill their form again.
   */
  const TOKEN_PATTERN = /\{\{\s*(?:profile\s*\.\s*)?([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}|\bprofile\.([a-zA-Z][a-zA-Z0-9_]*)\b/g;

  /** Every profile key referenced by a string. */
  function tokensIn(text) {
    const keys = [];
    const source = String(text || '');
    TOKEN_PATTERN.lastIndex = 0;

    let match;
    while ((match = TOKEN_PATTERN.exec(source)) !== null) {
      const key = match[1] || match[2];
      if (key && ALL_KEYS.includes(key) && !keys.includes(key)) keys.push(key);
    }

    return keys;
  }

  /**
   * Substitute profile values into a string.
   *
   * An unknown or empty key resolves to '' and is reported, so the caller can
   * tell "I filled this" apart from "I wrote an empty string into it" — which
   * is the difference between a form that is done and one that silently is not.
   *
   * @returns {{text:string, used:string[], missing:string[]}}
   */
  function resolveTokens(text, values) {
    const used = [];
    const missing = [];
    const source = String(text ?? '');

    const resolved = source.replace(TOKEN_PATTERN, (whole, braced, bare) => {
      const key = braced || bare;
      if (!ALL_KEYS.includes(key)) {
        missing.push(key);
        return '';
      }

      const value = values?.[key];
      if (value === undefined || value === null || value === '' || value === false) {
        missing.push(key);
        return '';
      }

      if (!used.includes(key)) used.push(key);
      return String(value);
    });

    return { text: resolved, used, missing };
  }

  /** True when any token in the string points at a field marked sensitive. */
  function referencesSensitive(text) {
    return tokensIn(text).some((key) => FIELD_BY_KEY.get(key)?.sensitive);
  }

  /* ---------------------------------------------------------------------- */
  /* What the model is allowed to know                                      */
  /* ---------------------------------------------------------------------- */

  /**
   * The profile, described to the planner without a single value in it.
   *
   * This is the whole privacy design in one function. The model is told that
   * `pincode` exists and is filled; it is never told that it is 560102. It
   * writes `{{profile.pincode}}` and the page does the rest. Sensitive fields
   * are not described at all — an ID number is not something a plan should be
   * routing around in the first place.
   *
   * @returns {Array<{key:string,label:string,filled:boolean}>}
   */
  function describeForModel(values) {
    const described = [];

    for (const entry of [...FIELDS, ...DERIVED]) {
      if (entry.sensitive) continue;
      const value = values?.[entry.key];
      if (value === undefined || value === null || value === '' || value === false) continue;
      described.push({ key: entry.key, label: entry.label, filled: true });
    }

    return described;
  }

  /* ---------------------------------------------------------------------- */

  const scope = typeof self !== 'undefined' ? self : globalThis;

  scope.SETU_PROFILE = {
    STORAGE_KEY,
    SCHEMA_VERSION,
    GROUPS,
    FIELDS,
    DERIVED,
    ALL_KEYS,
    MIN_SCORE,

    fieldFor: (key) => FIELD_BY_KEY.get(key) || DERIVED_BY_KEY.get(key) || null,
    fieldsIn: (group) => FIELDS.filter((field) => field.group === group),
    derivedIn: (group) => DERIVED.filter((entry) => entry.group === group),

    sampleProfile,
    emptyProfile,
    normalise,
    derive,
    filledKeys,
    completeness,
    ageFrom,

    load,
    loadRaw,
    save,
    clear,
    restoreSample,
    subscribe,

    haystack,
    matchControl,
    matchSnapshot,

    tokensIn,
    resolveTokens,
    referencesSensitive,
    describeForModel
  };
})();
