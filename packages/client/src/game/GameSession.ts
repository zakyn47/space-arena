import { TICK_RATE, type SelfState, type ServerMessage, type ShipState, type SnapshotMessage, type WelcomeMessage } from '@arena/shared';
import { InputSampler } from '../input/InputSampler';
import { TouchControls } from '../input/TouchControls';
import { Connection } from '../net/Connection';
import { Renderer } from '../render/Renderer';
import type { SpriteFactory } from '../render/SpriteFactory';
import { INTERPOLATION_DELAY_MS, Interpolator } from '../sim/Interpolator';
import { Predictor } from '../sim/Predictor';
import { BuildMenu } from '../ui/BuildMenu';
import { Hud } from '../ui/Hud';
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
  private readonly input: InputSampler;
  private readonly touch: TouchControls;
  private latest: SnapshotMessage | null = null;
  private respawned = false;
  private inputTimer: ReturnType<typeof setInterval> | undefined;
  private thrusting = false;

  private constructor(
    private readonly connection: Connection,
    private readonly renderer: Renderer,
    private readonly hud: Hud,
    private readonly menu: BuildMenu,
    private readonly toast: Toast,
    private readonly dom: GameDom,
  ) {
    const dock = (): void => this.connection.send({ type: 'dock' });
    this.input = new InputSampler(dock);
    this.touch = new TouchControls(dom.gameRoot, this.input, dock);
  }

  static async start(welcome: WelcomeMessage, connection: Connection, sprites: SpriteFactory, dom: GameDom): Promise<ActiveGame> {
    dom.gameRoot.hidden = false;
    const renderer = await Renderer.create(dom.gameRoot, sprites, welcome.safeZones, welcome.worldSize);
    const game = new ActiveGame(
      connection,
      renderer,
      new Hud(dom.hud, dom.minimap, welcome.safeZones, welcome.worldSize),
      new BuildMenu(dom.shop, (message) => connection.send(message)),
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
        this.respawned = true;
        this.toast.show(message.killer ? `Destroyed by ${message.killer}` : 'Ship destroyed');
        return;
      case 'shopResult':
        this.menu.showResult(message);
        return;
      default:
        return;
    }
  }

  stop(): void {
    clearInterval(this.inputTimer);
    this.touch.destroy();
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
    const input = this.input.sample(this.predictor.current?.angle ?? 0, this.predictor.turnRate / TICK_RATE);
    this.thrusting = input.thrust;
    const seq = this.predictor.predict(input);
    this.connection.send({ type: 'input', seq, ...input });
  }

  private onSnapshot(snapshot: SnapshotMessage): void {
    this.announceChanges(snapshot.self);
    this.latest = snapshot;
    this.interpolator.push(snapshot.entities, performance.now());
    this.predictor.reconcile(snapshot.self, snapshot.lastSeq);
    if (snapshot.radar) this.hud.setRadar(snapshot.radar);
    if (snapshot.hits) this.renderer.showHits(snapshot.hits, INTERPOLATION_DELAY_MS / 1_000);
    this.hud.update(snapshot.self);
    this.menu.update(snapshot.self);
    this.touch.update(snapshot.self);
  }

  private announceChanges(self: SelfState): void {
    const previous = this.latest?.self;
    const respawned = this.respawned;
    this.respawned = false;
    if (!previous) return;
    if (self.shieldDisrupted > 0 && previous.shieldDisrupted <= 0) this.toast.show(`Shields disabled for ${Math.ceil(self.shieldDisrupted)}s`);
    if (self.speedBoost > 0 && previous.speedBoost <= 0) this.toast.show(`Speed boost ${Math.ceil(self.speedBoost)}s`);
    // Hull only rises in flight from a repair booster; docking and respawning also refill it.
    const repaired = Math.round(self.hull - previous.hull);
    if (!respawned && !self.docked && !previous.docked && repaired > 0) this.toast.show(`Hull repaired +${repaired}`);
  }

  private draw(): void {
    if (!this.latest) return;
    const { self } = this.latest;
    const motion = this.predictor.sample() ?? self;
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
      hullId: self.build.hullId,
      npc: null,
      miningTargetId: self.miningTargetId,
      ...(self.darkMatter > 0 ? { darkMatter: true as const } : {}),
      ...(this.thrusting ? { thrusting: true as const } : {}),
    };
    const others = this.interpolator.sample(performance.now() - INTERPOLATION_DELAY_MS);
    this.renderer.render({ camera: motion, entities: [ownShip, ...others], selfId: self.id });
  }
}

export function runSession(token: string, sprites: SpriteFactory, dom: GameDom, onReady: () => void): Promise<string> {
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
            onReady();
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
