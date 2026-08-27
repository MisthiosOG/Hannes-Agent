import { Box, stringWidth, Text, useStdout } from '@hermes/ink'
import { useStore } from '@nanostores/react'
import type { ReactNode } from 'react'

import { useGateway } from '../app/gatewayContext.js'
import type { AppOverlaysProps } from '../app/interfaces.js'
import { fuzzyMatchIndices } from '../app/slash/fuzzyScore.js'
import { $overlayState, hasFloatingPanel, patchOverlayState } from '../app/overlayStore.js'
import { $uiSessionId, $uiTheme } from '../app/uiStore.js'

import { ActiveSessionSwitcher } from './activeSessionSwitcher.js'
import { FloatBox } from './appChrome.js'
import { BillingOverlay } from './billingOverlay.js'
import { MaskedPrompt } from './maskedPrompt.js'
import { ModelPicker } from './modelPicker.js'
import { OverlayHint } from './overlayControls.js'
import { listRowStyle } from './overlayPrimitives.js'
import { PetPicker } from './petPicker.js'
import { PluginsHub } from './pluginsHub.js'
import { ApprovalPrompt, ClarifyPrompt, ConfirmPrompt } from './prompts.js'
import { SkillsHub } from './skillsHub.js'
import { SubscriptionOverlay } from './subscriptionOverlay.js'
import { WidgetGrid, type WidgetGridWidget } from './widgetGrid.js'

const COMPLETION_WINDOW = 16

// Command-palette meta sanitizer. Gateway descriptions mix usage blocks,
// alias notes, and decorative emoji — all noise at palette density. Strip to
// a short, uniform, emoji-free phrase: the palette is text-only by design.
const cleanCommandMeta = (meta: string): string => {
  const out = meta
    .replace(/\s*\(usage:[^)]*\)/gi, '')
    .replace(/\s*\(alias for [^)]*\)/gi, '')
    // Emoji + decorative symbol ranges (⚡ ✦ ✧ 🧠 ★ …) anywhere in the text.
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()

  return out.length > 60 ? `${out.slice(0, 59).trimEnd()}…` : out
}

/**
 * A prompt hosted in a single-cell WidgetGrid with the classic 1-cell padding.
 * The inner full-width column restores the horizontal stretch the old plain
 * padded Box gave its child, so rendering is identical; routing through the
 * grid makes the prompt zone a layout-engine surface like the desktop app's
 * pane shell.
 */
function PromptCell({ children, cols, id }: { children: ReactNode; cols: number; id: string }) {
  return (
    <Box flexDirection="column" flexShrink={0}>
      <WidgetGrid
        cols={cols}
        columns={1}
        gap={0}
        paddingX={1}
        paddingY={1}
        rowGap={0}
        widgets={[
          {
            children: (
              <Box flexDirection="column" width="100%">
                {children}
              </Box>
            ),
            id
          }
        ]}
      />
    </Box>
  )
}

