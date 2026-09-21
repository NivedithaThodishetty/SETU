/**
 * SETU Lens & Copilot — Popup Controller.
 *
 * Broadsheet design system implementation matching Sanctuary web app.
 * All feature logic lives in the content script; the popup reads state,
 * sends intents, hydrates Phosphor duotone icons, and updates real-time
 * live sensory preview.
 */

const $ = (selector) => document.querySelector(selector);

const FEATURES = ['bionic', 'lineFocus', 'highlight', 'focus', 'tts', 'scroll', 'eye', 'breathe'];

/**
 * Operating system shortcut detection.
 */
const IS_MAC = /mac/i.test(navigator.userAgentData?.platform || navigator.platform || '');
const ALT = IS_MAC ? '⌥' : 'Alt+';
const SHIFT = IS_MAC ? '⇧' : 'Shift+';

const SHORTCUTS = {
  commander: `${ALT}${SHIFT}C`,
  bionic: `${ALT}B`,
  focus: `${ALT}F`,
  lineFocus: `${ALT}L`,
  tts: `${ALT}T`,
  highlight: `${ALT}H`,
  scroll: `${ALT}S`,
  eye: `${ALT}E`
};

const SAMPLE_WORDS = [
  'Attention', 'is', 'the', 'part', 'that', 'changed', 'everything.',
  'Instead', 'of', 'surviving', 'a', 'wall', 'of', 'text,',
  'words', 'hold', 'still.'
];

class Popup {
  constructor() {
    this.state = {};
    this.tabId = null;
    this.tabUrl = '';
    this.reachable = false;
    this.apiHost = self.SETU_DEFAULTS?.apiHost || '';
  }

  async init() {
    this.renderIcons();
    this.renderShortcuts();
    this.wire();

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    this.tabId = tab?.id ?? null;
    this.tabUrl = tab?.url || '';

    const { setuState, apiHost } = await chrome.storage.sync.get(['setuState', 'apiHost']);
    this.state = setuState || {};
    this.apiHost = apiHost || this.apiHost;

    // Before the first paint, so the popup never flashes the wrong palette.
    self.setuApplyAppearance(this.state.settings?.appearance);

    // Paint immediately from stored state, then reconcile against the live page
    this.render();
    this.updateSamplePreview();

    await this.connectToPage();
    this.render();
    this.updateSamplePreview();
    this.checkEngine();
  }

  /* ------------------------------------------------------------------ */
  /* Icon & Shortcut Rendering                                          */
  /* ------------------------------------------------------------------ */

  renderIcons() {
    if (!window.SETU_ICONS?.icon) return;
    document.querySelectorAll('[data-icon]').forEach((el) => {
      const name = el.dataset.icon;
      const size = el.dataset.iconSize ? parseInt(el.dataset.iconSize, 10) : 18;
      el.innerHTML = window.SETU_ICONS.icon(name, { size });
    });
  }

  renderShortcuts() {
    document.querySelectorAll('[data-shortcut]').forEach((el) => {
      el.textContent = SHORTCUTS[el.dataset.shortcut] || '';
    });
  }

  /* ------------------------------------------------------------------ */
  /* Page Connection                                                    */
  /* ------------------------------------------------------------------ */

  async connectToPage() {
    if (!this.tabId || !/^https?:/i.test(this.tabUrl)) {
      this.showBanner('SETU cannot run on browser internal pages. Open any website and try again.');
      return;
    }

    const ready = await chrome.runtime.sendMessage({ action: 'ensureTab', tabId: this.tabId });

    if (!ready?.ok) {
      this.showBanner('SETU could not start on this page.', {
        label: 'Reload page',
        onClick: () => {
          chrome.tabs.reload(this.tabId);
          window.close();
        }
      });
      return;
    }

    const response = await this.send({ action: 'getState' });
    if (!response?.ok) {
      this.showBanner('This page is not responding.', {
        label: 'Reload page',
        onClick: () => {
          chrome.tabs.reload(this.tabId);
          window.close();
        }
      });
      return;
    }

    this.reachable = true;
    this.hideBanner();
    this.state = response.state || this.state;
    this.active = new Set(response.active || []);
  }

