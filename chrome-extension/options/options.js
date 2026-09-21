/**
 * SETU — Options Page Controller (Broadsheet Design System).
 *
 * Exists so the engine URL, Sanctuary workspace, and cognitive reading
 * preferences are first-class, testable settings.
 * Everything saves dynamically with debounce; live preview reflects
 * chosen typography, letter spacing, and line height in real time.
 */

const $ = (selector) => document.querySelector(selector);

const IS_MAC = /mac/i.test(navigator.userAgentData?.platform || navigator.platform || '');
const ALT = IS_MAC ? '⌥' : 'Alt+';
const SHIFT = IS_MAC ? '⇧' : 'Shift+';

const KEY_MAP = [
  [`${ALT}${SHIFT}C`, 'Open SETU Commander (Voice & Text Copilot)'],
  [`${ALT}B`, 'Toggle Bionic Reading Fixations'],
  [`${ALT}F`, 'Toggle Focus Mode (Sensory Reader)'],
  [`${ALT}L`, 'Toggle Line Focus Band'],
  [`${ALT}H`, 'Toggle Reading Ruler (Line/Word/Block)'],
  [`${ALT}T`, 'Toggle Explain This — a spoken explanation in your language'],
  [`${ALT}S`, 'Toggle Smooth Hands-Free Auto Scroll'],
  [`${ALT}E`, 'Toggle Gaze Scroll (Head Tracking)'],
  [`${ALT}M`, 'Map a Chart, Image or Section as a Mind Map'],
  [`${ALT}3`, 'Break This Page Into a 3-Step Path'],
  [`${ALT}X`, 'Turn Every Active SETU Tool Off']
];

const DEFAULT_SETTINGS = {
  bionicIntensity: 0.45,
  lineFocusHeight: 1,
  highlightColor: '#0088b0',
  scrollWpm: 220,
  ttsRate: 1,
  ttsPitch: 1,
  ttsVoice: '',
  ttsSpeaker: '',
  ttsLanguage: 'en-IN',
  ttsExplain: false,
  gazeSensitivity: 1,
  gazeInvert: false,
  fontScale: 1,
  appearance: 'light',
  letterSpacing: 0.12,
  lineHeight: 1.8,
  language: 'English'
};

/**
 * One line per language for the voice preview.
 *
 * Written in each language rather than transliterated: a Bulbul voice reading
 * romanised Hindi sounds nothing like the same voice reading Devanagari, and
 * the preview would be misleading about the thing being previewed.
 */
const SAMPLE_LINES = {
  'en-IN': 'This is how I will read your pages aloud.',
  'hi-IN': 'मैं आपके पन्ने इसी आवाज़ में पढ़कर सुनाऊँगी।',
  'bn-IN': 'আমি এই কণ্ঠেই আপনার পাতা পড়ে শোনাব।',
  'gu-IN': 'હું આ અવાજમાં તમારાં પાનાં વાંચી સંભળાવીશ.',
  'kn-IN': 'ನಾನು ಈ ಧ್ವನಿಯಲ್ಲಿ ನಿಮ್ಮ ಪುಟಗಳನ್ನು ಓದುತ್ತೇನೆ.',
  'ml-IN': 'ഈ ശബ്ദത്തിൽ ഞാൻ നിങ്ങളുടെ പേജുകൾ വായിച്ചു കേൾപ്പിക്കും.',
  'mr-IN': 'मी याच आवाजात तुमची पाने वाचून दाखवेन.',
  'od-IN': 'ମୁଁ ଏହି ସ୍ୱରରେ ଆପଣଙ୍କ ପୃଷ୍ଠା ପଢ଼ି ଶୁଣାଇବି।',
  'pa-IN': 'ਮੈਂ ਇਸੇ ਆਵਾਜ਼ ਵਿੱਚ ਤੁਹਾਡੇ ਪੰਨੇ ਪੜ੍ਹ ਕੇ ਸੁਣਾਵਾਂਗੀ।',
  'ta-IN': 'இந்தக் குரலில் உங்கள் பக்கங்களை நான் வாசித்துக் காட்டுவேன்.',
  'te-IN': 'ఈ స్వరంతోనే నేను మీ పేజీలను చదివి వినిపిస్తాను.'
};

