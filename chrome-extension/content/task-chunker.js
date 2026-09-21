/**
 * The 3-Step Path — preemptive cognitive task chunking.
 *
 * Dense portals — banking, government, insurance, job applications — present
 * the whole wall at once, and for a reader with task-initiation paralysis that
 * wall is the entire problem. This collapses the page into exactly three steps
 * and floats them as a checklist, so they face one thing at a time.
 *
 * Three things make it work on every site rather than on the demo site:
 *
 *  1. It never waits for the network to show something. A deterministic plan
 *     is read out of the live page and rendered immediately, then quietly
 *     replaced when the AI plan lands. On a page with no engine, no AI key, or
 *     an exhausted quota — which, on free tiers, is most of the time — the
 *     reader still gets a usable path in about 20ms instead of a spinner and
 *     then an error.
 *  2. Steps point at real controls. "Show me" scrolls the actual field into
 *     view and rings it, resolved through the shared page snapshot, so it
 *     survives a re-render.
 *  3. Progress is per page and survives a reload, because these are exactly
 *     the forms that reload themselves halfway through.
 */

(() => {
  const { Feature, UI, API, Text, Page, Dock, Scroll, Session, icon } = window.SETU;

  /** Controls that submit, pay, or otherwise end the task. */
  const FINAL_ACTION =
    /\b(submit|continue|next|proceed|pay|checkout|place order|apply|send|save|finish|complete|confirm)\b/i;

  /** Fields nobody should be told to "fill in what you know" about. */
  const SENSITIVE_FIELD = /\b(password|otp|cvv|pin|security code)\b/i;

  const PROGRESS_TTL_MS = 24 * 60 * 60 * 1000;

  class TaskChunker extends Feature {
    static key = 'chunking';

    constructor() {
      super();
      this.plan = null;
      this.source = 'local';
      this.done = new Set();
      this.collapsed = false;
      this.controller = null;
      this.snapshot = null;
      this.stopSpotlight = null;
    }

    async onEnable() {
      this.build();

      // Something usable, on screen, before any network call is made.
      this.snapshot = Page.snapshot({ maxControls: 80, maxText: 4000 });
      this.plan = this.readPageDirectly(this.snapshot);
      this.source = 'local';
      this.render();

      await this.restoreProgress();

      // Now go and get a better one. The panel stays interactive throughout.
      API.warm();
      this.upgrade();
    }

    onDisable() {
      this.controller?.abort();
      this.controller = null;
      this.stopSpotlight?.();
      this.stopSpotlight = null;
      this.releaseDock?.();
      this.releaseDock = null;
      this.clearEvery('elapsed');
      UI.destroyHost('chunks');
      this.scope = null;
      this.panel = null;
      this.body = null;
      this.plan = null;
      this.done.clear();
    }

    /** A single-page app navigated — the old plan is about a page that is gone. */
    onNavigate() {
      this.done.clear();
      this.snapshot = Page.snapshot({ maxControls: 80, maxText: 4000 });
      this.plan = this.readPageDirectly(this.snapshot);
      this.source = 'local';
      this.render();
      this.upgrade();
    }

    /* ------------------------------------------------------------------ */
    /* The deterministic plan                                             */
    /* ------------------------------------------------------------------ */

    /**
     * Build three steps out of what is actually on screen, with no model call.
     *
     * This is not a placeholder. For the form-shaped pages this feature exists
     * for, grouping the visible fields into thirds and naming the final action
     * is most of the value — someone stuck on a benefits form needs "there are
     * eleven fields, here are the first four, the submit button is called
     * Continue" far more than they need prose about the page.
     */
    readPageDirectly(snapshot) {
      const controls = snapshot.controls || [];

      const fields = controls.filter(
        (control) =>
          ['input', 'select', 'textarea'].includes(control.tag) &&
          !['submit', 'button', 'reset', 'image'].includes(control.type)
      );

      const finalAction =
        controls.find((c) => c.type === 'submit') ||
        controls.find((c) => c.tag === 'button' && FINAL_ACTION.test(c.label)) ||
        controls.find((c) => FINAL_ACTION.test(c.label)) ||
        null;

      const sections = (snapshot.headings || []).filter((h) => h.length > 2).slice(0, 6);

      const steps = fields.length >= 2
        ? this.stepsForForm(fields, finalAction)
        : this.stepsForReading(sections, finalAction, snapshot);

      const needed = fields
        .filter((field) => /\b(id|number|licence|license|passport|aadhaar|pan|account|policy|reference|code)\b/i.test(field.label))
        .map((field) => field.label)
        .slice(0, 4);

      return {
        pageName: (snapshot.title || document.title || 'This page').slice(0, 90),
        whatThisPageIsFor: fields.length
          ? `This page asks you for ${fields.length} piece${fields.length === 1 ? '' : 's'} of information, then ${
              finalAction ? `you press "${finalAction.label}"` : 'submits them'
            }.`
          : 'This page is mostly something to read. The path below breaks it into three passes.',
        estimatedMinutes: Math.max(2, Math.min(20, Math.ceil(fields.length * 0.6) + 2)),
        thingsToHaveReady: needed,
        steps,
        encouragement: 'You do not have to finish this in one sitting. One step is real progress.'
      };
    }

    /** Split the visible fields into three runs, ending at the action. */
    stepsForForm(fields, finalAction) {
      const safe = fields.filter((field) => !SENSITIVE_FIELD.test(field.label));
      const half = Math.ceil(safe.length / 2) || 1;
      const first = safe.slice(0, half);
      const rest = safe.slice(half);

      const name = (list) =>
        list.slice(0, 3).map((f) => `"${f.label}"`).join(', ') +
        (list.length > 3 ? `, and ${list.length - 3} more` : '');

      return [
        {
          title: 'Gather what you need',
          what: safe.length
            ? `Look at the ${safe.length} field${safe.length === 1 ? '' : 's'} on this page — starting with ${name(first)} — and collect anything you will have to look up.`
            : 'Read the top of the page and note anything you will need to look up.',
          why: 'Being ambushed halfway through is what makes people abandon a form.',
          targetRef: first[0]?.ref || '',
          targetText: first[0]?.label || ''
        },
        {
          title: 'Fill the easy ones',
          what: first.length
            ? `Fill in ${name(first)}. Skip anything you are unsure about — you come back to it.`
            : 'Answer whatever you can straight away and skip the rest.',
          why: 'Momentum from the easy fields makes the harder ones feel smaller.',
          targetRef: first[0]?.ref || '',
          targetText: first[0]?.label || ''
        },
        {
          title: finalAction ? `Check, then "${finalAction.label}"` : 'Check, then submit',
          what: rest.length
            ? `Go back over what you skipped${rest.length ? ` and finish ${name(rest)}` : ''}, then ${
                finalAction ? `press "${finalAction.label}"` : 'submit'
              }.`
            : `Read back over your answers, then ${finalAction ? `press "${finalAction.label}"` : 'submit'}.`,
          why: 'One deliberate pass at the end catches mistakes without slowing you down.',
          targetRef: finalAction?.ref || rest[0]?.ref || '',
          targetText: finalAction?.label || rest[0]?.label || ''
        }
      ];
    }

    /** Reading-shaped pages get three passes rather than three form runs. */
    stepsForReading(sections, finalAction, snapshot) {
      const words = (snapshot.text || '').split(/\s+/).filter(Boolean).length;
      const minutes = Math.max(1, Math.round(words / 200));

      return [
        {
          title: 'Read the opening only',
          what: sections[0]
            ? `Read down to "${sections[0]}" and stop there. Ignore everything below it for now.`
            : 'Read the first screen and stop there. Ignore everything below it for now.',
          why: 'Seeing one section at a time keeps the page from feeling like a wall.',
          targetRef: '',
          targetText: ''
        },
        {
          title: sections.length > 1 ? `Then the middle` : 'Then the body',
          what: sections.length > 1
            ? `Work through the sections in the middle: ${sections.slice(0, 3).join(', ')}.`
            : `Work through the body of the page — roughly ${minutes} minute${minutes === 1 ? '' : 's'} of reading.`,
          why: 'Named sections give you a place to stop and come back to.',
          targetRef: '',
          targetText: ''
        },
        {
          title: finalAction ? `Decide, then "${finalAction.label}"` : 'Decide what to do next',
          what: finalAction
            ? `When you have what you need, press "${finalAction.label}".`
            : 'Decide whether you have what you came for, or what you still need to find.',
          why: 'Naming the end of the task is what lets you stop reading.',
          targetRef: finalAction?.ref || '',
          targetText: finalAction?.label || ''
        }
      ];
    }

    /* ------------------------------------------------------------------ */
    /* The AI plan                                                        */
    /* ------------------------------------------------------------------ */

    /** Ask the engine for a better plan and swap it in if one arrives. */
    async upgrade() {
      this.controller?.abort();
      this.controller = new AbortController();
      const controller = this.controller;

      this.setStatus('reading', 'Reading this page more closely…');
      this.startElapsed();

      try {
        const plan = await API.cached(
          '/api/agent/chunk',
          {
            pageContext: {
              url: this.snapshot.url,
              title: this.snapshot.title,
              headings: this.snapshot.headings,
              controls: this.snapshot.controls,
              text: this.snapshot.text
            }
          },
          { signal: controller.signal, ttlMs: 20 * 60 * 1000 }
        );

        if (!this.enabled || controller.signal.aborted) return;

        const steps = Array.isArray(plan?.steps) ? plan.steps.filter((s) => s?.title) : [];
        if (steps.length < 2) throw new Error('The engine returned an empty plan.');

        // Keep the local step targets: the model is not shown control refs for
        // the chunker, so its steps have no way to point at anything, and
        // losing "Show me" would be a downgrade dressed up as an upgrade.
        const localSteps = this.plan?.steps || [];
        this.plan = {
          ...plan,
          steps: steps.slice(0, 3).map((step, index) => ({
            ...step,
            targetRef: step.targetRef || localSteps[index]?.targetRef || '',
            targetText: step.targetText || localSteps[index]?.targetText || ''
          }))
        };
        this.source = plan.fallback ? 'engine-offline' : 'ai';
        this.render();
        this.setStatus('ok', '');
      } catch (error) {
        if (!this.enabled) return;
        if (error.name === 'AbortError') {
          this.setStatus('ok', '');
          return;
        }
        // The local plan is already on screen and already useful, so this is a
        // note, not a failure state. Anything else would be theatre.
        this.setStatus('local', this.explain(error));
      } finally {
        this.clearEvery('elapsed');
        if (this.controller === controller) this.controller = null;
      }
    }

    /** Turn an engine failure into one short line the user can act on. */
    explain(error) {
      return {
        offline: 'Showing the page-read path — the SETU engine is unreachable.',
        timeout: 'Showing the page-read path — the engine was too slow this time.',
        'rate-limited': 'Showing the page-read path — the AI quota needs a minute.',
        unavailable: 'Showing the page-read path — the engine has no AI provider.'
      }[error.code] || 'Showing the path read straight off this page.';
    }

    /* ------------------------------------------------------------------ */
    /* Progress                                                           */
    /* ------------------------------------------------------------------ */

    progressKey() {
      return Session.pageKey('setu_steps');
    }

    async restoreProgress() {
      try {
        const key = this.progressKey();
        const stored = await chrome.storage.local.get(key);
        const entry = stored?.[key];
        if (!entry || Date.now() - (entry.savedAt || 0) > PROGRESS_TTL_MS) return;

        this.done = new Set(Array.isArray(entry.done) ? entry.done : []);
        this.collapsed = Boolean(entry.collapsed);
        this.applyCollapsed();
        this.paintProgress();
      } catch (_) {
        /* storage unavailable — progress simply starts fresh */
      }
    }

    saveProgress() {
      try {
        chrome.storage.local.set({
          [this.progressKey()]: {
            done: [...this.done],
            collapsed: this.collapsed,
            savedAt: Date.now()
          }
        });
      } catch (_) {
        /* best effort */
      }
    }

    /* ------------------------------------------------------------------ */
    /* Panel                                                              */
    /* ------------------------------------------------------------------ */

    build() {
      const root = UI.host('chunks', { layer: 'panel' });

      const style = document.createElement('style');
      style.textContent = `
        .panel {
          position: fixed; width: min(360px, calc(100vw - 40px));
          max-height: calc(100vh - 140px); overflow-y: auto;
          padding: 16px; background: var(--surface);
          border: 1px solid var(--border); border-radius: var(--radius-lg);
          box-shadow: var(--shadow); font-family: var(--font); color: var(--text);
        }
        .panel[data-collapsed="true"] { max-height: none; overflow: visible; }
        .panel[data-collapsed="true"] .body,
        .panel[data-collapsed="true"] .status { display: none; }
        .head { display:flex; align-items:center; justify-content:space-between; gap:10px; cursor:move; }
        .badge { font-size:10px; font-weight:700; letter-spacing:.08em; text-transform: uppercase; color:var(--accent-700); }
        .icons { display:flex; gap:3px; }
        .icons button {
          background:none; border:1px solid transparent; color:var(--text-dim);
          cursor:pointer; padding:4px; border-radius:var(--radius);
          display:grid; place-items:center;
        }
        .icons button:hover { color:var(--accent-900); background:var(--accent-100); border-color:var(--accent); }
        .icons button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

        .status {
          display:none; align-items:center; gap:7px; margin-top:9px;
          font-size:11.5px; line-height:1.45; color:var(--text-dim);
        }
        .status[data-show="true"] { display:flex; }
        .status[data-tone="reading"] { color: var(--accent-700); }
        .status[data-tone="local"] { color: var(--warn); }
        .spinner {
          flex-shrink:0; width:9px; height:9px; border-radius:50%;
          background: var(--accent); animation: fade 1.3s ease-in-out infinite;
        }
        .status[data-tone="local"] .spinner { animation:none; background: var(--warn); }
        @keyframes fade { 0%,100%{opacity:.25} 50%{opacity:1} }
        .elapsed { font-variant-numeric: tabular-nums; opacity:.75; }

        h3 { font-size:16px; font-weight:700; margin:10px 0 4px; line-height:1.35; color: var(--text); }
        .sub { font-size:12.5px; color:var(--text-dim); line-height:1.5; margin-bottom:12px; }
        .meta { display:flex; gap:7px; flex-wrap:wrap; margin-bottom:13px; }
        .ready { margin-bottom:13px; padding:10px 12px; border-radius:var(--radius);
                 background:rgba(237,187,0,.12); border:1px solid rgba(237,187,0,.35); }
        .ready-title { font-size:10.5px; font-weight:700; color:var(--warn); text-transform: uppercase; letter-spacing:.06em; margin-bottom:5px; }
        .ready li { font-size:12px; color:var(--text); margin-left:15px; line-height:1.5; }

        ol.steps { list-style:none; display:flex; flex-direction:column; gap:9px; }
        .step {
          display:flex; gap:11px; padding:12px; border-radius:var(--radius);
          background:var(--bg); border:1px solid var(--border);
          transition:border-color .16s ease, opacity .16s ease, background .16s ease;
        }
        .step:hover { border-color:var(--accent); background: var(--accent-100); }
        .step[data-done="true"] { opacity:.55; }
        .step[data-done="true"] .step-title { text-decoration:line-through; }
        .tick {
          flex-shrink:0; width:22px; height:22px; border-radius:50%; padding:0;
          border:2px solid var(--border); display:grid; place-items:center;
          color:transparent; background: var(--surface); cursor:pointer;
        }
        .tick:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .step[data-done="true"] .tick { background:var(--accent); border-color:var(--accent); color:var(--on-accent); }
        .step-main { min-width: 0; flex: 1; }
        .step-title { font-size:13.5px; font-weight:700; margin-bottom:3px; color: var(--text); }
        .step-what { font-size:12px; color:var(--text-dim); line-height:1.5; }
        .step-why  { font-size:11.5px; color:var(--text-dim); opacity:.85; margin-top:4px; font-style:italic; }
        .show {
          margin-top:8px; display:inline-flex; align-items:center; gap:5px;
          background:transparent; border:1px solid var(--border); color:var(--accent-700);
          border-radius:999px; padding:3px 11px; font-family:var(--font);
          font-size:11.5px; font-weight:700; cursor:pointer;
        }
        .show:hover { border-color:var(--accent); background:var(--accent-100); }
        .show:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

        .foot { margin-top:14px; font-size:12px; color:var(--accent-700); line-height:1.5; font-weight:600; }
        .bar { height:3px; background:var(--bg); border-radius:2px; overflow:hidden; margin:12px 0 0; border: 1px solid var(--border); }
        .bar-fill { height:100%; width:0; background:var(--accent); transition:width .3s ease; }
      `;
      root.appendChild(style);

      const scope = document.createElement('div');
      scope.className = 'setu-scope';
      scope.innerHTML = `
        <div class="panel" role="region" aria-label="Three step path" data-collapsed="false">
          <div class="head">
            <span class="badge">3-STEP PATH</span>
            <div class="icons">
              <button data-act="collapse" aria-label="Collapse" title="Collapse">${icon('minus', { size: 17 })}</button>
              <button data-act="refresh" aria-label="Read the page again" title="Read the page again">${icon('arrow-counter-clockwise', { size: 17 })}</button>
              <button data-act="close" aria-label="Close" title="Close">${icon('x', { size: 17 })}</button>
            </div>
          </div>
          <p class="status" role="status" aria-live="polite">
            <span class="spinner"></span><span class="status-text"></span><span class="elapsed"></span>
          </p>
          <div class="body"></div>
        </div>
      `;
      root.appendChild(scope);

      this.scope = scope;
      this.panel = scope.querySelector('.panel');
      this.body = scope.querySelector('.body');

      scope.querySelector('[data-act="close"]').onclick = () =>
        window.setuLens?.toggle('chunking', false);
      scope.querySelector('[data-act="refresh"]').onclick = () => this.regenerate();
      scope.querySelector('[data-act="collapse"]').onclick = () => {
        this.collapsed = !this.collapsed;
        this.applyCollapsed();
        this.saveProgress();
      };

      // Docked rather than pinned: Gaze Scroll also lives in the top-right,
      // and two panels in the same corner meant one of them was unreachable.
      this.releaseDock = Dock.register('chunks', 'top-right', this.panel);
      Dock.observe(this.panel);
      this.makeDraggable(scope.querySelector('.head'));
    }

    applyCollapsed() {
      if (!this.panel) return;
      this.panel.dataset.collapsed = String(this.collapsed);
      const button = this.scope?.querySelector('[data-act="collapse"]');
      if (button) {
        button.innerHTML = icon(this.collapsed ? 'plus' : 'minus', { size: 17 });
        button.setAttribute('aria-label', this.collapsed ? 'Expand' : 'Collapse');
      }
      Dock.layout();
    }

    /**
     * Let the user move the panel off whatever it is covering.
     *
     * Dragging opts the panel out of the dock — once it has been placed by
     * hand, having it snap back when another tool opens would be worse than
     * the overlap the dock exists to prevent.
     */
    makeDraggable(handle) {
      let origin = null;

      const onDown = (event) => {
        if (event.target.closest('button')) return;
        const rect = this.panel.getBoundingClientRect();
        origin = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
        handle.setPointerCapture?.(event.pointerId);
      };

      const onMove = (event) => {
        if (!origin) return;
        this.releaseDock?.();
        this.releaseDock = null;

        const width = this.panel.offsetWidth;
        const height = this.panel.offsetHeight;
        const left = Math.max(8, Math.min(window.innerWidth - width - 8, origin.left + event.clientX - origin.x));
        const top = Math.max(8, Math.min(window.innerHeight - Math.min(height, 90) - 8, origin.top + event.clientY - origin.y));

        Object.assign(this.panel.style, {
          left: `${left}px`,
          top: `${top}px`,
          right: 'auto',
          bottom: 'auto'
        });
      };

      const onUp = (event) => {
        if (!origin) return;
        origin = null;
        handle.releasePointerCapture?.(event.pointerId);
      };

      this.listen(handle, 'pointerdown', onDown);
      this.listen(handle, 'pointermove', onMove);
      this.listen(handle, 'pointerup', onUp);
      this.listen(handle, 'pointercancel', onUp);
    }

    regenerate() {
      this.snapshot = Page.snapshot({ maxControls: 80, maxText: 4000 });
      this.plan = this.readPageDirectly(this.snapshot);
      this.source = 'local';
      this.render();
      this.upgrade();
    }

    /* ------------------------------------------------------------------ */
    /* Rendering                                                          */
    /* ------------------------------------------------------------------ */

    setStatus(tone, message) {
      const status = this.scope?.querySelector('.status');
      if (!status) return;

      status.dataset.tone = tone;
      status.dataset.show = message ? 'true' : 'false';
      status.querySelector('.status-text').textContent = message;
      if (!message) status.querySelector('.elapsed').textContent = '';
      Dock.layout();
    }

    /**
     * Show how long the upgrade has been running.
     *
     * The plan on screen is already usable, so this is information rather than
     * a wait — but without it a reader has no way to tell a slow model from a
     * dead one, and will keep pressing the refresh button.
     */
    startElapsed() {
      const startedAt = Date.now();
      const caption = this.scope?.querySelector('.elapsed');
      this.every('elapsed', 1000, () => {
        if (!caption?.isConnected) return this.clearEvery('elapsed');
        const seconds = Math.round((Date.now() - startedAt) / 1000);
        caption.textContent = seconds > 2 ? ` ${seconds}s` : '';
      });
    }

    render() {
      const plan = this.plan;
      if (!plan || !this.body) return;

      const steps = plan.steps || [];

      this.body.innerHTML = `
        <h3>${Text.escape(plan.pageName || document.title)}</h3>
        <p class="sub">${Text.escape(plan.whatThisPageIsFor || '')}</p>
        <div class="meta">
          <span class="setu-tag">~${Number(plan.estimatedMinutes) || 5} min</span>
          <span class="setu-tag">${steps.length} step${steps.length === 1 ? '' : 's'}</span>
          ${
            this.source === 'ai'
              ? '<span class="setu-tag" data-tone="accent">AI plan</span>'
              : '<span class="setu-tag">read from this page</span>'
          }
        </div>
        ${
          (plan.thingsToHaveReady || []).length
            ? `<div class="ready">
                 <div class="ready-title">HAVE THESE READY</div>
                 <ul>${plan.thingsToHaveReady
                   .map((item) => `<li>${Text.escape(item)}</li>`)
                   .join('')}</ul>
               </div>`
            : ''
        }
        <ol class="steps">
          ${steps
            .map(
              (step, index) => `
            <li class="step" data-index="${index}" data-done="${this.done.has(index)}">
              <button class="tick" type="button"
                      role="checkbox" aria-checked="${this.done.has(index)}"
                      aria-label="Mark step ${index + 1} done">${icon('check', { size: 12 })}</button>
              <div class="step-main">
                <div class="step-title">${index + 1}. ${Text.escape(step.title || '')}</div>
                <div class="step-what">${Text.escape(step.what || '')}</div>
                ${step.why ? `<div class="step-why">${Text.escape(step.why)}</div>` : ''}
                ${
                  step.targetRef || step.targetText
                    ? `<button class="show" type="button" data-show="${index}">${icon('crosshair', { size: 12 })}Show me</button>`
                    : ''
                }
              </div>
            </li>`
            )
            .join('')}
        </ol>
        ${plan.encouragement ? `<p class="foot">${Text.escape(plan.encouragement)}</p>` : ''}
        <div class="bar"><div class="bar-fill"></div></div>
      `;

      this.body.querySelectorAll('.tick').forEach((tick) => {
        tick.onclick = () => this.toggleStep(tick.closest('.step'));
      });
      this.body.querySelectorAll('.show').forEach((button) => {
        button.onclick = () => this.showStep(Number(button.dataset.show));
      });

      this.paintProgress();
      Dock.layout();
    }

    /** Scroll the control a step is about into view and ring it. */
    showStep(index) {
      const step = this.plan?.steps?.[index];
      if (!step) return;

      const target = Page.resolve(step);
      if (!target) {
        UI.toast('That part of the page has moved. Press the refresh icon to read it again.', {
          tone: 'warn',
          duration: 4000
        });
        return;
      }

      Scroll.into(target, { block: 'center' });
      this.stopSpotlight?.();
      this.stopSpotlight = UI.spotlight(target, { duration: 4200 });
    }

    toggleStep(el) {
      if (!el) return;
      const index = Number(el.dataset.index);
      const nowDone = !this.done.has(index);

      if (nowDone) this.done.add(index);
      else this.done.delete(index);

      el.dataset.done = String(nowDone);
      el.querySelector('.tick')?.setAttribute('aria-checked', String(nowDone));

      this.paintProgress();
      this.saveProgress();

      if (this.done.size === (this.plan?.steps || []).length) {
        UI.toast('Every step done. Nicely handled.', { tone: 'success', duration: 3600 });
      }
    }

    paintProgress() {
      const total = (this.plan?.steps || []).length || 1;
      const fill = this.body?.querySelector('.bar-fill');
      if (fill) fill.style.width = `${(this.done.size / total) * 100}%`;

      this.body?.querySelectorAll('.step').forEach((el) => {
        const done = this.done.has(Number(el.dataset.index));
        el.dataset.done = String(done);
        el.querySelector('.tick')?.setAttribute('aria-checked', String(done));
      });
    }
  }

  window.SETU.features.set('chunking', TaskChunker);
})();
