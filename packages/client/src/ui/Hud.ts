import { DOCK_RANGE, type SafeZone, type SelfState } from '@arena/shared';

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
    `Carried ${self.carriedCredits} cr (at risk)`,
    `Banked ${self.bankedCredits} cr`,
  ];
  return prompt ? [...lines, prompt] : lines;
}

export class Hud {
  constructor(
    private readonly root: HTMLElement,
    private readonly minimap: HTMLCanvasElement,
    private readonly zones: readonly SafeZone[],
    private readonly worldSize: number,
  ) {}

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
    context.fillStyle = '#5ec8ff';
    context.fillRect(self.x * scale - 2, self.y * scale - 2, 4, 4);
  }
}