const SAMPLE_WORDS = [
  'Attention', 'is', 'the', 'part', 'that', 'changed', 'everything.',
  'Instead', 'of', 'reading', 'a', 'sentence', 'word', 'by', 'word',
  'and', 'hoping', 'to', 'remember', 'the', 'start', 'by', 'the', 'time',
  'it', 'reaches', 'the', 'end,', 'the', 'model', 'looks', 'at', 'every',
  'word', 'at', 'once', 'and', 'decides', 'which', 'actually', 'matter.'
];

class Options {
  constructor() {
    this.state = null;
    /** Raw stored profile values — the editor's source of truth while open. */
    this.profile = null;
    /** Field edits waiting on the save debounce. */
    this.profilePatch = null;
    this.profileTimer = null;
  }

  async init() {
    this.renderIcons();
    const manifest = chrome.runtime.getManifest();
    if ($('#version')) $('#version').textContent = `v${manifest.version}`;

    this.renderKeys();

    const { setuState, apiHost, sanctuaryUrl } = await chrome.storage.sync.get([
      'setuState',
      'apiHost',
      'sanctuaryUrl'
    ]);

    this.state = setuState || {};
    this.state.settings = { ...DEFAULT_SETTINGS, ...(this.state.settings || {}) };

    // Before the first paint, so the page never flashes the wrong palette.
    self.setuApplyAppearance(this.state.settings.appearance);

    const currentApiHost = apiHost || self.SETU_DEFAULTS?.apiHost || '';
    const currentSanctuaryUrl = sanctuaryUrl || self.SETU_DEFAULTS?.sanctuaryUrl || '';

    if ($('#api-host')) $('#api-host').value = currentApiHost;
    if ($('#sanctuary-url')) $('#sanctuary-url').value = currentSanctuaryUrl;
    if ($('#open-sanctuary-link')) $('#open-sanctuary-link').href = currentSanctuaryUrl;

    this.renderSettings();
    this.wire();
    this.renderProfile();
    this.renderDiagnostics();
    this.testEngine();
    this.loadVoices();
  }

  /**
   * Ask the engine which natural voices it can actually speak with.
   *
   * The catalogue is not static: which speakers exist depends on the Bulbul
   * model version the engine is configured for, and a speaker from the wrong
   * version is a hard 400 on every request. Reading the live list is the only
   * way to offer a choice that is guaranteed to work.
   */
  async loadVoices() {
    const speaker = $('#speaker');
    const language = $('#tts-language');
    const label = $('#v-voice');
    if (!speaker || !language) return;

    const response = await chrome.runtime.sendMessage({
      action: 'apiFetch',
      method: 'GET',
      path: '/api/speech/voices',
      timeoutMs: 10000
    });

    const data = response?.ok ? response.data : null;
    const chosenSpeaker = this.state.settings.ttsSpeaker || '';
    const chosenLanguage = self.setuResolveLanguage(
      this.state.settings.ttsLanguage || this.state.settings.language
    ).code;

    // Languages first, and unconditionally.
    //
    // This used to be populated only after the `enabled` check below, from the
    // engine's reply — so an engine that was asleep, offline, or without a
    // Sarvam key left this dropdown showing the single hard-coded "English"
    // option in the HTML. A reader who wanted Hindi was being told by the UI
    // that SETU has no Hindi. Which language SETU *explains* in is decided by
    // the model, and is available whether or not natural voice is.
    const languages = data?.languages?.length ? data.languages : self.SETU_LANGUAGES;
    language.innerHTML = languages
      .map(
        (entry) =>
          `<option value="${escapeHtml(entry.code)}"${
            entry.code === chosenLanguage ? ' selected' : ''
          }>${escapeHtml(self.setuLanguageLabel(entry))}</option>`
      )
      .join('');

    if (!data?.enabled) {
      if (label) label.textContent = "this browser's voice";
      speaker.innerHTML = '<option value="">Browser default voice</option>';
      speaker.disabled = true;
      return;
    }

    speaker.disabled = false;
    speaker.innerHTML = [
      '<option value="">Engine default</option>',
      ...(data.voices || []).map(
        (voice) =>
          `<option value="${escapeHtml(voice.id)}"${voice.id === chosenSpeaker ? ' selected' : ''}>${escapeHtml(
            voice.label || voice.id
          )}${voice.note ? ` — ${escapeHtml(voice.note)}` : ''}</option>`
      )
    ].join('');

    if (label) {
      const current = (data.voices || []).find((voice) => voice.id === chosenSpeaker);
      label.textContent = current?.label || data.defaultSpeaker || 'engine default';
    }
  }

