/**
 * Sanctuary Bridge — hands the current page to the SETU Sanctuary web app.
 *
 * Extracts readable content in-page (so the web app never has to re-fetch a
 * URL it may not be able to reach), stores it via the service worker, and opens
 * the workspace on the mind-map view.
 */

(() => {
  const { Feature, UI, Text } = window.SETU;

  class SanctuaryBridge extends Feature {
    static key = 'sanctuary';

    /** Capture the page and open the Sanctuary. */
    async send() {
      const payload = {
        title: document.title,
        url: location.href,
        capturedAt: new Date().toISOString(),
        text: Text.pageText(20000)
      };

      if (payload.text.length < 120) {
        UI.toast("There isn't enough readable text on this page to send.", { tone: 'warn' });
        return { ok: false, error: 'Not enough readable text on this page.' };
      }

      const response = await chrome.runtime.sendMessage({ action: 'sendToSanctuary', payload });

      if (response?.ok) {
        UI.toast('Sent to your Sanctuary', { tone: 'success' });
      } else {
        UI.toast(response?.error || 'Could not reach the Sanctuary.', { tone: 'error' });
      }
      return response;
    }
  }

  window.SETU.features.set('sanctuary', SanctuaryBridge);
})();
