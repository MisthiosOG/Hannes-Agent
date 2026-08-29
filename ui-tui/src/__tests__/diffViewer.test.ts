import { describe, expect, it } from 'vitest'

import { parseDiff } from '../components/diffViewer.js'

describe('parseDiff', () => {
  it('keeps git metadata for one file section', () => {
    const files = parseDiff(
      [
        'diff --git a/src/app.tsx b/src/app.tsx',
        'index 123..456 100644',
        '--- a/src/app.tsx',
        '+++ b/src/app.tsx',
        '@@ -1,2 +1,3 @@',
        ' const oldLine = true',
        '+const newLine = true'
      ].join('\n')
    )

    expect(files).toHaveLength(1)
    expect(files[0]?.name).toBe('src/app.tsx')
    expect(files[0]?.adds).toBe(1)
    expect(files[0]?.dels).toBe(0)
  })

  it('drops repeated identical file sections', () => {
    const section = ['--- a/foo.ts', '+++ b/foo.ts', '@@ -1 +1 @@', '-old', '+new'].join('\n')

    expect(parseDiff(`${section}\n${section}`)).toHaveLength(1)
  })

  it('uses the new path for a new file and separates plain unified sections', () => {
    const section = (name: string) => ['--- /dev/null', `+++ b/${name}`, '@@ -0,0 +1 @@', '+new'].join('\n')
    const files = parseDiff(`${section('one.ts')}\n${section('two.ts')}`)

    expect(files.map(file => file.name)).toEqual(['one.ts', 'two.ts'])
  })
})
