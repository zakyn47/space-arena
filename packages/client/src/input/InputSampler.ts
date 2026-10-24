import { IDLE_INPUT, type ShipInput } from '@arena/shared';

type InputKey = keyof ShipInput;

const KEY_MAP: Readonly<Record<string, InputKey>> = {
  KeyW: 'thrust',
  KeyS: 'reverse',
  KeyA: 'left',
  KeyD: 'right',
  Space: 'fire',
  ShiftLeft: 'shield',
  ShiftRight: 'shield',
  KeyR: 'rocket',
};

const DOCK_KEY = 'KeyE';

export class InputSampler {
  private readonly pressed = new Set<InputKey>();
  private target: Window | null = null;

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.handleKey(event.code, true, event.repeat)) event.preventDefault();
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (this.handleKey(event.code, false, false)) event.preventDefault();
  };

  private readonly onBlur = (): void => {
    this.pressed.clear();
  };

  constructor(private readonly onDock: () => void = () => {}) {}

  attach(target: Window): void {
    this.target = target;
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.onBlur);
  }

  detach(): void {
    this.target?.removeEventListener('keydown', this.onKeyDown);
    this.target?.removeEventListener('keyup', this.onKeyUp);
    this.target?.removeEventListener('blur', this.onBlur);
    this.target = null;
    this.pressed.clear();
  }

  handleKey(code: string, down: boolean, repeat: boolean): boolean {
    if (code === DOCK_KEY) {
      if (down && !repeat) this.onDock();
      return true;
    }
    const key = KEY_MAP[code];
    if (!key) return false;
    if (down) this.pressed.add(key);
    else this.pressed.delete(key);
    return true;
  }

  sample(): ShipInput {
    return {
      ...IDLE_INPUT,
      thrust: this.pressed.has('thrust'),
      reverse: this.pressed.has('reverse'),
      left: this.pressed.has('left'),
      right: this.pressed.has('right'),
      fire: this.pressed.has('fire'),
      shield: this.pressed.has('shield'),
      rocket: this.pressed.has('rocket'),
    };
  }
}
