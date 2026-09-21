# Demo applicant for the agent's form autofill

One invented person — **Meera Rakeshbhai Solanki**, a 20-year-old OBC student in Valsad,
Gujarat — chosen so that the three forms most worth demonstrating are all plausible
applications for her:

| Form | Why she fits |
|---|---|
| **PAN (Form 49A)** | Adult, no PAN yet, father's name and DOB on file |
| **Income certificate** | Family income ₹1.8 L, farmer father, OBC |
| **Caste certificate** | OBC, father's name, permanent village address in Dharampur |

She is also the product's actual target user: a dyslexic student entitled to exam
accommodations under the RPwD Act whose family has probably never claimed them.

Nothing belongs to a real person. Mobile numbers are synthetic (`9000000000`), the email is
on the reserved `example.com` domain, addresses are composed.

## Where the profile lives now

**MongoDB**, served by the engine. `npm run seed` in `backend/` writes it there:

```
GET /api/profile   (x-user-id: demo_user)  ->  61 fields
```

The agent asks for it on boot when local storage is empty, caches it into
`chrome.storage.local`, and every read after that is local — so form-filling stays
offline-capable and `{{profile.pincode}}` is still substituted in the page, never in a prompt.

That fetch is **not in the branch**. `setu-profile.js`'s `load()` reads only
`chrome.storage.local` and falls back to a hardcoded sample, so merging alone leaves the
`/api/profile` endpoint unused. Apply `profile-fetch-from-engine.patch` after merging:

```bash
git apply chrome-extension/demo/profile-fetch-from-engine.patch
```

Verified against a live engine in four conditions:

| | |
|---|---|
| fresh install, via the worker | pulls Meera from MongoDB, caches 77 fields |
| worker context, direct fetch | pulls from MongoDB |
| engine unreachable | falls back to the built-in sample, does not break |
| profile already stored locally | local copy wins, network does not overwrite the user |

## Loading it by hand (fallback)

Only needed on a machine with no engine reachable.


```bash
node demo/seed-profile.js                      # validate + print the paste snippet
node demo/seed-profile.js --with-placeholders  # include the invalid ID stand-ins
node demo/seed-profile.js --out seed.js        # write the snippet to a file
```

The browser's working copy is `chrome.storage.local` under `setuProfile` — still deliberately
not `chrome.storage.sync`, which would push a home address and a date of birth through a Google
account to every machine it touches. MongoDB is where the profile is *held*; local storage is
the cache the agent actually fills from.

Nothing outside the browser can write that cache, so this script validates the data against the
real catalogue in `shared/setu-profile.js` and prints a snippet to paste into the extension's
service-worker console. With an engine reachable you should not need it — the fetch above does
this automatically.

**Requires `feat/copilot-saved-details-autofill` to be merged.** The script says so and exits
if the module is absent.

## Verified working

Round-tripped through the real module with an in-memory `chrome.storage.local`:

```
completeness: 87%
13 sensitive fields, 0 filled  ->  PASS

derived fields the forms actually match on:
  fullName    Meera Rakeshbhai Solanki
  dobDMY      22/08/2006      dobDay 22  dobMonth 08  dobYear 2006
  mobileFull  +91 9000000000
  fullAddress 14, Shreeji Apartments, Station Road, Halar, ... Gujarat - 396001, India
```

16 of 17 real government-form labels matched correctly, with `Aadhaar Number` and `PAN`
identified and then **held back** because they are `sensitive: true`.

## Government IDs are empty on purpose

Every ID and bank field ships blank. That is the shipped design, not an omission —
`setu-profile.js` states the reasoning: *a plausible-looking Aadhaar is indistinguishable from
a real one once it is sitting in a government portal's input, and a form submitted with a
made-up ID is a worse outcome than a form that was never filled.*

`--with-placeholders` adds stand-ins that are **invalid by construction**, so a real portal
rejects them even by accident:

- `aadhaar: 0000 0000 0000` — real Aadhaar never begins with 0 or 1 and carries a Verhoeff
  checksum; this fails both
- `pan: ZZZZZ0000Z` — character 4 encodes holder type, character 5 must be the surname
  initial; this satisfies neither
- `ifsc: DEMO0000000` — not allocated to any bank

**On stage, the empty version is the better demo.** The agent fills thirty-odd fields and stops
at Aadhaar. Say that out loud — it is the same instinct that keeps a fake ID out of a
government portal, and the audit called this "better privacy engineering than most production
products."

---

## Gaps found while testing this — worth fixing after the merge

Three findings, in order of how much they matter. All are in `shared/setu-profile.js`.

### 1. `familyIncome` does not exist, and it is the most important box on these forms

An income certificate, a caste certificate and every scholarship form ask for **family**
income, not the applicant's. The catalogue has only `annualIncome`, documented as the
applicant's own.

Add a field:

```js
{
  key: 'familyIncome',
  group: 'work',
  label: 'Annual family income (₹)',
  type: 'text',
  sample: '',
  inputTypes: ['number'],
  match: [/\bfamily income\b/, /\bhousehold income\b/, /\bincome of (?:the )?family\b/,
          /\bparent(?:s|al)? income\b/, /\btotal annual income\b/],
  avoid: /applicant'?s own|self income/
}
```

### 2. The `avoid` rule on `annualIncome` is inconsistent, and the failure fills a wrong number

```js
avoid: /father|mother|parent|household|family income/
```

It matches the literal string `family income`, so:

| Label | Behaviour |
|---|---|
| `Annual Family Income` | correctly declines |
| `Total Annual Income of Family` | **fills personal income into a family-income box** |

Same field, different word order, opposite outcome. On a government form a wrong number is
worse than a blank one — it looks filled and gets submitted. Widen to
`/father|mother|parent|household|family|guardian/`.

### 3. Smaller misses

| Label seen on real forms | Currently |
|---|---|
| `Sub-Caste` | matches `category`, which would write "OBC" into a sub-caste box |
| `Bank Branch` | no match — DBT and scholarship forms ask separately from bank name |
| `Ration Card Number` | no match — asked by most welfare schemes |
| `Domicile State` | matches `state`, which is right by luck; a `domicile` field would be safer |
| Disability percentage | no field — forms ask `%` alongside UDID, and the RPwD exam-accommodation pack needs it |

Once those exist, add them to `profile-demo.json` and re-run `seed-profile.js` — it validates
keys against the catalogue, so a typo is caught before it reaches a demo.
