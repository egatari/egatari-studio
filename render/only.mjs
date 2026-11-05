// render.mjs の --only：段階の鍵（スライドの鍵:段階）か、スライドの鍵・id（そのスライドの全段階）
//   resolveOnly(tokens, tl, ids) → { keys: Set<段階の鍵>, unknown: [字], valid: [スライドの鍵] }
//   tl：DECK.timeline() の [{key, slideKey, i}]、ids：スライドの番号 → DOM の id（なければ null）
// 段階の鍵が先（段階の鍵と同じ字のスライドの鍵はない：段階の鍵は ":" を含む）。どれにも当たらない字は unknown に返す
export function resolveOnly(tokens, tl, ids = []) {
  const keys = new Set(), unknown = [];
  for (const t of tokens) {
    const hit = tl.filter((g) => g.key === t || g.slideKey === t || (ids[g.i] && ids[g.i] === t));
    if (!hit.length) unknown.push(t);
    for (const g of hit) keys.add(g.key);
  }
  const valid = [...new Set(tl.map((g) => g.slideKey))];
  return { keys, unknown, valid };
}

export function unknownOnlyMessage(unknown, valid, max = 8) {
  const shown = valid.slice(0, max).join(', ') + (valid.length > max ? `, …（ほか ${valid.length - max} 枚 / ${valid.length - max} more）` : '');
  return `--only に当たるスライド・段階がない / --only matches no slide or step: ${unknown.join(', ')}\n`
    + `  使えるのはスライドの鍵か id（そのスライドの全段階）、または スライドの鍵:段階 / valid: a slide key or id (all its steps), or slideKey:step\n`
    + `  スライド / slides: ${shown}`;
}