export function PromptZone({
  cols,
  onApprovalChoice,
  onClarifyAnswer,
  onClarifyQuestionAnswer,
  onSecretSubmit,
  onSudoSubmit
}: Pick<
  AppOverlaysProps,
  'cols' | 'onApprovalChoice' | 'onClarifyAnswer' | 'onClarifyQuestionAnswer' | 'onSecretSubmit' | 'onSudoSubmit'
>) {
  const overlay = useStore($overlayState)
  const theme = useStore($uiTheme)

  if (overlay.approval) {
    return (
      <PromptCell cols={cols} id="approval">
        <ApprovalPrompt cols={cols} onChoice={onApprovalChoice} req={overlay.approval} t={theme} />
      </PromptCell>
    )
  }

  if (overlay.billing) {
    const current = overlay.billing

    const onPatch = (next: Partial<typeof current>) =>
      patchOverlayState(prev => (prev.billing ? { ...prev, billing: { ...prev.billing, ...next } } : prev))

    const onClose = () => patchOverlayState({ billing: null })

    return (
      <PromptCell cols={cols} id="billing">
        <BillingOverlay onClose={onClose} onPatch={onPatch} overlay={current} t={theme} />
      </PromptCell>
    )
  }

  if (overlay.subscription) {
    const current = overlay.subscription

    const onPatch = (next: Partial<typeof current>) =>
      patchOverlayState(prev =>
        prev.subscription ? { ...prev, subscription: { ...prev.subscription, ...next } } : prev
      )

    const onClose = () => patchOverlayState({ subscription: null })

    return (
      <PromptCell cols={cols} id="subscription">
        <SubscriptionOverlay onClose={onClose} onPatch={onPatch} overlay={current} t={theme} />
      </PromptCell>
    )
  }

  if (overlay.confirm) {
    const req = overlay.confirm

    const onConfirm = () => {
      patchOverlayState({ confirm: null })
      req.onConfirm()
    }

    const onCancel = () => patchOverlayState({ confirm: null })

    return (
      <PromptCell cols={cols} id="confirm">
        <ConfirmPrompt onCancel={onCancel} onConfirm={onConfirm} req={req} t={theme} />
      </PromptCell>
    )
  }

  if (overlay.clarify) {
    return (
      <PromptCell cols={cols} id="clarify">
        <ClarifyPrompt
          cols={cols}
          onAnswer={onClarifyAnswer}
          onCancel={() => onClarifyAnswer('')}
          onQuestionAnswer={onClarifyQuestionAnswer}
          req={overlay.clarify}
          t={theme}
        />
      </PromptCell>
    )
  }

  if (overlay.sudo) {
    return (
      <PromptCell cols={cols} id="sudo">
        <MaskedPrompt cols={cols} icon="🔐" label="sudo password required" onSubmit={onSudoSubmit} t={theme} />
      </PromptCell>
    )
  }

  if (overlay.secret) {
    return (
      <PromptCell cols={cols} id="secret">
        <MaskedPrompt
          cols={cols}
          icon="🔑"
          label={overlay.secret.prompt}
          onSubmit={onSecretSubmit}
          sub={`for ${overlay.secret.envVar}`}
          t={theme}
        />
      </PromptCell>
    )
  }

  return null
}

