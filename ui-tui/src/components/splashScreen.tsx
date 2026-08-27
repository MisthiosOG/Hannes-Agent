/**
 * SplashScreen — full-screen landing shown on first launch.
 * User types their first prompt here; pressing Enter submits it,
 * dismisses the splash, and starts the main TUI session.
 */

import { Box, NoSelect, Text, useInput, useStdout } from '@hermes/ink'
import { useEffect, useState } from 'react'

import { mix } from '../lib/color.js'
import type { Theme } from '../theme.js'

interface SplashScreenProps {
  onSubmit: (prompt: string) => void
  planMode: boolean
  t: Theme
}

// Block-letter ASCII logo for "HANNES"
const LOGO = [
  '  ██╗  ██╗ █████╗ ███╗  ██╗███╗  ██╗███████╗███████╗',
  '  ██║  ██║██╔══██╗████╗ ██║████╗ ██║██╔════╝██╔════╝',
  '  ███████║███████║██╔██╗██║██╔██╗██║█████╗  ███████╗',
  '  ██╔══██║██╔══██║██║╚████║██║╚████║██╔══╝  ╚════██║',
  '  ██║  ██║██║  ██║██║ ╚███║██║ ╚███║███████╗███████║',
  '  ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚══╝╚═╝  ╚══╝╚══════╝╚══════╝',
]

// Card width: matches logo width
const CARD_W = 58

export function SplashScreen({ onSubmit, planMode, t }: SplashScreenProps) {
  const { stdout } = useStdout()
  const cols = stdout?.columns ?? 80
  const rows = stdout?.rows ?? 24

  const [input, setInput] = useState('')
  const [blink, setBlink] = useState(true)

  useEffect(() => {
    const id = setInterval(() => setBlink(v => !v), 530)
    return () => clearInterval(id)
  }, [])

  useInput((ch, key) => {
    if (key.ctrl && (ch === 'c' || ch === '\x03')) {
      return
    }
    if (key.return) {
      const trimmed = input.trim()
      if (trimmed) onSubmit(trimmed)
      return
    }
    if (key.backspace || key.delete) {
      setInput(v => v.slice(0, -1))
      return
    }
    if (ch === '\u0015') { setInput(''); return }
    if (ch && !key.ctrl && !key.meta && ch >= ' ') {
      setInput(v => v + ch)
    }
  })

  // Horizontal centering
  const cardW = Math.min(CARD_W, cols - 4)
  const hPad = Math.max(0, Math.floor((cols - cardW) / 2))
  const logoW = LOGO[0]!.length
  const logoPad = Math.max(0, Math.floor((cols - logoW) / 2))

  // Vertical centering: logo(6) + gap + tagline + gap + card(5) = 14 rows
  const blockH = LOGO.length + 1 + 1 + 1 + 5
  const topPad = Math.max(1, Math.floor((rows - blockH) / 2))

  // Input display truncation
  const innerW = cardW - 2           // minus 2 border columns
  const maxInput = Math.max(4, innerW - 2)
  const displayInput = input.length > maxInput
    ? '…' + input.slice(-(maxInput - 1))
    : input

  return (
    <Box flexDirection="column" height={rows} width={cols}>
      {Array.from({ length: topPad }, (_, i) => <Text key={i}>{' '}</Text>)}

      {/* Logo */}
      {LOGO.map((line, i) => (
        <Text bold color={t.color.primary} key={i} wrap="truncate-end">
          {' '.repeat(logoPad)}{line}
        </Text>
      ))}

      {/* Tagline */}
      <Text>{' '}</Text>
      <Box flexDirection="row" width={cols}>
        <Text>{' '.repeat(Math.max(0, Math.floor((cols - 30) / 2)))}</Text>
        <Text color={t.color.muted}>self-improving personal agent</Text>
      </Box>

      <Text>{' '}</Text>
      <Text>{' '}</Text>

      {/* ── Card: background + rail + input centered ── */}
      <Box flexDirection="row" width={cols}>
        <Text>{' '.repeat(hPad)}</Text>
        <Box
          backgroundColor={mix(t.color.completionBg, t.color.primary, 0.12)}
          borderBottom={false}
          borderColor={t.color.primary}
          borderLeft
          borderRight={false}
          borderStyle="single"
          borderTop={false}
          flexDirection="column"
          paddingLeft={1}
          paddingRight={1}
          width={cardW}
        >
          <Text>{' '}</Text>

          {/* Input row — centered */}
          <Box flexDirection="row" justifyContent="center" width={innerW}>
            <NoSelect>
              <Text color={input ? t.color.text : t.color.muted} wrap="truncate-end">
                {displayInput || 'ask me anything…'}
              </Text>
              <Text color={t.color.primary}>{blink ? '▍' : ' '}</Text>
            </NoSelect>
          </Box>

          <Text>{' '}</Text>
        </Box>
      </Box>

      {/* Divider line — full card width, below the card */}
      <Box flexDirection="row" width={cols}>
        <Text>{' '.repeat(hPad)}</Text>
        <Text color={t.color.border}>{'─'.repeat(Math.max(1, cardW))}</Text>
      </Box>

      {/* Footer strip — background tint between two dividers */}
      <Box flexDirection="row" width={cols}>
        <Text>{' '.repeat(hPad)}</Text>
        <Box
          backgroundColor={mix(t.color.completionBg, t.color.primary, 0.08)}
          flexDirection="row"
          justifyContent="space-between"
          paddingX={1}
          width={cardW}
        >
          <Text color={t.color.muted}>{' '}Enter to send{' '}</Text>
          <Text color={t.color.muted}>{' '}Ctrl+U clear{' '}</Text>
          <Text
            backgroundColor={mix(t.color.completionBg, planMode ? t.color.warn : t.color.primary, 0.14)}
            bold
            color={planMode ? t.color.warn : t.color.primary}
          >
            {' '}
            {planMode ? 'PLAN mode' : 'BUILD mode'}
            {' '}
          </Text>
        </Box>
      </Box>

      {/* Bottom divider — closing line */}
      <Box flexDirection="row" width={cols}>
        <Text>{' '.repeat(hPad)}</Text>
        <Text color={t.color.border}>{'─'.repeat(Math.max(1, cardW))}</Text>
      </Box>
    </Box>
  )
}
