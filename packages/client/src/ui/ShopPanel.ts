import {
  MAX_TIER,
  UPGRADE_LINES,
  nextTierCost,
  type BuyFailure,
  type BuyResultMessage,
  type SelfState,
  type UpgradeLine,
} from '@arena/shared';

const LABELS: Readonly<Record<UpgradeLine, string>> = {
  hull: 'Hull',
  engine: 'Engine',
  weapon: 'Weapons',
  shield: 'Shields',
  cargo: 'Cargo',
};

const FAILURE_TEXT: Readonly<Record<BuyFailure, string>> = {
  not_docked: 'Dock first',
  max_tier: 'Already at max tier',
  insufficient_credits: 'Not enough banked credits',
};

export interface ShopRow {
  readonly line: UpgradeLine;
  readonly label: string;
  readonly tier: number;
  readonly maxTier: number;
  readonly cost: number | null;
  readonly affordable: boolean;
}

export function shopRows(self: SelfState): ShopRow[] {
  return UPGRADE_LINES.map((line) => {
    const cost = nextTierCost(self.loadout, line);
    return {
      line,
      label: LABELS[line],
      tier: self.loadout[line],
      maxTier: MAX_TIER[line],
      cost,
      affordable: cost !== null && cost <= self.bankedCredits,
    };
  });
}

export class ShopPanel {
  private renderedKey = '';
  private readonly result = document.createElement('div');

  constructor(
    private readonly root: HTMLElement,
    private readonly onBuy: (line: UpgradeLine) => void,
  ) {
    this.result.className = 'result';
  }

  update(self: SelfState): void {
    this.root.hidden = !self.docked;
    if (!self.docked) return;
    const rows = shopRows(self);
    const key = JSON.stringify(rows);
    if (key === this.renderedKey) return;
    this.renderedKey = key;
    this.root.replaceChildren(...rows.map((row) => this.rowElement(row)), this.result);
  }

  showResult(message: BuyResultMessage): void {
    this.result.textContent = message.ok ? `${LABELS[message.line]} upgraded` : FAILURE_TEXT[message.reason];
  }

  private rowElement(row: ShopRow): HTMLElement {
    const element = document.createElement('div');
    element.className = 'row';
    const icon = document.createElement('img');
    icon.src = `/ui/icon_${row.line}.png`;
    icon.alt = '';
    icon.addEventListener('error', () => {
      icon.style.visibility = 'hidden';
    });
    const name = document.createElement('span');
    name.textContent = `${row.label} ${row.tier}/${row.maxTier}`;
    const price = document.createElement('span');
    price.textContent = row.cost === null ? 'MAX' : `${row.cost} cr`;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Buy';
    button.disabled = !row.affordable;
    button.addEventListener('click', () => this.onBuy(row.line));
    element.append(icon, name, price, button);
    return element;
  }
}
