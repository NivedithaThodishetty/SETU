/**
 * Explain This — a spoken explanation in the reader's own language.
 *
 * Renamed from "Read Aloud" in 3.3, because reading was never the point. For
 * a reader whose difficulty is *understanding* a passage, hearing the same
 * words back in the same language is no accommodation at all. The default is
 * now to explain the selection — or, when nothing is selected, what the page
 * is about — in plain Grade-6 language, in whichever of the eleven supported
 * languages the reader has chosen, and then speak that explanation. Verbatim
 * reading is still one click away for people who want it.
 *
 * Two engines behind one interface:
 *
 *  1. Sarvam Bulbul, through the SETU engine. A real human voice in ten
 *     Indian languages plus English. For a reader whose difficulty is decoding
 *     text rather than understanding it, this is the whole accommodation — a
 *     robotic voice reading English at someone who thinks in Tamil is not.
 *  2. The browser's SpeechSynthesis, whenever Sarvam is unconfigured,
 *     unreachable, or blocked. Never leaves the reader in silence.
 *
 * Audio is decoded and played through WebAudio rather than an <audio> element.
 * That is not an optimisation: a great many sites ship a `media-src` Content
 * Security Policy that blocks a blob: URL outright, and read-aloud simply died
 * on them. Decoding an ArrayBuffer fetches nothing, so no policy applies —
 * and it hands us the exact clip duration, which is what makes the word
 * highlight track a voice that sends no boundary events.
 *
 * The highlight is drawn as an overlay positioned over a live Range, rather
 * than by wrapping words in <span>s. That matters for composability: wrapping
 * would fight Bionic Reading for the same text nodes and corrupt both. Read
 * Aloud never touches the page DOM at all.
 */

