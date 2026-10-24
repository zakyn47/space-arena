const TOAST_MS = 3_000;

export class Toast {
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly root: HTMLElement) {}

  show(text: string): void {
    this.root.textContent = text;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.root.textContent = '';
    }, TOAST_MS);
  }
}
