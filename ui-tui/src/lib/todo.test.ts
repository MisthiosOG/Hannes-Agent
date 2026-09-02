import { describe, expect, it } from 'vitest'

import { todoGlyph, todoTone } from './todo.js'

describe('todoGlyph', () => {
  it('uses bullet symbols for active/pending and fixed-width for finished', () => {
    expect(todoGlyph('completed')).toBe('[x]')
    expect(todoGlyph('in_progress')).toBe('●')
    expect(todoGlyph('pending')).toBe('○')
    expect(todoGlyph('cancelled')).toBe('[-]')
  })
})

describe('todoTone', () => {
  it('keeps todo status rows neutral instead of red/green', () => {
    expect(todoTone('completed')).toBe('dim')
    expect(todoTone('cancelled')).toBe('dim')
    expect(todoTone('pending')).toBe('body')
    expect(todoTone('in_progress')).toBe('active')
  })
})
