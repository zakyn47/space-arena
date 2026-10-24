import {
  HULLS,
  MAX_CAPTAIN_LEVEL,
  MAX_SKILL_RANK,
  captainLevel,
  captainNeedsTraining,
  captainPoints,
  experienceForLevel,
  MAX_ROCKETS_PER_PURCHASE,
  gearAt,
  gearCost,
  resaleValue,
  slotExists,
  type HullId,
  statsFor,
  type ClientMessage,
  type SelfState,
  type ShopFailure,
  type ShopResultMessage,
  type SlotRef,
} from '@arena/shared';
import { ORDNANCE_ICONS } from './Hud';
import { captainRows, gearLabel, gearOptions, hullCards, ordnanceOffers, salvageRows, slotRows, statSummary } from './buildMenuModel';

type Tab = 'ship' | 'hulls' | 'rockets' | 'captain';

const TABS: readonly { readonly id: Tab; readonly label: string }[] = [
  { id: 'ship', label: 'Loadout' },
  { id: 'hulls', label: 'Hull exchange' },
  { id: 'rockets', label: 'Ammunition' },
  { id: 'captain', label: 'Captain' },
];

const HULL_ROLES: Readonly<Record<HullId, string>> = {
  scout: 'Interceptor · Light frame, high speed and agile handling.',
  fighter: 'Frontline · Twin weapon mounts for a balanced combat build.',
  freighter: 'Industrial · Large cargo hold and three utility bays.',
  gunship: 'Heavy assault · Three weapons, twin shields, reinforced hull.',
};

const FAILURE_TEXT: Readonly<Record<ShopFailure, string>> = {
  not_docked: 'Dock first',
  insufficient_credits: 'Not enough banked credits',
  slot_mismatch: 'That item does not fit this slot',
  ammo_cap: 'Ammo racks are full',
  unknown_item: 'Not available',
  no_skill_points: 'No captain skill points available',
  skill_maxed: 'That captain skill is at maximum rank',
};

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

function button(text: string, enabled: boolean, onClick: () => void): HTMLButtonElement {
  const node = element('button', text);
  node.type = 'button';
  node.disabled = !enabled;
  node.addEventListener('click', onClick);
  return node;
}

export class BuildMenu {
  private tab: Tab = 'ship';
  private selectedSlot: SlotRef | null = null;
  private self: SelfState | null = null;
  private renderedKey = '';
  private resultText = '';

  constructor(
    private readonly root: HTMLElement,
    private readonly send: (message: ClientMessage) => void,
  ) {}

  update(self: SelfState): void {
    this.root.hidden = !self.docked;
    this.self = self;
    if (!self.docked) {
      this.selectedSlot = null;
      return;
    }
    if (captainNeedsTraining(self.captain)) this.tab = 'captain';
    if (this.selectedSlot && !slotExists(self.build, this.selectedSlot)) this.selectedSlot = null;
    this.render();
  }

  showResult(message: ShopResultMessage): void {
    this.resultText = message.ok ? 'Done' : FAILURE_TEXT[message.reason];
    this.render(true);
  }

  private render(force = false): void {
    const self = this.self;
    if (!self) return;
    const key = JSON.stringify([self.captain, self.build, self.salvage, self.bankedCredits, self.rockets, this.tab, this.selectedSlot, this.resultText]);
    if (!force && key === this.renderedKey) return;
    this.renderedKey = key;
    const focusKey = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.focus : undefined;
    const heading = element('div', '', 'hangar-header');
    const title = element('div');
    title.append(element('div', 'STATION SERVICES / DOCKED', 'eyebrow'), element('h2', 'Ship hangar'));
    const actions = element('div', '', 'hangar-actions');
    actions.append(element('strong', `${self.bankedCredits.toLocaleString()} cr`, 'credits'), button('Undock [E] →', !captainNeedsTraining(self.captain), () => this.send({ type: 'dock' })));
    heading.append(title, actions);
    const summary = element('div', '', 'stat-strip');
    for (const stat of statSummary(statsFor(self.build, self.captain))) summary.append(element('span', stat));
    const result = element('div', this.resultText, 'result');
    result.setAttribute('role', 'status');
    this.root.replaceChildren(heading, this.tabBar(), summary, this.tabBody(self), result);
    if (focusKey) {
      const target = Array.from(this.root.querySelectorAll<HTMLElement>('[data-focus]')).find((node) => node.dataset.focus === focusKey);
      target?.focus({ preventScroll: true });
    }
  }

  private select(tab: Tab): void {
    this.tab = tab;
    this.render();
  }

  private tabBar(): HTMLElement {
    const bar = element('div', '', 'tabs');
    for (const tab of TABS) {
      const label = tab.id === 'captain' ? `Captain (${this.self ? captainPoints(this.self.captain) : 0})` : tab.label;
      const enabled = tab.id === 'captain' || !this.self || !captainNeedsTraining(this.self.captain);
      const node = button(label, enabled, () => this.select(tab.id));
      node.setAttribute('aria-pressed', String(tab.id === this.tab));
      node.dataset.focus = `tab-${tab.id}`;
      bar.append(node);
    }
    return bar;
  }

