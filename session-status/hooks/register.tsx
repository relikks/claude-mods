import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Outcome, StatusKind } from '../types'

const P = 'session-status'
const outcome = atom({ plugin: 'session-status', key: 'outcome' } as const, 'idle')
const asks = atom({ plugin: 'session-status', key: 'asks' } as const, [])
const background = atom({ plugin: 'session-status', key: 'background' } as const, 0)
const title = atom({ plugin: 'session-status', key: 'title' } as const, null)
const isEditing = atom({ plugin: 'session-status', key: 'isEditing' } as const, false)

// The desktop app's own session tools: they hold the title the sidebar shows.
const APP = 'ccd_session_mgmt'

// Tools that always wait on the person: a question put to them, a plan to approve.
const PERSON_TOOLS = ['AskUserQuestion', 'ExitPlanMode']

const LABELS: Record<StatusKind, string> = {
  working: 'Trabajando',
  attention: 'Te necesita',
  background: 'En segundo plano',
  idle: 'Esperando tu mensaje',
  error: 'Error',
  stopped: 'Detenida',
}

const DEFAULT_COLORS: Record<StatusKind, string> = {
  working: '#2563eb',
  attention: '#f59e0b',
  background: '#7c3aed',
  idle: '#16a34a',
  error: '#dc2626',
  stopped: '#6b7280',
}

