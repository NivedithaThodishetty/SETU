/**
 * Crisis-language detection across every language SETU advertises.
 *
 * WHY THIS FILE EXISTS SEPARATELY
 * ------------------------------
 * The detection used to be twelve English regular expressions inside
 * fallbackEngine.js. The architecture around them was right — detection runs
 * server-side before any model call, the reply is fixed reviewed text that is
 * never sampled, and a crisis turn is never scored for points — but the
 * dictionary was monolingual in a product that invites input in eleven Indian
 * languages. A Hindi-speaking teenager typing "मुझे मरना है", or romanised
 * "mujhe marna hai", or a Tamil speaker typing "enakku saaganum", matched
 * nothing at all: the short-circuit did not fire, the message went to a
 * language model, and the user received a sampled reflective response — the
 * precise outcome the architecture was built to prevent.
 *
 * A guard that covers one of twenty-three languages is more dangerous than no
 * guard, because the team believes it is in place. Detection is therefore its
 * own module with its own suite (`npm run test:crisis`), so the coverage is
 * visible and a language added to the catalogue without patterns here fails a
 * test rather than quietly shipping.
 *
 * THE THREE LAYERS
 * ----------------
 *  1. Patterns, per language, in native script and romanised form. Written
 *     per-language rather than machine-translated from an English list, because
 *     idioms of self-harm do not translate literally — "khatam kar dunga" is
 *     not "I will finish", and a translated list produces both misses and false
 *     positives.
 *
 *  2. A context guard that separates a person from an essay about people.
 *     See INTENT vs KEYWORD below.
 *
 *  3. A conservative classifier second pass, run only when layers 1 and 2 miss.
 *     One yes/no question, temperature 0, tight deadline. It catches paraphrase
 *     and idiom that no pattern list can adjudicate. Critically it decides
 *     *whether* to show the fixed script — it never writes the reply, so the
 *     guarantee that a crisis response is never sampled survives intact.
 *
 * INTENT PATTERNS VS KEYWORD PATTERNS
 * -----------------------------------
 * These are separated because they need different false-positive handling, and
 * conflating them is how a detector ends up interrupting a psychology student.
 *
 *   INTENT patterns are anchored on first-person intent — "I want to die",
 *   "mujhe marna hai", "죽고 싶다". Someone writing these is talking about
 *   themselves. They fire unconditionally and are never suppressed.
 *
 *   KEYWORD patterns are the bare nouns — "suicide", "आत्महत्या", "intihar".
 *   They are indispensable, because "I have been thinking about suicide for
 *   weeks" carries no other marker. But they also match "my essay is about
 *   suicide rates in India" and "we studied suicide prevention in class". So a
 *   keyword hit is suppressed when the surrounding text looks academic or
 *   third-party, and only then.
 *
 * A NOTE ON WORD BOUNDARIES
 * -------------------------
 * `\b` in JavaScript is defined over ASCII word characters, so it is not merely
 * useless next to Devanagari, Tamil, Arabic or Han text — it is actively wrong.
 * `/\bölmek/` never matches "ölmek" at the start of a string, because both
 * sides of that position are non-word characters and so no boundary exists.
 * Native-script patterns here therefore match bare substrings, which is safe in
 * these scripts because the phrases are long enough not to embed accidentally.
 * Romanised patterns keep `\b`, where it is both meaningful and necessary:
 * without it "marna" matches inside "marnate". A pattern beginning with a
 * non-ASCII letter must not carry a leading `\b`, and the suite asserts that
 * every pattern matches at least one fixture, which is what catches this.
 */

const { resolveLanguage } = require('../config/languages');

/* -------------------------------------------------------------------------- */
/* Layer 1 — first-person intent. Never suppressed.                           */
/* -------------------------------------------------------------------------- */