  /**
   * Speak one line in the chosen voice.
   *
   * Picking a voice from a list of names is guesswork — "Ritu, bright and
   * clear" tells you almost nothing about whether you want to listen to it for
   * twenty minutes. Playing it does.
   */
  async previewVoice() {
    const button = $('#preview-voice');
    if (!button || button.dataset.busy === 'true') return;

    button.dataset.busy = 'true';
    const original = button.textContent;
    button.textContent = 'Speaking…';

    try {
      const languageCode = this.state.settings.ttsLanguage || 'en-IN';
      const sample = SAMPLE_LINES[languageCode] || SAMPLE_LINES['en-IN'];

      const response = await chrome.runtime.sendMessage({
        action: 'apiFetch',
        method: 'POST',
        path: '/api/speech',
        timeoutMs: 30000,
        body: {
          text: sample,
          speaker: this.state.settings.ttsSpeaker || undefined,
          language: languageCode,
          pace: this.state.settings.ttsRate || 1
        }
      });

      if (!response?.ok || !response.data?.audio) {
        this.toast(response?.error || 'The voice engine did not answer.', 'error');
        return;
      }

      const audio = new Audio(`data:${response.data.mime || 'audio/mpeg'};base64,${response.data.audio}`);
      await audio.play();
    } catch (error) {
      this.toast(`Could not play that voice: ${error.message}`, 'error');
    } finally {
      button.dataset.busy = 'false';
      button.textContent = original;
    }
  }

  /** Mark the selected appearance chip. Anything unrecognised means light. */
  renderAppearance(choice) {
    const selected = choice === 'dark' || choice === 'auto' ? choice : 'light';
    document.querySelectorAll('[data-appearance-choice]').forEach((button) => {
      button.setAttribute('aria-checked', String(button.dataset.appearanceChoice === selected));
    });
  }

  renderIcons() {
    if (!window.SETU_ICONS?.icon) return;
    document.querySelectorAll('[data-icon]').forEach((el) => {
      const name = el.dataset.icon;
      const size = el.dataset.iconSize ? parseInt(el.dataset.iconSize, 10) : 18;
      el.innerHTML = window.SETU_ICONS.icon(name, { size });
    });
  }

  renderKeys() {
    const keysList = $('#keys');
    if (!keysList) return;
    keysList.innerHTML = KEY_MAP.map(
      ([key, description]) => `<li><span>${description}</span><kbd>${key}</kbd></li>`
    ).join('');
  }

  /* ======================================================================== */
  /* Your details — the profile the Copilot fills forms from                  */
  /* ======================================================================== */

  /**
   * Build the editor from the field catalogue in `shared/setu-profile.js`.
   *
   * Generated rather than written out in the markup, and that is not laziness:
   * the catalogue is also what the matcher scores against, so a field that
   * exists in one and not the other is a box the user fills in that nothing
   * ever reads, or a detail the Copilot claims to know and cannot show them.
   * One list, two consumers.
   *
   * The whole section is skipped rather than half-drawn if the profile module
   * is missing, because a settings page that silently forgets what you typed is
   * worse than one that plainly does not offer the feature.
   */
  async renderProfile() {
    const root = $('#profile-groups');
    const P = self.SETU_PROFILE;
    if (!root || !P) return;

    this.profile = await P.loadRaw();

    root.innerHTML = P.GROUPS.map((group) => this.profileGroupMarkup(group)).join('');

    // Queried by element rather than by class so the reference survives any
    // later restyle of the generated markup.
    root.querySelectorAll('input, select, textarea').forEach((el) => {
      const key = el.dataset.profileKey;
      if (!key) return;

      const commit = () => {
        const value = el.type === 'checkbox' ? el.checked : el.value;
        this.saveProfileField(key, value);
      };

      // `input` for the live meter and derived chips, `change` for the pickers
      // that only report on commit. Both funnel through the same debounce, so a
      // fast typist writes once rather than once per keystroke.
      el.addEventListener('input', commit);
      el.addEventListener('change', commit);
    });

    this.paintProfile();
  }

