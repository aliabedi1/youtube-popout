(() => {
  'use strict';
  const BUTTON = 'yt-popout-button';
  const boundVideos = new WeakSet();
  let scheduled = false;
  let busy = false;
  let messageTimer;

  function getVideo(player) {
    return player.querySelector('video.html5-main-video') || player.querySelector('video');
  }

  function sync(player, button) {
    const video = getVideo(player);
    const active = Boolean(video && document.pictureInPictureElement === video);
    const label = active ? 'Return video to tab' : 'Pop out player';
    if (button.title !== label) button.title = label;
    if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);
    if (button.getAttribute('aria-pressed') !== String(active)) button.setAttribute('aria-pressed', String(active));
    const disabled = !document.pictureInPictureEnabled || !video || video.readyState === 0 || video.videoWidth === 0;
    if (button.disabled !== disabled) button.disabled = disabled;
  }

  function showMessage(player, text) {
    clearTimeout(messageTimer);
    let message = player.querySelector('.yt-popout-message');
    if (!message) {
      message = document.createElement('div');
      message.className = 'yt-popout-message';
      message.setAttribute('role', 'status');
      player.append(message);
    }
    message.textContent = text;
    messageTimer = setTimeout(() => message.remove(), 4500);
  }

  async function toggle(player, button) {
    if (busy) return;
    const video = getVideo(player);
    if (!video || video.readyState === 0 || video.videoWidth === 0) {
      showMessage(player, 'Start the video, then try Pop out player again.');
      return;
    }
    busy = true;
    try {
      if (document.pictureInPictureElement === video) {
        await document.exitPictureInPicture();
      } else {
        // Keep this call in the click handler to preserve Chrome's user activation.
        const disabled = video.disablePictureInPicture;
        video.disablePictureInPicture = false;
        try {
          await video.requestPictureInPicture();
        } finally {
          video.disablePictureInPicture = disabled;
        }
      }
    } catch (error) {
      console.debug('[YouTube Popout]', error.name);
      showMessage(player, 'Could not pop out this video. Play it and click again.');
    } finally {
      busy = false;
      sync(player, button);
    }
  }

  function createButton(player) {
    const button = document.createElement('button');
    button.className = 'ytp-button ' + BUTTON;
    button.type = 'button';
    // Lucide picture-in-picture-2, ISC licensed; see icons/LICENSE.
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' })) svg.setAttribute(key, value);
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M21 9V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10c0 1.1.9 2 2 2h4');
    const rect = document.createElementNS(ns, 'rect');
    for (const [key, value] of Object.entries({ x: '12', y: '13', width: '10', height: '7', rx: '2' })) rect.setAttribute(key, value);
    svg.append(path, rect);
    button.append(svg);
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      void toggle(player, button);
    });
    return button;
  }

  function install() {
    scheduled = false;
    for (const player of document.querySelectorAll('.html5-video-player')) {
      const settings = player.querySelector('.ytp-settings-button');
      if (!settings?.parentElement) continue;
      let button = player.querySelector('.' + BUTTON);
      if (!button) button = createButton(player);
      // Follow Settings even if YouTube rebuilds or rearranges the control bar.
      if (settings.nextElementSibling !== button) settings.after(button);
      const video = getVideo(player);
      if (video && !boundVideos.has(video)) {
        boundVideos.add(video);
        for (const event of ['enterpictureinpicture', 'leavepictureinpicture', 'loadedmetadata', 'emptied', 'resize']) {
          video.addEventListener(event, schedule);
        }
      }
      sync(player, button);
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(install);
  }

  // YouTube navigates without reloading; watch for new players and controls.
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('yt-navigate-finish', schedule);
  install();
})();
