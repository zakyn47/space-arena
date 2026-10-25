import { DOCK_RANGE, ORDNANCE_NAMES, SALVAGE_CAPACITY, captainLevel, captainPoints, captainNeedsTraining, statsFor, type Ordnance, type RadarBlip, type SafeZone, type SelfState } from '@arena/shared';

const RADAR_COLORS: Readonly<Record<RadarBlip['kind'], string>> = { player: '#ffffff', pirate: '#ff4d4d', boss: '#c04bff', repair: '#3cffb0', speed: '#ffb23c' };
const RADAR_DOT_SIZES: Readonly<Record<RadarBlip['kind'], number>> = { player: 2, pirate: 2, boss: 6, repair: 4, speed: 4 };

export const ORDNANCE_ICONS: Readonly<Record<Ordnance, string>> = { rockets: '/ui/icon_rocket.png', mines: '/ui/icon_mine.png', plasma: '/ui/icon_plasma.png' };
const ORDNANCE_HINTS: Readonly<Record<Ordnance, string>> = { rockets: 'Hold to fire', mines: 'Hold to drop', plasma: 'Hold to fire' };

function disabledSeconds(self: SelfState): number | null {
  return self.shieldDisrupted > 0 ? Math.ceil(self.shieldDisrupted) : null;
}

function shieldSuffix(self: SelfState): string {
  const disabled = disabledSeconds(self);
  if (disabled !== null) return ` (DISABLED ${disabled}s)`;
  return self.shieldUp ? ' (UP)' : '';
}

export interface MinimapDot {
  readonly x: number;
  readonly y: number;
  readonly color: string;
  readonly size: number;
}

export function minimapDots(blips: readonly RadarBlip[], scale: number): MinimapDot[] {
  return blips.map((blip) => ({ x: blip.x * scale, y: blip.y * scale, color: RADAR_COLORS[blip.kind], size: RADAR_DOT_SIZES[blip.kind] }));
}

const EDGE_WARNING_DISTANCE = 900;
const EDGE_CONTACT = 30;

export function edgeWarning(self: SelfState, worldSize: number): string | null {
  const gap = Math.min(self.x, self.y, worldSize - self.x, worldSize - self.y);
  if (gap > EDGE_WARNING_DISTANCE) return null;
  if (gap <= EDGE_CONTACT) return "⚠ Arena edge — you can't fly further";
  return `⚠ Arena edge ahead — ${Math.round(gap)} px`;
}

export function dockPrompt(self: SelfState, inRange: boolean): string | null {
  if (self.docked && captainNeedsTraining(self.captain)) return 'Choose your starting captain skills to undock';
  if (self.docked) return 'Docked — press E to undock';
  if (self.canDock) return 'Press E to dock';
  if (inRange && self.dockCooldown > 0) return `Dock available in ${Math.ceil(self.dockCooldown)}s`;
  return null;
}

export function hudLines(self: SelfState, prompt: string | null): string[] {
  const lines = [
    `Hull ${Math.ceil(self.hull)} / ${Math.round(self.maxHull)}`,
    `Shield ${Math.floor(self.shieldEnergy)} / ${Math.round(self.maxShield)}${shieldSuffix(self)}`,
    `${ORDNANCE_NAMES[self.ordnance]} ${self.rockets} / ${self.maxRockets}`,
    `Cargo ${self.ore} / ${self.cargoCapacity} ore`,
    `Salvage ${self.salvage.length} / ${SALVAGE_CAPACITY}`,
    `Carried ${self.carriedCredits} cr (at risk)`,
    `Banked ${self.bankedCredits} cr`,
    ...(self.speedBoost > 0 ? [`Speed boost ${Math.ceil(self.speedBoost)}s`] : []),
  ];
  return prompt ? [...lines, prompt] : lines;
}

export interface AbilityState {
  readonly label: string;
  readonly key: string;
  readonly icon: string;
  readonly status: string;
  readonly active: boolean;
  readonly unavailable: boolean;
}

export function abilityStates(self: SelfState, inSafeZone: boolean): AbilityState[] {
  const stats = statsFor(self.build, self.captain);
  const blocked = self.docked ? 'Docked' : inSafeZone ? 'Safe zone' : null;
  const attackBlocked = blocked ?? (self.shieldUp ? 'Shield up' : null);
  const noWeapon = stats.weapons.length === 0;
  const noShield = self.maxShield === 0;
  const disabled = disabledSeconds(self);
  const noMining = stats.miningRate === 0;
  const cargoFull = self.ore >= self.cargoCapacity;
  return [
    {
      label: 'Guns', key: 'Space', icon: `/ui/gear_${stats.weapons[0]?.gearId ?? 'pulse_laser'}.png`,
      status: noWeapon ? 'No weapon' : attackBlocked ?? 'Hold to fire',
      active: false, unavailable: noWeapon || attackBlocked !== null,
    },
    {
      label: 'Shield', key: 'Shift', icon: '/ui/gear_shield_gen.png',
      status: noShield ? 'No generator' : blocked ?? (disabled !== null ? `Disabled ${disabled}s` : self.shieldUp ? 'Active' : self.shieldEnergy <= 0 ? 'Depleted' : 'Hold to raise'),
      active: self.shieldUp && blocked === null, unavailable: noShield || blocked !== null || disabled !== null || self.shieldEnergy <= 0,
    },
    {
      label: ORDNANCE_NAMES[self.ordnance], key: 'R', icon: ORDNANCE_ICONS[self.ordnance],
      status: self.rockets === 0 ? 'Empty' : attackBlocked ?? ORDNANCE_HINTS[self.ordnance],
      active: false, unavailable: self.rockets === 0 || attackBlocked !== null,
    },
    {
      label: 'Mining', key: 'F', icon: '/ui/gear_mining_laser.png',
      status: noMining ? 'Not installed' : attackBlocked ?? (cargoFull ? 'Cargo full' : self.miningTargetId !== null ? 'Mining' : 'Aim at rock'),
      active: self.miningTargetId !== null && attackBlocked === null && !noMining && !cargoFull,
      unavailable: noMining || attackBlocked !== null || cargoFull,
    },
    {
      label: 'Dock', key: 'E', icon: '/world/safe_zone_station.png',
      status: self.docked && captainNeedsTraining(self.captain) ? 'Choose skills' : self.docked ? 'Undock' : self.canDock ? 'Dock' : self.dockCooldown > 0 ? `${Math.ceil(self.dockCooldown)}s` : 'Near station',
      active: self.docked, unavailable: self.docked ? captainNeedsTraining(self.captain) : !self.canDock,
    },
  ];
}