export function FloatingOverlays({
  cols,
  compIdx,
  completions,
  onActiveSessionSelect,
  onActiveSessionClose,
  onCompAccept,
  onCompSelect,
  onModelSelect,
  onNewLiveSession,
  onNewPromptSession,
  onResumeSelect,
  pagerPageSize,
  query
}: Pick<
  AppOverlaysProps,
  | 'cols'
  | 'compIdx'
  | 'completions'
  | 'onActiveSessionSelect'
  | 'onActiveSessionClose'
  | 'onCompAccept'
  | 'onCompSelect'
  | 'onModelSelect'
  | 'onNewLiveSession'
  | 'onNewPromptSession'
  | 'onResumeSelect'
  | 'pagerPageSize'
  | 'query'
>) {
  const { gw } = useGateway()
  const overlay = useStore($overlayState)
  const sid = useStore($uiSessionId)
  const theme = useStore($uiTheme)
  // Hook order matters: this must stay ABOVE the `hasAny` early return so the
  // hook count is identical whether or not any overlay is visible (#310).
  const stdoutRows = useStdout().stdout?.rows ?? 24

  const hasAny = hasFloatingPanel(overlay) || completions.length

  if (!hasAny) {
    return null
  }

  // Fixed viewport centered on compIdx — previously the slice end was
  // compIdx + 8 so the dropdown grew from 8 rows to 16 as the user scrolled
  // down, bouncing the height on every keystroke.
  //
  // Capped by the terminal height too: the palette floats above the composer,
  // and a palette taller than the space above it triggers the renderer's
  // negative-y clamp (shift-down), which paints its bottom rows over the
  // composer card. Reserve ~9 rows for card + statusline + gap + chrome.
  const maxViewportRows = Math.max(4, stdoutRows - 9)
  const viewportSize = Math.min(COMPLETION_WINDOW, completions.length, maxViewportRows)

  const start = Math.max(0, Math.min(compIdx - Math.floor(COMPLETION_WINDOW / 2), completions.length - viewportSize))

  // Every floating panel is a widget in a single-column grid. Panels keep
  // their intrinsic (content-hugging) widths inside full-width cells today;
  // multi-column tiling on wide terminals is a `columns`/track change here,
  // not a rewrite. `maxWidth` hands each panel its cell budget — with one
  // column it never binds, so rendering is identical to the pre-grid layout.
  const widgets: WidgetGridWidget[] = []

  if (overlay.sessions) {
    widgets.push({
      id: 'sessions',
      render: width => (
        <FloatBox color={theme.color.border} width={width}>
          <ActiveSessionSwitcher
            currentSessionId={sid}
            gw={gw}
            maxWidth={width}
            onCancel={() => patchOverlayState({ sessions: false })}
            onClose={onActiveSessionClose}
            onNew={onNewLiveSession}
            onNewPrompt={onNewPromptSession}
            onResume={onResumeSelect}
            onSelect={onActiveSessionSelect}
            t={theme}
          />
        </FloatBox>
      )
    })
  }

  if (overlay.modelPicker) {
    const initialRefresh = typeof overlay.modelPicker === 'object' && overlay.modelPicker.refresh === true

    widgets.push({
      id: 'model-picker',
      render: width => (
        <FloatBox color={theme.color.border} width={width}>
          <ModelPicker
            gw={gw}
            initialRefresh={initialRefresh}
            maxWidth={width}
            onCancel={() => patchOverlayState({ modelPicker: false })}
            onSelect={onModelSelect}
            sessionId={sid}
            t={theme}
          />
        </FloatBox>
      )
    })
  }

  if (overlay.petPicker) {
    widgets.push({
      id: 'pet-picker',
      render: width => (
        <FloatBox color={theme.color.border} width={width}>
          <PetPicker gw={gw} maxWidth={width} onClose={() => patchOverlayState({ petPicker: false })} t={theme} />
        </FloatBox>
      )
    })
  }

  if (overlay.skillsHub) {
    widgets.push({
      id: 'skills-hub',
      render: width => (
        <FloatBox color={theme.color.border} width={width}>
          <SkillsHub gw={gw} maxWidth={width} onClose={() => patchOverlayState({ skillsHub: false })} t={theme} />
        </FloatBox>
      )
    })
  }

  if (overlay.pluginsHub) {
    widgets.push({
      id: 'plugins-hub',
      render: width => (
        <FloatBox color={theme.color.border} width={width}>
          <PluginsHub gw={gw} maxWidth={width} onClose={() => patchOverlayState({ pluginsHub: false })} t={theme} />
        </FloatBox>
      )
    })
  }

  const pager = overlay.pager

  if (pager) {
    widgets.push({
      id: 'pager',
      render: width => (
        <FloatBox color={theme.color.border} width={width}>
          <Box flexDirection="column" paddingX={1} paddingY={1}>
            {pager.title && (
              <Box justifyContent="center" marginBottom={1}>
                <Text bold color={theme.color.primary}>
                  {pager.title}
                </Text>
              </Box>
            )}

            {pager.lines.slice(pager.offset, pager.offset + pagerPageSize).map((line, i) => (
              <Text key={i}>{line}</Text>
            ))}

            <Box marginTop={1}>
              <OverlayHint t={theme}>
                {pager.offset + pagerPageSize < pager.lines.length
                  ? `↑↓/jk line · Enter/Space/PgDn page · b/PgUp back · g/G top/bottom · Esc/q close (${Math.min(pager.offset + pagerPageSize, pager.lines.length)}/${pager.lines.length})`
                  : `end · ↑↓/jk · b/PgUp back · g top · Esc/q close (${pager.lines.length} lines)`}
              </OverlayHint>
            </Box>
          </Box>
        </FloatBox>
      )
    })
  }

  if (completions.length) {
    widgets.push({
      id: 'completions',
      render: () => {
        // Command palette: query header (slash stripped — the user already
        // typed it in the composer) + fuzzy-highlighted rows + short hint.
        // No panel fill: rows sit on the terminal's own background; only the
        // ACTIVE row carries the selection surface (completionCurrentBg),
        // mirroring the session switcher.
        const paletteQuery = (query ?? '').replace(/^\//, '').trim()
        const width = Math.max(28, cols)

        // Stable name track: measured across ALL commands (not just the
        // visible window) and capped, so the description column never jumps
        // when a long skill name scrolls into view. Names past the cap
        // truncate with an ellipsis.
        const NAME_CAP = 22
        const nameW =
          Math.min(
            NAME_CAP,
            Math.max(...completions.map(item => stringWidth(item.display.replace(/^\//, ''))))
          ) + 2

        const renderName = (name: string, active: boolean) => {
          const shown = name.length > NAME_CAP ? `${name.slice(0, NAME_CAP - 1)}…` : name
          const hits = new Set(fuzzyMatchIndices(paletteQuery, shown))

          return [...shown].map((ch, i) => (
            <Text
              key={i}
              bold={active || hits.has(i)}
              color={hits.has(i) ? theme.color.primary : active ? theme.color.text : theme.color.label}
            >
              {ch}
            </Text>
          ))
        }

return (
          // OpenCode-style: accent left rail + thin dividers between the
          // query header, the command rows, and the hint — same language as
          // the ClarifyPrompt option list, so /cmd does not look like a
          // separate boxed UI.
          //
          // Rail is drawn as text, not borderLeft: the container already
          // shifts left 1 to hug the card edge; border glyphs at x<0 get
          // dropped by the renderer, text does not.
          <Box
            backgroundColor={theme.color.completionBg}
            flexDirection="column"
            marginBottom={1}
            width={width}
          >
              <Box flexDirection="row" paddingBottom={0}>
                <Text color={theme.color.primary}>│ › </Text>
                <Text color={theme.color.text} wrap="truncate-end">
                  {paletteQuery}
                </Text>
              </Box>
              <Text color={theme.color.border}>{`│${'─'.repeat(Math.max(0, width - 2))}`}</Text>

              {(() => {
                const visible = completions.slice(start, start + viewportSize)
                // Explicit meta width: flex-shrink alone lets the Text measure
                // wider than its box (Ink's AtMost pass), so the truncation
                // ellipsis rendered past the border. Pin the column instead —
                // interior = width - 2 borders; minus name track and its pad.
                const metaW = Math.max(8, width - 4 - (nameW + 1))

                return visible.map((item, i) => {
                  const active = start + i === compIdx
                  const row = listRowStyle(theme, active)
                  const name = item.display.replace(/^\//, '')
                  const meta = item.meta ? cleanCommandMeta(item.meta) : ''

                  return (
                    <Box
                      backgroundColor={row.backgroundColor}
                      flexDirection="row"
                      key={`${start + i}:${item.text}:${item.display}:${item.meta ?? ''}`}
                      // Mouse support: click a row to select it, click the
                      // active row again to accept it into the input (parity
                      // with ↑↓ + Tab).
                      onMouseDown={
                        onCompSelect
                          ? () => {
                              const idx = start + i

                              if (idx === compIdx) {
                                onCompAccept?.(idx)
                              } else {
                                onCompSelect(idx)
                              }
                            }
                          : undefined
                      }
                      width={width - 1}
                    >
                      <Text color={active ? row.color : theme.color.primary}>│</Text>
                      <Box flexShrink={0} width={nameW + 1}>
                        <Text> </Text>
                        {renderName(name, active)}
                      </Box>
                      {meta ? (
                        <Box flexShrink={1} overflow="hidden" width={metaW}>
                          <Text
                            color={active ? row.color : theme.color.muted}
                            wrap="truncate-end"
                          >
                            {meta}
                          </Text>
                        </Box>
                      ) : null}
                    </Box>
                  )
                })
              })()}

              <Text color={theme.color.border}>{`│${'─'.repeat(Math.max(0, width - 2))}`}</Text>

              <Text color={theme.color.muted}>
                {`│ ${completions.length} commands · ↑↓ select · tab fill · ⏎ run · esc close`}
              </Text>
            </Box>
        )
      }
    })
  }

  return (
    <Box alignItems="flex-start" bottom="100%" flexDirection="column" left={-1} position="absolute" right={0}>
      <WidgetGrid cols={cols} columns={1} gap={0} paddingX={0} paddingY={0} rowGap={0} widgets={widgets} />
    </Box>
  )
}
