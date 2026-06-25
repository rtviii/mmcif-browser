// Single-line syntax tokenizer for CIF source text. Runs only for the rows currently
// visible in the virtualized view, so it can be straightforward rather than fast.
//
// Tokens partition the entire line (whitespace included) so the renderer can reproduce
// the verbatim text by concatenating token slices. Only `item` tokens are hoverable —
// they carry the {cat, field} used for the dictionary join.

export type TokenType =
  | "keyword" // loop_, data_*, save_*, stop_, global_
  | "comment" // # ...
  | "item" // _cat.attr
  | "string" // '...', "...", or a ;multiline; content line
  | "number"
  | "text"; // whitespace, barewords, . / ? placeholders

export interface Token {
  type: TokenType;
  start: number; // column offset (inclusive)
  end: number; // column offset (exclusive)
  cat?: string; // only on type === "item"
  field?: string; // only on type === "item"
}

export interface TokenizeCtx {
  /** True when this line sits inside a ;...; multiline text field. */
  inTextBlock?: boolean;
}

const KEYWORDS = new Set(["loop_", "stop_", "global_"]);
const ITEM_RE = /^_([A-Za-z0-9_]+)\.(.+)$/;
const NUMBER_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

function isSpace(ch: string): boolean {
  return ch === " " || ch === "\t";
}

function classify(word: string): Token {
  const t: Token = { type: "text", start: 0, end: word.length };
  if (KEYWORDS.has(word) || word.startsWith("data_") || word.startsWith("save_")) {
    t.type = "keyword";
  } else if (word[0] === "_") {
    const m = ITEM_RE.exec(word);
    if (m) {
      t.type = "item";
      t.cat = m[1];
      t.field = m[2];
    }
  } else if (word[0] === "'" || word[0] === '"') {
    t.type = "string";
  } else if (NUMBER_RE.test(word)) {
    t.type = "number";
  }
  return t;
}

export function tokenizeLine(text: string, ctx?: TokenizeCtx): Token[] {
  // Inside a multiline text field (or the ;-delimiter lines themselves), the whole
  // line is string content.
  if (ctx?.inTextBlock || text[0] === ";") {
    return [{ type: "string", start: 0, end: text.length }];
  }
  const trimmedStart = text.search(/\S/);
  if (trimmedStart === -1) {
    return text.length ? [{ type: "text", start: 0, end: text.length }] : [];
  }
  // A leading # makes the entire line a comment.
  if (text[trimmedStart] === "#") {
    const tokens: Token[] = [];
    if (trimmedStart > 0) tokens.push({ type: "text", start: 0, end: trimmedStart });
    tokens.push({ type: "comment", start: trimmedStart, end: text.length });
    return tokens;
  }

  const tokens: Token[] = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (isSpace(ch)) {
      let j = i + 1;
      while (j < n && isSpace(text[j])) j++;
      tokens.push({ type: "text", start: i, end: j });
      i = j;
      continue;
    }
    let j: number;
    if (ch === "'" || ch === '"') {
      // Quoted value ends at a matching quote followed by whitespace or EOL.
      j = i + 1;
      while (j < n) {
        if (text[j] === ch && (j + 1 >= n || isSpace(text[j + 1]))) {
          j++;
          break;
        }
        j++;
      }
    } else {
      j = i + 1;
      while (j < n && !isSpace(text[j])) j++;
    }
    const word = text.slice(i, j);
    const tok = classify(word);
    tok.start = i;
    tok.end = j;
    tokens.push(tok);
    i = j;
  }
  return tokens;
}