  profileGroupMarkup(group) {
    const P = self.SETU_PROFILE;
    const fields = P.fieldsIn(group.key);
    if (!fields.length) return '';

    // Identity, contact and the current address are what almost every form
    // asks for, so they are open; the other six wait to be asked for.
    const openByDefault = ['identity', 'contact', 'address'].includes(group.key);

    return `
      <details class="pgroup" data-group="${escapeHtml(group.key)}" data-sensitive="${group.sensitive ? 'true' : 'false'}"${
        openByDefault ? ' open' : ''
      }>
        <summary>
          <span>${escapeHtml(group.label)}</span>
          <output class="pgroup-count"></output>
        </summary>
        <div class="pgroup-body">
          <p class="pgroup-hint">${escapeHtml(group.hint || '')}</p>
          <div class="pgrid">
            ${fields.map((field) => this.profileFieldMarkup(field)).join('')}
          </div>
          <footer class="pderived"></footer>
        </div>
      </details>`;
  }

  profileFieldMarkup(field) {
    const value = this.profile?.[field.key];
    const label = escapeHtml(field.label);
    const hint = field.hint ? `<small>${escapeHtml(field.hint)}</small>` : '';

    // Searchable text: the label, the key, and the words the matcher looks for.
    // Someone hunting for their PIN code types "pincode", "postal" or "zip"
    // depending on which form just asked them for it, and all three should land.
    const search = escapeHtml(
      [field.label, field.key, ...(field.match || []).map((re) => re.source.replace(/[\\^$.*+?()[\]{}|]|\\b/g, ' '))]
        .join(' ')
        .toLowerCase()
    );

    // `autocomplete="off"` throughout: the browser offering to autofill the
    // page where you configure autofill is a loop nobody needs.
    const shared = `data-profile-key="${escapeHtml(field.key)}" autocomplete="off" spellcheck="false"`;

    if (field.type === 'checkbox') {
      return `
        <label class="pfield check" data-search="${search}">
          <input type="checkbox" ${shared}${value ? ' checked' : ''} />
          <span>${label}</span>
        </label>`;
    }

    if (field.type === 'select') {
      const options = ['', ...(field.options || [])]
        .map(
          (option) =>
            `<option value="${escapeHtml(option)}"${option === value ? ' selected' : ''}>${
              option ? escapeHtml(option) : '— not set —'
            }</option>`
        )
        .join('');
      return `
        <label class="pfield" data-search="${search}">
          <span>${label}</span>
          <select ${shared}>${options}</select>
          ${hint}
        </label>`;
    }

    if (field.type === 'textarea') {
      return `
        <label class="pfield wide" data-search="${search}">
          <span>${label}</span>
          <textarea rows="3" ${shared}>${escapeHtml(value || '')}</textarea>
          ${hint}
        </label>`;
    }

    const placeholder = field.placeholder ? ` placeholder="${escapeHtml(field.placeholder)}"` : '';
    return `
      <label class="pfield" data-search="${search}">
        <span>${label}</span>
        <input type="${escapeHtml(field.type || 'text')}" ${shared}${placeholder} value="${escapeHtml(value || '')}" />
        ${hint}
      </label>`;
  }

  /**
   * Write one field, on a debounce.
   *
   * Coalesced because this fires per keystroke and each save is a storage
   * write plus a full recompute of the derived values. The patch is
   * accumulated rather than replaced, so a burst that touches three fields
   * still saves all three.
   */
  saveProfileField(key, value) {
    this.profilePatch = { ...(this.profilePatch || {}), [key]: value };

    clearTimeout(this.profileTimer);
    this.profileTimer = setTimeout(async () => {
      const patch = this.profilePatch;
      this.profilePatch = null;

      try {
        const saved = await self.SETU_PROFILE.save(patch);
        // `isSample` comes back from the store rather than being assumed: it is
        // the store that decides an edit has made the profile the user's own,
        // and merging only the patch left the "these are not your details"
        // banner up after the very edit that made it untrue.
        this.profile = { ...this.profile, ...patch, isSample: saved.isSample };
        this.paintProfile();
      } catch (error) {
        this.toast(`Could not save: ${error.message}`, 'error');
      }
    }, 400);
  }

