import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Outcome, SessionInfo, StatusKind } from '../types'

const P = 'session-status'
const outcome = atom({ plugin: 'session-status', key: 'outcome' } as const, 'idle')
const asks = atom({ plugin: 'session-status', key: 'asks' } as const, [])
const background = atom({ plugin: 'session-status', key: 'background' } as const, 0)
const info = atom({ plugin: 'session-status', key: 'info' } as const, { project: null, branch: null })
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

/** The last segment of a path, either separator. */
export function baseName(path: string): string {
  const parts = path.split(/[\\/]+/).filter(Boolean)
  return parts[parts.length - 1] ?? path
}

/** The info line: the project and, in a repository, its branch. */
export function infoLine(i: SessionInfo): string {
  return [i.project, i.branch].filter((part): part is string => part !== null).join('  ·  ')
}

/** Runs git in the session's folder; null when it fails (no repo, no git) or times out. */
async function git($: EngineInterface, args: string[]): Promise<string | null> {
  try {
    const run = await $.process.run(['git', ...args], { timeoutMs: 5000 })
    return run.exitCode === 0 ? run.stdout.trim() : null
  } catch {
    return null
  }
}

/** Reads the session's project and git branch; a part that cannot be read stays null. */
async function refreshInfo($: EngineInterface) {
  let project: string | null = null
  try {
    const repo = await $.session.repo()
    project = baseName(repo?.root ?? (await $.session.cwd()))
  } catch {
    // Unknown folder: no project shown.
  }
  const branch = await git($, ['rev-parse', '--abbrev-ref', 'HEAD'])
  const next: SessionInfo = { project, branch }
  await update($, info, () => next)
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
    await refreshInfo($)
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
      await refreshInfo($)
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
    const details = infoLine(await read($, info))
    const accent = color(kind)

    // A rounded card of two centered rows, IntelliJ-like: the title big and bold on top (click to edit; it
    // wraps, never cut), then the state pill beside the project and branch. Only the desktop takes a tint.
    return (
      <Box
        flexDirection="column"
        alignItems="center"
        gap={1}
        borderStyle="round"
        borderColor={accent}
        backgroundColor={e.surface === 'desktop' ? tint(accent) : undefined}
        paddingX={1}
      >
        {editing ? (
          <Box flexDirection="row" alignItems="center" gap={1}>
            <Input
              key="title-input"
              value={name ?? ''}
              placeholder="Título de la sesión"
              submitLabel="guardar"
              autoFocus
              onSubmit={value => void saveTitle($, value)}
            />
            <Button key="title-cancel" label="Cancelar" onPress={() => void update($, isEditing, () => false)} />
          </Box>
        ) : (
          <Button key="title" plain onPress={() => void update($, isEditing, () => true)}>
            <Text size="title" weight="bold" wrap="wrap">
              {name ?? 'Sin título (clic para ponerle uno)'}
            </Text>
          </Button>
        )}
        <Box flexDirection="row" alignItems="center" justifyContent="center" gap={1} flexWrap="wrap">
          <Box flexShrink={0} borderStyle="round" borderColor={accent} backgroundColor={accent} paddingX={1}>
            <Text color={textOn(accent)} weight="semibold" size="footnote">
              {LABELS[kind]}
            </Text>
          </Box>
          {details !== '' && (
            <Text dimColor size="footnote" wrap="wrap">
              {details}
            </Text>
          )}
        </Box>
      </Box>
    )
  })
}
