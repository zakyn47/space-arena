import type { SafeZone, SelfState } from '@arena/shared';

export function hudLines(self: SelfState): string[] {
  const lines = [
    `Hull ${Math.ceil(self.hull)} / ${Math.round(self.maxHull)}`,
    `Shield ${Math.floor(self.shieldEnergy)} / ${Math.round(self.maxShield)}${self.shieldUp ? ' (UP)' : ''}`,
    `Cargo ${self.ore} / ${self.cargoCapacity} ore`,
    `Carried ${self.carriedCredits} cr (at risk)`,
    `Banked ${self.bankedCredits} cr`,
  ];
  return self.docked ? [...lines, 'DOCKED'] : lines;
}

export class Hud {
  constructor(
    private readonly root: HTMLElement,
    private readonly minimap: HTMLCanvasElement,
    private readonly zones: readonly SafeZone[],
    private readonly worldSize: number,
  ) {}

  update(self: SelfState): void {
    this.root.replaceChildren(
      ...hudLines(self).map((line) => {
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
