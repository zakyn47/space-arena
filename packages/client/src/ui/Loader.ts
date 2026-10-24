export function loadingLabel(done: number, total: number): string {
  return total === 0 ? 'Preparing the hangar…' : `Loading sprites ${done} / ${total}`;
}

export class Loader {
  constructor(
    private readonly root: HTMLElement,
    private readonly status: HTMLElement,
    private readonly bar: HTMLProgressElement,
  ) {}

  show(text: string, progress: number | null = null): void {
    this.root.hidden = false;
    this.status.textContent = text;
    if (progress === null) this.bar.removeAttribute('value');
    else this.bar.value = progress;
  }

  hide(): void {
    this.root.hidden = true;
  }
}
