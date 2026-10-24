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
const STICK_DEAD_ZONE = 0.2;

type PointerInput =
  | { readonly kind: 'action'; readonly input: ShipInput }
  | { readonly kind: 'stick'; readonly x: number; readonly y: number };

export function flightStickInput(x: number, y: number, angle = 0, turnStep = 0): ShipInput {
  if (Math.hypot(x, y) <= STICK_DEAD_ZONE) return IDLE_INPUT;
  const target = Math.atan2(x, -y);
  const delta = Math.atan2(Math.sin(target - angle), Math.cos(target - angle));
  const tolerance = Math.max(turnStep / 2, 0.01);
  return { ...IDLE_INPUT, thrust: true, left: delta < -tolerance, right: delta > tolerance };
}

function isEditing(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select') !== null);
}

export class InputSampler {
  private readonly pressed = new Set<InputKey>();
  private readonly pointerInputs = new Map<number, PointerInput>();
  private target: Window | null = null;

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.handleKey(event.code, true, event.repeat, isEditing(event.target))) event.preventDefault();
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (this.handleKey(event.code, false, false, isEditing(event.target))) event.preventDefault();
  };

  private readonly onBlur = (): void => {
    this.pressed.clear();
    this.clearPointers();
  };

  private readonly onFocusIn = (event: FocusEvent): void => {
    if (isEditing(event.target)) this.onBlur();
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
    this.clearPointers();
  }

  handleKey(code: string, down: boolean, repeat: boolean, editing = false): boolean {
    if (editing) {
      this.onBlur();
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

  setPointerInput(pointerId: number, input: ShipInput | null): void {
    if (input === null) this.pointerInputs.delete(pointerId);
    else this.pointerInputs.set(pointerId, { kind: 'action', input });
  }

  setPointerStick(pointerId: number, x: number, y: number): void {
    this.pointerInputs.set(pointerId, { kind: 'stick', x, y });
  }

  clearPointers(): void {
    this.pointerInputs.clear();
  }

  private isPressed(key: InputKey, pointers: readonly ShipInput[]): boolean {
    if (this.pressed.has(key)) return true;
    for (const input of pointers) {
      if (input[key]) return true;
    }
    return false;
  }

  sample(angle = 0, turnStep = 0): ShipInput {
    const pointers = [...this.pointerInputs.values()].map((source) =>
      source.kind === 'stick' ? flightStickInput(source.x, source.y, angle, turnStep) : source.input,
    );
    return {
      ...IDLE_INPUT,
      thrust: this.isPressed('thrust', pointers),
      reverse: this.isPressed('reverse', pointers),
      left: this.isPressed('left', pointers),
      right: this.isPressed('right', pointers),
      fire: this.isPressed('fire', pointers),
      shield: this.isPressed('shield', pointers),
      rocket: this.isPressed('rocket', pointers),
      mine: this.isPressed('mine', pointers),
    };
  }
}
