import { Box, Text, useInput, useStdout } from '@hermes/ink'
import { useEffect, useState } from 'react'

import type { GatewayClient } from '../gatewayClient.js'
import { rpcErrorMessage } from '../lib/rpc.js'
import type { Theme } from '../theme.js'

import { OverlayHint, useOverlayKeys, windowItems } from './overlayControls.js'
import { chipRowProps, clampOverlayWidth } from './overlayPrimitives.js'

const VISIBLE = 12
const MIN_WIDTH = 44
// Thin separator between header/info and the row list (cf. ModelPicker).
const divider = (width: number, color: string) => <Text color={color}>{'─'.repeat(width)}</Text>

interface PluginRow {
  description?: string
  name: string
  source?: string
  status?: string
  version?: string
}

interface PluginsListResponse {
  bundled_count?: number
  plugins?: PluginRow[]
  user_count?: number
}

interface PluginsToggleResponse {
  name?: string
  ok?: boolean
  plugin?: PluginRow
  unchanged?: boolean
}

type Scope = 'all' | 'user'

const GLYPH: Record<string, string> = {
  disabled: '✗',
  enabled: '✓'
}

export function PluginsHub({ gw, maxWidth, onClose, t }: PluginsHubProps) {
  const [rows, setRows] = useState<PluginRow[]>([])
  const [bundledCount, setBundledCount] = useState(0)
  const [userCount, setUserCount] = useState(0)
  const [idx, setIdx] = useState(0)
  const [scope, setScope] = useState<Scope>('user')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)

  const { stdout } = useStdout()
  // Optional maxWidth lets grid layouts hand the hub its cell budget.
  const preferredWidth = Math.max(MIN_WIDTH, (stdout?.columns ?? 80) - 2)
  const width = clampOverlayWidth(preferredWidth, maxWidth)

  const load = () => {
    gw.request<PluginsListResponse>('plugins.manage', { action: 'list' })
      .then(r => {
        setRows(r?.plugins ?? [])
        setUserCount(Number(r?.user_count ?? 0))
        setBundledCount(Number(r?.bundled_count ?? 0))
        setErr('')
        setLoading(false)
      })
      .catch((e: unknown) => {
        setErr(rpcErrorMessage(e))
        setLoading(false)
      })
  }

  useEffect(load, [gw])

  // Default to user plugins; fall back to all when there are none so the
  // overlay is never empty when bundled plugins exist.
  const visibleRows = scope === 'user' ? rows.filter(r => r.source !== 'bundled') : rows
  const effectiveRows = scope === 'user' && !visibleRows.length && rows.length ? rows : visibleRows
  const effectiveScope: Scope = effectiveRows === visibleRows ? scope : 'all'
  const clampedIdx = Math.min(idx, Math.max(0, effectiveRows.length - 1))

  useOverlayKeys({ disabled: busy, onClose })

  const toggle = (row: PluginRow) => {
    if (busy || !row) {
      return
    }

    const enable = row.status !== 'enabled'
    setBusy(true)
    setErr('')

    gw.request<PluginsToggleResponse>('plugins.manage', { action: 'toggle', enable, name: row.name })
      .then(r => {
        if (r?.plugin) {
          setRows(prev => prev.map(p => (p.name === r.plugin!.name ? r.plugin! : p)))
        } else {
          load()
        }
      })
      .catch((e: unknown) => setErr(rpcErrorMessage(e)))
      .finally(() => setBusy(false))
  }

  useInput((ch, key) => {
    if (busy) {
      return
    }

    const count = effectiveRows.length

    if (key.upArrow && clampedIdx > 0) {
      setIdx(clampedIdx - 1)

      return
    }

    if (key.downArrow && clampedIdx < count - 1) {
      setIdx(clampedIdx + 1)

      return
    }

    // Tab toggles user-only vs all (bundled) scope.
    if (key.tab) {
      setScope(s => (s === 'user' ? 'all' : 'user'))
      setIdx(0)

      return
    }

    if (key.return || ch === ' ') {
      const row = effectiveRows[clampedIdx]

      if (row) {
        toggle(row)
      }

      return
    }

    const n = ch === '0' ? 10 : parseInt(ch, 10)

    if (!Number.isNaN(n) && n >= 1 && n <= Math.min(10, count)) {
      const next = n - 1
      const row = effectiveRows[next]

      if (row) {
        setIdx(next)
        toggle(row)
      }
    }
  })

  if (loading) {
    return <Text color={t.color.muted}>loading plugins…</Text>
  }

  if (err && !rows.length) {
    return (
      <Box flexDirection="column" width={width}>
        <Text color={t.color.label}>error: {err}</Text>
        <OverlayHint t={t}>Esc/q close</OverlayHint>
      </Box>
    )
  }

  if (!rows.length) {
    return (
      <Box flexDirection="column" width={width}>
        <Text bold color={t.color.accent}>
          Plugins Hub
        </Text>
        <Text color={t.color.muted}>no plugins installed</Text>
        <Text color={t.color.muted}>install: hermes plugins install owner/repo</Text>
        <OverlayHint t={t}>Esc/q close</OverlayHint>
      </Box>
    )
  }

  const labels = effectiveRows.map(r => {
    const status = r.status ?? 'not enabled'
    const glyph = GLYPH[status] ?? '○'
    const ver = r.version ? ` v${r.version}` : ''
    const src = effectiveScope === 'all' && r.source === 'bundled' ? ' [bundled]' : ''
    const state = status === 'enabled' ? '' : ` (${status})`

    return `${glyph} ${r.name}${ver}${src}${state}`
  })

  const { items, offset } = windowItems(labels, clampedIdx, VISIBLE)

  const scopeLabel =
    effectiveScope === 'user'
      ? `${userCount} user plugin(s)${bundledCount ? ` · +${bundledCount} bundled (Tab)` : ''}`
      : `all ${rows.length} plugins`

  return (
    <Box flexDirection="column" width={width}>
      <Text bold color={t.color.accent}>
        Plugins Hub
      </Text>

      <Text color={t.color.muted}>{scopeLabel}</Text>
      <Text color={t.color.muted}>{offset > 0 ? ` ↑ ${offset} more` : ' '}</Text>

      {divider(width, t.color.border)}

      {items.map((row, i) => {
        const lineIdx = offset + i
        const active = clampedIdx === lineIdx

        return (
          <Text
            color={t.color.muted}
            {...chipRowProps(t, active)}
            key={effectiveRows[lineIdx]?.name ?? row}
            wrap="truncate-end"
          >
            {active ? '▸ ' : '  '}
            {lineIdx + 1}. {row}
          </Text>
        )
      })}

      <Text color={t.color.muted}>
        {offset + VISIBLE < labels.length ? ` ↓ ${labels.length - offset - VISIBLE} more` : ' '}
      </Text>

      {divider(width, t.color.border)}

      {err ? <Text color={t.color.label}>error: {err}</Text> : null}
      {busy ? <Text color={t.color.accent}>updating…</Text> : null}

      <OverlayHint t={t}>↑/↓ select · Enter/Space toggle · Tab user/all · 1-9,0 quick · Esc/q close</OverlayHint>
    </Box>
  )
}

interface PluginsHubProps {
  gw: GatewayClient
  maxWidth?: number
  onClose: () => void
  t: Theme
}