/**
 * Every pattern here is high-specificity by design. The original comment in
 * fallbackEngine.js made the right trade and it is preserved: a false positive
 * that interrupts someone venting with a helpline banner does real damage to
 * trust, so ordinary frustration ("this deadline is killing me", "mar gaya
 * yaar") must not trip the guard. What has changed is that missing an
 * *explicit* statement is no longer the accepted price of that — layer 3 covers
 * the paraphrase these patterns deliberately decline to guess at.
 *
 * Negative lookbehind appears wherever a natural negation is common enough to
 * matter. English, Spanish, Portuguese, Italian, Russian and Indonesian negate
 * with a prefix ("I don't want to die", "no quiero morir"), so the affirmative
 * pattern would otherwise match the negated sentence. French, German and
 * Turkish negate by inserting a particle *inside* the phrase ("je ne veux pas
 * mourir", "ich will nicht sterben", "ölmek istemiyorum"), so the affirmative
 * pattern cannot match them and no guard is needed.
 */
const INTENT_PATTERNS = {
  // -- English ---------------------------------------------------------------
  'en-IN': [
    /\bkill(?:ing)?\s+my\s?self\b/i,
    /\bend(?:ing)?\s+(?:my|it)\s+(?:life|all)\b/i,
    /\btake\s+my\s+own\s+life\b/i,
    /(?<!\bdon'?t\s)(?<!\bdo\s not\s)(?<!\bnot\s)\b(?:want|going)\s+to\s+die\b/i,
    /\bdon'?t\s+want\s+to\s+(?:be\s+here|live|wake\s+up)\b/i,
    /\bbetter\s+off\s+(?:dead|without\s+me)\b/i,
    /\bno\s+(?:reason|point)\s+(?:in\s+|to\s+)?(?:living|live|being\s+here|go(?:ing)?\s+on)\b/i,
    /\bhurt(?:ing)?\s+my\s?self\b/i,
    /\bcut(?:ting)?\s+my\s?self\b/i,
    // "kms" is real self-harm slang, but it is also the everyday abbreviation
    // for kilometres in Indian English — "the school is 8 kms away" must not
    // fire. Requiring that no number precedes it keeps the slang and drops the
    // distance.
    /(?<!\d)(?<!\d\s)\bkms\b/i
  ],

  // -- Hindi — Devanagari and romanised -------------------------------------
  'hi-IN': [
    /मुझे\s*मरना\s*है/,
    /मरना\s*चाहता|मरना\s*चाहती/,
    /जीने\s*का\s*मन\s*नहीं/,
    /जीना\s*नहीं\s*चाहता|जीना\s*नहीं\s*चाहती/,
    /ज़िंदा\s*नहीं\s*रहना|जिंदा\s*नहीं\s*रहना/,
    /ख़ुद\s*को\s*ख़त्म|खुद\s*को\s*खत्म/,
    /जान\s*दे\s*दूँगा|जान\s*दे\s*दूंगा|जान\s*दे\s*दूँगी|जान\s*दे\s*दूंगी/,
    /अपने\s*आप\s*को\s*मार/,
    // Romanised / Hinglish. Bare "mar jaunga" is deliberately absent: it is
    // overwhelmingly hyperbolic in ordinary speech ("itna kaam hai mar jaunga")
    // and belongs to the classifier, which can read the sentence around it.
    /\bmujhe\s+marna\b/i,
    /\bmarna\s+hai\b/i,
    /\bmar\s+jaana\s+hai\b/i,
    /\bjeene\s+ka\s+mann?\s+nahi/i,
    /\bjeena\s+nahi\s+chahta|\bjeena\s+nahi\s+chahti/i,
    /\bzinda\s+nahi\s+rehna\b/i,
    /\bkhatam\s+kar\s+dunga\b|\bkhatam\s+kar\s+dungi\b/i,
    /\bjaan\s+de\s+dunga\b|\bjaan\s+de\s+dungi\b/i
  ],

  // -- Bengali ---------------------------------------------------------------
  'bn-IN': [
    /মরতে\s*চাই/,
    /বাঁচতে\s*চাই\s*না/,
    /মরে\s*যেতে\s*চাই/,
    /নিজেকে\s*শেষ\s*করে/,
    /\bmorte\s+chai\b/i,
    /\bbachte\s+chai\s+na\b/i
  ],

  // -- Gujarati --------------------------------------------------------------
  'gu-IN': [
    /મરવું\s*છે/,
    /જીવવું\s*નથી/,
    /જીવવા\s*નથી\s*માંગતો|જીવવા\s*નથી\s*માંગતી/,
    /\bmarvu\s+chhe\b/i,
    /\bjeevavu\s+nathi\b/i
  ],

  // -- Kannada ---------------------------------------------------------------
  'kn-IN': [
    /ಸಾಯಬೇಕು/,
    /ಸಾಯಲು\s*ಬಯಸು/,
    /ಬದುಕಲು\s*ಇಷ್ಟವಿಲ್ಲ/,
    /ಬದುಕಬೇಕು\s*ಅನಿಸುತ್ತಿಲ್ಲ/,
    /\bsaayabeku\b|\bsayabeku\b/i,
    /\bbadukalu\s+ishtavilla\b/i
  ],

  // -- Malayalam -------------------------------------------------------------
  'ml-IN': [
    /മരിക്കണം/,
    /മരിക്കാൻ\s*ആഗ്രഹ/,
    /ജീവിക്കാൻ\s*വയ്യ/,
    /ജീവിക്കാൻ\s*താൽപ്പര്യമില്ല/,
    /\bmarikkanam\b/i,
    /\bjeevikkan\s+vayya\b/i
  ],

  // -- Marathi ---------------------------------------------------------------
  'mr-IN': [
    /मला\s*मरायच/,
    /मरायचं\s*आहे|मरायचे\s*आहे/,
    /जगायचं\s*नाही|जगायचे\s*नाही/,
    /जगावंसं\s*वाटत\s*नाही/,
    /\bmala\s+maraych/i,
    /\bjagaycha\s+nahi\b|\bjagayche\s+nahi\b/i
  ],

  // -- Odia ------------------------------------------------------------------
  'od-IN': [
    /ମରିବାକୁ\s*ଚାହେଁ/,
    /ବଞ୍ଚିବାକୁ\s*ଚାହେଁ\s*ନାହିଁ/,
    /ନିଜକୁ\s*ଶେଷ\s*କରି/,
    /\bmaribaku\s+chahen\b/i,
    /\bbanchibaku\s+chahen\s+nahin\b/i
  ],

  // -- Punjabi ---------------------------------------------------------------
  'pa-IN': [
    /ਮਰਨਾ\s*ਚਾਹੁੰਦਾ|ਮਰਨਾ\s*ਚਾਹੁੰਦੀ/,
    /ਜੀਣਾ\s*ਨਹੀਂ\s*ਚਾਹੁੰਦਾ|ਜੀਣਾ\s*ਨਹੀਂ\s*ਚਾਹੁੰਦੀ/,
    /ਮੈਂ\s*ਮਰ\s*ਜਾਣਾ/,
    /\bmarna\s+chahunda\b|\bmarna\s+chahundi\b/i,
    /\bjeena\s+nahi\s+chahunda\b/i
  ],

  // -- Tamil -----------------------------------------------------------------
  'ta-IN': [
    /சாக\s*வேண்டும்/,
    /சாகணும்/,
    /இறக்க\s*வேண்டும்/,
    /வாழ\s*விரும்பவில்லை/,
    /உயிரை\s*விட/,
    // The audit names this exact romanisation as a miss in the old detector.
    /\benakku\s+saaganum\b/i,
    /\bsaaganum\b|\bsaaga\s+venum\b/i,
    /\bvaazha\s+virumbavillai\b/i
  ],

  // -- Telugu ----------------------------------------------------------------
  'te-IN': [
    /చనిపోవాలని/,
    /చావాలని\s*ఉంది/,
    /బతకాలని\s*లేదు/,
    /బ్రతకాలని\s*లేదు/,
    /\bchanipovalani\b/i,
    /\bbatakalani\s+ledu\b/i
  ],

  // -- Spanish ---------------------------------------------------------------
  'es-ES': [
    /(?<!\bno\s)\bquiero\s+morir(?:me)?\b/i,
    /\bme\s+quiero\s+matar\b|\bquiero\s+matarme\b/i,
    /\bno\s+quiero\s+vivir\b/i,
    /\bacabar\s+con\s+mi\s+vida\b/i,
    /\bquitarme\s+la\s+vida\b/i,
    /\bhacerme\s+daño\b/i
  ],

  // -- French ----------------------------------------------------------------
  'fr-FR': [
    /\bme\s+suicider\b/i,
    /\bje\s+veux\s+mourir\b/i,
    /\bje\s+veux\s+en\s+finir\b/i,
    // The negation particle sits between the verb and "plus vivre" in real
    // sentences ("je ne veux plus vivre"), so the middle word is optional
    // rather than absent.
    /\bne\s+(?:\S+\s+)?plus\s+vivre\b/i,
    /\bmettre\s+fin\s+à\s+mes\s+jours\b/i,
    /\bme\s+faire\s+du\s+mal\b/i
  ],

  // -- German ----------------------------------------------------------------
  'de-DE': [
    /\bich\s+will\s+sterben\b/i,
    /\bmich\s+umbringen\b|\bmich\s+töten\b/i,
    /\bnicht\s+mehr\s+leben\b/i,
    /\bmir\s+das\s+leben\s+nehmen\b/i,
    /\bmich\s+selbst\s+verletzen\b/i
  ],

  // -- Portuguese ------------------------------------------------------------
  'pt-BR': [
    /(?<!\bnão\s)\bquero\s+morrer\b/i,
    /\bme\s+matar\b|\bquero\s+me\s+matar\b/i,
    /\bnão\s+quero\s+viver\b/i,
    /\bacabar\s+com\s+a\s+minha\s+vida\b/i,
    /\bme\s+machucar\b/i
  ],

  // -- Italian ---------------------------------------------------------------
  'it-IT': [
    /(?<!\bnon\s)\bvoglio\s+morire\b/i,
    /\buccidermi\b|\bammazzarmi\b/i,
    /\bfarla\s+finita\b/i,
    /\bnon\s+voglio\s+vivere\b/i,
    /\bfarmi\s+del\s+male\b/i
  ],

  // -- Arabic ----------------------------------------------------------------
  'ar-SA': [
    /أريد\s*أن\s*أموت|اريد\s*ان\s*اموت/,
    /أقتل\s*نفسي|اقتل\s*نفسي/,
    /لا\s*أريد\s*العيش|لا\s*اريد\s*العيش/,
    /أنهي\s*حياتي|انهي\s*حياتي/,
    /أؤذي\s*نفسي|اؤذي\s*نفسي/
  ],

  // -- Chinese ---------------------------------------------------------------
  'zh-CN': [
    /我想死|想去死/,
    /不想活/,
    /结束生命|結束生命|了结自己/,
    /伤害自己|傷害自己/
  ],

  // -- Japanese --------------------------------------------------------------
  'ja-JP': [
    /死にたい/,
    /消えたい/,
    /生きたくない/,
    /自分を傷つけ/
  ],

  // -- Korean ----------------------------------------------------------------
  'ko-KR': [
    /죽고\s*싶/,
    /살기\s*싫/,
    /사라지고\s*싶/
  ],

  // -- Russian ---------------------------------------------------------------
  'ru-RU': [
    /(?<!не\s)хочу\s+умереть/i,
    /покончить\s+с\s+собой/i,
    /не\s+хочу\s+жить/i,
    /причинить\s+себе\s+вред/i
  ],

  // -- Indonesian ------------------------------------------------------------
  'id-ID': [
    /(?<!\btidak\s)\b(?:ingin|mau)\s+mati\b/i,
    /\btidak\s+ingin\s+hidup\b|\bgak\s+mau\s+hidup\b/i,
    /\bmengakhiri\s+hidup\b/i,
    /\bmenyakiti\s+diri\b/i
  ],

  // -- Turkish ---------------------------------------------------------------
  'tr-TR': [
    // No leading \b: "ö" is not an ASCII word character, so a boundary does not
    // exist before it and /\bölmek/ can never match. See the header note.
    /ölmek\s+istiyorum/i,
    /\bkendimi\s+öldür/i,
    /\byaşamak\s+istemiyorum\b/i,
    /\bkendime\s+zarar\s+ver/i
  ]
};

/* -------------------------------------------------------------------------- */
/* Layer 2 — bare keywords, suppressed in academic and third-party context    */
/* -------------------------------------------------------------------------- */

/**
 * The nouns. Indispensable — "I have been thinking about suicide for weeks"
 * carries no other marker — and also the patterns most likely to misfire, since
 * the same word appears in coursework, journalism and research.
 */
const KEYWORD_PATTERNS = {
  'en-IN': [/\bsuicid(?:e|es|al)\b/i, /\bself[\s-]?harm(?:ing|ed)?\b/i],
  'hi-IN': [/आत्महत्या/, /ख़ुदकुशी|खुदकुशी/, /\baatmahatya\b|\batmahatya\b/i, /\bkhud\s*kushi\b|\bkhudkushi\b/i],
  'bn-IN': [/আত্মহত্যা/, /\batmahatya\b|\batmohotya\b/i],
  'gu-IN': [/આપઘાત/, /આત્મહત્યા/, /\baapghat\b|\bapghat\b/i],
  'kn-IN': [/ಆತ್ಮಹತ್ಯೆ/, /\baatmahatye\b|\batmahatye\b/i],
  'ml-IN': [/ആത്മഹത്യ/, /\batmahatya\b|\baathmahathya\b/i],
  'mr-IN': [/आत्महत्या/],
  'od-IN': [/ଆତ୍ମହତ୍ୟା/, /\batmahatya\b/i],
  'pa-IN': [/ਖੁਦਕੁਸ਼ੀ/, /ਆਤਮ\s*ਹੱਤਿਆ/, /\bkhudkushi\b|\bkhud\s*kushi\b/i],
  'ta-IN': [/தற்கொலை/, /\btharkolai\b|\bthar\s*kolai\b/i],
  'te-IN': [/ఆత్మహత్య/, /\batmahatya\b|\baatmahatya\b/i],
  'es-ES': [/\bsuicid(?:io|arme|arse|a|as)\b/i],
  'fr-FR': [/\bsuicid(?:e|es|er|aire|aires)\b/i],
  'de-DE': [/\bselbstmord\b|\bsuizid\b/i],
  'pt-BR': [/\bsuicíd(?:io|ios)\b|\bsuicidar\b/i],
  'it-IT': [/\bsuicid(?:io|armi|arsi)\b/i],
  'ar-SA': [/انتحار|أنتحر|الانتحار/],
  'zh-CN': [/自杀|自殺/],
  'ja-JP': [/自殺/],
  'ko-KR': [/자살/, /자해/],
  'ru-RU': [/самоубийств|суицид/i],
  'id-ID': [/\bbunuh\s+diri\b/i],
  'tr-TR': [/\bintihar\b/i]
};

/**
 * Markers that a keyword hit is about a topic rather than about the writer.
 *
 * Applied ONLY to keyword patterns, never to intent patterns — so "I want to
 * kill myself, I have an essay due" still fires, correctly, because the intent
 * layer does not consult this at all.
 *
 * Deliberately conservative. Every term here describes discussing, studying or
 * reporting on the subject, and none of them is a word someone reaches for
 * while describing their own state. When this guard is wrong the classifier is
 * still behind it, because a suppressed keyword hit falls through to layer 3
 * rather than being discarded.
 */
const ACADEMIC_CONTEXT =
  /\b(?:essay|assignment|homework|thesis|dissertation|coursework|syllabus|curriculum|lecture|seminar|class(?:es|room)?|studied|studying|research(?:ing|er)?|paper|article|journal|news|documentary|movie|film|novel|book|chapter|statistics|stats|rates?|prevalence|prevention|awareness|campaign|helpline|hotline|policy|report|survey|module|exam|quiz|presentation|project)\b/i;

/* -------------------------------------------------------------------------- */
/* Detection                                                                  */
/* -------------------------------------------------------------------------- */

const ALL_INTENT = Object.values(INTENT_PATTERNS).flat();
const ALL_KEYWORD = Object.values(KEYWORD_PATTERNS).flat();

/**
 * Which languages carry patterns. Exported so the suite can assert that the
 * catalogue and the dictionary have not drifted apart — adding a language to
 * `config/languages.js` without adding patterns here is exactly the failure
 * this module exists to prevent, and it should break a build, not a person.
 */
const COVERED_LANGUAGES = Object.keys(INTENT_PATTERNS);

/**
 * Pattern-only detection. Synchronous, deterministic, and works with no API key
 * — which matters, because this is the one guarantee in SETU that must hold in
 * the fully-offline deployment a school with no budget would run.
 *
 * Every language's patterns are tested regardless of the requested language:
 * the picker says Hindi but a user typing English at 2am is common, and a guard
 * that only watches the selected language would miss them.
 */
function detectCrisisLanguage(text) {
  const value = String(text || '');
  if (!value.trim()) return false;

  if (ALL_INTENT.some((pattern) => pattern.test(value))) return true;
  if (ALL_KEYWORD.some((pattern) => pattern.test(value))) return !ACADEMIC_CONTEXT.test(value);
  return false;
}

/**
 * Detection with provenance, for logging and for the suite.
 *
 * Returns which language block matched and which layer, so an operator reading
 * logs can tell "the Tamil intent patterns fired" from "an English keyword
 * fired", without the message itself ever being logged.
 */
function inspectCrisisLanguage(text) {
  const value = String(text || '');
  const miss = { matched: false, layer: null, language: null, patternIndex: -1 };
  if (!value.trim()) return miss;

  for (const [language, patterns] of Object.entries(INTENT_PATTERNS)) {
    for (let index = 0; index < patterns.length; index += 1) {
      if (patterns[index].test(value)) {
        return { matched: true, layer: 'intent', language, patternIndex: index };
      }
    }
  }

  if (ACADEMIC_CONTEXT.test(value)) return miss;

  for (const [language, patterns] of Object.entries(KEYWORD_PATTERNS)) {
    for (let index = 0; index < patterns.length; index += 1) {
      if (patterns[index].test(value)) {
        return { matched: true, layer: 'keyword', language, patternIndex: index };
      }
    }
  }

  return miss;
}

/* -------------------------------------------------------------------------- */
/* Layer 3 — conservative classifier second pass                              */
/* -------------------------------------------------------------------------- */

/**
 * The classifier prompt.
 *
 * Deliberately asks one closed question and forbids everything else. It is not
 * being asked to help, counsel, or phrase anything — only to answer whether the
 * fixed script should be shown. Keeping its job this small is what preserves
 * the guarantee that no part of a crisis reply is ever sampled.
 */
const CLASSIFIER_INSTRUCTIONS = `You are a safety classifier. You do not converse and you do not help.

Answer exactly one question about the message below: does it indicate that the person writing it
may be at risk of suicide or self-harm?

Answer YES for: statements of wanting to die, wanting to not exist, planning or preparing to end
their life, wanting to hurt themselves, or saying that others would be better off without them.
This holds in every language, including romanised and code-mixed text.

Answer NO for: figurative or idiomatic exhaustion ("this deadline is killing me", "I'm dying of
boredom", "itna kaam hai mar jaunga"), anger at someone else, discussion of suicide as a topic in
the abstract, fiction, news, or academic contexts, and ordinary sadness, stress or frustration
without any reference to the person's own death or self-harm.

Reply with exactly one word: YES or NO. No punctuation, no explanation.`;

/**
 * Ask the model whether a message the patterns missed indicates risk.
 *
 * Only ever called after the pattern layers decline, so this is the paraphrase
 * net and not the primary guard. It is bounded hard — one short call,
 * temperature 0, a deadline well under the Listen budget — because a
 * reflective-support turn that hangs waiting on a safety check has failed the
 * user in a different way.
 *
 * Returns false on every error path. That is the correct trade *here* and only
 * here: the patterns have already declined this message, so an unreachable
 * model means we are back to exactly the behaviour that shipped before this
 * layer existed, rather than showing a helpline banner to someone venting about
 * a deadline because a fetch timed out. The explicit-statement guarantee lives
 * in the patterns, which need no network at all.
 *
 * @param {string} text
 * @param {{ timeoutMs?: number, deadlineMs?: number }} [options]
 * @returns {Promise<boolean>}
 */
async function classifyCrisisRisk(text, { timeoutMs = 2500, deadlineMs = 3000 } = {}) {
  const value = String(text || '').trim();
  if (!value) return false;

  // Required lazily: aiService pulls in the whole provider stack, and
  // fallbackEngine must stay importable in the no-key deployment.
  let requestText;
  try {
    ({ requestText } = require('./aiService'));
  } catch (_) {
    return false;
  }

  try {
    const answer = await requestText({
      instructions: CLASSIFIER_INSTRUCTIONS,
      messages: [{ role: 'user', content: value.slice(0, 2000) }],
      temperature: 0,
      tier: 'fast',
      thinkingLevel: 'minimal',
      timeoutMs,
      deadlineMs,
      maxRetries: 0,
      maxOutputTokens: 8,
      // Crisis text is not held in the shared response cache, and an identical
      // message from a different person is re-evaluated rather than answered
      // from a previous person's result.
      noCache: true
    });

    return /^\s*yes\b/i.test(String(answer || ''));
  } catch (_) {
    return false;
  }
}

/**
 * The full assessment: patterns first, classifier only if they miss.
 *
 * @returns {Promise<{ crisis: boolean, via: 'pattern'|'classifier'|null,
 *                     layer: 'intent'|'keyword'|null, language: string|null }>}
 */
async function assessCrisisRisk(text, options = {}) {
  const inspection = inspectCrisisLanguage(text);
  if (inspection.matched) {
    return {
      crisis: true,
      via: 'pattern',
      layer: inspection.layer,
      language: inspection.language
    };
  }

  if (options.useClassifier === false) {
    return { crisis: false, via: null, layer: null, language: null };
  }

  const flagged = await classifyCrisisRisk(text, options);
  return {
    crisis: flagged,
    via: flagged ? 'classifier' : null,
    layer: null,
    language: null
  };
}

/* -------------------------------------------------------------------------- */
/* The fixed response                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Helplines, by region.
 *
 * Numbers need no translation, which is the single most useful property of this
 * block: a Tamil-speaking child who cannot read the English paragraph above it
 * can still read 14416. India's national services are listed first for every
 * user because that is this product's primary audience; the international
 * directory is always appended so the response is never useless to someone
 * outside India.
 */
const HELPLINES = {
  india: [
    {
      region: 'India',
      name: 'Tele-MANAS (Government of India)',
      contact: '14416 or 1-800-891-4416',
      hours: '24 hours, every day, free — answers in 20+ Indian languages'
    },
    {
      region: 'India',
      name: 'KIRAN Mental Health Helpline',
      contact: '1800-599-0019',
      hours: '24 hours, 13 languages, free'
    },
    {
      region: 'India',
      name: 'AASRA',
      contact: '+91 98204 66726',
      hours: '24 hours, every day'
    }
  ],
  international: [
    {
      region: 'Anywhere',
      name: 'Find a Helpline (search by country)',
      contact: 'https://findahelpline.com',
      hours: 'Directory of verified local services in 130+ countries'
    },
    {
      region: 'International',
      name: 'International Association for Suicide Prevention',
      contact: 'https://www.iasp.info/resources/Crisis_Centres/',
      hours: 'Directory of crisis centres worldwide'
    }
  ]
};

/**
 * Crisis scripts, keyed by language, with an explicit review flag.
 *
 * ONLY entries marked `reviewed: true` are ever served. This is the mechanism
 * that lets the product be honest about a genuinely hard problem: running a
 * suicide-risk script through a translation model is the single worst place in
 * this codebase for a subtle error, and there is nobody on this team who can
 * verify twenty-two translations. So the structure is here, the English is
 * reviewed, and a professionally translated and second-speaker-verified version
 * of any language can be dropped in and flipped to `reviewed: true` without
 * touching a line of logic.
 *
 * Until then a non-English user receives the English script plus `languageNote`
 * explaining why, and — more importantly — the helpline numbers, which are
 * language-independent and staffed by humans who speak their language.
 *
 * The detection above is fully multilingual regardless. Detecting risk in Tamil
 * and answering in English is imperfect; not detecting it at all is not.
 */
const CRISIS_SCRIPTS = {
  'en-IN': {
    reviewed: true,
    message:
      'I am really glad you said that out loud. What you are carrying sounds far too heavy to hold on your own, and I am a piece of software — not the right support for this. Please talk to a person tonight.',
    immediateStep:
      'If you are in immediate danger, call your local emergency number or go to the nearest emergency department.',
    stayingHere:
      'You are welcome to keep this page open. Nothing you wrote leaves your browser unless you choose to save it.'
  }
};

/**
 * The fixed response for a crisis turn.
 *
 * Never generated by a model. When someone signals risk, the reply has to be
 * predictable, must not attempt therapy, and must put a real human channel in
 * front of them — so it is hardcoded and reviewed rather than sampled.
 */
function buildCrisisResponse(language = 'en-IN') {
  const requested = resolveLanguage(language);
  const script = CRISIS_SCRIPTS[requested.code]?.reviewed
    ? CRISIS_SCRIPTS[requested.code]
    : CRISIS_SCRIPTS['en-IN'];

  const servedInEnglish = script === CRISIS_SCRIPTS['en-IN'] && requested.code !== 'en-IN';

  return {
    crisis: true,
    language: servedInEnglish ? 'en-IN' : requested.code,
    requestedLanguage: requested.code,
    languageNote: servedInEnglish
      ? 'This message is shown in English so its wording stays exact — a mistranslated safety message is worse than an untranslated one. The helplines below answer in your language: Tele-MANAS covers 20+ Indian languages and KIRAN 13.'
      : null,
    message: script.message,
    helplines: [...HELPLINES.india, ...HELPLINES.international],
    immediateStep: script.immediateStep,
    stayingHere: script.stayingHere
  };
}

module.exports = {
  INTENT_PATTERNS,
  KEYWORD_PATTERNS,
  ACADEMIC_CONTEXT,
  COVERED_LANGUAGES,
  CRISIS_SCRIPTS,
  HELPLINES,
  detectCrisisLanguage,
  inspectCrisisLanguage,
  classifyCrisisRisk,
  assessCrisisRisk,
  buildCrisisResponse
};
