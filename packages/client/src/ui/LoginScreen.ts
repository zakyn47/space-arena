import { authenticate, type AuthMode } from '../api';
import { showHighscores } from './highscores';
import type { SavedPilot } from './savedPilot';

function child<T extends HTMLElement>(root: HTMLElement, selector: string, type: { new (): T; prototype: T }): T {
  const found = root.querySelector(selector);
  if (!(found instanceof type)) throw new Error(`missing ${selector}`);
  return found;
}

export class LoginScreen {
  private readonly resume: HTMLElement;
  private readonly fields: HTMLElement;

  constructor(
    private readonly form: HTMLFormElement,
    private readonly errorText: HTMLElement,
  ) {
    this.resume = child(form, '#resume-pilot', HTMLElement);
    this.fields = child(form, '#login-fields', HTMLElement);
    child(form, '#resume-switch', HTMLButtonElement).addEventListener('click', () => this.showFields());
    for (const tab of form.querySelectorAll<HTMLButtonElement>('[role="tab"]')) {
      tab.addEventListener('click', () => this.showTab(tab.dataset.tab ?? 'play'));
    }
  }

  waitForPilot(message: string, saved: SavedPilot | null): Promise<SavedPilot> {
    this.form.hidden = false;
    this.errorText.textContent = message;
    if (message) this.showTab('play');
    if (saved) this.showResume(saved.username);
    else this.showFields();
    return new Promise((resolve) => {
      const finish = (pilot: SavedPilot): void => {
        this.form.removeEventListener('submit', onSubmit);
        resumeButton.removeEventListener('click', onResume);
        this.form.hidden = true;
        resolve(pilot);
      };
      const onSubmit = (event: SubmitEvent): void => {
        event.preventDefault();
        void this.submit(this.modeOf(event)).then((pilot) => {
          if (pilot) finish(pilot);
        });
      };
      const onResume = (): void => {
        if (saved) finish(saved);
      };
      const resumeButton = child(this.form, '#resume-play', HTMLButtonElement);
      this.form.addEventListener('submit', onSubmit);
      resumeButton.addEventListener('click', onResume);
    });
  }

  private showResume(username: string): void {
    child(this.form, '#resume-name', HTMLElement).textContent = username;
    this.resume.hidden = false;
    this.fields.hidden = true;
  }

  private showFields(): void {
    this.resume.hidden = true;
    this.fields.hidden = false;
  }

  private showTab(name: string): void {
    for (const tab of this.form.querySelectorAll<HTMLButtonElement>('[role="tab"]')) {
      tab.setAttribute('aria-selected', String(tab.dataset.tab === name));
    }
    for (const panel of this.form.querySelectorAll<HTMLElement>('[role="tabpanel"]')) {
      panel.hidden = panel.dataset.panel !== name;
    }
    const highscores = this.form.querySelector('#highscores-body');
    if (name === 'highscores' && highscores instanceof HTMLTableSectionElement) void showHighscores(highscores);
  }

  private modeOf(event: SubmitEvent): AuthMode {
    return event.submitter instanceof HTMLButtonElement && event.submitter.value === 'register' ? 'register' : 'login';
  }

  private async submit(mode: AuthMode): Promise<SavedPilot | null> {
    const data = new FormData(this.form);
    const username = String(data.get('username') ?? '');
    try {
      const result = await authenticate(mode, username, String(data.get('password') ?? ''));
      if (result.ok) return { username, token: result.token };
      this.errorText.textContent = result.error;
    } catch {
      this.errorText.textContent = 'network error';
    }
    return null;
  }
}
