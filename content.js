(() => {
  'use strict';
  const BUTTON = 'yt-popout-button';
  const boundVideos = new WeakSet();
  let scheduled = false;
  let busy = false;
  let messageTimer;
  let popout = null;

  function getVideo(player) {
    return player.querySelector('video.html5-main-video') || player.querySelector('video');
  }

  function sync(player, button) {
    const video = getVideo(player);
    const active = Boolean(popout?.player === player || (video && document.pictureInPictureElement === video));
    const label = active ? 'Return video to tab' : 'Pop out player';
    if (button.title !== label) button.title = label;
    if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);
    if (button.getAttribute('aria-pressed') !== String(active)) button.setAttribute('aria-pressed', String(active));
    const disabled = (!window.documentPictureInPicture && !document.pictureInPictureEnabled) || !video || video.readyState === 0 || video.videoWidth === 0;
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

  async function openPopout(player, video, button) {
    const pip = await window.documentPictureInPicture.requestWindow({ width: 480, height: 320 });
    const doc = pip.document;
    doc.title = 'YouTube Popout';
    const style = doc.createElement('style');
    style.textContent = `
      :root { color-scheme: dark; font: 13px/1.4 Arial,sans-serif; }
      * { box-sizing: border-box; }
      body { margin: 0; height: 100vh; display: flex; flex-direction: column; background: #000; color: #fff; }
      .stage { position: relative; flex: 1; min-height: 0; overflow: hidden; }
      .stage .html5-video-player { position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important; background: #000 !important; }
      .stage .html5-video-player > :not(.html5-video-container) { display: none !important; }
      .stage .html5-video-container { position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important; }
      .stage video { position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important; object-fit: contain !important; }
      .controls { display: flex; gap: 8px; align-items: center; padding: 6px 8px; min-height: 42px; background: #171717; }
      button { flex-shrink: 0; width: 30px; height: 30px; display: grid; place-items: center; background: transparent; border: 0; color: #fff; border-radius: 4px; cursor: pointer; }
      button:hover { background: #383838; }
      button:focus-visible, input:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
      svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
      input { min-width: 32px; width: 100%; flex: 1; accent-color: #fff; cursor: pointer; }
      output { min-width: 34px; text-align: right; font-variant-numeric: tabular-nums; }
    `;
    doc.head.append(style);
    const stage = doc.createElement('div'); stage.className = 'stage';
    const controls = doc.createElement('div'); controls.className = 'controls';
    const iconButton = (label, paths) => {
      const control = doc.createElement('button');
      control.type = 'button'; control.title = label; control.setAttribute('aria-label', label);
      const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
      for (const d of paths) { const path = doc.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', d); svg.append(path); }
      control.append(svg); return control;
    };
    const play = iconButton('Pause', ['M9 4v16M15 4v16']);
    const mute = iconButton('Mute', ['m11 5-6 4H2v6h3l6 4z', 'M15.5 8.5a5 5 0 0 1 0 7', 'M19 5a10 10 0 0 1 0 14']);
    const slider = doc.createElement('input');
    slider.type = 'range'; slider.min = '0'; slider.max = '100'; slider.step = '1'; slider.setAttribute('aria-label', 'Volume');
    const percent = doc.createElement('output'); percent.setAttribute('aria-hidden', 'true');
    const back = iconButton('Return video to tab', ['M9 14 4 9l5-5', 'M4 9h11a5 5 0 0 1 5 5v5']);
    const update = () => {
      const value = video.muted ? 0 : Math.round(video.volume * 100);
      slider.value = String(value); percent.value = value + '%';
      slider.setAttribute('aria-valuetext', value + '%');
      mute.setAttribute('aria-label', video.muted ? 'Unmute' : 'Mute'); mute.title = video.muted ? 'Unmute' : 'Mute';
      mute.setAttribute('aria-pressed', String(video.muted));
      play.setAttribute('aria-label', video.paused ? 'Play' : 'Pause'); play.title = video.paused ? 'Play' : 'Pause';
      play.querySelector('path').setAttribute('d', video.paused ? 'm8 4 12 8-12 8z' : 'M9 4v16M15 4v16');
    };
    play.addEventListener('click', () => { if (video.paused) video.play().catch(() => {}); else video.pause(); });
    mute.addEventListener('click', () => { video.muted = !video.muted; });
    slider.addEventListener('input', () => { video.volume = Number(slider.value) / 100; video.muted = video.volume === 0; });
    back.addEventListener('click', () => pip.close());
    controls.append(play, mute, slider, percent, back);
    doc.body.append(stage, controls);
    const marker = document.createComment('YouTube Popout return position');
    player.before(marker);
    const parent = marker.parentNode;
    popout = { player, window: pip };
    // Move the complete player so YouTube retains its video references and listeners.
    stage.append(player);
    for (const event of ['volumechange', 'play', 'pause']) video.addEventListener(event, update);
    update(); sync(player, button);
    const restore = () => {
      if (popout?.window !== pip) return;
      if (marker.isConnected) marker.replaceWith(player);
      else if (parent?.isConnected) parent.append(player);
      popout = null;
      for (const event of ['volumechange', 'play', 'pause']) video.removeEventListener(event, update);
      document.removeEventListener('yt-navigate-start', close);
      sync(player, button); schedule();
    };
    const close = () => pip.close();
    pip.addEventListener('pagehide', restore, { once: true });
    document.addEventListener('yt-navigate-start', close);
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
      if (popout) {
        popout.window.close();
      } else if (document.pictureInPictureElement === video) {
        await document.exitPictureInPicture();
      } else if (window.documentPictureInPicture) {
        await openPopout(player, video, button);
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