  private tabBody(self: SelfState): HTMLElement {
    if (this.tab === 'captain') return this.captainTab(self);
    if (this.tab === 'hulls') return this.hullsTab(self);
    if (this.tab === 'rockets') return this.rocketsTab(self);
    return this.shipTab(self);
  }

  private shipTab(self: SelfState): HTMLElement {
    const body = element('div', '', 'list');
    const layout = element('div', '', 'loadout-layout');
    const preview = element('section', '', 'ship-preview');
    const hull = HULLS[self.build.hullId];
    preview.append(element('div', 'ACTIVE HULL', 'eyebrow'), element('h3', hull.name), element('p', HULL_ROLES[hull.id], 'muted'));
    const diagram = element('div', '', 'ship-diagram');
    const ship = element('img', '', 'hangar-ship');
    ship.src = `/ships/ship_${hull.id}.png`;
    ship.alt = `${hull.name} with selectable module hardpoints`;
    diagram.append(ship);
    const slots = element('div', '', 'module-list');
    slots.append(element('h3', 'Installed modules'), element('p', 'Select a hardpoint to fit or upgrade its module.', 'muted'));
    for (const row of slotRows(self.build)) {
      const selected = this.selectedSlot?.type === row.slot.type && this.selectedSlot.index === row.slot.index;
      const select = (): void => {
        this.selectedSlot = row.slot;
        this.render();
      };
      const point = button(row.code, true, select);
      point.className = `hardpoint ${row.slot.type}`;
      point.style.left = `${row.position.x}%`;
      point.style.top = `${row.position.y}%`;
      point.title = row.label;
      point.setAttribute('aria-label', row.label);
      point.setAttribute('aria-pressed', String(selected));
      point.dataset.focus = `point-${row.code}`;
      diagram.append(point);
      const module = button('', true, select);
      module.className = 'module-card';
      module.setAttribute('aria-pressed', String(selected));
      module.dataset.focus = `slot-${row.code}`;
      const icon = element('img');
      icon.alt = '';
      if (row.gear) icon.src = `/ui/gear_${row.gear.gearId}.png`;
      else icon.style.visibility = 'hidden';
      module.append(element('span', row.code, 'module-code'), icon, element('span', row.label), element('span', '›', 'module-arrow'));
      slots.append(module);
    }
    preview.append(diagram, element('p', 'Top view / select a labeled hardpoint', 'diagram-caption'));
    layout.append(preview, slots);
    body.append(layout);
    if (this.selectedSlot) body.append(this.gearList(self, this.selectedSlot));
    else body.append(element('p', 'Choose a module above to browse compatible equipment.', 'empty-state'));
    if (self.salvage.length > 0) body.append(element('h3', 'Recovered salvage'), ...this.salvageLines(self));
    return body;
  }

  private salvageLines(self: SelfState): HTMLElement[] {
    return salvageRows(self.build, self.salvage).map((row) => {
      const line = element('div', '', 'row');
      const icon = element('img');
      icon.alt = '';
      const gear = self.salvage[row.index];
      if (gear) icon.src = `/ui/gear_${gear.gearId}.png`;
      line.append(
        icon,
        element('span', row.label),
        ...row.slots.map((target) =>
          button(`Install → ${target.label}`, true, () =>
            this.send({ type: 'installSalvage', index: row.index, slot: target.slot }),
          ),
        ),
        button(`Sell (${row.salePrice} cr)`, true, () => this.send({ type: 'sellSalvage', index: row.index })),
      );
      return line;
    });
  }

  private gearList(self: SelfState, slot: SlotRef): HTMLElement {
    const list = element('div', '', 'list options');
    const installed = gearAt(self.build, slot);
    const header = element('div', '', 'equipment-header');
    header.append(element('h3', `${slot.type.charAt(0).toUpperCase()}${slot.type.slice(1)} ${slot.index + 1} / Equipment`));
    if (installed) {
      header.append(button(`Sell ${gearLabel(installed)} · ${resaleValue(gearCost(installed))} cr`, true, () => this.send({ type: 'sellGear', slot })));
    }
    list.append(header, element('p', 'Your installed module trades in for 50% of its value toward the listed price. Stat changes compare against your current build.', 'muted'));
    for (const option of gearOptions(self.build, slot, self.bankedCredits, self.captain)) {
      const line = element('div', '', 'row');
      line.append(
        element('span', option.label),
        element('span', `${option.price} cr`),
        element('span', option.delta, 'delta'),
        button('Buy', option.affordable, () =>
          this.send({ type: 'buyGear', gearId: option.gearId, mk: option.mk, slot }),
        ),
      );
      list.append(line);
    }
    return list;
  }

