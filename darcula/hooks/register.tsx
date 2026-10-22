import type { BoxHoverProps, BoxProps, Register, RenderPropsOf, ToolGroupCall } from 'claude-code'

/** IntelliJ's two dark looks: Darcula (the classic UI) and the New UI's Dark. */
export type Variant = 'classic' | 'newui'

/**
 * What fills a frame: a faint wash of its color (reads with the app light or dark), the variant's own solid
 * panels (only with the app dark: the text inside is the app's, never the mod's), or nothing but the border.
 */
export type Fill = 'tint' | 'solid' | 'none'

/** Darcula's syntax colors, shared by both variants: every frame takes its color from here. */
export const SYNTAX = {
  keyword: '#CC7832',
  string: '#6A8759',
  field: '#9876AA',
  number: '#6897BB',
  method: '#FFC66D',
  comment: '#808080',
  annotation: '#BBB529',
  error: '#BC3F3C',
} as const

export type Surfaces = { editor: string; panel: string; hover: string; accent: string }

/**
 * Each variant's editor and tool-window backgrounds, a hovered row's, and its focus accent: a blue no tool kind
 * takes (Darcula's numbers, the reads' color, are #6897BB), so a running call or the person's prompt stands out.
 */
export const SURFACES: Record<Variant, Surfaces> = {
  classic: { editor: '#2B2B2B', panel: '#3C3F41', hover: '#4B4F52', accent: '#589DF6' },
  newui: { editor: '#1E1F22', panel: '#2B2D30', hover: '#393B40', accent: '#548AF7' },
}

/** A transparent border: there for a hover to color (a hover restyles a border, it adds none), unseen at rest. */
export const CLEAR = '#00000000'

/** The alpha of a 'tint' wash at rest and under the pointer: about 10% and 20% of the row's color. */
const WASH = '1a'
const WASH_HOVER = '33'

export type ToolKind = 'run' | 'read' | 'write' | 'search' | 'web' | 'mcp' | 'other'

const KINDS = new Map<string, ToolKind>([
  ['Bash', 'run'],
  ['PowerShell', 'run'],
  ['Monitor', 'run'],
  ['Read', 'read'],
  ['Edit', 'write'],
  ['Write', 'write'],
  ['NotebookEdit', 'write'],
  ['Glob', 'search'],
  ['Grep', 'search'],
  ['LSP', 'search'],
  ['ToolSearch', 'search'],
  ['WebFetch', 'web'],
  ['WebSearch', 'web'],
])

const KIND_COLORS: Record<ToolKind, string> = {
  run: SYNTAX.keyword,
  read: SYNTAX.number,
  write: SYNTAX.method,
  search: SYNTAX.field,
  web: SYNTAX.string,
  mcp: SYNTAX.annotation,
  other: SYNTAX.comment,
}

/** What a tool does, by its name; an MCP server's tool by its `mcp__` prefix. */
export function kindOf(tool: string): ToolKind {
  return tool.startsWith('mcp__') ? 'mcp' : (KINDS.get(tool) ?? 'other')
}

type CallState = { tool: string; isRunning: boolean; isErrored: boolean; isInterrupted: boolean }

/** A call's color: grey once an abort cut it, red when it failed, the accent while it runs, else its kind's. */
export function callColor(call: CallState, accent: string): string {
  if (call.isInterrupted) return SYNTAX.comment
  if (call.isErrored) return SYNTAX.error
  if (call.isRunning) return accent
  return KIND_COLORS[kindOf(call.tool)]
}

/** A folded group's color: red when a call failed, the accent while live, the kind's when all share one, else grey. */
export function groupColor(calls: ReadonlyArray<ToolGroupCall>, isActive: boolean, accent: string): string {
  if (calls.some(call => call.isErrored && !call.isInterrupted)) return SYNTAX.error
  if (isActive) return accent
  const kinds = new Set(calls.map(call => kindOf(call.tool)))
  const [only] = kinds
  return kinds.size === 1 && only !== undefined ? KIND_COLORS[only] : SYNTAX.comment
}

/**
 * Whether a user row holds the person's own words: typed, sent through Remote Control, by the SDK host or from
 * Slack, or submitted by a plugin as theirs (`asUser`). An unstamped row (`unclassified`) is never presumed
 * theirs, as the engine never presumes it: a teammate block or an idle notice comes that way.
 */
export function isPersons(props: RenderPropsOf['UserMessage']): boolean {
  const origin = props.origin
  if (origin.kind === 'composer' || origin.kind === 'bridge' || origin.kind === 'sdk') return true
  if (origin.kind === 'slack-ping') return true
  return origin.kind === 'plugin' && origin.asUser === true
}

/** A user row's color: the accent for the person's words; a task's notice by how it ended; grey for the rest. */
export function userColor(props: RenderPropsOf['UserMessage'], accent: string): string {
  if (isPersons(props)) return accent
  if (props.task === undefined) return SYNTAX.comment
  if (props.task.status === 'failed') return SYNTAX.error
  if (props.task.status === 'killed') return SYNTAX.comment
  return SYNTAX.field
}

