import { TICK_RATE, type ServerMessage, type ShipState, type SnapshotMessage, type WelcomeMessage } from '@arena/shared';
import { InputSampler } from '../input/InputSampler';
import { Connection } from '../net/Connection';
import { Renderer } from '../render/Renderer';
import type { SpriteFactory } from '../render/SpriteFactory';
import { INTERPOLATION_DELAY_MS, Interpolator } from '../sim/Interpolator';
import { Predictor } from '../sim/Predictor';
import { Hud } from '../ui/Hud';
import { ShopPanel } from '../ui/ShopPanel';
import { Toast } from '../ui/Toast';

export interface GameDom {
  readonly gameRoot: HTMLElement;
  readonly hud: HTMLElement;
  readonly minimap: HTMLCanvasElement;
  readonly shop: HTMLElement;
  readonly toast: HTMLElement;
}

class ActiveGame {
  private readonly predictor = new Predictor();
  private readonly interpolator = new Interpolator();
  private readonly input = new InputSampler();
  private latest: SnapshotMessage | null = null;
  private inputTimer: ReturnType<typeof setInterval> | undefined;

  private constructor(
    private readonly connection: Connection,
    private readonly renderer: Renderer,
    private readonly hud: Hud,
    private readonly shop: ShopPanel,
    private readonly toast: Toast,
    private readonly dom: GameDom,
  ) {}

  static async start(welcome: WelcomeMessage, connection: Connection, sprites: SpriteFactory, dom: GameDom): Promise<ActiveGame> {
    dom.gameRoot.hidden = false;
    const renderer = await Renderer.create(dom.gameRoot, sprites, welcome.safeZones);
    const game = new ActiveGame(
      connection,
      renderer,
      new Hud(dom.hud, dom.minimap, welcome.safeZones, welcome.worldSize),
      new ShopPanel(dom.shop, (line) => connection.send({ type: 'buy', line })),
      new Toast(dom.toast),
      dom,
    );
    game.begin();
    return game;
  }

  handle(message: ServerMessage): void {
    switch (message.type) {
      case 'snapshot':
        this.onSnapshot(message);
        return;
      case 'died':
        this.toast.show(message.killer ? `Destroyed by ${message.killer}` : 'Ship destroyed');
        return;
      case 'buyResult':
        this.shop.showResult(message);
        return;
      default:
        return;
    }
  }

  stop(): void {
    clearInterval(this.inputTimer);
    this.input.detach();
    this.renderer.destroy();
    this.dom.gameRoot.hidden = true;
  }

  private begin(): void {
    this.input.attach(window);
    this.inputTimer = setInterval(() => this.sendInput(), 1_000 / TICK_RATE);
    this.renderer.onFrame(() => this.draw());
  }

  private sendInput(): void {
    const input = this.input.sample();
    const seq = this.predictor.predict(input);
    this.connection.send({ type: 'input', seq, ...input });
  }

  private onSnapshot(snapshot: SnapshotMessage): void {
    this.latest = snapshot;
    this.interpolator.push(snapshot.entities, performance.now());
    this.predictor.reconcile(snapshot.self, snapshot.lastSeq);
    this.hud.update(snapshot.self);
    this.shop.update(snapshot.self);
  }

  private draw(): void {
    if (!this.latest) return;
    const { self } = this.latest;
    const motion = this.predictor.current ?? self;
    const ownShip: ShipState = {
      kind: 'ship',
      id: self.id,
      name: 'you',
      x: motion.x,
      y: motion.y,
      vx: motion.vx,
      vy: motion.vy,
      angle: motion.angle,
      shieldUp: self.shieldUp,
      hullTier: self.loadout.hull,
    };
    const others = this.interpolator.sample(performance.now() - INTERPOLATION_DELAY_MS);
    this.renderer.render({ camera: motion, entities: [ownShip, ...others] });
  }
}

export function runSession(token: string, sprites: SpriteFactory, dom: GameDom): Promise<string> {
  return new Promise((resolve) => {
    let reason = 'connection lost';
    let game: ActiveGame | null = null;
    let closed = false;
    const connection = Connection.open(token, {
      onMessage: (message) => {
        if (message.type === 'kicked') {
          reason = message.reason;
          return;
        }
        if (message.type === 'welcome') {
          void ActiveGame.start(message, connection, sprites, dom).then((started) => {
            if (closed) started.stop();
            else game = started;
          });
          return;
        }
        game?.handle(message);
      },
      onClose: () => {
        closed = true;
        game?.stop();
        resolve(reason);
      },
    });
  });
}