function textNode(tag: 'div' | 'span' | 'kbd', className: string, text: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function resourceMeter(label: string, current: number, maximum: number, className: 'hull' | 'shield', alert = false): HTMLElement {
  const panel = textNode('div', `hud-resource ${className}`, '');
  const displayed = className === 'shield' ? Math.floor(current) : Math.ceil(current);
  panel.append(textNode('span', 'hud-label', label), textNode('span', 'hud-value', `${displayed} / ${Math.round(maximum)}`));
  const meter = document.createElement('meter');
  meter.min = 0;
  meter.max = Math.max(1, maximum);
  meter.value = Math.max(0, Math.min(current, maximum));
  meter.setAttribute('aria-label', label);
  if (alert || (maximum > 0 && current / maximum <= 0.25)) panel.classList.add('low');
  panel.append(meter);
  return panel;
}

function shieldMeter(self: SelfState): HTMLElement {
  const disabled = disabledSeconds(self);
  const label = disabled === null ? 'Shield energy' : `Shield disabled ${disabled}s`;
  return resourceMeter(label, self.shieldEnergy, self.maxShield, 'shield', disabled !== null);
}

function abilityTile(ability: AbilityState): HTMLElement {
  const tile = textNode('div', 'hud-ability', '');
  tile.classList.toggle('active', ability.active);
  tile.classList.toggle('unavailable', ability.unavailable);
  tile.title = `${ability.label} [${ability.key}] — ${ability.status}`;
  const icon = document.createElement('img');
  icon.src = ability.icon;
  icon.alt = '';
  tile.append(textNode('kbd', 'hud-key', ability.key), icon, textNode('span', 'hud-ability-name', ability.label), textNode('span', 'hud-ability-status', ability.status));
  return tile;
}

export class Hud {
  private radar: readonly RadarBlip[] = [];
  private renderedKey = '';

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
    const edge = self.docked ? null : edgeWarning(self, this.worldSize);
    const prompt = dockPrompt(self, inRange) ?? edge;
    const points = captainPoints(self.captain);
    const lines = [...hudLines(self, null).slice(3), `Captain Lv.${captainLevel(self.captain)} · ${points} skill point${points === 1 ? '' : 's'}`];
    const inSafeZone = this.zones.some((zone) => Math.hypot(self.x - zone.x, self.y - zone.y) <= zone.radius);
    const abilities = abilityStates(self, inSafeZone);
    const key = JSON.stringify([lines, prompt, self.hull, self.maxHull, self.shieldEnergy, self.maxShield, self.rockets, self.maxRockets, abilities]);
    if (key !== this.renderedKey) {
      this.renderedKey = key;
      const info = textNode('div', 'flight-info', '');
      for (const line of lines) info.append(textNode('div', '', line));
      const bar = textNode('div', 'combat-bar', '');
      bar.setAttribute('role', 'group');
      bar.setAttribute('aria-label', 'Ship status and abilities');
      const resources = textNode('div', 'hud-resources', '');
      const ammo = textNode('div', `hud-resource ammo${self.rockets === 0 ? ' low' : ''}`, '');
      ammo.append(textNode('span', 'hud-label', `${ORDNANCE_NAMES[self.ordnance]} ammo`), textNode('span', 'hud-value', `${self.rockets} / ${self.maxRockets}`));
      resources.append(resourceMeter('Hull integrity', self.hull, self.maxHull, 'hull'), shieldMeter(self), ammo);
      const tiles = textNode('div', 'hud-abilities', '');
      tiles.append(...abilities.map(abilityTile));
      bar.append(resources, tiles);
      const promptNode = textNode('div', 'hud-dock-prompt', prompt ?? '');
      promptNode.hidden = prompt === null;
      promptNode.classList.toggle('danger', prompt !== null && prompt === edge);
      this.root.replaceChildren(info, promptNode, bar);
    }
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
      context.fillRect(dot.x - dot.size / 2, dot.y - dot.size / 2, dot.size, dot.size);
    }
    context.strokeStyle = 'rgba(255, 90, 60, 0.85)';
    context.lineWidth = 2;
    context.strokeRect(1, 1, this.minimap.width - 2, this.minimap.height - 2);
    context.fillStyle = '#5ec8ff';
    context.fillRect(self.x * scale - 2, self.y * scale - 2, 4, 4);
  }
}