  /**
   * Repaint everything computed: the meter, the per-group counts, the derived
   * chips, and the sample-data warning.
   *
   * Kept separate from `renderProfile` so it can run on every keystroke
   * without rebuilding the markup underneath the cursor — which would move the
   * caret and lose the selection mid-word.
   */
  paintProfile() {
    const P = self.SETU_PROFILE;
    const root = $('#profile-groups');
    if (!P || !root || !this.profile) return;

    const values = P.derive(this.profile);

    const banner = $('#profile-banner');
    if (banner) banner.dataset.show = this.profile.isSample ? 'true' : 'false';

    // Counted against the *derived* values, not the raw ones. With "same as
    // current address" ticked, the permanent fields are stored empty and filled
    // in by the mirror — so counting raw showed "0 / 9 saved" next to a ticked
    // box, which reads as "this did not work". The number that matters here is
    // how much the Copilot can actually fill, and that is the derived one.
    const scored = P.FIELDS.filter((field) => field.type !== 'checkbox');
    const filled = scored.filter((field) => String(values[field.key] || '').trim()).length;

    const count = $('#profile-count');
    if (count) count.textContent = `${filled} of ${scored.length}`;

    const fill = $('#profile-fill');
    if (fill) fill.style.width = `${Math.round((filled / Math.max(1, scored.length)) * 100)}%`;

    for (const details of root.querySelectorAll('details')) {
      const group = details.dataset.group;
      const groupFields = P.fieldsIn(group).filter((field) => field.type !== 'checkbox');
      const groupFilled = groupFields.filter((field) => String(values[field.key] || '').trim()).length;

      const output = details.querySelector('output');
      if (output) output.textContent = `${groupFilled} / ${groupFields.length} saved`;

      const footer = details.querySelector('footer');
      if (!footer) continue;

      // What SETU assembles for itself — full name, age, the one-line postal
      // address. Shown as read-only chips so the exact string that will land in
      // a form field can be checked here rather than in the form.
      const chips = P.derivedIn(group)
        .map((entry) => ({ label: entry.label, value: values[entry.key] }))
        .filter((entry) => entry.value);

      footer.innerHTML = chips.length
        ? `<span class="pderived-label">SETU works these out for you</span>${chips
            .map(
              (chip) =>
                `<span class="pchip"><b>${escapeHtml(chip.label)}</b><span>${escapeHtml(chip.value)}</span></span>`
            )
            .join('')}`
        : '';
    }
  }

  /** Filter the whole editor down to the fields matching a typed query. */
  filterProfile(query) {
    const root = $('#profile-groups');
    if (!root) return;

    const needle = String(query || '').trim().toLowerCase();

    for (const details of root.querySelectorAll('details')) {
      let visible = 0;

      for (const field of details.querySelectorAll('label')) {
        const hit = !needle || (field.dataset.search || '').includes(needle);
        field.hidden = !hit;
        if (hit) visible += 1;
      }

      details.hidden = visible === 0;
      // Searching means "show me this", so a match opens its group. Clearing
      // the box restores the default set rather than leaving all nine open.
      if (needle && visible) details.open = true;
      else if (!needle) details.open = ['identity', 'contact', 'address'].includes(details.dataset.group);
    }
  }

  /**
   * Two-press confirmation, same as the settings reset.
   *
   * A profile is typed once and relied on for months, and a single stray click
   * on "Clear my details" would silently undo an afternoon of it with nothing
   * to undo it back.
   */
  async clearProfile() {
    const button = $('#profile-clear');
    if (!button) return;

    const label = button.querySelector('span:last-child');

    if (button.dataset.armed !== 'true') {
      button.dataset.armed = 'true';
      if (label) label.textContent = 'Click again to erase everything';
      setTimeout(() => {
        button.dataset.armed = 'false';
        if (label) label.textContent = 'Clear my details';
      }, 5000);
      return;
    }

    button.dataset.armed = 'false';
    if (label) label.textContent = 'Clear my details';

    await self.SETU_PROFILE.clear();
    await this.renderProfile();
    this.renderDiagnostics();
    this.toast('Your details have been erased from this browser.', 'success');
  }

  async restoreSampleProfile() {
    await self.SETU_PROFILE.restoreSample();
    await this.renderProfile();
    this.renderDiagnostics();
    this.toast('Sample details restored — remember to replace them.', 'success');
  }

  renderSettings() {
    const s = this.state.settings;
    const chosenLanguage = self.setuResolveLanguage(s.ttsLanguage || s.language);
    const languageSelect = $('#language');
    if (languageSelect) {
      languageSelect.innerHTML = self.SETU_LANGUAGES.map(
        (entry) =>
          `<option value="${escapeHtml(entry.code)}"${
            entry.code === chosenLanguage.code ? ' selected' : ''
          }>${escapeHtml(self.setuLanguageLabel(entry))}</option>`
      ).join('');
      languageSelect.value = chosenLanguage.code;
    }
    this.renderAppearance(s.appearance);
    this.renderGazeDirection(Boolean(s.gazeInvert));
    if ($('#bionic')) $('#bionic').value = Math.round((s.bionicIntensity ?? 0.45) * 100);
    if ($('#spacing')) $('#spacing').value = Math.round((s.letterSpacing ?? 0.12) * 100);
    if ($('#line')) $('#line').value = Math.round((s.lineHeight ?? 1.8) * 10);
    if ($('#wpm')) $('#wpm').value = s.scrollWpm ?? 220;
    if ($('#rate')) $('#rate').value = Math.round((s.ttsRate ?? 1) * 10);
    if ($('#gaze')) $('#gaze').value = Math.round((s.gazeSensitivity ?? 1) * 10);
    this.paintValues();
  }

