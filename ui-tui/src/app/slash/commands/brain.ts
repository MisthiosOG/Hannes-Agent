import type { GatewayClient } from '../../../gatewayClient.js'
import { asRpcResult, rpcErrorMessage } from '../../../lib/rpc.js'
import { openExternalUrl } from '../../../lib/openExternalUrl.js'
import type { PanelSection } from '../../../types.js'
import type { SlashCommand } from '../types.js'

interface BrainSnapshot {
  categories?: { count: number; name: string }[]
  entities?: { count: number; name: string }[]
  facts?: { category: string; content: string; created_at: string; trust: number; used: number }[]
  facts_total?: number
  html_path?: string
  level?: number
  skills_tracked?: number
}

const factsPanel = (r: BrainSnapshot): PanelSection[] => {
  const sections: PanelSection[] = []

  sections.push({
    rows: [
      ['level', String(r.level ?? 1)],
      ['facts', String(r.facts_total ?? 0)],
      ['skills', String(r.skills_tracked ?? 0)]
    ],
    title: 'Brain'
  })

  const cats = r.categories ?? []
  if (cats.length) {
    sections.push({
      rows: cats.map(c => [c.name, `${c.count} facts`]),
      title: 'Categories'
    })
  }

  const facts = r.facts ?? []
  if (facts.length) {
    sections.push({
      rows: facts.map(f => [f.category, `${f.content}  (${f.trust.toFixed(2)}t · ${f.used}x)`]),
      title: `Top facts (${facts.length})`
    })
  }

  return sections
}

const loadBrain = (gw: GatewayClient): Promise<BrainSnapshot> =>
  gw
    .request<BrainSnapshot>('brain.snapshot', { limit: 40 })
    .then(raw => asRpcResult<BrainSnapshot>(raw) ?? {})

export const brainCommands: SlashCommand[] = [
  {
    help: 'show what the agent has learned (brain stats + facts)',
    name: 'brain',
    run: (arg, ctx) => {
      const wantWeb = arg.trim().toLowerCase() === 'web'

      if (wantWeb) {
        ctx.gateway.gw
          .request<BrainSnapshot>('brain.snapshot', { web: true, limit: 40 })
          .then(raw => {
            const r = asRpcResult<BrainSnapshot>(raw)
            const path = r?.html_path

            if (!path) {
              return ctx.transcript.sys('brain: no html view generated')
            }

            ctx.transcript.sys(`brain: wrote ${path}`)

            if (!openExternalUrl(`file:///${path.replace(/\\/g, '/')}`)) {
              ctx.transcript.sys(`brain: open ${path} in a browser`)
            }
          })
          .catch(ctx.guardedErr)

        return
      }

      loadBrain(ctx.gateway.gw)
        .then(r => {
          if (!(r.facts_total ?? 0)) {
            ctx.transcript.sys('brain: nothing learned yet — talk to the agent and it will start remembering')
          } else {
            ctx.transcript.panel('Hannes Brain', factsPanel(r))
          }
        })
        .catch(ctx.guardedErr)
    }
  }
]