/** How one row is framed. */
export type Look = {
  /** The row's color: its border, and its wash under 'tint'. */
  color: string
  /** When the border shows the color: always, only under the pointer, or the row has no border. */
  border: 'always' | 'hover' | 'none'
  /** Which background 'solid' paints: the editor's or a tool window's. */
  surface: 'editor' | 'panel'
  /** Whether 'tint' washes the row at rest, and not only under the pointer. */
  isWashed: boolean
}

/**
 * The props of the Box that frames one row the engine draws. Keyed, so its `hover` applies over the whole
 * row; a column, so the engine's row inside it stretches across.
 */
export function frame(look: Look, fill: Fill, s: Surfaces): BoxProps {
  const box: BoxProps = { key: 'darcula', flexDirection: 'column', paddingX: 1 }
  const hover: BoxHoverProps = {}
  if (look.border !== 'none') {
    box.borderStyle = 'round'
    box.borderColor = look.border === 'always' ? look.color : CLEAR
    if (look.border === 'hover') hover.borderColor = look.color
  }
  if (fill === 'solid') {
    box.backgroundColor = s[look.surface]
    if (look.surface === 'panel') hover.backgroundColor = s.hover
  } else if (fill === 'tint') {
    if (look.isWashed) box.backgroundColor = look.color + WASH
    hover.backgroundColor = look.color + (look.isWashed ? WASH_HOVER : WASH)
  }
  if (Object.keys(hover).length > 0) box.hover = hover
  return box
}

/** The option's value when it is one of `allowed`, else `fallback`. */
function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.find(one => one === value) ?? fallback
}

export const register: Register = (on, options) => {
  const variant = pick<Variant>(options.variant, ['classic', 'newui'], 'classic')
  const fill = pick<Fill>(options.background, ['tint', 'solid', 'none'], 'tint')
  const s = SURFACES[variant]

  // Every hook matches the desktop alone: on the terminal, VS Code and the phone none runs, and the engine
  // draws its own rows as ever. Each one keeps the engine's row (`next(e)`, once, props untouched) inside a
  // Box: the app's own row, with its buttons and its text, stays as the app draws it, framed from outside.
  // A tree that fails to validate, or a throw, leaves the engine's row alone (the `.catch`).

  // The person's prompts: a tool window with the accent border. Notices and other agents' messages: framed
  // only under the pointer, in their status color.
  on('ui.render', { component: 'UserMessage', surface: 'desktop' }, async ($, e, next) => {
    const { Box } = $.ui.resolve(e)
    const isOwn = isPersons(e.props)
    const look: Look = {
      color: userColor(e.props, s.accent),
      border: isOwn ? 'always' : 'hover',
      surface: 'panel',
      isWashed: isOwn,
    }
    return <Box {...frame(look, fill, s)}>{await next(e)}</Box>
  }).catch(($, e, next) => next(e))

  // Claude's text: the editor, a green (string) border under the pointer; a summary block, a grey one.
  on('ui.render', { component: 'AssistantMessage', surface: 'desktop' }, async ($, e, next) => {
    if (e.props.text.trim() === '') return next(e)
    const { Box } = $.ui.resolve(e)
    const look: Look = {
      color: e.props.isSummary ? SYNTAX.comment : SYNTAX.string,
      border: 'hover',
      surface: 'editor',
      isWashed: false,
    }
    return <Box {...frame(look, fill, s)}>{await next(e)}</Box>
  }).catch(($, e, next) => next(e))

  // A tool call: a tool window bordered in its kind's color (run, read, write, search, web, MCP), red when it
  // failed, grey when interrupted, the accent while it runs.
  on('ui.render', { component: 'ToolUse', surface: 'desktop' }, async ($, e, next) => {
    const { Box } = $.ui.resolve(e)
    const look: Look = { color: callColor(e.props, s.accent), border: 'always', surface: 'panel', isWashed: true }
    return <Box {...frame(look, fill, s)}>{await next(e)}</Box>
  }).catch(($, e, next) => next(e))

  // A result under its call: an indented console, no border unless it failed. A result with nothing to show is
  // left alone, so no empty frame is drawn.
  on('ui.render', { component: 'ToolResult', surface: 'desktop' }, async ($, e, next) => {
    if (!e.props.isErrored && (e.props.output === undefined || e.props.output === null)) return next(e)
    const { Box } = $.ui.resolve(e)
    const look: Look = {
      color: e.props.isErrored ? SYNTAX.error : SYNTAX.comment,
      border: e.props.isErrored ? 'always' : 'none',
      surface: 'editor',
      isWashed: true,
    }
    return (
      <Box {...frame(look, fill, s)} marginLeft={2}>
        {await next(e)}
      </Box>
    )
  }).catch(($, e, next) => next(e))

  // A folded run of calls: one tool window. Unfolded, each call is a ToolUse row with its own frame, so the
  // group is left alone (a frame around them would nest); `isExpanded` is never rewritten here.
  on('ui.render', { component: 'ToolGroup', surface: 'desktop' }, async ($, e, next) => {
    if (e.props.isExpanded) return next(e)
    const { Box } = $.ui.resolve(e)
    const look: Look = {
      color: groupColor(e.props.calls, e.props.isActive, s.accent),
      border: 'always',
      surface: 'panel',
      isWashed: true,
    }
    return <Box {...frame(look, fill, s)}>{await next(e)}</Box>
  }).catch(($, e, next) => next(e))
}
