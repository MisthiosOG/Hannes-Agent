import { PassThrough } from 'stream'

import { renderSync } from '@hermes/ink'
import { createElement as h } from 'react'
import { it } from 'vitest'

import { StatusRule } from '../components/appChrome.js'
import { stripAnsi } from '../lib/text.js'
import { DEFAULT_THEME } from '../theme.js'

it('debug narrow 80', () => {
  for (const cols of [120, 100, 80, 60]) {
    const stdout = new PassThrough()
    let output = ''
    Object.assign(stdout, { columns: cols, isTTY: false, rows: 20 })
    stdout.on('data', c => (output += c.toString()))

    const el = h(StatusRule, {
      bgCount: 0,
      busy: false,
      cols,
      cwdLabel: '~/repo',
      gitBranch: 'main',
      lastTurnEndedAt: Date.now() - 5000,
      liveSessionCount: 0,
      model: 'opus-4.8',
      sessionStartedAt: Date.now() - 60000,
      sessionTitle: '',
      skillsCount: 43,
      status: 'ready',
      statusColor: DEFAULT_THEME.color.ok,
      t: DEFAULT_THEME,
      toolsCount: 21,
      turnStartedAt: null,
      usage: { context_max: 200000, context_percent: 25, context_used: 50000, total: 50000 },
      voiceLabel: '',
      yolo: false
    })
    const inst = renderSync(el, {
      patchConsole: false,
      stderr: new PassThrough() as never,
      stdin: new PassThrough() as never,
      stdout: stdout as never
    })
    inst.unmount()
    const line = stripAnsi(output).split('\n')[0]
    console.log(`cols=${cols} len=${line.length}:`, JSON.stringify(line))
    output = ''
  }
})