(() => {
  const { Feature, UI, Store, Text, API, Scroll, Dock, Reading, LANGUAGES, resolveLanguage, languageLabel, icon } =
    window.SETU;

  /**
   * Clip sizing.
   *
   * The first clip is deliberately short so audio starts almost immediately;
   * later clips are larger because they are fetched under cover of the one
   * already playing, where size costs nothing perceptible. The ceiling is
   * Sarvam's own per-request limit.
   */
  const FIRST_CLIP_CHARS = 220;
  const CLIP_CHARS = 600;
  const MAX_CLIP_CHARS = 1400;

  /* ---------------------------------------------------------------------- */
  /* Speech engine                                                          */
  /* ---------------------------------------------------------------------- */

  /**
   * Split text into speakable clips on sentence boundaries.
   *
   * Danda (।) and double danda (॥) end a sentence in Devanagari, Bengali,
   * Gujarati, Punjabi, and Odia. Splitting only on full stops turned a Hindi
   * paragraph into one 4000-character clip, which the voice engine rejects.
   */
  function splitForSpeech(text, { first = FIRST_CLIP_CHARS, rest = CLIP_CHARS } = {}) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (!clean) return [];

    const sentences = clean.match(/[^.!?।॥]+[.!?।॥]+(\s|$)|[^.!?।॥]+$/g) || [clean];
    const clips = [];
    let current = '';
    let offset = 0;
    let cursor = 0;

    const limit = () => (clips.length === 0 ? first : rest);

    const push = () => {
      const trimmed = current.trim();
      if (trimmed) clips.push({ text: trimmed, offset });
      current = '';
      offset = cursor;
    };

    for (const raw of sentences) {
      const sentence = raw.trim();
      if (!sentence) continue;

      if (sentence.length > MAX_CLIP_CHARS) {
        push();
        let buffer = '';
        for (const word of sentence.split(' ')) {
          if (buffer && `${buffer} ${word}`.length > Math.min(limit(), MAX_CLIP_CHARS)) {
            clips.push({ text: buffer.trim(), offset });
            offset += buffer.length + 1;
            buffer = word;
          } else {
            buffer = buffer ? `${buffer} ${word}` : word;
          }
        }
        if (buffer.trim()) {
          clips.push({ text: buffer.trim(), offset });
          offset += buffer.length + 1;
        }
        cursor = offset;
        continue;
      }

      if (current && `${current} ${sentence}`.length > limit()) push();
      current = current ? `${current} ${sentence}` : sentence;
      cursor += raw.length;
    }

    push();
    return clips;
  }

  /**
   * The shared voice.
   *
   * Deliberately separate from the Read Aloud feature: the mind-map explainer
   * speaks a node on hover, the agent speaks an answer, and Focus Mode speaks
   * an article, and none of those should have to open a transport bar to do it.
   */
  const Voice = {
    /** null = not yet probed. */
    available: null,
    catalogue: [],

    /**
     * Seeded from the table shipped with the extension, never left empty.
     *
     * This list used to start empty and be filled only from
     * `/api/speech/voices`. So whenever the engine was asleep, offline, or had
     * no Sarvam key, every language picker in the product collapsed to a
     * single "English" option — and a reader who wanted an explanation in
     * Hindi was told, by the UI itself, that SETU does not do that. The
     * language of an *explanation* is decided by the model, not the voice
     * service, so it must not depend on the voice service answering.
     */
    languages: LANGUAGES.slice(),
    defaultSpeaker: '',
    maxCharacters: MAX_CLIP_CHARS,
    probing: null,

    playing: false,
    paused: false,

    _ctx: null,
    _gain: null,
    _source: null,
    _token: 0,
    _clips: new Map(),
    _controller: null,
    _listeners: new Set(),

    /** Ask the engine which natural voices exist. Cached for the page's life. */
    async probe(force = false) {
      if (!force && Voice.available !== null) return Voice.available;
      if (!force && Voice.probing) return Voice.probing;

      Voice.probing = (async () => {
        try {
          const data = await API.get('/api/speech/voices', { timeoutMs: 8000 });
          Voice.available = Boolean(data?.enabled);
          Voice.catalogue = Array.isArray(data?.voices) ? data.voices : [];
          // Prefer the engine's list when it has one — it is authoritative
          // about what the configured Sarvam model can actually speak — but
          // never replace a working list with an empty one.
          if (Array.isArray(data?.languages) && data.languages.length) {
            Voice.languages = data.languages;
          }
          Voice.defaultSpeaker = data?.defaultSpeaker || '';
          Voice.maxCharacters = Number(data?.maxCharacters) || MAX_CLIP_CHARS;
          return Voice.available;
        } catch (_) {
          // Unreachable engine: browser speech still works, and every language
          // stays selectable because the shipped table is still standing.
          Voice.available = false;
          return false;
        } finally {
          Voice.probing = null;
        }
      })();

      return Voice.probing;
    },

    subscribe(fn) {
      Voice._listeners.add(fn);
      return () => Voice._listeners.delete(fn);
    },

    _emit(event) {
      for (const fn of Voice._listeners) {
        try {
          fn(event);
        } catch (_) {
          /* a listener must not break playback */
        }
      }
    },

    context() {
      if (!Voice._ctx) {
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return null;
        Voice._ctx = new Ctor();
        Voice._gain = Voice._ctx.createGain();
        Voice._gain.connect(Voice._ctx.destination);
      }
      return Voice._ctx;
    },

    settings() {
      return {
        speaker: Store.getSetting('ttsSpeaker') || Voice.defaultSpeaker || undefined,
        language: Store.language().code,
        pace: Math.max(0.5, Math.min(2, Store.getSetting('ttsRate') || 1))
      };
    },

    /** Fetch and decode one clip, memoised so a replay costs nothing. */
    async clip(text, signal) {
      const { speaker, language, pace } = Voice.settings();
      const key = `${speaker || 'default'}|${language}|${pace}|${text}`;

      const cached = Voice._clips.get(key);
      if (cached) return cached;

      const response = await API.post(
        '/api/speech',
        { text, speaker, language, pace },
        { signal, timeoutMs: 45000 }
      );

      if (!response?.audio) throw new Error('The voice engine returned no audio.');

      const ctx = Voice.context();
      if (!ctx) throw new Error('This browser has no audio output available.');

      const bytes = base64ToBytes(response.audio);
      // decodeAudioData detaches the buffer it is given, so decode a copy —
      // otherwise a cached clip cannot be played a second time.
      const buffer = await ctx.decodeAudioData(bytes.buffer.slice(0));

      if (Voice._clips.size > 80) Voice._clips.delete(Voice._clips.keys().next().value);
      Voice._clips.set(key, buffer);
      return buffer;
    },

    /**
     * Speak `text`.
     *
     * @param {string} text
     * @param {object} options
     * @param {(progress: {clip: number, charIndex: number, total: number}) => void} options.onProgress
     * @param {boolean} options.allowBrowserFallback
     * @returns {Promise<void>} resolves when the last word has been spoken.
     */
    async say(text, { onProgress = null, allowBrowserFallback = true } = {}) {
      Voice.stop();

      const clean = String(text || '')
        .replace(/[#*_`~>[\]]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!clean) return;

      const token = (Voice._token += 1);
      Voice.playing = true;
      Voice.paused = false;
      Voice._emit({ type: 'start' });

      const natural = await Voice.probe();
      if (token !== Voice._token) return;

      if (natural) {
        try {
          await Voice._sayNatural(clean, token, onProgress);
          return;
        } catch (error) {
          if (token !== Voice._token) return;
          if (error.name === 'AbortError') return;
          console.warn('[SETU:voice] natural voice failed, falling back:', error.message);
          if (!allowBrowserFallback) throw error;
        }
      }

      if (token !== Voice._token) return;
      await Voice._sayBrowser(clean, token, onProgress);
    },

    async _sayNatural(text, token, onProgress) {
      const clips = splitForSpeech(text);
      if (!clips.length) return;

      Voice._controller = new AbortController();
      const { signal } = Voice._controller;

      // Fetch the next clip while the current one plays, so the reader hears
      // the first sentence in about a second rather than after the whole
      // passage has been synthesised.
      let pending = Voice.clip(clips[0].text, signal);

      for (let index = 0; index < clips.length; index += 1) {
        const buffer = await pending;
        if (token !== Voice._token) return;

        pending =
          index + 1 < clips.length
            ? Voice.clip(clips[index + 1].text, signal).catch((error) => {
                // Surface it at await time, not as an unhandled rejection.
                if (error.name !== 'AbortError') console.warn('[SETU:voice]', error.message);
                throw error;
              })
            : Promise.resolve(null);

        await Voice._playBuffer(buffer, token, (fraction) => {
          onProgress?.({
            clip: index,
            charIndex: clips[index].offset + Math.floor(fraction * clips[index].text.length),
            total: text.length
          });
        });

        if (token !== Voice._token) return;
      }

      Voice._finish(token);
    },

    _playBuffer(buffer, token, onFraction) {
      return new Promise((resolve, reject) => {
        const ctx = Voice.context();
        if (!ctx) return reject(new Error('No audio output.'));

        // A page can start suspended when nothing has played yet.
        ctx.resume?.().catch(() => {});

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(Voice._gain);
        Voice._source = source;

        const startedAt = ctx.currentTime;
        const duration = buffer.duration || 0.001;

        // currentTime freezes while the context is suspended, so this doubles
        // as the pause-aware clock.
        const ticker = setInterval(() => {
          if (token !== Voice._token) return;
          const elapsed = Math.min(duration, ctx.currentTime - startedAt);
          onFraction?.(elapsed / duration);
        }, 120);

        source.onended = () => {
          clearInterval(ticker);
          Voice._source = null;
          resolve();
        };

        try {
          source.start();
        } catch (error) {
          clearInterval(ticker);
          reject(error);
        }
      });
    },

    _sayBrowser(text, token, onProgress) {
      return new Promise((resolve) => {
        const synth = window.speechSynthesis;
        if (!synth) {
          Voice._finish(token);
          return resolve();
        }

        const language = Store.language().code;
        const preferred = Store.getSetting('ttsVoice');
        const voices = synth.getVoices();

        // The browser truncates very long utterances; chunk on sentences.
        const clips = splitForSpeech(text, { first: 2200, rest: 2200 });
        let index = 0;

        const speakNext = () => {
          if (token !== Voice._token || index >= clips.length) {
            Voice._finish(token);
            return resolve();
          }

          const clip = clips[index];
          const utterance = new SpeechSynthesisUtterance(clip.text);
          utterance.rate = Math.max(0.5, Math.min(2.5, Store.getSetting('ttsRate') || 1));
          utterance.pitch = Store.getSetting('ttsPitch') || 1;
          utterance.lang = language;

          // Match on the language subtag rather than the full code: a system
          // may ship `hi-IN`, `hi`, or `hi_IN`, and requiring an exact match
          // silently dropped every Indian-language voice the machine had.
          const short = language.split('-')[0].toLowerCase();
          const speaks = (voice) => voice.lang?.toLowerCase().replace('_', '-').startsWith(short);

          const match =
            voices.find((v) => v.name === preferred && speaks(v)) ||
            voices.find((v) => speaks(v) && v.localService) ||
            voices.find((v) => speaks(v)) ||
            null;

          if (match) {
            utterance.voice = match;
            utterance.lang = match.lang;
          } else if (voices.length && short !== 'en') {
            // Reading Devanagari with an English voice produces sounds, not
            // words. Say so once, rather than letting the reader conclude the
            // language setting does nothing.
            Voice._warnMissingVoice(language);
          }

          utterance.onboundary = (event) => {
            if (event.name && event.name !== 'word') return;
            onProgress?.({
              clip: index,
              charIndex: clip.offset + event.charIndex,
              total: text.length
            });
          };

          utterance.onend = () => {
            index += 1;
            speakNext();
          };

          utterance.onerror = (event) => {
            // 'interrupted' and 'canceled' are our own stop() — not failures.
            if (event.error !== 'interrupted' && event.error !== 'canceled') {
              console.warn('[SETU:voice] browser speech:', event.error);
            }
            Voice._finish(token);
            resolve();
          };

          synth.speak(utterance);
        };

        speakNext();
      });
    },

    _finish(token) {
      if (token !== Voice._token) return;
      Voice.playing = false;
      Voice.paused = false;
      Voice._emit({ type: 'end' });
    },

    pause() {
      if (!Voice.playing || Voice.paused) return;
      Voice.paused = true;
      Voice._ctx?.suspend?.().catch(() => {});
      window.speechSynthesis?.pause();
      Voice._emit({ type: 'pause' });
    },

    resume() {
      if (!Voice.playing || !Voice.paused) return;
      Voice.paused = false;
      Voice._ctx?.resume?.().catch(() => {});
      window.speechSynthesis?.resume();
      Voice._emit({ type: 'resume' });
    },

    stop() {
      Voice._token += 1;
      Voice.playing = false;
      Voice.paused = false;

      Voice._controller?.abort();
      Voice._controller = null;

      if (Voice._source) {
        try {
          Voice._source.onended = null;
          Voice._source.stop();
        } catch (_) {
          /* already finished */
        }
        Voice._source = null;
      }

      Voice._ctx?.resume?.().catch(() => {});

      try {
        window.speechSynthesis?.cancel();
      } catch (_) {
        /* already idle */
      }

      Voice._emit({ type: 'stop' });
    },

    /** Voice settings changed — cached clips were synthesised with the old ones. */
    invalidate() {
      Voice._clips.clear();
    },

    _warnedLanguages: new Set(),

    /**
     * Tell the reader once per language that the *voice* is missing, while
     * being clear that the explanation itself is still in their language.
     */
    _warnMissingVoice(code) {
      if (Voice._warnedLanguages.has(code)) return;
      Voice._warnedLanguages.add(code);

      const language = resolveLanguage(code);
      UI.toast(
        `This browser has no ${language.name} voice installed, so it will be read in the default voice. The text is still ${language.name}. Connect the SETU engine for a natural ${language.name} voice.`,
        { tone: 'warn', duration: 7000 }
      );
    }
  };

  /**
   * Index just past the last complete sentence in `text`, or -1.
   *
   * Danda (।) and double danda (॥) terminate a sentence in Devanagari,
   * Bengali, Gujarati, Punjabi and Odia; Latin punctuation terminates the
   * rest. Both are checked equally rather than one being the fallback.
   */
  function lastSentenceEnd(text) {
    for (let i = text.length - 1; i >= 0; i -= 1) {
      if (!/[.!?।॥]/.test(text[i])) continue;
      // A terminator only ends a sentence when something follows it; otherwise
      // the model may still be mid-token (an abbreviation, a decimal).
      if (i + 1 < text.length && /\s/.test(text[i + 1])) return i + 1;
    }
    return -1;
  }

  function base64ToBytes(base64) {
    const cleaned = String(base64).replace(/^data:[^;]+;base64,/, '');
    const binary = atob(cleaned);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  window.addEventListener('pagehide', () => Voice.stop());

  /* ---------------------------------------------------------------------- */
  /* The Explain This feature                                               */
  /* ---------------------------------------------------------------------- */

  class TextToSpeech extends Feature {
    static key = 'tts';

    constructor() {
      super();
      /** Spoken string plus a char-offset index back into live text nodes. */
      this.segments = [];
      this.spokenText = '';
      this.speaking = false;
      this.explainController = null;
    }

    async onEnable() {
      this.build();

      // Probe and warm in parallel with the user reaching for Play.
      API.warm();
      Voice.probe().then(() => this.populateVoices());

      this.trackSelection();

      this.cleanup(
        Voice.subscribe((event) => {
          if (event.type === 'end' || event.type === 'stop') {
            this.speaking = false;
            this.paintTransport();
            this.hideMark();
          } else {
            this.paintTransport();
          }
        })
      );

      UI.toast(
        this.explaining()
          ? `Explain This ready — press play for a ${Store.language().native} explanation`
          : 'Read aloud ready — press play, or select text first',
        { tone: 'success', duration: 3600 }
      );
    }

    onDisable() {
      this.explainController?.abort();
      this.explainController = null;
      this.clearSource();
      Voice.stop();
      this.releaseDock?.();
      this.releaseDock = null;
      UI.destroyHost('tts');
      UI.destroyHost('tts-mark');
      this.scope = null;
      this.mark = null;
      this.markScope = null;
      this.sourceLayer = null;
    }

    /**
     * Hold on to the passage the reader highlighted.
     *
     * Reading it at the moment they press play is too late: clicking anywhere,
     * including on our own play button, collapses the document selection
     * first. So "explain this paragraph" would silently become "explain the
     * whole page" — and, worse, there would be nothing left to draw a
     * highlight around.
     */
    trackSelection() {
      this.captureSelection();

      this.listen(document, 'selectionchange', () => {
        const selection = document.getSelection();
        const anchor = selection?.anchorNode;
        // Our own panel's text is not page content.
        if (anchor && Text.isOurs(anchor)) return;
        this.captureSelection();
      });
    }

    captureSelection() {
      const selection = document.getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount) return;

      const text = String(selection).trim();
      if (text.length < 2) return;

      try {
        this.selectedRange = selection.getRangeAt(0).cloneRange();
        this.selectedText = text;
      } catch (_) {
        /* a detached or cross-root selection — keep whatever we had */
      }
    }

    /** The passage to work from, with the live Range that located it. */
    heldSelection() {
      const live = Text.selection();
      if (live) {
        // A fresh selection always wins over a remembered one.
        this.captureSelection();
        return { text: live, range: this.selectedRange };
      }
      if (this.selectedRange && this.selectedText) {
        // Only usable while the nodes it points at are still in the document.
        const container = this.selectedRange.commonAncestorContainer;
        if (container?.isConnected) {
          return { text: this.selectedText, range: this.selectedRange };
        }
      }
      return { text: '', range: null };
    }

    onSettings() {
      Voice.invalidate();
      this.paintRate();
      this.syncSelects();
    }

    /* ------------------------------------------------------------------ */
    /* Controls                                                           */
    /* ------------------------------------------------------------------ */

    build() {
      const root = UI.host('tts', { layer: 'control' });

      const style = document.createElement('style');
      style.textContent = `
        .bar {
          position: fixed; display: flex; flex-direction: column; gap: 8px;
          padding: 10px 14px 12px; background: var(--surface);
          border: 1px solid var(--border); border-radius: var(--radius-lg);
          box-shadow: var(--shadow); font-family: var(--font); color: var(--text);
          max-width: min(560px, calc(100vw - 40px));
        }
        .row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .icon {
          width: 34px; height: 34px; border-radius: var(--radius); flex-shrink: 0;
          display: grid; place-items: center;
          background: transparent; border: 1px solid var(--border);
          color: var(--text); cursor: pointer;
          transition: background .15s ease, border-color .15s ease, color .15s ease;
        }
        .icon:hover { background: var(--accent-100); border-color: var(--accent); color: var(--accent-900); }
        .icon:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .icon[data-primary] { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
        .icon[data-primary]:hover { background: var(--accent-600); border-color: var(--accent-600); color: var(--on-accent); }
        .sep { width:1px; height:20px; background:var(--border); flex-shrink:0; }
        .rate { font-size:13px; font-weight:600; min-width:40px; text-align:center; color:var(--text); font-variant-numeric: tabular-nums; }
        select {
          max-width: 148px; padding: 6px 9px; font-size: 12.5px; font-family: var(--font);
          background: var(--bg); color: var(--text);
          border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer;
        }
        select:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
        .toggle {
          display:inline-flex; align-items:center; gap:6px;
          border:1px solid var(--border); border-radius:999px; padding:4px 11px;
          background:transparent; color:var(--text-dim); cursor:pointer;
          font-family:var(--font); font-size:12px; font-weight:700;
        }
        .toggle[aria-pressed="true"] { background:var(--accent-100); border-color:var(--accent); color:var(--accent-900); }
        .toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
        .modes { display:inline-flex; gap:4px; padding:3px; border:1px solid var(--border); border-radius:999px; }
        .modes button {
          display:inline-flex; align-items:center; gap:6px;
          border:none; border-radius:999px; padding:5px 13px;
          background:transparent; color:var(--text-dim); cursor:pointer;
          font-family:var(--font); font-size:12.5px; font-weight:700;
          transition: background .15s ease, color .15s ease;
        }
        .modes button[aria-checked="true"] { background:var(--accent); color:var(--on-accent); }
        .modes button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .engine { font-size:11px; color:var(--text-dim); }
        .engine b { color: var(--accent-700); font-weight: 700; }
        .progress { height:3px; background:var(--border); border-radius:2px; overflow:hidden; }
        .progress-fill { height:100%; width:0; background:var(--accent); border-radius:2px; transition:width .25s linear; }
      `;
      root.appendChild(style);

      const scope = document.createElement('div');
      scope.className = 'setu-scope';
      scope.innerHTML = `
        <div class="bar" role="group" aria-label="Explain This controls">
          <div class="row">
            <button class="icon" data-primary data-act="play" aria-label="Play" title="Play / Pause">${icon('play')}</button>
            <button class="icon" data-act="stop" aria-label="Stop" title="Stop">${icon('stop')}</button>
            <div class="sep"></div>
            <button class="icon" data-act="slower" aria-label="Slower" title="Slower">${icon('minus')}</button>
            <span class="rate">1.0×</span>
            <button class="icon" data-act="faster" aria-label="Faster" title="Faster">${icon('plus')}</button>
            <div class="sep"></div>
            <select data-act="voice" aria-label="Voice"></select>
            <select data-act="language" aria-label="Language"></select>
            <button class="icon" data-act="close" aria-label="Close Explain This" title="Close">${icon('x')}</button>
          </div>
          <div class="row">
            <div class="modes" role="radiogroup" aria-label="What should I say?">
              <button data-act="mode" data-mode="explain" role="radio" aria-checked="true"
                      title="Explain what this is about, in your language, then say it">
                ${icon('book-open', { size: 14 })}Explain this
              </button>
              <button data-act="mode" data-mode="read" role="radio" aria-checked="false"
                      title="Say the words exactly as they are written">
                ${icon('speaker-high', { size: 14 })}Read it out
              </button>
            </div>
            <span class="engine" data-role="engine"></span>
          </div>
          <div class="progress"><div class="progress-fill"></div></div>
        </div>
      `;
      root.appendChild(scope);
      this.scope = scope;

      const bar = scope.querySelector('.bar');
      this.releaseDock = Dock.register('tts', 'bottom-left', bar);
      Dock.observe(bar);

      const on = (act, fn) => scope.querySelector(`[data-act="${act}"]`).addEventListener('click', fn);
      on('play', () => this.togglePlay());
      on('stop', () => this.stop());
      on('slower', () => this.changeRate(-0.1));
      on('faster', () => this.changeRate(0.1));
      on('close', () => window.setuLens?.toggle('tts', false));
      scope.querySelectorAll('[data-act="mode"]').forEach((button) => {
        button.addEventListener('click', () => {
          const explain = button.dataset.mode === 'explain';
          Store.set({ settings: { ttsExplain: explain } });
          this.paintMode(explain);
          // Switching mode mid-sentence should take effect now, not after the
          // current passage finishes.
          if (this.speaking) this.stop();
        });
      });

      scope.querySelector('[data-act="voice"]').addEventListener('change', (event) => {
        Store.set({ settings: { ttsSpeaker: event.target.value, ttsVoice: event.target.value } });
        Voice.invalidate();
        if (this.speaking) this.restart();
      });

      scope.querySelector('[data-act="language"]').addEventListener('change', async (event) => {
        // Sets both the voice code and the AI language name together. Setting
        // only one of them is what produced explanations written in English
        // and spoken by a Hindi voice.
        const language = await Store.setLanguage(event.target.value);
        Voice.invalidate();
        UI.toast(`SETU will explain in ${language.native}`, { tone: 'success' });
        if (this.speaking) this.restart();
      });

      this.populateVoices();
      this.paintRate();
      this.paintTransport();
      this.paintMode(this.explaining());
    }

    /** True when the panel is in "explain" rather than "read verbatim" mode. */
    explaining() {
      return Store.getSetting('ttsExplain') !== false;
    }

    paintMode(explain) {
      this.scope?.querySelectorAll('[data-act="mode"]').forEach((button) => {
        button.setAttribute('aria-checked', String((button.dataset.mode === 'explain') === explain));
      });
    }

    /**
     * Fill the voice and language pickers.
     *
     * Sarvam speakers when the engine has them, the browser's own voices when
     * it does not. Showing an empty <select> reads as a broken control, so the
     * unprobed state says what is happening instead.
     */
    populateVoices() {
      const voiceSelect = this.scope?.querySelector('[data-act="voice"]');
      const languageSelect = this.scope?.querySelector('[data-act="language"]');
      const engineLabel = this.scope?.querySelector('[data-role="engine"]');
      if (!voiceSelect || !languageSelect) return;

      const chosenVoice = Store.getSetting('ttsSpeaker') || Store.getSetting('ttsVoice') || '';
      const chosenLanguage = Store.language().code;

      if (Voice.available === null) {
        voiceSelect.innerHTML = '<option value="">Finding voices…</option>';
      } else if (Voice.available && Voice.catalogue.length) {
        voiceSelect.innerHTML = Voice.catalogue
          .map(
            (voice) =>
              `<option value="${Text.escape(voice.id)}"${voice.id === chosenVoice ? ' selected' : ''}>${Text.escape(
                voice.label || voice.id
              )}${voice.note ? ` — ${Text.escape(voice.note)}` : ''}</option>`
          )
          .join('');
        if (!chosenVoice && Voice.defaultSpeaker) voiceSelect.value = Voice.defaultSpeaker;
      } else {
        const browserVoices = window.speechSynthesis?.getVoices?.() || [];
        voiceSelect.innerHTML = browserVoices.length
          ? browserVoices
              .map(
                (voice) =>
                  `<option value="${Text.escape(voice.name)}"${voice.name === chosenVoice ? ' selected' : ''}>${Text.escape(
                    voice.name
                  )}</option>`
              )
              .join('')
          : '<option value="">Default voice</option>';
      }

      // Never narrows to English: `Voice.languages` is seeded from the table
      // shipped with the extension and only ever replaced by a non-empty one.
      const languages = Voice.languages.length ? Voice.languages : LANGUAGES;

      languageSelect.innerHTML = languages
        .map(
          (language) =>
            `<option value="${Text.escape(language.code)}"${
              language.code === chosenLanguage ? ' selected' : ''
            }>${Text.escape(languageLabel(language))}</option>`
        )
        .join('');

      if (engineLabel) {
        engineLabel.innerHTML =
          Voice.available === null
            ? 'checking the voice engine…'
            : Voice.available
              ? 'natural voice: <b>Sarvam Bulbul</b>'
              : "natural voice unavailable — using this browser's voice";
      }

      this.paintMode(this.explaining());
      Dock.layout();
    }

    syncSelects() {
      const voiceSelect = this.scope?.querySelector('[data-act="voice"]');
      const languageSelect = this.scope?.querySelector('[data-act="language"]');
      if (voiceSelect) voiceSelect.value = Store.getSetting('ttsSpeaker') || voiceSelect.value;
      if (languageSelect) languageSelect.value = Store.language().code;
      this.paintMode(this.explaining());
    }

    paintRate() {
      const el = this.scope?.querySelector('.rate');
      if (el) el.textContent = `${(Store.getSetting('ttsRate') || 1).toFixed(1)}×`;
    }

    paintTransport() {
      const button = this.scope?.querySelector('[data-act="play"]');
      if (!button) return;
      const showPause = Voice.playing && !Voice.paused;
      button.innerHTML = icon(showPause ? 'pause' : 'play');
      button.setAttribute('aria-label', showPause ? 'Pause' : 'Play');
    }

    changeRate(delta) {
      const next = Math.max(0.5, Math.min(2.5, Number(((Store.getSetting('ttsRate') || 1) + delta).toFixed(1))));
      Store.set({ settings: { ttsRate: next } });
      Voice.invalidate();
      this.paintRate();
      if (this.speaking) this.restart();
    }

    /* ------------------------------------------------------------------ */
    /* Reading                                                            */
    /* ------------------------------------------------------------------ */

    /**
     * Build the spoken string and a char-offset index back into live text
     * nodes, so a progress tick can be mapped to an exact on-screen Range.
     */
    prepare(text) {
      this.segments = [];

      if (text) {
        this.spokenText = String(text).replace(/\s+/g, ' ').trim();
        return;
      }

      const nodes = Text.collect(document.body, { minLength: 2 });
      let buffer = '';

      for (const node of nodes) {
        const content = node.textContent.replace(/\s+/g, ' ');
        if (!content.trim()) continue;
        this.segments.push({ node, charIndex: buffer.length, length: content.length });
        buffer += content;
        if (!/\s$/.test(buffer)) buffer += ' ';
      }

      this.spokenText = buffer.trim();
    }

    /** Read the page, or the selection, or an explanation of the selection. */
    async togglePlay() {
      if (Voice.playing) {
        if (Voice.paused) Voice.resume();
        else Voice.pause();
        this.paintTransport();
        return;
      }

      const { text: selected, range } = this.heldSelection();

      if (this.explaining()) {
        // No selection is not an error. "Explain this" with nothing selected
        // has an obvious meaning — explain what this page is about — and
        // refusing to act until the reader highlights something made the
        // feature feel broken on exactly the pages where a wall of text is
        // the problem.
        const source = selected || Text.pageText(6000);

        if (!source) {
          UI.toast("There isn't enough readable text here for me to explain.", {
            tone: 'warn',
            duration: 3600
          });
          return;
        }

        await this.speakExplanation(source, { whole: !selected, range });
        return;
      }

      if (selected) {
        UI.toast('Reading your selection', { tone: 'success' });
        await this.speak(selected);
      } else {
        await this.speak();
      }
    }

    async speak(text = null) {
      this.prepare(text);

      if (!this.spokenText) {
        UI.toast('No readable text found on this page.', { tone: 'warn' });
        return;
      }

      this.speaking = true;
      this.paintTransport();

      await Voice.say(this.spokenText, {
        onProgress: (progress) => {
          this.markWord(progress.charIndex);
          this.paintProgress(progress.charIndex);
        }
      });

      this.speaking = false;
      this.paintProgress(0);
    }

    /**
     * Explain the selection in the reader's own language, then read the
     * explanation aloud in that language.
     *
     * The explanation is streamed and spoken sentence by sentence rather than
     * waited for in full. On the free models SETU runs on that is the
     * difference between hearing the first sentence in about two seconds and
     * hearing nothing for forty.
     */
    async speakExplanation(source, { whole = false, range = null } = {}) {
      this.explainController?.abort();
      this.explainController = new AbortController();
      const controller = this.explainController;

      // One resolved language for both halves. Deriving the name from the
      // voice catalogue meant that whenever the engine was unreachable the
      // catalogue was empty, the name fell back to English, and the reader got
      // an English explanation no matter which language they had picked —
      // the "it only speaks one language" bug.
      const language = Store.language();

      // A caller may hand us the text without the Range that located it — the
      // right-click menu does exactly that. The document selection is still
      // live at that moment, so recovering it here means the highlight works
      // from the context menu too.
      const passage = range || (whole ? null : this.heldSelection().range);

      UI.toast(
        whole
          ? `Explaining this page in ${language.native}…`
          : `Explaining your selection in ${language.native}…`,
        { tone: 'success', duration: 3000 }
      );

      this.speaking = true;
      this.paintTransport();
      this.segments = [];
      this.hideMark();

      // Show what is being explained. A highlighted passage marks itself
      // exactly; a whole-page explanation outlines the article it read, so the
      // scope is at least visible even though no single passage owns it.
      this.showSource(
        passage
          ? { range: passage, label: `Explaining this in ${language.native}` }
          : { element: this.articleElement(), label: `Explaining this page in ${language.native}` }
      );

      // Producer: sentences arrive from the engine. Consumer: the voice speaks
      // each one as soon as it is whole.
      const queue = [];
      let finished = false;
      let wake = null;

      const push = (sentence) => {
        queue.push(sentence);

        // Start synthesising it now rather than when the voice reaches it.
        // Clips are memoised by exactly the key the player will look up, so
        // this turns the wait for sentence two from "generate, then play" into
        // "already generated". On a natural voice that is several seconds a
        // sentence, and it is the difference between an explanation that flows
        // and one that stops between every full stop.
        if (Voice.available === true) {
          Voice.clip(sentence).catch(() => {
            /* the player will surface any real failure */
          });
        }

        wake?.();
      };

      /** How much of the streamed answer has already been handed to the voice. */
      let consumed = 0;

      const producer = API.stream(
        '/api/agent/explain/stream',
        {
          // Told what it is looking at, so a whole page comes back as "this
          // page is about…" rather than a summary of a stray paragraph.
          text: whole
            ? `Explain what this page is about, and the two or three things worth taking away from it.

---
PAGE: ${document.title}

${source}`
            : source,
          language: language.name,
          style: 'spoken'
        },
        {
          signal: controller.signal,
          onChunk: (_chunk, accumulated) => {
            // Emit complete sentences only; half a sentence read aloud is
            // worse than a beat of silence.
            const pending = accumulated.slice(consumed);

            // The last terminator of *any* script wins. Preferring '. ' meant
            // a Hindi explanation — which ends every sentence with '।' and may
            // never contain a full stop at all — was held back until the whole
            // answer had arrived, losing the entire point of streaming.
            const boundary = lastSentenceEnd(pending);

            if (boundary > 40) {
              push(pending.slice(0, boundary).trim());
              consumed += boundary;
            }
          }
        }
      );

      let full = '';
      producer
        .then((text) => {
          full = text;
          const tail = text.slice(consumed).trim();
          if (tail) push(tail);
        })
        .catch((error) => {
          if (error.name !== 'AbortError') {
            UI.toast(`Could not explain that: ${error.message}`, { tone: 'error', duration: 4600 });
          }
        })
        .finally(() => {
          finished = true;
          wake?.();
        });

      try {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          if (controller.signal.aborted) return;

          if (!queue.length) {
            if (finished) break;
            await new Promise((resolve) => {
              wake = resolve;
              setTimeout(resolve, 400);
            });
            wake = null;
            continue;
          }

          const sentence = queue.shift();
          if (!sentence) continue;
          await Voice.say(sentence, { allowBrowserFallback: true });
          if (controller.signal.aborted) return;
        }

        if (!full && !queue.length) {
          UI.toast('The engine had nothing to say about that selection.', { tone: 'warn' });
        }
      } finally {
        this.speaking = false;
        this.paintTransport();
        this.clearSource();
        if (this.explainController === controller) this.explainController = null;
      }
    }

    /**
     * Re-say what we were saying, under the new settings.
     *
     * Explanations restart through `togglePlay` rather than `speak`: a changed
     * language has to be re-generated by the model, not merely re-voiced, and
     * replaying the cached English audio in a "Hindi" session was precisely
     * the behaviour that made the language picker look inert.
     */
    /**
     * The block a whole-page explanation was drawn from.
     *
     * Deliberately the same resolution order `Text.pageText` uses, so the
     * outline marks what was actually read rather than a plausible-looking
     * container that was not.
     */
    articleElement() {
      const hosted = Reading.surface();
      if (hosted?.isConnected) return hosted;

      for (const selector of ['article', 'main', '[role="main"]', '#content, .content, .post-content, .entry-content']) {
        const el = document.querySelector(selector);
        if (el && (el.innerText || '').trim().length > 400) return el;
      }
      return document.body;
    }

    restart() {
      const wasSpeaking = this.speaking;
      const explaining = this.explaining();
      const text = this.spokenText;

      this.stop();
      if (!wasSpeaking) return;

      if (explaining) {
        this.togglePlay();
        return;
      }
      if (text) this.speak(this.segments.length ? null : text);
    }

    stop() {
      this.explainController?.abort();
      this.explainController = null;
      this.speaking = false;
      Voice.stop();
      this.hideMark();
      this.clearSource();
      this.paintProgress(0);
      this.paintTransport();
    }

    /* ------------------------------------------------------------------ */
    /* Spoken-word highlight                                              */
    /* ------------------------------------------------------------------ */

    /** Draw the highlight over the word at `charIndex` of the spoken text. */
    markWord(charIndex) {
      if (!this.segments.length) return;

      // The segments are ordered by charIndex, so a binary search keeps this
      // O(log n) on pages with tens of thousands of text nodes. The previous
      // linear reverse scan ran on every progress tick.
      let low = 0;
      let high = this.segments.length - 1;
      let found = -1;
      while (low <= high) {
        const mid = (low + high) >> 1;
        if (this.segments[mid].charIndex <= charIndex) {
          found = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      if (found === -1) return;

      const segment = this.segments[found];
      if (!segment.node.isConnected) return;

      const local = charIndex - segment.charIndex;
      const content = segment.node.textContent;
      if (local < 0 || local >= content.length) return;

      let start = local;
      let end = local;
      while (start > 0 && /\S/.test(content[start - 1])) start -= 1;
      while (end < content.length && /\S/.test(content[end])) end += 1;
      if (start === end) return;

      const range = document.createRange();
      try {
        range.setStart(segment.node, start);
        range.setEnd(segment.node, end);
      } catch (_) {
        return;
      }

      const rect = range.getBoundingClientRect();
      if (!rect.width) return;

      this.paintMark(rect);

      // Keep the spoken word comfortably in view — through the arbiter, so it
      // still works inside the Focus Mode reader and does not fight Auto
      // Scroll for the document scroller.
      if (rect.top < 90 || rect.bottom > window.innerHeight - 90) {
        Scroll.into(segment.node.parentElement, { block: 'center' });
      }
    }

    /**
     * Build the overlay both highlights live in, once.
     *
     * Two marks, drawn in the same shadow layer: `.mark` follows the word being
     * spoken while reading verbatim, and `.source` shows the passage an
     * explanation is *about*. They never appear together, because the two modes
     * are mutually exclusive.
     */
    ensureMarkLayer() {
      const root = UI.host('tts-mark', { layer: 'reading' });
      if (this.markScope?.isConnected) return;

      const style = document.createElement('style');
      style.textContent = `
        .mark {
          position: fixed; border-radius: 2px; pointer-events: none;
          background: color-mix(in srgb, var(--accent) 22%, transparent);
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 45%, transparent);
          transition: top .1s ease, left .1s ease, width .1s ease, height .1s ease;
        }
        /* Magenta, not cyan: this marks what is being talked *about*, which is
           a different statement from cyan's "this is the word being said", and
           the two must never be read as the same thing. */
        .source {
          position: fixed; pointer-events: none; border-radius: 2px;
          background: color-mix(in srgb, var(--accent-2) 16%, transparent);
          box-shadow: 0 0 0 1.5px color-mix(in srgb, var(--accent-2) 55%, transparent);
        }
        /* A whole-page scope is outlined rather than filled — washing an entire
           article in colour would make it harder to read, not easier. */
        .source[data-kind="scope"] {
          background: transparent;
          border: 2px dashed color-mix(in srgb, var(--accent-2) 70%, transparent);
          box-shadow: none;
        }
        .source-tag {
          position: fixed; pointer-events: none;
          padding: 3px 9px; border-radius: 999px;
          background: var(--accent-2); color: #fff;
          font-family: var(--font); font-size: 11px; font-weight: 700;
          white-space: nowrap;
        }
      `;
      root.appendChild(style);

      const scope = document.createElement('div');
      scope.className = 'setu-scope';

      this.sourceLayer = document.createElement('div');
      scope.appendChild(this.sourceLayer);

      this.mark = document.createElement('div');
      this.mark.className = 'mark';
      this.mark.style.display = 'none';
      scope.appendChild(this.mark);

      root.appendChild(scope);
      this.markScope = scope;
    }

    paintMark(rect) {
      this.ensureMarkLayer();

      Object.assign(this.mark.style, {
        top: `${rect.top - 2}px`,
        left: `${rect.left - 2}px`,
        width: `${rect.width + 4}px`,
        height: `${rect.height + 4}px`,
        display: 'block'
      });
    }

    hideMark() {
      if (this.mark) this.mark.style.display = 'none';
    }

    /* ------------------------------------------------------------------ */
    /* "This is what I am explaining"                                     */
    /* ------------------------------------------------------------------ */

    /**
     * Show the passage an explanation is about.
     *
     * Without this an explanation arrived as disembodied audio: the reader
     * heard a paragraph of plain language with no way to tell which part of a
     * dense page it referred to — which, for someone who opened the tool
     * because the page was already hard to hold onto, is most of the value
     * gone. A live Range is kept rather than a stored rectangle so the marks
     * survive reflow, and they are repainted on scroll because everything here
     * is viewport-positioned.
     *
     * @param {{range?: Range, element?: Element, label?: string}} source
     */
    showSource({ range = null, element = null, label = '' }) {
      this.clearSource();
      if (!range && !element?.isConnected) return;

      this.source = { range, element, label };
      this.ensureMarkLayer();

      const repaint = () => this.paintSource();
      // Captured, so a scroll inside the Focus Mode reader is heard too.
      window.addEventListener('scroll', repaint, { passive: true, capture: true });
      window.addEventListener('resize', repaint, { passive: true });
      this.stopSourceTracking = () => {
        window.removeEventListener('scroll', repaint, { capture: true });
        window.removeEventListener('resize', repaint);
      };

      this.paintSource();

      // Bring it into view, so "what is it explaining?" is answerable without
      // the reader having to go looking.
      const anchor = element || range?.startContainer?.parentElement;
      if (anchor?.isConnected) Scroll.into(anchor, { block: 'center' });
    }

    paintSource() {
      if (!this.source || !this.sourceLayer) return;

      const { range, element, label } = this.source;

      let rects = [];
      if (range) {
        // A Range spanning several lines yields one rect per line box, which is
        // what makes a multi-line highlight follow the prose instead of boxing
        // in the whitespace around it.
        rects = [...range.getClientRects()].filter((r) => r.width > 1 && r.height > 1);
      } else if (element?.isConnected) {
        const rect = element.getBoundingClientRect();
        if (rect.width > 1 && rect.height > 1) rects = [rect];
      }

      if (!rects.length) {
        this.sourceLayer.innerHTML = '';
        return;
      }

      // Rebuild only when the count changes; otherwise move what is already
      // there, so scrolling does not thrash the DOM on every frame.
      const kind = range ? 'passage' : 'scope';
      const wanted = rects.length + (label ? 1 : 0);
      if (this.sourceLayer.childElementCount !== wanted) {
        this.sourceLayer.innerHTML = '';
        for (let i = 0; i < rects.length; i += 1) {
          const box = document.createElement('div');
          box.className = 'source';
          box.dataset.kind = kind;
          this.sourceLayer.appendChild(box);
        }
        if (label) {
          const tag = document.createElement('div');
          tag.className = 'source-tag';
          tag.textContent = label;
          this.sourceLayer.appendChild(tag);
        }
      }

      const boxes = this.sourceLayer.querySelectorAll('.source');
      rects.forEach((rect, i) => {
        const box = boxes[i];
        if (!box) return;
        Object.assign(box.style, {
          top: `${rect.top - 2}px`,
          left: `${rect.left - 2}px`,
          width: `${rect.width + 4}px`,
          height: `${rect.height + 4}px`
        });
      });

      const tag = this.sourceLayer.querySelector('.source-tag');
      if (tag) {
        const first = rects[0];
        // Above the passage where there is room, below it when the passage is
        // at the very top of the viewport.
        const above = first.top > 30;
        Object.assign(tag.style, {
          top: `${above ? first.top - 26 : first.bottom + 6}px`,
          left: `${Math.max(8, first.left)}px`
        });
      }
    }

    clearSource() {
      this.stopSourceTracking?.();
      this.stopSourceTracking = null;
      this.source = null;
      if (this.sourceLayer) this.sourceLayer.innerHTML = '';
    }

    paintProgress(charIndex) {
      const fill = this.scope?.querySelector('.progress-fill');
      if (fill && this.spokenText.length) {
        fill.style.width = `${Math.min(100, (charIndex / this.spokenText.length) * 100)}%`;
      }
    }
  }

  // Exposed before the feature is registered so every later module — the mind
  // map's hover audio, the agent's "read this answer" — can speak without
  // opening a transport bar.
  window.SETU.Voice = Voice;
  window.SETU.features.set('tts', TextToSpeech);
})();
