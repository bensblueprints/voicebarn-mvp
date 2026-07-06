'use strict';
/**
 * SSML-lite pause parsing. Piper does NOT support SSML — this is the one
 * documented, honest extension: inline pause tokens inside paragraph text.
 * Supported syntax (case-insensitive, either form):
 *   <pause 500ms>   <pause 0.5s>   <pause 500>   (bare number = ms)
 *   [pause 500ms]   [pause 0.5s]   [pause 500]
 * Anything else in the text is left completely untouched — no other SSML
 * tags (prosody, breaks, phonemes, etc.) are recognized or stripped.
 */

const PAUSE_RE = /<pause\s+(\d+(?:\.\d+)?)\s*(ms|s)?\s*>|\[pause\s+(\d+(?:\.\d+)?)\s*(ms|s)?\s*\]/gi;

/**
 * Split text into an ordered array of chunks:
 *   { type: 'text', value: string }
 *   { type: 'pause', ms: number }
 * Empty/whitespace-only text chunks between pauses are dropped.
 */
function parsePauseTokens(text) {
  const chunks = [];
  let lastIndex = 0;
  let match;
  PAUSE_RE.lastIndex = 0;
  while ((match = PAUSE_RE.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index);
    if (before.trim() !== '') chunks.push({ type: 'text', value: before });
    const amount = Number(match[1] !== undefined ? match[1] : match[3]);
    const unit = (match[2] !== undefined ? match[2] : match[4]) || 'ms';
    const ms = unit.toLowerCase() === 's' ? amount * 1000 : amount;
    chunks.push({ type: 'pause', ms });
    lastIndex = PAUSE_RE.lastIndex;
  }
  const rest = text.slice(lastIndex);
  if (rest.trim() !== '') chunks.push({ type: 'text', value: rest });
  if (chunks.length === 0) chunks.push({ type: 'text', value: text });
  return chunks;
}

/** Strip pause tokens entirely (used for preview-length estimates / plain display). */
function stripPauseTokens(text) {
  return text.replace(PAUSE_RE, ' ').replace(/\s+/g, ' ').trim();
}

module.exports = { parsePauseTokens, stripPauseTokens };
