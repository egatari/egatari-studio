// Main-thread DOM host for the build worker's score RPC. Loaded only on the first score.
import ABCJS_SOURCE from 'virtual:abcjs-source';
import { renderScore } from '../kit/core/abcjs.mjs';
import markup from '../vendor/egatari-spec/schema/rendered-markup-1.json' with { type: 'json' };
export function renderAbc({ abc, options }) {
  // A fresh document keeps editor CSS and fonts out of SVG coordinates and serialization.
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1280px;height:720px;visibility:hidden';
  document.body.appendChild(frame);
  try {
    const doc = frame.contentDocument;
    doc.open(); doc.write('<!doctype html><body></body>'); doc.close();
    const script = doc.createElement('script'); script.textContent = ABCJS_SOURCE; doc.head.appendChild(script);
    return renderScore({ abc, options, markup }, frame.contentWindow.ABCJS, doc);
  } finally { frame.remove(); }
}
