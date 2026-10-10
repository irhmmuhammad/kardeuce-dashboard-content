/**
 * Tiny overlay stack so Escape / Cmd+S only affect the top-most layer
 * (e.g. a confirm dialog above the content drawer).
 */
const stack: symbol[] = [];

export function pushLayer(): symbol {
  const s = Symbol('layer');
  stack.push(s);
  return s;
}

export function popLayer(s: symbol) {
  const i = stack.indexOf(s);
  if (i >= 0) stack.splice(i, 1);
}

export function isTopLayer(s: symbol): boolean {
  return stack[stack.length - 1] === s;
}

export function hasOpenLayer(): boolean {
  return stack.length > 0;
}
