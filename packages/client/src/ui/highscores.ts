import type { HighscoreEntry } from '@arena/shared';
import { fetchHighscores } from '../api';

export function highscoreRows(entries: readonly HighscoreEntry[]): string[][] {
  return entries.map((entry) => [`#${entry.rank}`, entry.username, String(entry.kills)]);
}

function messageRow(text: string): HTMLTableRowElement {
  const row = document.createElement('tr');
  const cell = document.createElement('td');
  cell.colSpan = 3;
  cell.className = 'muted';
  cell.textContent = text;
  row.append(cell);
  return row;
}

function dataRow(cells: readonly string[]): HTMLTableRowElement {
  const row = document.createElement('tr');
  for (const text of cells) {
    const cell = document.createElement('td');
    cell.textContent = text;
    row.append(cell);
  }
  return row;
}

export async function showHighscores(body: HTMLTableSectionElement): Promise<void> {
  body.replaceChildren(messageRow('Loading…'));
  const entries = await fetchHighscores();
  if (entries === null) return body.replaceChildren(messageRow("Couldn't load highscores"));
  const rows = highscoreRows(entries);
  body.replaceChildren(...(rows.length === 0 ? [messageRow('No pilot kills yet — be the first.')] : rows.map(dataRow)));
}
