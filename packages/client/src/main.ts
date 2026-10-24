import { runSession, type GameDom } from './game/GameSession';
import { SpriteFactory } from './render/SpriteFactory';
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
  const login = new LoginScreen(element('login', HTMLFormElement), element('login-error', HTMLElement));
  const dom: GameDom = {
    gameRoot: element('game', HTMLDivElement),
    hud: element('hud', HTMLDivElement),
    minimap: element('minimap', HTMLCanvasElement),
    shop: element('shop', HTMLDivElement),
    toast: element('toast', HTMLDivElement),
  };
  const sprites = await SpriteFactory.load();
  let token = localStorage.getItem(TOKEN_KEY);
  let message = '';
  for (;;) {
    token ??= await login.waitForToken(message);
    localStorage.setItem(TOKEN_KEY, token);
    const reason = await runSession(token, sprites, dom);
    if (reason === 'unauthorized') localStorage.removeItem(TOKEN_KEY);
    token = null;
    message = reason;
  }
}

void main();
