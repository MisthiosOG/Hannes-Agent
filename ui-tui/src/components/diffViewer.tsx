import { Box, Text } from '@hermes/ink'
import type { Theme } from '../theme.js'

// ponytail: approved design accent — the theme has no violet token, so the
// diff rail/header uses a fixed violet (matches the A-variant preview).
const VIOLET = '#A78BFA'

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

interface DiffViewerProps {
  text: string
  t: Theme
}

export function DiffViewer({ text, t }: DiffViewerProps) {
  const files = parseDiff(text)

  // A-variant: no box, no full background — just a violet left rail and
  // numbered rows, so the patch reads inline with the surrounding chat
  // instead of as a separate UI surface.
  return (
    <Box borderBottom={false} borderLeft borderColor={VIOLET} borderRight={false} borderStyle="single" borderTop={false} flexDirection="column">
      {files.map((file, fi) => (
        <Box flexDirection="column" key={fi}>
          {file.name ? (
            <Text color={VIOLET}>
              {` ${file.name}`}
              {file.adds + file.dels > 0 ? (
                <Text>
                  <Text color={t.color.diffAdded}> +{file.adds}</Text>
                  <Text color={t.color.diffRemoved}> −{file.dels}</Text>
                </Text>
              ) : null}
            </Text>
          ) : null}

          {file.rows.map((row, i) => {
            const marker = row.kind === 'add' ? '+' : row.kind === 'del' ? '-' : ' '
            const bg = row.kind === 'add' ? t.color.diffAdded : row.kind === 'del' ? t.color.diffRemoved : undefined
            const color =
              row.kind === 'add'
                ? t.color.diffAddedWord
                : row.kind === 'del'
                  ? t.color.diffRemovedWord
                  : t.color.muted

            return (
              <Text key={i} backgroundColor={bg} color={color}>
                {` ${String(row.num).padStart(3)} ${marker}${row.text}`}
              </Text>
            )
          })}
        </Box>
      ))}
    </Box>
  )
}
