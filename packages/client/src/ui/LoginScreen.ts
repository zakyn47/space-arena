import { authenticate, type AuthMode } from '../api';

export class LoginScreen {
  constructor(
    private readonly form: HTMLFormElement,
    private readonly errorText: HTMLElement,
  ) {}

  waitForToken(message = ''): Promise<string> {
    this.form.hidden = false;
    this.errorText.textContent = message;
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