  renderGazeDirection(inverted) {
    document.querySelectorAll('[data-gaze-choice]').forEach((button) => {
      const isInverted = button.dataset.gazeChoice === 'inverted';
      button.setAttribute('aria-checked', String(isInverted === inverted));
    });
  }

  paintValues() {
    const s = this.state.settings;
    if ($('#v-language')) {
      $('#v-language').textContent = self.setuResolveLanguage(s.ttsLanguage || s.language).name;
    }
    if ($('#v-bionic')) $('#v-bionic').textContent = `${Math.round((s.bionicIntensity ?? 0.45) * 100)}%`;
    if ($('#v-spacing')) $('#v-spacing').textContent = `${(s.letterSpacing ?? 0.12).toFixed(2)}em`;
    if ($('#v-line')) $('#v-line').textContent = (s.lineHeight ?? 1.8).toFixed(1);
    if ($('#v-wpm')) $('#v-wpm').textContent = `${s.scrollWpm ?? 220} wpm`;
    if ($('#v-rate')) $('#v-rate').textContent = `${(s.ttsRate ?? 1).toFixed(1)}×`;
    if ($('#v-gaze')) $('#v-gaze').textContent = `${(s.gazeSensitivity ?? 1).toFixed(1)}×`;

    // Dynamic Live Sample Preview
    const preview = $('#preview');
    if (preview) {
      preview.style.letterSpacing = `${s.letterSpacing ?? 0.12}em`;
      preview.style.lineHeight = String(s.lineHeight ?? 1.8);

      const intensity = s.bionicIntensity ?? 0.45;
      const formatted = SAMPLE_WORDS.map((word) => {
        const len = word.length;
        if (len <= 1) return `<b>${word}</b>`;
        const fixLen = Math.max(1, Math.ceil(len * intensity));
        const fix = word.slice(0, fixLen);
        const rest = word.slice(fixLen);
        return `<b style="font-weight: 800; color: var(--text);">${fix}</b>${rest}`;
      }).join(' ');

      const p = preview.querySelector('p') || preview;
      p.innerHTML = formatted;
    }
  }

