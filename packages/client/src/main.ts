import { runSession, type GameDom } from './game/GameSession';
import { SpriteFactory } from './render/SpriteFactory';
import { Loader, loadingLabel } from './ui/Loader';
import { LoginScreen } from './ui/LoginScreen';
import { setupMobileDisplay } from './ui/MobileDisplay';

const TOKEN_KEY = 'arena.token';

function element<T extends HTMLElement>(id: string, type: { new (): T; prototype: T }): T {
  const found = document.getElementById(id);
  if (!(found instanceof type)) throw new Error(`missing #${id}`);
  return found;
}

async function main(): Promise<void> {
  setupMobileDisplay();
  const loader = new Loader(element('loader', HTMLDivElement), element('loader-status', HTMLElement), element('loader-progress', HTMLProgressElement));
  const login = new LoginScreen(element('login', HTMLFormElement), element('login-error', HTMLElement));
  const dom: GameDom = {
    gameRoot: element('game', HTMLDivElement),
    hud: element('hud', HTMLDivElement),
    minimap: element('minimap', HTMLCanvasElement),
    shop: element('shop', HTMLDivElement),
    toast: element('toast', HTMLDivElement),
  };
  const sprites = await SpriteFactory.load((done, total) => loader.show(loadingLabel(done, total), total === 0 ? null : done / total));
  loader.hide();
  let token = localStorage.getItem(TOKEN_KEY);
  let message = '';
  for (;;) {
    token ??= await login.waitForToken(message);
    localStorage.setItem(TOKEN_KEY, token);
    loader.show('Connecting to the arena…');
    const reason = await runSession(token, sprites, dom, () => loader.hide());
    loader.hide();
    if (reason === 'unauthorized') localStorage.removeItem(TOKEN_KEY);
    token = null;
    message = reason;
  }
}

void main();
