// Keep accepting the old double-bracket form so already-attached composer
// state can still be submitted after the UI switches to compact chips.
export const PASTE_SNIPPET_RE = /(?:\[\[[^\n]*?\]\]|\[Pasted[^\]]*\]|\[Image \d+\])/g
