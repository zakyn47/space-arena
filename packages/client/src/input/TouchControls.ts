import { IDLE_INPUT, zoneAt, type SelfState } from '@arena/shared';
import { abilityStates } from '../ui/Hud';
import type { InputSampler } from './InputSampler';

type HoldAction = 'reverse' | 'fire' | 'shield' | 'rocket' | 'mine';

const ACTIONS: readonly { readonly input: HoldAction; readonly key: string; readonly label: string }[] = [
  { input: 'fire', key: 'Space', label: 'Fire' },
  { input: 'shield', key: 'Shift', label: 'Shield' },
  { input: 'rocket', key: 'R', label: 'Rockets' },
  { input: 'mine', key: 'F', label: 'Mine' },
];

interface ActionView {
  readonly key: string;
  readonly button: HTMLButtonElement;
  readonly icon: HTMLImageElement;
  readonly label: HTMLElement;
  readonly status: HTMLElement;
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

export class TouchControls {
  private readonly root = node('div', 'touch-controls');
  private readonly stick = node('div', 'touch-stick');
  private readonly knob = node('div', 'touch-stick-knob', '✥');
  private readonly actions: ActionView[] = [];
  private readonly pointers = new Map<number, HTMLElement>();
  private readonly events = new AbortController();
  private stickPointer: number | null = null;
  private readonly reverse: ActionView;

  constructor(
    host: HTMLElement,
    private readonly input: InputSampler,
    onDock: () => void,
  ) {
    this.root.hidden = true;
    this.root.setAttribute('role', 'group');
    this.root.setAttribute('aria-label', 'Touch flight controls');
    this.stick.setAttribute('role', 'group');
    this.stick.setAttribute('aria-label', 'Flight stick: drag in the direction to fly; release to coast');
    const directions = node('span', 'touch-stick-turn');
    directions.append(node('span', '', '←'), node('span', '', '→'));
    this.stick.append(node('span', 'touch-stick-up', '↑'), node('span', 'touch-stick-down', 'DRAG TO FLY'), directions, this.knob);
    this.stick.addEventListener('pointerdown', (event) => {
      if (this.stickPointer !== null || event.button !== 0) return;
      event.preventDefault();
      this.stickPointer = event.pointerId;
      this.capture(event.pointerId, this.stick);
      this.moveStick(event);
    }, { signal: this.events.signal });
    const buttons = node('div', 'touch-actions');
    for (const action of ACTIONS) {
      const view = this.createAction(action.key, action.label);
      view.button.dataset.input = action.input;
      this.bindHold(view, action.input);
      buttons.append(view.button);
    }
    this.reverse = this.createAction('S', 'Reverse');
    this.reverse.icon.src = '/ui/gear_thruster.png';
    this.reverse.status.textContent = 'Hold to reverse';
    this.bindHold(this.reverse, 'reverse');
    buttons.append(this.reverse.button);
    const dock = this.createAction('E', 'Dock');
    dock.button.classList.add('touch-dock');
    dock.button.addEventListener('click', onDock, { signal: this.events.signal });
    buttons.append(dock.button);
    this.root.append(this.stick, buttons);
    host.append(this.root);
    const options = { signal: this.events.signal };
    window.addEventListener('pointermove', (event) => {
      if (event.pointerId !== this.stickPointer) return;
      event.preventDefault();
      this.moveStick(event);
    }, options);
    window.addEventListener('pointerup', (event) => this.release(event.pointerId), options);
    window.addEventListener('pointercancel', (event) => this.release(event.pointerId), options);
    this.root.addEventListener('lostpointercapture', (event) => this.release(event.pointerId), options);
    this.root.addEventListener('contextmenu', (event) => event.preventDefault(), options);
    window.addEventListener('blur', this.releaseAll, options);
    window.addEventListener('resize', this.releaseAll, options);
    document.addEventListener('visibilitychange', this.releaseAll, options);
  }

  update(self: SelfState): void {
    this.root.hidden = self.docked;
    if (self.docked) this.releaseAll();
    this.reverse.button.disabled = self.docked;
    const abilities = abilityStates(self, zoneAt(self.x, self.y) !== undefined);
    for (const view of this.actions) {
      const ability = abilities.find((state) => state.key === view.key);
      if (!ability) continue;
      view.button.disabled = ability.unavailable;
      view.button.classList.toggle('active', ability.active);
      view.status.textContent = ability.status;
      view.label.textContent = ability.label;
      if (view.icon.getAttribute('src') !== ability.icon) view.icon.src = ability.icon;
    }
  }

  destroy(): void {
    this.releaseAll();
    this.events.abort();
    this.root.remove();
  }

  private createAction(key: string, label: string): ActionView {
    const button = node('button', 'touch-action');
    button.type = 'button';
    button.disabled = true;
    button.setAttribute('aria-label', key === 'E' ? 'Dock at station' : `${label} (hold)`);
    const icon = node('img', 'touch-action-icon');
    icon.alt = '';
    const status = node('span', 'touch-action-status');
    const labelNode = node('span', 'touch-action-label', label);
    button.append(icon, labelNode, status);
    const view = { key, button, icon, label: labelNode, status };
    this.actions.push(view);
    return view;
  }

  private bindHold(view: ActionView, input: HoldAction): void {
    view.button.dataset.input = input;
    view.button.addEventListener('pointerdown', (event) => {
      if (view.button.disabled || event.button !== 0) return;
      event.preventDefault();
      this.capture(event.pointerId, view.button);
      this.input.setPointerInput(event.pointerId, { ...IDLE_INPUT, [input]: true });
      view.button.classList.add('held');
      view.button.setAttribute('aria-pressed', 'true');
    }, { signal: this.events.signal });
  }

  private capture(pointerId: number, element: HTMLElement): void {
    this.pointers.set(pointerId, element);
    element.setPointerCapture(pointerId);
  }

  private moveStick(event: PointerEvent): void {
    const bounds = this.stick.getBoundingClientRect();
    const radius = bounds.width * 0.3;
    const dx = event.clientX - bounds.left - bounds.width / 2;
    const dy = event.clientY - bounds.top - bounds.height / 2;
    const scale = Math.min(1, radius / Math.max(1, Math.hypot(dx, dy)));
    const x = dx * scale;
    const y = dy * scale;
    this.knob.style.transform = `translate(${x}px, ${y}px)`;
    this.stick.classList.add('held');
    this.input.setPointerStick(event.pointerId, x / radius, y / radius);
  }

  private release(pointerId: number): void {
    const element = this.pointers.get(pointerId);
    if (!element) return;
    this.pointers.delete(pointerId);
    this.input.setPointerInput(pointerId, null);
    if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
    if (![...this.pointers.values()].includes(element)) {
      element.classList.remove('held');
      element.setAttribute('aria-pressed', 'false');
    }
    if (pointerId !== this.stickPointer) return;
    this.stickPointer = null;
    this.knob.style.transform = '';
  }

  private readonly releaseAll = (): void => {
    for (const pointerId of [...this.pointers.keys()]) this.release(pointerId);
    this.input.clearPointers();
  };
}
