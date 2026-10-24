interface LandscapeOrientation {
  lock?: (orientation: 'landscape') => Promise<void>;
}

export async function enterLandscape(host: Pick<HTMLElement, 'requestFullscreen'>, orientation: LandscapeOrientation): Promise<boolean> {
  await host.requestFullscreen();
  if (!orientation.lock) return false;
  try {
    await orientation.lock('landscape');
    return true;
  } catch {
    return false;
  }
}

export function setupMobileDisplay(): void {
  const controls = document.createElement('div');
  controls.className = 'mobile-display';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Landscape ⛶';
  const status = document.createElement('span');
  status.setAttribute('role', 'status');
  controls.append(button, status);
  document.body.append(controls);
  document.addEventListener('fullscreenchange', () => {
    button.textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Landscape ⛶';
    status.textContent = '';
  });
  button.addEventListener('click', () => { void toggle(); });

  async function toggle(): Promise<void> {
    button.disabled = true;
    status.textContent = '';
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      const orientation: ScreenOrientation & LandscapeOrientation = screen.orientation;
      const locked = await enterLandscape(document.documentElement, orientation);
      if (!locked) status.textContent = 'Enable auto-rotate and turn your phone sideways.';
    } catch {
      status.textContent = 'Fullscreen unavailable. Enable auto-rotate and turn your phone sideways.';
    } finally {
      button.disabled = false;
    }
  }
}