  showBanner(message, action = null) {
    const banner = $('#banner');
    const button = $('#banner-act');
    $('#banner-text').textContent = message;
    banner.hidden = false;

    if (action) {
      button.hidden = false;
      button.textContent = action.label;
      button.onclick = action.onClick;
    } else {
      button.hidden = true;
    }
  }

  hideBanner() {
    $('#banner').hidden = true;
  }

  /* ------------------------------------------------------------------ */
  /* Event Wiring                                                       */
  /* ------------------------------------------------------------------ */

  wire() {
    // Reading Tools
    $('#tools').addEventListener('click', (event) => {
      const button = event.target.closest('.tool');
      if (button) this.toggleFeature(button.dataset.feature, button);
    });

    // Sensory Themes
    $('#themes').addEventListener('click', (event) => {
      const button = event.target.closest('button[data-theme]');
      if (button) this.setTheme(button.dataset.theme);
    });

    // Copilot Actions
    $('#act-commander').onclick = () => this.dispatch({ action: 'openCommander' }, true);
    $('#act-visual').onclick = () => this.dispatch({ action: 'explainVisual' }, true);
    $('#act-chunk').onclick = () =>
      this.dispatch({ action: 'toggleFeature', feature: 'chunking', enabled: true }, true);
    $('#act-sanctuary').onclick = () => this.sendToSanctuary();

    // Turn all off
    $('#act-reset').onclick = async () => {
      if (!(await this.guard())) return;
      await this.send({ action: 'resetAll' });
      await this.connectToPage();
      this.render();
      this.updateSamplePreview();
      this.toast('All reading tools turned off', 'success');
    };

    $('#active-count').onclick = () => $('#act-reset').click();

    // External Navigation
    $('#act-open-web').onclick = () => {
      chrome.runtime.sendMessage({ action: 'openSanctuary' });
      window.close();
    };

    $('#act-options').onclick = () => {
      chrome.runtime.openOptionsPage();
      window.close();
    };

    $('#engine').onclick = () => this.checkEngine(true);

    // Fine-Tuning Range Sliders
    this.wireSlider(
      '#s-bionic',
      '#v-bionic',
      (raw) => `${raw}%`,
      (raw) => ({ bionicIntensity: raw / 100 })
    );

    this.wireSlider(
      '#s-wpm',
      '#v-wpm',
      (raw) => `${raw} wpm`,
      (raw) => ({ scrollWpm: raw })
    );

    this.wireSlider(
      '#s-rate',
      '#v-rate',
      (raw) => `${(raw / 10).toFixed(1)}×`,
      (raw) => ({ ttsRate: raw / 10 })
    );

    this.wireSlider(
      '#s-spacing',
      '#v-spacing',
      (raw) => `${(raw / 100).toFixed(2)}em`,
      (raw) => ({ letterSpacing: raw / 100 })
    );
  }

  wireSlider(sliderSel, valueSel, format, toSettings) {
    const slider = $(sliderSel);
    const output = $(valueSel);
    if (!slider || !output) return;

    slider.addEventListener('input', () => {
      const val = Number(slider.value);
      output.textContent = format(val);
      this.updateSamplePreview();
    });

    slider.addEventListener('change', () => {
      const patch = toSettings(Number(slider.value));
      this.saveSettings(patch);
      this.updateSamplePreview();
    });
  }

  /* ------------------------------------------------------------------ */
  /* Real-Time Live Preview Renderer                                    */
  /* ------------------------------------------------------------------ */

