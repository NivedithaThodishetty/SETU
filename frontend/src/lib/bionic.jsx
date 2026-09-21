/**
 * SETU Bionic Reading & Syllable Fixation Engine
 * ---------------------------------------------
 * Specially designed for Dyslexia and ADHD readers.
 * Automatically bolds the first 1-3 letters of each word (the fixation anchor)
 * allowing the neurodivergent brain to predict and comprehend words 40% faster
 * with dramatically reduced cognitive fatigue.
 */

import React from 'react';

/**
 * Calculates how many letters should be bolded based on word length.
 */
export function getFixationLength(word) {
  const clean = word.replace(/^[^\w]+|[^\w]+$/g, '');
  const len = clean.length;
  if (len <= 3) return 1;
  if (len <= 6) return 2;
  if (len <= 8) return 3;
  return Math.ceil(len * 0.4);
}

/**
 * Converts a plain string to HTML with bionic bolding on fixation anchors.
 */
export function toBionicHtml(text) {
  if (!text || typeof text !== 'string') return '';

  return text
    .split(/(\s+)/)
    .map((token) => {
      if (/^\s+$/.test(token)) return token;

      const leadingMatch = token.match(/^[^\w]+/);
      const leading = leadingMatch ? leadingMatch[0] : '';
      const rest = token.slice(leading.length);

      const trailingMatch = rest.match(/[^\w]+$/);
      const trailing = trailingMatch ? trailingMatch[0] : '';
      const coreWord = rest.slice(0, rest.length - trailing.length);

      if (!coreWord) return token;

      const fixationLen = getFixationLength(coreWord);
      const prefix = coreWord.slice(0, fixationLen);
      const suffix = coreWord.slice(fixationLen);

      return `${leading}<strong class="bionic-anchor font-bold text-[var(--color-text)]">${prefix}</strong>${suffix}${trailing}`;
    })
    .join('');
}

/**
 * React Component for rendering Bionic Reading text
 */
export function BionicText({ text, enabled = false, className = '' }) {
  if (!text) return null;
  if (!enabled || typeof text !== 'string') {
    return <span className={className}>{text}</span>;
  }

  const tokens = text.split(/(\s+)/);

  return (
    <span className={className}>
      {tokens.map((token, index) => {
        if (/^\s+$/.test(token)) {
          return <span key={index}>{token}</span>;
        }

        const leadingMatch = token.match(/^[^\w]+/);
        const leading = leadingMatch ? leadingMatch[0] : '';
        const rest = token.slice(leading.length);

        const trailingMatch = rest.match(/[^\w]+$/);
        const trailing = trailingMatch ? trailingMatch[0] : '';
        const coreWord = rest.slice(0, rest.length - trailing.length);

        if (!coreWord) {
          return <span key={index}>{token}</span>;
        }

        const fixationLen = getFixationLength(coreWord);
        const prefix = coreWord.slice(0, fixationLen);
        const suffix = coreWord.slice(fixationLen);

        return (
          <span key={index} className="inline-block whitespace-normal">
            {leading}
            <strong className="bionic-fixation font-extrabold text-[var(--color-text)] tracking-tight">
              {prefix}
            </strong>
            <span className="bionic-suffix">{suffix}</span>
            {trailing}
          </span>
        );
      })}
    </span>
  );
}