  private hullsTab(self: SelfState): HTMLElement {
    const body = element('div', '', 'hull-grid');
    for (const card of hullCards(self.build, self.bankedCredits)) {
      const panel = element('section', '', `hull-card${card.current ? ' current' : ''}`);
      const icon = element('img');
      icon.src = `/ships/ship_${card.hullId}.png`;
      icon.alt = card.name;
      const properties = element('div', '', 'hull-properties');
      for (const stat of card.stats) properties.append(element('span', stat));
      panel.append(
        icon,
        element('div', card.current ? 'ACTIVE HULL' : 'AVAILABLE FRAME', 'eyebrow'),
        element('h3', card.name),
        element('p', HULL_ROLES[card.hullId], 'muted'),
        properties,
        element('p', card.slots, 'slot-capacity'),
        button(card.current ? 'Currently flying' : `Buy hull · ${card.price.toLocaleString()} cr`, card.affordable, () => {
          this.selectedSlot = null;
          this.send({ type: 'buyHull', hullId: card.hullId });
        }),
      );
      body.append(panel);
    }
    const note = element('p', 'W = weapons · S = shields · E = engine · U = utility. Base hull properties shown; installed gear modifies your final stats. Hull and overflow equipment trade in for 50%; compatible modules transfer automatically.', 'muted hull-note');
    body.append(note);
    return body;
  }

  private captainTab(self: SelfState): HTMLElement {
    const body = element('div', '', 'captain-panel');
    const level = captainLevel(self.captain);
    const points = captainPoints(self.captain);
    const header = element('div', '', 'captain-header');
    const identity = element('div');
    identity.append(element('div', 'PERSISTENT CAPTAIN', 'eyebrow'), element('h3', `Captain · Level ${level}`), element('p', 'Your experience and skills survive ship destruction.', 'muted'));
    const profile = element('div', '', 'captain-identity');
    const avatar = element('img', '', 'captain-avatar');
    avatar.src = '/ui/captain_avatar.png';
    avatar.alt = 'Captain avatar';
    avatar.addEventListener('error', () => { avatar.hidden = true; });
    profile.append(avatar, identity);
    header.append(profile, element('strong', `${points} skill point${points === 1 ? '' : 's'} available`, 'captain-points'));
    const progress = element('progress');
    progress.max = level === MAX_CAPTAIN_LEVEL ? 1 : experienceForLevel(level + 1) - experienceForLevel(level);
    progress.value = level === MAX_CAPTAIN_LEVEL ? 1 : self.captain.xp - experienceForLevel(level);
    progress.setAttribute('aria-label', 'Captain experience toward next level');
    const progressText = level === MAX_CAPTAIN_LEVEL ? 'Maximum level reached' : `${progress.value} / ${progress.max} XP toward level ${level + 1}`;
    body.append(header, progress, element('p', `${progressText} · ${self.captain.xp.toLocaleString()} total XP`, 'muted'));
    if (captainNeedsTraining(self.captain)) body.append(element('p', 'Choose your starting skills: spend 3 points before your first launch. You can spread them across skills or specialize.', 'captain-onboarding'));
    const skills = element('div', '', 'captain-skills');
    for (const row of captainRows(self)) {
      const card = element('section', '', 'captain-skill');
      const icon = element('img');
      icon.src = `/ui/${row.icon}.png`;
      icon.alt = '';
      const train = button(row.rank === MAX_SKILL_RANK ? 'Maximum rank' : 'Train · 1 point', row.canTrain, () => this.send({ type: 'trainCaptain', skill: row.skill }));
      train.dataset.focus = `train-${row.skill}`;
      card.append(icon, element('h3', row.name), element('span', `Rank ${row.rank} / ${MAX_SKILL_RANK}`, 'captain-rank'), element('p', row.description, 'muted'), element('p', `Next rank on this ship: ${row.delta}`, 'delta'), train);
      skills.append(card);
    }
    const stats = statsFor(self.build, self.captain);
    body.append(skills, element('p', `Current handling: thrust ${Math.round(stats.thrust)} · turn ${stats.turnRate.toFixed(2)} rad/s · shield regeneration ${stats.shieldRegen.toFixed(1)}/s`, 'muted'), element('p', 'Earn 10 XP per ore banked; pirate kills give 50 / 100 / 250 XP by tier; player kills give 100 XP. Each level grants 1 point, up to level 20. Training is available only while docked.', 'muted'));
    return body;
  }

  private rocketsTab(self: SelfState): HTMLElement {
    const body = element('div', '', 'list');
    for (const offer of ordnanceOffers(self)) {
      const line = element('div', '', 'row');
      const icon = element('img');
      icon.src = ORDNANCE_ICONS[offer.ordnance];
      icon.alt = '';
      const status = offer.carried ? `${offer.held} / ${self.maxRockets}` : `Swap · sells current ammo for ${offer.refund} cr`;
      const buy = (count: number) => () => this.send({ type: 'buyOrdnance', ordnance: offer.ordnance, count });
      line.append(
        icon,
        element('span', `${offer.name} ${status}`),
        button('+1', offer.canBuyOne, buy(1)),
        button(`Fill (${offer.fillPrice} cr)`, offer.canFill, buy(Math.min(offer.missing, MAX_ROCKETS_PER_PURCHASE))),
      );
      body.append(line);
    }
    body.append(element('p', 'You carry one ammunition type at a time. Buying the other type sells your current ammo back at 50%. R fires rockets or drops a mine behind you.', 'muted'));
    return body;
  }
}
