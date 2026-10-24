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
  KeyF: 'mine',
};

const DOCK_KEY = 'KeyE';

function isEditing(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select') !== null);
}

export class InputSampler {
  private readonly pressed = new Set<InputKey>();
  private target: Window | null = null;

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.handleKey(event.code, true, event.repeat, isEditing(event.target))) event.preventDefault();
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (this.handleKey(event.code, false, false, isEditing(event.target))) event.preventDefault();
  };

  private readonly onBlur = (): void => {
    this.pressed.clear();
  };

  private readonly onFocusIn = (event: FocusEvent): void => {
    if (isEditing(event.target)) this.pressed.clear();
  };

  constructor(private readonly onDock: () => void = () => {}) {}

  attach(target: Window): void {
    this.target = target;
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.onBlur);
    target.addEventListener('focusin', this.onFocusIn);
  }

  detach(): void {
    this.target?.removeEventListener('keydown', this.onKeyDown);
    this.target?.removeEventListener('keyup', this.onKeyUp);
    this.target?.removeEventListener('blur', this.onBlur);
    this.target?.removeEventListener('focusin', this.onFocusIn);
    this.target = null;
    this.pressed.clear();
  }

  handleKey(code: string, down: boolean, repeat: boolean, editing = false): boolean {
    if (editing) {
      this.pressed.clear();
      return false;
    }
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
      mine: this.pressed.has('mine'),
    };
  }
}
