import { DOCK_RANGE, SALVAGE_CAPACITY, type RadarBlip, type SafeZone, type SelfState } from '@arena/shared';

const RADAR_COLORS: Readonly<Record<RadarBlip['kind'], string>> = { player: '#ffffff', pirate: '#ff4d4d' };
const RADAR_DOT = 2;

export interface MinimapDot {
  readonly x: number;
  readonly y: number;
  readonly color: string;
}

export function minimapDots(blips: readonly RadarBlip[], scale: number): MinimapDot[] {
  return blips.map((blip) => ({ x: blip.x * scale, y: blip.y * scale, color: RADAR_COLORS[blip.kind] }));
}

export function dockPrompt(self: SelfState, inRange: boolean): string | null {
  if (self.docked) return 'Docked — press E to undock';
  if (self.canDock) return 'Press E to dock';
  if (inRange && self.dockCooldown > 0) return `Dock available in ${Math.ceil(self.dockCooldown)}s`;
  return null;
}

export function hudLines(self: SelfState, prompt: string | null): string[] {
  const lines = [
    `Hull ${Math.ceil(self.hull)} / ${Math.round(self.maxHull)}`,
    `Shield ${Math.floor(self.shieldEnergy)} / ${Math.round(self.maxShield)}${self.shieldUp ? ' (UP)' : ''}`,
    `Rockets ${self.rockets} / ${self.maxRockets}`,
    `Cargo ${self.ore} / ${self.cargoCapacity} ore`,
    `Salvage ${self.salvage.length} / ${SALVAGE_CAPACITY}`,
    `Carried ${self.carriedCredits} cr (at risk)`,
    `Banked ${self.bankedCredits} cr`,
  ];
  return prompt ? [...lines, prompt] : lines;
}

export class Hud {
  private radar: readonly RadarBlip[] = [];

  constructor(
    private readonly root: HTMLElement,
    private readonly minimap: HTMLCanvasElement,
    private readonly zones: readonly SafeZone[],
    private readonly worldSize: number,
  ) {}

  setRadar(radar: readonly RadarBlip[]): void {
    this.radar = radar;
  }

  update(self: SelfState): void {
    const inRange = this.zones.some((zone) => Math.hypot(self.x - zone.x, self.y - zone.y) <= DOCK_RANGE);
    const lines = hudLines(self, dockPrompt(self, inRange));
    this.root.replaceChildren(
      ...lines.map((line) => {
        const row = document.createElement('div');
        row.textContent = line;
        return row;
      }),
    );
    this.drawMinimap(self);
  }

  private drawMinimap(self: SelfState): void {
    const context = this.minimap.getContext('2d');
    if (!context) return;
    const scale = this.minimap.width / this.worldSize;
    context.clearRect(0, 0, this.minimap.width, this.minimap.height);
    context.fillStyle = 'rgba(60, 255, 176, 0.35)';
    for (const zone of this.zones) {
      context.beginPath();
      context.arc(zone.x * scale, zone.y * scale, Math.max(3, zone.radius * scale), 0, Math.PI * 2);
      context.fill();
    }
    for (const dot of minimapDots(this.radar, scale)) {
      context.fillStyle = dot.color;
      context.fillRect(dot.x - RADAR_DOT / 2, dot.y - RADAR_DOT / 2, RADAR_DOT, RADAR_DOT);
    }
    context.fillStyle = '#5ec8ff';
    context.fillRect(self.x * scale - 2, self.y * scale - 2, 4, 4);
  }
}