  updateSamplePreview() {
    const sampleBox = $('#sample-box');
    const sampleText = $('#sample-text');
    if (!sampleBox || !sampleText) return;

    const intensity = ($('#s-bionic') ? Number($('#s-bionic').value) : 45) / 100;
    const spacing = ($('#s-spacing') ? Number($('#s-spacing').value) : 2) / 100;

    sampleBox.style.letterSpacing = `${spacing}em`;

    // Render bionic anchors according to current fixation strength
    const bionicEnabled = this.active ? this.active.has('bionic') : Boolean(this.state.bionic);

    if (bionicEnabled || intensity > 0) {
      const formatted = SAMPLE_WORDS.map((word) => {
        const len = word.length;
        if (len <= 1) return `<b class="bionic-fixation">${word}</b>`;
        const fixLen = Math.max(1, Math.ceil(len * intensity));
        const fix = word.slice(0, fixLen);
        const rest = word.slice(fixLen);
        return `<b class="bionic-fixation">${fix}</b>${rest}`;
      }).join(' ');
      sampleText.innerHTML = formatted;
    } else {
      sampleText.textContent = SAMPLE_WORDS.join(' ');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Actions & Settings Management                                      */
  /* ------------------------------------------------------------------ */

  async guard() {
    if (this.reachable) return true;
    this.toast('SETU is not running on this page.', 'error');
    return false;
  }

  async toggleFeature(key, button) {
    if (!(await this.guard())) return;

    const next = button.getAttribute('aria-pressed') !== 'true';

    // Optimistic UI update
    button.setAttribute('aria-pressed', String(next));
    button.dataset.busy = 'true';

    const response = await this.send({ action: 'toggleFeature', feature: key, enabled: next });
    button.dataset.busy = 'false';

    if (!response?.ok) {
      button.setAttribute('aria-pressed', String(!next));
      this.toast('Could not reach this page. Try reloading it.', 'error');
      return;
    }

    button.setAttribute('aria-pressed', String(response.enabled));
    this.state[key] = response.enabled;
    if (this.active) {
      if (response.enabled) this.active.add(key);
      else this.active.delete(key);
    }

    if (next && !response.enabled) {
      this.toast('That tool could not start on this page.', 'error', 3600);
    }

    this.renderActiveCount();
    this.updateSamplePreview();
  }

  async setTheme(theme) {
    if (!(await this.guard())) return;

    this.state.theme = theme;
    document.querySelectorAll('#themes button').forEach((button) => {
      button.setAttribute('aria-checked', String(button.dataset.theme === theme));
    });
    await this.send({ action: 'setTheme', theme });
  }

  async saveSettings(patch) {
    this.state.settings = { ...(this.state.settings || {}), ...patch };
    await chrome.storage.sync.set({ setuState: this.state });
    await this.send({ action: 'setSetting', settings: patch });
  }

  async sendToSanctuary() {
    if (!(await this.guard())) return;
    const response = await this.send({ action: 'sendToSanctuary' });
    if (response?.ok) {
      window.close();
    } else {
      this.toast(response?.error || 'Nothing readable to send from this page.', 'error', 3600);
    }
  }

  async dispatch(message, closeAfter = false) {
    if (!(await this.guard())) return;
    const response = await this.send(message);
    if (!response?.ok) {
      this.toast('Could not reach this page. Try reloading it.', 'error');
      return;
    }
    if (closeAfter) window.close();
  }

  async send(message) {
    if (!this.tabId) return null;
    try {
      return await chrome.tabs.sendMessage(this.tabId, message);
    } catch (_) {
      return null;
    }
  }

  /* ------------------------------------------------------------------ */
  /* State Rendering                                                    */
  /* ------------------------------------------------------------------ */

  render() {
    for (const key of FEATURES) {
      const button = document.querySelector(`.tool[data-feature="${key}"]`);
      if (!button) continue;
      const on = this.active ? this.active.has(key) : Boolean(this.state[key]);
      button.setAttribute('aria-pressed', String(on));
    }

    const theme = this.state.theme || 'default';
    document.querySelectorAll('#themes button').forEach((button) => {
      button.setAttribute('aria-checked', String(button.dataset.theme === theme));
    });

    const settings = this.state.settings || {};
    const set = (selector, value) => {
      const el = $(selector);
      if (el) el.value = value;
    };

    set('#s-bionic', Math.round((settings.bionicIntensity ?? 0.45) * 100));
    set('#s-wpm', settings.scrollWpm ?? 220);
    set('#s-rate', Math.round((settings.ttsRate ?? 1) * 10));
    set('#s-spacing', Math.round((settings.letterSpacing ?? 0.12) * 100));

    if ($('#v-bionic')) $('#v-bionic').textContent = `${Math.round((settings.bionicIntensity ?? 0.45) * 100)}%`;
    if ($('#v-wpm')) $('#v-wpm').textContent = `${settings.scrollWpm ?? 220} wpm`;
    if ($('#v-rate')) $('#v-rate').textContent = `${(settings.ttsRate ?? 1).toFixed(1)}×`;
    if ($('#v-spacing')) $('#v-spacing').textContent = `${(settings.letterSpacing ?? 0.12).toFixed(2)}em`;

    this.renderActiveCount();
  }

  renderActiveCount() {
    const count = FEATURES.filter((key) =>
      this.active ? this.active.has(key) : this.state[key]
    ).length;
    const badge = $('#active-count');
    const badgeText = $('#active-count-text');
    if (!badge || !badgeText) return;

    badge.hidden = count === 0;
    badgeText.textContent = count ? `${count} active` : '';
  }

  /* ------------------------------------------------------------------ */
  /* Engine Health Probe                                                */
  /* ------------------------------------------------------------------ */

  async checkEngine(verbose = false) {
    const engine = $('#engine');
    const label = $('#engine-label');
    if (!engine || !label) return;

    engine.dataset.state = '';
    label.textContent = 'checking';

    const probe = (timeoutMs) =>
      chrome.runtime.sendMessage({ action: 'apiFetch', method: 'GET', path: '/api/health', timeoutMs });

    let response = await probe(self.SETU_DEFAULTS?.healthTimeoutMs || 6000);

    if (!response?.ok && (response?.code === 'offline' || response?.code === 'timeout')) {
      engine.dataset.state = 'waking';
      label.textContent = 'waking up';
      engine.title = 'The engine is asleep. Waking it takes up to a minute on a free host.';
      response = await probe(self.SETU_DEFAULTS?.wakeTimeoutMs || 75000);
    }

    if (!response?.ok) {
      engine.dataset.state = 'down';
      label.textContent = 'offline';
      engine.title = `No engine at ${this.apiHost}. Click to open options.`;
      if (verbose) {
        chrome.runtime.openOptionsPage();
        window.close();
      }
      return;
    }

    const health = response.data || {};
    if (!health.aiConfigured) {
      engine.dataset.state = 'warn';
      label.textContent = 'no AI key';
      engine.title = 'The engine is running but has no AI provider configured.';
      if (verbose) this.toast('Engine is up but has no AI key configured.', 'error', 5000);
      return;
    }

    engine.dataset.state = 'ok';
    label.textContent = health.primaryProvider || 'AI ready';
    engine.title = [
      `Engine ${health.version || ''}`.trim(),
      `AI: ${health.primaryProvider}`,
      `Voice: ${health.speech?.configured ? health.speech.provider : 'browser'}`,
      `Database: ${health.database?.connected ? 'connected' : 'local only'}`
    ].join('\n');
  }

  toast(message, tone = 'info', duration = 2600) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = message;
    el.dataset.tone = tone;
    el.dataset.show = 'true';
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      el.dataset.show = 'false';
    }, duration);
  }
}

document.addEventListener('DOMContentLoaded', () => new Popup().init());
