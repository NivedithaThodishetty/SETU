/**
 * SETU — one-time camera grant.
 *
 * Opened in a tab when Gaze Scroll finds it has no camera permission. The
 * `getUserMedia` call below runs on the extension's own origin, from a real
 * user gesture, so Chrome shows its standard prompt and — crucially — the
 * grant belongs to SETU rather than to whatever website happened to be open.
 * The camera frame the content script embeds then works everywhere without
 * ever prompting again.
 *
 * The stream is stopped the instant permission is confirmed. The point of this
 * page is the grant, not the video.
 */

(() => {
  const status = document.querySelector('.status');
  const preview = document.querySelector('video');
  const grantButton = document.querySelector('[data-act="grant"]');

  let stream = null;

  // Guarded so the page also renders when opened outside an extension context
  // (a designer previewing it, a reviewer opening the file directly). The
  // palette simply falls back to light.
  if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
    chrome.storage.sync.get('setuState', ({ setuState }) => {
      self.setuApplyAppearance?.(setuState?.settings?.appearance);
    });
  }

  function say(message, tone = 'info') {
    status.textContent = message;
    status.dataset.tone = tone;
    status.dataset.show = 'true';
  }

  function release() {
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    preview.srcObject = null;
    preview.dataset.show = 'false';
  }

  grantButton.addEventListener('click', async () => {
    grantButton.disabled = true;
    say('Waiting for you to choose in the browser prompt…');

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'user' },
        audio: false
      });
    } catch (error) {
      grantButton.disabled = false;

      if (error.name === 'NotAllowedError') {
        say(
          'The camera is still blocked. Click the camera icon in the address bar, choose "Always allow", then try again.',
          'error'
        );
      } else if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') {
        say('No camera was found on this device, so Gaze Scroll cannot run here.', 'error');
      } else if (error.name === 'NotReadableError') {
        say('The camera is in use by another app. Close it and try again.', 'error');
      } else {
        say(`The camera could not start: ${error.message}`, 'error');
      }
      return;
    }

    preview.srcObject = stream;
    preview.dataset.show = 'true';
    say(
      'Camera allowed. Gaze Scroll will work on every site now — go back to your page and switch it on.',
      'ok'
    );

    // Two seconds is enough for the preview to prove the camera really works,
    // and leaving it running afterwards would be its own small betrayal.
    setTimeout(() => {
      release();
      grantButton.disabled = false;
      grantButton.textContent = 'Check again';
    }, 2000);
  });

  document.querySelector('[data-act="close"]').addEventListener('click', () => {
    release();
    window.close();
  });

  window.addEventListener('pagehide', release);
})();
