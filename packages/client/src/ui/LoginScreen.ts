import { authenticate, type AuthMode } from '../api';

export class LoginScreen {
  constructor(
    private readonly form: HTMLFormElement,
    private readonly errorText: HTMLElement,
  ) {
    for (const tab of form.querySelectorAll<HTMLButtonElement>('[role="tab"]')) {
      tab.addEventListener('click', () => this.showTab(tab.dataset.tab ?? 'play'));
    }
  }

  waitForToken(message = ''): Promise<string> {
    this.form.hidden = false;
    this.errorText.textContent = message;
    if (message) this.showTab('play');
    return new Promise((resolve) => {
      const onSubmit = (event: SubmitEvent): void => {
        event.preventDefault();
        void this.submit(this.modeOf(event)).then((token) => {
          if (token === null) return;
          this.form.removeEventListener('submit', onSubmit);
          this.form.hidden = true;
          resolve(token);
        });
      };
      this.form.addEventListener('submit', onSubmit);
    });
  }

  private showTab(name: string): void {
    for (const tab of this.form.querySelectorAll<HTMLButtonElement>('[role="tab"]')) {
      tab.setAttribute('aria-selected', String(tab.dataset.tab === name));
    }
    for (const panel of this.form.querySelectorAll<HTMLElement>('[role="tabpanel"]')) {
      panel.hidden = panel.dataset.panel !== name;
    }
  }

  private modeOf(event: SubmitEvent): AuthMode {
    return event.submitter instanceof HTMLButtonElement && event.submitter.value === 'register' ? 'register' : 'login';
  }

  private async submit(mode: AuthMode): Promise<string | null> {
    const data = new FormData(this.form);
    try {
      const result = await authenticate(mode, String(data.get('username') ?? ''), String(data.get('password') ?? ''));
      if (result.ok) return result.token;
      this.errorText.textContent = result.error;
    } catch {
      this.errorText.textContent = 'network error';
    }
    return null;
  }
}
