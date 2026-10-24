import {
  MAX_ROCKETS_PER_PURCHASE,
  statsFor,
  type ClientMessage,
  type SelfState,
  type ShopFailure,
  type ShopResultMessage,
  type SlotRef,
} from '@arena/shared';
import { gearOptions, hullCards, rocketOffer, slotRows, statSummary } from './buildMenuModel';

type Tab = 'ship' | 'hulls' | 'rockets';

const TABS: readonly { readonly id: Tab; readonly label: string }[] = [
  { id: 'ship', label: 'Ship' },
  { id: 'hulls', label: 'Hulls' },
  { id: 'rockets', label: 'Rockets' },
];

const FAILURE_TEXT: Readonly<Record<ShopFailure, string>> = {
  not_docked: 'Dock first',
  insufficient_credits: 'Not enough banked credits',
  slot_mismatch: 'That item does not fit this slot',
  rocket_cap: 'Rocket racks are full',
  unknown_item: 'Not available',
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
    this.render();
  }

  showResult(message: ShopResultMessage): void {
    this.resultText = message.ok ? 'Done' : FAILURE_TEXT[message.reason];
    this.render(true);
  }

  private render(force = false): void {
    const self = this.self;
    if (!self) return;
    const key = JSON.stringify([self.build, self.bankedCredits, self.rockets, this.tab, this.selectedSlot, this.resultText]);
    if (!force && key === this.renderedKey) return;
    this.renderedKey = key;
    this.root.replaceChildren(
      this.tabBar(),
      element('div', statSummary(statsFor(self.build)).join(' · '), 'summary'),
      element('div', `Banked ${self.bankedCredits} cr`, 'summary'),
      this.tabBody(self),
      element('div', this.resultText, 'result'),
    );
  }

  private select(tab: Tab): void {
    this.tab = tab;
    this.render();
  }

  private tabBar(): HTMLElement {
    const bar = element('div', '', 'tabs');
    for (const tab of TABS) {
      const node = button(tab.label, tab.id !== this.tab, () => this.select(tab.id));
      bar.append(node);
    }
    return bar;
  }

  private tabBody(self: SelfState): HTMLElement {
    if (this.tab === 'hulls') return this.hullsTab(self);
    if (this.tab === 'rockets') return this.rocketsTab(self);
    return this.shipTab(self);
  }

  private shipTab(self: SelfState): HTMLElement {
    const body = element('div', '', 'list');
    for (const row of slotRows(self.build)) {
      const line = element('div', '', 'row');
      const icon = element('img');
      icon.alt = '';
      if (row.gear) icon.src = `/ui/gear_${row.gear.gearId}.png`;
      line.append(
        icon,
        element('span', row.label),
        button('Change', true, () => {
          this.selectedSlot = row.slot;
          this.render();
        }),
        button('Sell', row.gear !== null, () => this.send({ type: 'sellGear', slot: row.slot })),
      );
      body.append(line);
    }
    if (this.selectedSlot) body.append(this.gearList(self, this.selectedSlot));
    return body;
  }

  private gearList(self: SelfState, slot: SlotRef): HTMLElement {
    const list = element('div', '', 'list options');
    for (const option of gearOptions(self.build, slot, self.bankedCredits)) {
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
    const body = element('div', '', 'list');
    for (const card of hullCards(self.build, self.bankedCredits)) {
      const line = element('div', '', 'row');
      const icon = element('img');
      icon.src = `/ships/ship_${card.hullId}.png`;
      icon.alt = '';
      line.append(
        icon,
        element('span', `${card.name} — ${card.slots} — ${card.stats.join(', ')}`),
        element('span', card.current ? 'Current' : `${card.price} cr`),
        button('Buy', card.affordable, () => this.send({ type: 'buyHull', hullId: card.hullId })),
      );
      body.append(line);
    }
    return body;
  }

  private rocketsTab(self: SelfState): HTMLElement {
    const offer = rocketOffer(self);
    const body = element('div', '', 'list');
    const line = element('div', '', 'row');
    const icon = element('img');
    icon.src = '/ui/icon_rocket.png';
    icon.alt = '';
    line.append(
      icon,
      element('span', `Rockets ${self.rockets} / ${self.maxRockets}`),
      button('+1', offer.canBuyOne, () => this.send({ type: 'buyRockets', count: 1 })),
      button(`Fill (${offer.fillPrice} cr)`, offer.canFill, () =>
        this.send({ type: 'buyRockets', count: Math.min(offer.missing, MAX_ROCKETS_PER_PURCHASE) }),
      ),
    );
    body.append(line);
    return body;
  }
}
