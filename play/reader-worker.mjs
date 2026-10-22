// Egatari Play: scan a lesson file in a Worker so that a large file does not freeze the page (play/scan.mjs).
// Receives {id, text}; answers {id, result}. Nothing in the file runs here either.
import { scanLesson } from './scan.mjs';

self.onmessage = (e) => {
  const m = e.data || {};
  if (typeof m.id !== 'number' || typeof m.text !== 'string') return;
  let result;
  try { result = scanLesson(m.text); } catch { result = { ok: false, error: 'parse' }; }
  self.postMessage({ id: m.id, result });
};
