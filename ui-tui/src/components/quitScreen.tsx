/**
 * QuitScreen — shown when Ctrl+C / exit is pressed.
 * Displays logo + session info briefly, then exits cleanly.
 */

import { Box, forceRedraw, Text, useInput, useStdout } from '@hermes/ink'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { Theme } from '../theme.js'

interface QuitScreenProps {
  cwd?: string
  model?: string
  sessionTitle?: string
  t: Theme
  onDone: () => void
}

// Small "HANNES" logo (compact version)
const LOGO = [
  '  ██╗  ██╗ █████╗ ███╗  ██╗███╗  ██╗███████╗███████╗',
  '  ██║  ██║██╔══██╗████╗ ██║████╗ ██║██╔════╝██╔════╝',
  '  ███████║███████║██╔██╗██║██╔██╗██║█████╗  ███████╗',
  '  ██╔══██║██╔══██║██║╚████║██║╚████║██╔══╝  ╚════██║',
  '  ██║  ██║██║  ██║██║ ╚███║██║ ╚███║███████╗███████║',
  '  ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚══╝╚═╝  ╚══╝╚══════╝╚══════╝',
]

export function QuitScreen({ cwd, model, sessionTitle, t, onDone }: QuitScreenProps) {
  const { stdout } = useStdout()
  const cols = stdout?.columns ?? 80
  const rows = stdout?.rows ?? 24

  const [count, setCount] = useState(2)
  const done = useRef(false)

  const finish = useCallback(() => {
    if (done.current) {return}
    done.current = true
    onDone()
  }, [onDone])

  // Reset Ink's frame cache as well as the terminal. Writing directly to
  // stdout leaves Ink believing the old splash frame is still on screen.
  useEffect(() => {
    // Effects run while Ink is still committing the first quit frame. Defer
    // until that frame is installed, otherwise the following diff can repaint
    // from the pre-quit splash buffer again.
    const id = setTimeout(() => forceRedraw(), 0)

    return () => clearTimeout(id)
  }, [])

  useEffect(() => {
    const id = setInterval(() => {
      setCount(c => Math.max(0, c - 1))
    }, 800)

    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (count <= 0) {finish()}
  }, [count, finish])

  useInput((_ch, key) => {
    // Any key or second Ctrl+C speeds up exit
    if (key.escape || key.ctrl || key.return) {
      finish()
    }
  }, { isActive: !done.current })

  const logoW = LOGO[0]!.length
  const logoPad = Math.max(0, Math.floor((cols - logoW) / 2))

  const blockH = LOGO.length + 1 + 2 + 1 + 1
  const topPad = Math.max(1, Math.floor((rows - blockH) / 2))

  const title = sessionTitle || '(no session)'
  const shortTitle = title.length > 50 ? title.slice(0, 47) + '…' : title
  const modelName = model?.split('/').pop() ?? ''

  return (
    <Box flexDirection="column" height={rows} width={cols}>
      {Array.from({ length: topPad }, (_, i) => <Text key={i}>{' '}</Text>)}

      {LOGO.map((line, i) => (
        <Text bold color={t.color.primary} key={i} wrap="truncate-end">
          {' '.repeat(logoPad)}{line}
        </Text>
      ))}

      <Text>{' '}</Text>

      <Box justifyContent="center" width={cols}>
        <Text color={t.color.muted}>see you next time</Text>
      </Box>

      <Box justifyContent="center" width={cols}>
        <Text color={t.color.accent}>{shortTitle}</Text>
      </Box>

      {modelName ? (
        <Box justifyContent="center" width={cols}>
          <Text color={t.color.border}>{modelName}</Text>
        </Box>
      ) : null}

      <Box justifyContent="center" width={cols}>
        <Text color={t.color.border}>exiting in {count}…</Text>
      </Box>
    </Box>
  )
}
