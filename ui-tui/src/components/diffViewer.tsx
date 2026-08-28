import { Box, NoSelect, Text } from '@hermes/ink'
import type { Theme } from '../theme.js'
import { highlightLine, isHighlightable } from '../lib/syntax.js'
import { mix } from '../lib/color.js'

// Extract a short filename from a diff header path.  Windows absolute paths
// (C:\Users\...) and long prefix paths are reduced to the basename so the
// header stays readable — the full path is noise in the transcript.
const shortenPath = (path: string): string => {
  const clean = path.replace(/^"|"$/g, '')
  const parts = clean.split(/[/\\]/)
  const base = parts[parts.length - 1] ?? clean
  const dir = parts.length > 1 ? parts[parts.length - 2] ?? '' : ''
  return dir ? `${dir}/${base}` : base
}

// Parse a unified diff header line to extract the short filename.
const diffFileName = (text: string): string | null => {
  const gitMatch = text.match(/^diff --git "?a\/(.+?)"? "?b\//)
  if (gitMatch) return shortenPath(gitMatch[1]!)
  const minusMatch = text.match(/^--- (?:a\/)?(.+)$/)
  if (minusMatch) return shortenPath(minusMatch[1]!)
  return null
}

// Metadata lines that should never appear as diff rows.
const headerLine =
  /^(?:diff --git |--- |\+\+\+ |similarity index |rename from |rename to |index |new file mode |deleted file mode |old mode |new mode |Binary files )/
// Path-arrow rename lines emitted by the gateway (`a/path → b/path`,
// `src/foo → src/bar`) — pure noise once the short filename header renders.
const renameArrow = /^.*?[/\\].*? → .*?[/\\]/
const hunkLine = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/

type DiffRow = { kind: 'ctx' | 'add' | 'del'; num: number; text: string }
type DiffFile = { name: string | null; adds: number; dels: number; rows: DiffRow[] }

const parseDiff = (raw: string): DiffFile[] => {
  // Strip ANSI escape codes the gateway may inject, then markdown fence.
  const clean = raw.replace(/\u001b\[[0-9;]*m/g, '').replace(/^```diff\s*\n?/i, '').replace(/\n?```$/i, '').trim()
  const lines = clean.split('\n')
  const files: DiffFile[] = []
  let cur: DiffFile = { name: null, adds: 0, dels: 0, rows: [] }
  let n = 1

  for (const line of lines) {
    if (headerLine.test(line) || renameArrow.test(line)) {
      const fn = diffFileName(line)
      if (fn) { cur = { name: fn, adds: 0, dels: 0, rows: [] }; files.push(cur) }
      continue
    }

    const hunk = hunkLine.exec(line)
    if (hunk) { n = parseInt(hunk[1]!, 10); continue }

    if (files.length === 0) files.push(cur)

    if (line.startsWith('+')) { cur.adds++; cur.rows.push({ kind: 'add', num: n, text: line.slice(1) }); n++ }
    else if (line.startsWith('-')) { cur.dels++; cur.rows.push({ kind: 'del', num: n, text: line.slice(1) }) }
    else { cur.rows.push({ kind: 'ctx', num: n, text: line }); n++ }
  }

  return files
}

// Language for syntax highlighting, resolved from the diff filename. The
// highlighter's `isHighlightable` already knows the aliases (tsx→ts, etc.).
const langFromName = (name: string | null): string => {
  if (!name) return ''
  const m = /\.([A-Za-z0-9]+)$/.exec(name)
  return m ? m[1]! : ''
}

interface DiffViewerProps {
  text: string
  t: Theme
}

export function DiffViewer({ text, t }: DiffViewerProps) {
  const files = parseDiff(text)
  const rail = t.color.border

  // opencode-style: the row background is the full-width tint (mint for
  // added, red for removed); the line-number column sits on a slightly
  // stronger tint so it reads as a separate editor gutter. Syntax
  // highlighting is drawn on top so tokens stay legible.
  const addBg = mix(t.color.completionBg, t.color.diffAddedWord, 0.14)
  const delBg = mix(t.color.completionBg, t.color.diffRemovedWord, 0.14)
  const addNumBg = mix(t.color.completionBg, t.color.diffAddedWord, 0.24)
  const delNumBg = mix(t.color.completionBg, t.color.diffRemovedWord, 0.24)

  return (
    <Box borderBottom={false} borderLeft borderColor={rail} borderRight={false} borderStyle="single" borderTop={false} flexDirection="column" width="100%">
      {files.map((file, fi) => {
        const lang = langFromName(file.name)
        const highlightable = lang ? isHighlightable(lang) : false

        return (
          <Box flexDirection="column" key={fi}>
            {/* File header: name left, +/- counts right */}
            <Box flexDirection="row" justifyContent="space-between" paddingLeft={1} paddingRight={1}>
              <Text color={rail} wrap="truncate-end">
                {file.name ?? '(diff)'}
              </Text>
              {file.adds + file.dels > 0 ? (
                <Box flexDirection="row">
                  <Text color={t.color.diffAddedWord}>{` +${file.adds}`}</Text>
                  <Text color={t.color.diffRemovedWord}>{` −${file.dels}`}</Text>
                </Box>
              ) : null}
            </Box>

            <Text color={rail}>{' ─'}</Text>

            {file.rows.map((row, i) => {
              const marker = row.kind === 'add' ? '+' : row.kind === 'del' ? '-' : ' '
              const markerColor =
                row.kind === 'add'
                  ? t.color.diffAddedWord
                  : row.kind === 'del'
                    ? t.color.diffRemovedWord
                    : t.color.muted
              const bg = row.kind === 'add' ? addBg : row.kind === 'del' ? delBg : undefined
              const numBg = row.kind === 'add' ? addNumBg : row.kind === 'del' ? delNumBg : undefined
              const code = highlightable ? highlightLine(row.text, lang, t) : [[t.color.text, row.text]]

              return (
                <Box key={i} backgroundColor={bg} flexDirection="row" width="100%">
                  <NoSelect fromLeftEdge>
                    <Text backgroundColor={numBg} color={t.color.muted} dimColor>
                      {` ${String(row.num).padStart(3)} `}
                    </Text>
                  </NoSelect>
                  <NoSelect>
                    <Text color={markerColor}>{` ${marker} `}</Text>
                  </NoSelect>
                  <Text wrap="truncate-end">
                    {code.map(([color, tok], kk) => (
                      <Text color={color || t.color.text} key={kk}>
                        {tok}
                      </Text>
                    ))}
                  </Text>
                </Box>
              )
            })}
          </Box>
        )
      })}
    </Box>
  )
}