/** Black or white text, whichever reads better on a `#rrggbb` background; white for anything else. */
export function textOn(background: string): string {
  const hex = background.trim()
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return '#ffffff'
  const channel = (at: number) => {
    const c = parseInt(hex.slice(at, at + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
  return luminance > 0.4 ? '#111111' : '#ffffff'
}

/**
 * The pill's dot as an SVG in `fill`: an arc that spins while working, a ring that pulses out while it needs the
 * person, a slow breath in the background, still otherwise. SMIL only: it animates without script.
 */
export function dotSvg(kind: StatusKind, fill: string): string {
  const open = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12">`
  if (kind === 'working') {
    return `${open}<circle cx="6" cy="6" r="4.5" fill="none" stroke="${fill}" stroke-opacity="0.3" stroke-width="2"/><path d="M6 1.5a4.5 4.5 0 0 1 4.5 4.5" fill="none" stroke="${fill}" stroke-width="2" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" from="0 6 6" to="360 6 6" dur="0.9s" repeatCount="indefinite"/></path></svg>`
  }
  if (kind === 'attention') {
    return `${open}<circle cx="6" cy="6" r="3" fill="none" stroke="${fill}" stroke-width="1.5"><animate attributeName="r" values="3;5.5" dur="1.2s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.9;0" dur="1.2s" repeatCount="indefinite"/></circle><circle cx="6" cy="6" r="3" fill="${fill}"/></svg>`
  }
  if (kind === 'background') {
    return `${open}<circle cx="6" cy="6" r="3.5" fill="${fill}"><animate attributeName="opacity" values="1;0.35;1" dur="2.4s" repeatCount="indefinite"/></circle></svg>`
  }
  return `${open}<circle cx="6" cy="6" r="3.5" fill="${fill}"/></svg>`
}

/** A double chevron (») in `stroke`, the title's lead-in. */
export function chevronsSvg(stroke: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7l5 5l-5 5"/><path d="M13 7l5 5l-5 5"/></svg>`
}

/** A faint wash of a `#rrggbb` color (about 12% opacity); undefined for anything else. */
export function tint(accent: string): string | undefined {
  const hex = accent.trim()
  return /^#[0-9a-f]{6}$/i.test(hex) ? `${hex}1f` : undefined
}

/**
 * The state to draw. Whether a turn runs is the engine's own word (`isWorking` of the band), never inferred
 * from tool calls, so no missed event can leave the band working. While a turn runs, a call waiting on the
 * person makes it "needs you". Otherwise the band shows how the main conversation's last turn ended, and
 * "in the background" when that turn stopped with work still in flight that will wake the session.
 */
export function shownKind(isWorking: boolean, pending: readonly string[], last: Outcome, inFlight: number): StatusKind {
  if (!isWorking) return last === 'idle' && inFlight > 0 ? 'background' : last
  return pending.length > 0 ? 'attention' : 'working'
}

/**
 * The key of a call waiting on the person: its loop, tool and input, so that a parallel call of the same tool
 * settling does not settle this one. Every event that settles a call carries the same three.
 */
export function askKey(loop: string | undefined, tool: string, input: unknown): string {
  let args: string
  try {
    args = JSON.stringify(input) ?? ''
  } catch {
    args = ''
  }
  return `${loop ?? 'main'}:${tool}:${args}`
}

/** Whether `key` belongs to `loop` (`undefined` for the main conversation). */
export function ofLoop(key: string, loop: string | undefined): boolean {
  return key.startsWith(`${loop ?? 'main'}:`)
}

async function addAsk($: EngineInterface, key: string) {
  await update($, asks, list => (list.includes(key) ? list : [...list, key]))
}

async function dropAsks($: EngineInterface, keep: (key: string) => boolean) {
  await update($, asks, list => (list.every(keep) ? list : list.filter(keep)))
}

/** The call no longer waits on the person. */
async function settle($: EngineInterface, loop: string | undefined, tool: string, input: unknown) {
  const key = askKey(loop, tool, input)
  await dropAsks($, k => k !== key)
}

/** Nothing of `loop` waits on the person any more. */
async function settleLoop($: EngineInterface, loop: string | undefined) {
  await dropAsks($, k => !ofLoop(k, loop))
}

/** The session's title as the app's sidebar shows it, or null where the app's tools are not reachable. */
async function appTitle($: EngineInterface): Promise<string | null> {
  try {
    const result = await $.mcp.call(APP, 'get_session', { session_id: 'self' })
    if (result.isError) return null
    const structured = result.structuredContent as { title?: unknown } | undefined
    if (typeof structured?.title === 'string') return structured.title
    for (const block of result.content) {
      if (block.type !== 'text' || block.text === undefined) continue
      try {
        const parsed = JSON.parse(block.text) as { title?: unknown }
        if (typeof parsed.title === 'string') return parsed.title
      } catch {
        // Not JSON: look at the next block.
      }
    }
  } catch {
    // No app tools here (a terminal session): the band keeps its own title.
  }
  return null
}

/** The title this mod saved for the session, kept for sessions with no app sidebar. */
async function savedTitle($: EngineInterface): Promise<string | null> {
  try {
    const saved = await $.store.get(`${P}:title:${await $.session.id()}`)
    return typeof saved === 'string' ? saved : null
  } catch {
    return null
  }
}

async function refreshTitle($: EngineInterface) {
  if (await read($, isEditing)) return
  const next = (await appTitle($)) ?? (await savedTitle($))
  if (next !== null && next !== (await read($, title))) await update($, title, () => next)
}

async function saveTitle($: EngineInterface, value: string) {
  const text = value.replace(/\s+/g, ' ').trim()
  await update($, isEditing, () => false)
  if (text === '') return
  await update($, title, () => text)
  try {
    await $.store.set(`${P}:title:${await $.session.id()}`, text)
  } catch {
    // The band still shows it for this session.
  }
  try {
    const result = await $.mcp.call(APP, 'set_session_title', { session_id: 'self', title: text })
    if (result.isError) $.ui.toast('Título guardado en la franja; la app no ha cambiado el de la barra lateral')
  } catch {
    // A terminal session has no sidebar title to change.
  }
}

export const register: Register = (on, options) => {
  const color = (kind: StatusKind): string => {
    const value = options[`color_${kind}`]
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : DEFAULT_COLORS[kind]
  }

  on('session.start', async ($, e, next) => {
    await refreshTitle($)
    return next(e)
  })

  // A new turn of the main conversation (a background task waking it too) forgets how the last one ended,
  // the work it left in flight (its Stop counts again) and the main conversation's asks left over.
  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      await update($, outcome, (): Outcome => 'idle')
      await update($, background, () => 0)
      await settleLoop($, undefined)
    }
    return next(e)
  })

  // Claude raises PermissionRequest when it is about to put a call to the person: it waits on them unless a
  // hook down the chain settled it.
  on('classic.PermissionRequest', async ($, e, next) => {
    const answer = await next(e)
    if (answer.decision === undefined && answer.block === undefined) {
      await addAsk($, askKey(e.agent_id, e.tool_name, e.tool_input))
    }
    return answer
  })

  // A question or a plan always waits on the person, whatever the mode.
  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    if (e.tool_use_id !== undefined && verdict.decision === 'ask' && PERSON_TOOLS.includes(e.tool)) {
      await addAsk($, askKey(e.agentId, e.tool, e.input))
    }
    return verdict
  }).catch(($, e, next) => next(e))

  // The ask is settled once the call ran, failed or was denied.
  on('classic.PostToolUse', async ($, e, next) => {
    await settle($, e.agent_id, e.tool_name, e.tool_input)
    return next(e)
  })
  on('classic.PostToolUseFailure', async ($, e, next) => {
    await settle($, e.agent_id, e.tool_name, e.tool_input)
    return next(e)
  })
  on('classic.PermissionDenied', async ($, e, next) => {
    await settle($, e.agent_id, e.tool_name, e.tool_input)
    return next(e)
  })

  // A loop asks the model again only once its calls are answered: nothing of that loop waits on the person.
  on('turn.step', async function* ($, e, next) {
    await settleLoop($, e.agentId)
    return yield* next(e)
  })

  on('turn.complete', async ($, e, next) => {
    // A loop that ended (a subagent's or a teammate's included) waits on the person no more.
    await settleLoop($, e.agentId)
    if (e.agentId === undefined) {
      const ended: Outcome = e.reason === 'answer' ? 'idle' : e.reason === 'aborted' ? 'stopped' : 'error'
      await update($, outcome, () => ended)
      await refreshTitle($)
    }
    return next(e)
  })

  // Claude's own count of the work still in flight when the main turn stopped: subagents, workflows, shells
  // and monitors that will wake the session. A subagent's stop recounts it.
  on('classic.Stop', async ($, e, next) => {
    if (e.agent_id === undefined) await update($, background, () => (e.background_tasks ?? []).length)
    return next(e)
  })
  on('classic.SubagentStop', async ($, e, next) => {
    if (e.background_tasks !== undefined) {
      const inFlight = e.background_tasks.length
      await update($, background, () => inFlight)
    }
    return next(e)
  })

  // Claude's own word for a main turn that died on an API error, in case turn.complete was not heard.
  on('classic.StopFailure', async ($, e, next) => {
    if (e.agent_id === undefined) await update($, outcome, (): Outcome => 'error')
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || e.surface === 'mobile') return next(e)
    const { Box, Text, Button, Input } = $.ui.resolve(e)

    const kind = shownKind(e.props.isWorking, await read($, asks), await read($, outcome), await read($, background))
    const name = await read($, title)
    const editing = await read($, isEditing)
    const accent = color(kind)
    const onAccent = textOn(accent)
    // The desktop draws the icons as SVG (the dot animated); the terminal, which has no Svg, as text.
    const desktop = e.surface === 'desktop' ? $.ui.resolve(e) : null
    const arrow = desktop ? (
      <desktop.Svg source={chevronsSvg(accent)} alt="»" width={16} height={16} />
    ) : (
      <Text color={accent} weight="bold">
        »
      </Text>
    )
    const dot = desktop ? (
      <desktop.Svg source={dotSvg(kind, onAccent)} alt={LABELS[kind]} width={12} height={12} isInteractive />
    ) : (
      <Text color={onAccent}>●</Text>
    )
    const stopEditing = () => void update($, isEditing, () => false)
    const startEditing = () => void update($, isEditing, () => true)

    // One rounded row, IntelliJ-like: a double chevron in the state's color and the title, bold, filling the
    // row and wrapping when long; a pencil to edit it shows on hover (always while there is no title); the
    // state pill with its live dot closes the row. Only the desktop takes a translucent tint.
    return (
      <Box
        key="band"
        flexDirection="row"
        alignItems="center"
        gap={1}
        borderStyle="round"
        borderColor={accent}
        backgroundColor={e.surface === 'desktop' ? tint(accent) : undefined}
        paddingX={1}
      >
        <Box flexShrink={0}>{arrow}</Box>
        <Box flexGrow={1} flexShrink={1} flexDirection="row" alignItems="center" gap={1}>
          {editing ? (
            <>
              <Box flexGrow={1}>
                <Input
                  key="title-input"
                  value={name ?? ''}
                  placeholder="Título de la sesión"
                  submitLabel="guardar"
                  autoFocus
                  onSubmit={value => void saveTitle($, value)}
                />
              </Box>
              <Button key="title-cancel" role="dismiss" label="✕" onPress={stopEditing} />
            </>
          ) : (
            <>
              <Box flexShrink={1}>
                <Text size="heading" weight="bold" wrap="wrap" dimColor={name === null}>
                  {name ?? 'Sin título'}
                </Text>
              </Box>
              <Box flexShrink={0} display={name === null ? 'flex' : 'none'} hover={{ display: 'flex' }}>
                <Button key="title" plain label="✎" onPress={startEditing} />
              </Box>
            </>
          )}
        </Box>
        <Box
          flexShrink={0}
          flexDirection="row"
          alignItems="center"
          gap={1}
          borderStyle="round"
          borderColor={accent}
          backgroundColor={accent}
          paddingX={1}
        >
          {dot}
          <Text color={onAccent} weight="semibold" size="footnote">
            {LABELS[kind]}
          </Text>
        </Box>
      </Box>
    )
  })
}
