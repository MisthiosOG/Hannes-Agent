import { useStore } from '@nanostores/react'
import { useCallback, useEffect, useState } from 'react'
import { useInput } from '@hermes/ink'

import { GatewayProvider } from './app/gatewayContext.js'
import { $uiState } from './app/uiStore.js'
import { useMainApp } from './app/useMainApp.js'
import { AppLayout } from './components/appLayout.js'
import { QuitScreen } from './components/quitScreen.js'
import { SplashScreen } from './components/splashScreen.js'
import type { GatewayClient } from './gatewayClient.js'
import { AlternateScreen } from '@hermes/ink'

export function App({ gw }: { gw: GatewayClient }) {
  const { appActions, appComposer, appProgress, appStatus, appTranscript, gateway, submitRef } = useMainApp(gw)
  const { mouseTracking } = useStore($uiState)
  const [showSplash, setShowSplash] = useState(true)
  const [quitting, setQuitting] = useState(false)
  const ui = useStore($uiState)

  // Global Ctrl+C — ONLY while the splash screen is up (no useInputHandlers
  // mounted there, so this is the sole Ctrl+C owner). Once inside the main
  // TUI, Ctrl+C belongs to useInputHandlers' pipeline: selected text → copy,
  // busy → interrupt, draft → clear, idle → quit. A second global handler
  // would pre-empt the copy path and quit mid-selection.
  useInput(
    (ch, key) => {
      if (key.ctrl && (ch === 'c' || ch === '\x03')) {
        setQuitting(true)
      }
    },
    { isActive: showSplash }
  )

  // Global SIGINT handler — catch the signal, render quit screen, then exit.
  useEffect(() => {
    const h = () => setQuitting(true)
    process.on('SIGINT', h)
    return () => { process.removeListener('SIGINT', h) }
  }, [])

  // The TUI's own Ctrl+C pipeline (useInputHandlers) quits via
  // patchUiState({ quitting: true }) — the nanostore. The QuitScreen below is
  // gated on the LOCAL `quitting` state, so mirror the store's flag here or
  // the quit path set by /quit / Ctrl+C-idle would never render the screen.
  useEffect(() => {
    if (ui.quitting) {
      setQuitting(true)
    }
  }, [ui.quitting])

  // When quitting, auto-exit after 3s so the process doesn't hang.
  useEffect(() => {
    if (!quitting) return
    const t = setTimeout(() => gw.kill('app.die'), 3500)
    return () => clearTimeout(t)
  }, [quitting, gw])

  const handleSplashSubmit = useCallback((prompt: string) => {
    setShowSplash(false)
    setTimeout(() => {
      submitRef.current(prompt)
    }, 80)
  }, [submitRef])

  if (quitting) {
    return (
      <AlternateScreen mouseTracking="off">
        <QuitScreen
          cwd={ui.info?.cwd}
          model={ui.info?.model}
          sessionTitle={ui.sessionTitle}
          t={ui.theme}
          onDone={() => {
            // Do NOT reset quitting — that would re-render the normal app
            // before the process exits. Just die directly.
            gw.kill('app.die')
            process.exit(0)
          }}
        />
      </AlternateScreen>
    )
  }

  if (showSplash) {
    return (
      <AlternateScreen mouseTracking="off">
        <SplashScreen
          onSubmit={handleSplashSubmit}
          planMode={ui.planMode}
          t={ui.theme}
        />
      </AlternateScreen>
    )
  }

  return (
    <GatewayProvider value={gateway}>
      <AppLayout
        actions={appActions}
        composer={appComposer}
        mouseTracking={mouseTracking}
        progress={appProgress}
        status={appStatus}
        transcript={appTranscript}
      />
    </GatewayProvider>
  )
}