  wire() {
    $('#api-host')?.addEventListener('change', async (event) => {
      const value = this.cleanUrl(event.target.value);
      if (!value) {
        this.toast('Please enter a valid URL (e.g. https://setu-37hl.onrender.com)', 'error');
        return;
      }
      event.target.value = value;
      await chrome.storage.sync.set({ apiHost: value });
      this.toast('Engine URL saved', 'success');
      this.testEngine();
    });

    $('#sanctuary-url')?.addEventListener('change', async (event) => {
      const value = this.cleanUrl(event.target.value);
      if (!value) {
        this.toast('Please enter a valid URL (e.g. https://setu-amber.vercel.app)', 'error');
        return;
      }
      event.target.value = value;
      await chrome.storage.sync.set({ sanctuaryUrl: value });
      if ($('#open-sanctuary-link')) $('#open-sanctuary-link').href = value;
      this.toast('Sanctuary URL saved', 'success');
    });

    $('#test-engine')?.addEventListener('click', () => this.testEngine());

    $('#language')?.addEventListener('change', (event) => {
      // The same write as the read-aloud picker below — they are two views of
      // one setting. Previously this was a free-text box, so a reader could
      // type "Spanish" and get Spanish prose that the voice engine had no way
      // to speak, or type "Hindi" here while the voice stayed on English.
      const chosen = self.setuResolveLanguage(event.target.value);
      this.saveSetting({ ttsLanguage: chosen.code, language: chosen.name });
      if ($('#v-language')) $('#v-language').textContent = chosen.name;
      if ($('#tts-language')) $('#tts-language').value = chosen.code;
    });

    $('#appearance')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-appearance-choice]');
      if (!button) return;
      const choice = button.dataset.appearanceChoice;
      // Repaint this page immediately; saveSetting propagates it to the popup
      // and to every open panel through storage.
      self.setuApplyAppearance(choice);
      this.renderAppearance(choice);
      this.saveSetting({ appearance: choice });
    });

    $('#speaker')?.addEventListener('change', (event) => {
      this.saveSetting({ ttsSpeaker: event.target.value, ttsVoice: event.target.value });
      this.loadVoices();
    });

    $('#tts-language')?.addEventListener('change', (event) => {
      // Both halves together: `ttsLanguage` drives the voice and `language`
      // drives the model. Writing only one of them is what produced
      // explanations in English spoken by an Indian-language voice.
      const chosen = self.setuResolveLanguage(event.target.value);
      this.saveSetting({ ttsLanguage: chosen.code, language: chosen.name });
      if ($('#language')) $('#language').value = chosen.name;
      if ($('#v-language')) $('#v-language').textContent = chosen.name;
    });

    $('#preview-voice')?.addEventListener('click', () => this.previewVoice());

    $('#gaze-invert')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-gaze-choice]');
      if (!button) return;
      const inverted = button.dataset.gazeChoice === 'inverted';
      this.renderGazeDirection(inverted);
      this.saveSetting({ gazeInvert: inverted });
    });

    this.slider('#bionic', (raw) => ({ bionicIntensity: raw / 100 }));
    this.slider('#spacing', (raw) => ({ letterSpacing: raw / 100 }));
    this.slider('#line', (raw) => ({ lineHeight: raw / 10 }));
    this.slider('#wpm', (raw) => ({ scrollWpm: raw }));
    this.slider('#rate', (raw) => ({ ttsRate: raw / 10 }));
    this.slider('#gaze', (raw) => ({ gazeSensitivity: raw / 10 }));

    $('#edit-shortcuts')?.addEventListener('click', () => {
      chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    });

    $('#reset')?.addEventListener('click', () => this.resetAll());

    $('#profile-search')?.addEventListener('input', (event) => this.filterProfile(event.target.value));
    $('#profile-clear')?.addEventListener('click', () => this.clearProfile());
    $('#profile-restore')?.addEventListener('click', () => this.restoreSampleProfile());
  }

  slider(selector, toSettings) {
    const el = $(selector);
    if (!el) return;
    el.addEventListener('input', () => {
      Object.assign(this.state.settings, toSettings(Number(el.value)));
      this.paintValues();
    });
    el.addEventListener('change', () => this.saveSetting(toSettings(Number(el.value))));
  }

  cleanUrl(raw) {
    const trimmed = String(raw || '').trim().replace(/\/+$/, '');
    if (!trimmed) return '';
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
    try {
      const parsed = new URL(withScheme);
      return `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/+$/, '')}`;
    } catch (_) {
      return '';
    }
  }

  async saveSetting(patch) {
    this.state.settings = { ...this.state.settings, ...patch };
    this.paintValues();
    await chrome.storage.sync.set({ setuState: this.state });
  }

  /* ------------------------------------------------------------------ */
  /* Engine Health Probe                                                */
  /* ------------------------------------------------------------------ */

  async testEngine() {
    const status = $('#engine-status');
    const headline = $('#engine-headline');
    const detail = $('#engine-detail');
    if (!status || !headline || !detail) return;

    status.dataset.state = 'busy';
    headline.textContent = 'Contacting the engine…';
    detail.innerHTML = '';

    const probe = (timeoutMs) =>
      chrome.runtime.sendMessage({ action: 'apiFetch', method: 'GET', path: '/api/health', timeoutMs });

    let response = await probe(self.SETU_DEFAULTS?.healthTimeoutMs || 6000);

    if (!response?.ok && (response?.code === 'offline' || response?.code === 'timeout')) {
      headline.textContent = 'Waking the engine…';
      detail.innerHTML =
        '<li>Free-tier cloud hosting puts the engine to sleep when idle. Waking takes ~30-60 seconds.</li>';
      response = await probe(self.SETU_DEFAULTS?.wakeTimeoutMs || 75000);
    }

    if (!response?.ok) {
      status.dataset.state = 'down';
      headline.textContent = 'Cannot reach the engine';
      detail.innerHTML = `
        <li>${escapeHtml(response?.error || 'No response received from host.')}</li>
        <li>Reading tools still function 100% on-device. AI Copilot &amp; Commander remain offline until connected.</li>
      `;
      return;
    }

    const health = response.data || {};
    const speech = health.speech || {};
    const database = health.database || {};

    status.dataset.state = health.aiConfigured ? 'ok' : 'warn';
    headline.textContent = health.aiConfigured
      ? 'Connected — AI features & Copilot ready'
      : 'Connected, but no AI API key is configured';

    detail.innerHTML = [
      `<li>Engine: <b>${escapeHtml(health.version || 'v3.1.0')}</b>${
        health.product ? ` · ${escapeHtml(health.product)}` : ''
      }</li>`,
      `<li>AI Provider: <b>${escapeHtml(health.primaryProvider || 'none')}</b></li>`,
      `<li>Speech Synthesis: <b>${escapeHtml(speech.configured ? speech.provider : "Browser native")}</b></li>`,
      `<li>Database: <b>${database.connected ? 'Connected' : 'Local-only session'}</b></li>`,
      health.aiConfigured
        ? ''
        : '<li>Provide an API key in backend <code>.env</code> and restart the engine.</li>'
    ]
      .filter(Boolean)
      .join('');
  }

  async renderDiagnostics() {
    const diag = $('#diag');
    if (!diag) return;

    let installId = 'not assigned';
    try {
      const res = await chrome.storage.local.get('installId');
      if (res?.installId) installId = res.installId;
    } catch (_) {}

    let bytes = 0;
    try {
      bytes = await chrome.storage.sync.getBytesInUse(null);
    } catch (_) {}

    // Reported separately from synced storage, and labelled "this device only",
    // because the one thing somebody wants to be certain of about a stored home
    // address is where it is stored.
    let profileState = 'not available';
    try {
      const P = self.SETU_PROFILE;
      if (P) {
        const raw = await P.loadRaw();
        const derived = P.derive(raw);
        const filled = P.FIELDS.filter((field) => String(derived[field.key] || '').trim()).length;
        profileState = raw.isSample ? `${filled} sample details` : `${filled} details saved`;
      }
    } catch (_) {}

    diag.innerHTML = `
      <div class="diag-item"><dt>Extension</dt><dd>${escapeHtml(chrome.runtime.getManifest().version)}</dd></div>
      <div class="diag-item"><dt>Platform</dt><dd>${IS_MAC ? 'macOS' : 'Windows / Linux'}</dd></div>
      <div class="diag-item"><dt>Synced Storage</dt><dd>${bytes} bytes in use</dd></div>
      <div class="diag-item"><dt>Your details</dt><dd>${escapeHtml(profileState)} · this device only</dd></div>
      <div class="diag-item"><dt>Install Identifier</dt><dd title="${escapeHtml(installId)}">${escapeHtml(installId.slice(0, 16))}…</dd></div>
    `;
  }

  async resetAll() {
    const button = $('#reset');
    if (!button) return;

    if (button.dataset.armed !== 'true') {
      button.dataset.armed = 'true';
      button.textContent = 'Click again to confirm full reset';
      setTimeout(() => {
        button.dataset.armed = 'false';
        button.textContent = 'Reset all settings to defaults';
      }, 5000);
      return;
    }

    // Synced storage only. Your saved details live in local storage and are
    // deliberately left alone: "reset my reading preferences" must never be a
    // way to lose an address and a date of birth you spent ten minutes typing.
    // "Clear my details" in the section above is the button that does that.
    await chrome.storage.sync.clear();
    await chrome.storage.sync.set({
      apiHost: self.SETU_DEFAULTS?.apiHost || '',
      sanctuaryUrl: self.SETU_DEFAULTS?.sanctuaryUrl || ''
    });

    this.state = { settings: { ...DEFAULT_SETTINGS } };
    if ($('#api-host')) $('#api-host').value = self.SETU_DEFAULTS?.apiHost || '';
    if ($('#sanctuary-url')) $('#sanctuary-url').value = self.SETU_DEFAULTS?.sanctuaryUrl || '';
    this.renderSettings();

    button.dataset.armed = 'false';
    button.textContent = 'Reset all settings to defaults';
    this.toast('Reading preferences reset. Your saved details were left alone.', 'success');
    this.testEngine();
    this.renderDiagnostics();
  }

  toast(message, tone = 'info') {
    const el = $('#toast');
    if (!el) return;
    el.textContent = message;
    el.dataset.tone = tone;
    el.dataset.show = 'true';
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      el.dataset.show = 'false';
    }, 2600);
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])
  );
}

document.addEventListener('DOMContentLoaded', () => new Options().init());
