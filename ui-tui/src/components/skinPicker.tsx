import { Box, Text, useInput, useStdout } from '@hermes/ink'
import { useEffect, useMemo, useState } from 'react'

import type { GatewayClient } from '../gatewayClient.js'
import { rpcErrorMessage } from '../lib/rpc.js'
import type { Theme } from '../theme.js'

import { OverlayHint, windowItems } from './overlayControls.js'
import { chipRowProps, clampOverlayWidth } from './overlayPrimitives.js'

const VISIBLE = 10
const MIN_WIDTH = 40

interface SkinRow {
  description?: string
  name: string
  source?: string
}

interface SkinList {
  active: string
  skins: SkinRow[]
}

/**
 * Interactive skin picker overlay. Pulls the catalog via `skin.list`,
 * filters as you type, and applies the highlighted skin with `config.set`
 * (fires skin.changed — no restart). The interactive sibling of
 * `/skin <name>` and `/skins <name>`.
 */
export function SkinPicker({ gw, maxWidth, onClose, t }: SkinPickerProps) {
  const [list, setList] = useState<SkinList | null>(null)
  const [query, setQuery] = useState('')
  const [idx, setIdx] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)

  const { stdout } = useStdout()
  const preferredWidth = Math.max(MIN_WIDTH, (stdout?.columns ?? 80) - 2)
  const width = clampOverlayWidth(preferredWidth, maxWidth)

  useEffect(() => {
    gw.request<SkinList>('skin.list')
      .then(r => {
        setList(r)
        setErr('')
      })
      .catch((e: unknown) => setErr(rpcErrorMessage(e)))
      .finally(() => setLoading(false))
  }, [gw])

  const active = list?.active ?? ''

  // Active first, then curated feel — just sort the current skin to top.
  const view = useMemo(() => {
    const skins = list?.skins ?? []
    const needle = query.trim().toLowerCase()
    const matched = needle
      ? skins.filter(s => s.name.toLowerCase().includes(needle) || (s.description ?? '').toLowerCase().includes(needle))
      : skins

    return [...matched].sort((a, b) => Number(b.name === active) - Number(a.name === active))
  }, [list, query, active])

  const apply = (name: string) => {
    setBusy(true)
    setErr('')
    gw.request('config.set', { key: 'skin', value: name })
      .then(() => onClose())
      .catch((e: unknown) => {
        setErr(rpcErrorMessage(e))
        setBusy(false)
      })
  }

  useInput((input, key) => {
    if (busy) {
      return
    }

    if (key.escape) {
      return onClose()
    }

    if (key.upArrow) {
      return setIdx(i => Math.max(0, i - 1))
    }

    if (key.downArrow) {
      return setIdx(i => Math.min(view.length - 1, i + 1))
    }

    if (key.return) {
      const skin = view[idx]

      return skin ? apply(skin.name) : undefined
    }

    if (key.backspace || key.delete) {
      setQuery(q => q.slice(0, -1))

      return setIdx(0)
    }

    // Printable char → extend the filter (ignore control/chorded keys).
    if (input && input.length === 1 && input >= ' ' && !key.ctrl && !key.meta) {
      setQuery(q => q + input)
      setIdx(0)
    }
  })

  if (loading) {
    return <Text color={t.color.muted}>loading skins…</Text>
  }

  if (err && !list) {
    return (
      <Box flexDirection="column" width={width}>
        <Text color={t.color.label}>error: {err}</Text>
        <OverlayHint t={t}>Esc cancel</OverlayHint>
      </Box>
    )
  }

  const { items, offset } = windowItems(view, idx, VISIBLE)

  return (
    <Box flexDirection="column" width={width}>
      <Text bold color={t.color.accent}>
        Skins
      </Text>

      <Text color={t.color.muted} wrap="truncate-end">
        {query ? `filter: ${query}` : 'type to filter'} · {view.length} skin{view.length === 1 ? '' : 's'}
      </Text>

      {offset > 0 && <Text color={t.color.muted}> ↑ {offset} more</Text>}

      {view.length === 0 ? (
        <Text color={t.color.muted}>{query ? `no skins match "${query}"` : 'no skins available'}</Text>
      ) : (
        items.map((skin, i) => {
          const at = offset + i === idx
          const isActive = skin.name === active
          const mark = isActive ? '●' : ' '
          const tag = skin.source === 'user' ? ' · user' : ''

          return (
            <Text color={t.color.muted} {...chipRowProps(t, at)} key={skin.name} wrap="truncate-end">
              {at ? '▸ ' : '  '}
              {mark} {skin.name}
              <Text color={at ? t.color.accent : t.color.muted}>
                {' '}
                {skin.description ?? 'skin'}
                {tag}
              </Text>
            </Text>
          )
        })
      )}

      {offset + VISIBLE < view.length && <Text color={t.color.muted}> ↓ {view.length - offset - VISIBLE} more</Text>}

      {err ? <Text color={t.color.label}>error: {err}</Text> : null}
      {busy ? <Text color={t.color.accent}>applying…</Text> : null}

      <OverlayHint t={t}>↑/↓ select · Enter apply · type to filter · Esc cancel</OverlayHint>
    </Box>
  )
}

interface SkinPickerProps {
  gw: GatewayClient
  maxWidth?: number
  onClose: () => void
  t: Theme
}
