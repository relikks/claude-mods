import { expect, test } from 'claude-code/testing'
import type { RenderPropsOf } from 'claude-code'

import { CLEAR, SURFACES, SYNTAX, callColor, frame, groupColor, isPersons, kindOf, userColor } from '../hooks/register'

const PLUGIN = 'darcula'
const SURFACE_LIST = ['terminal', 'desktop'] as const

const USER: RenderPropsOf['UserMessage'] = {
  text: 'arregla el test',
  origin: { kind: 'composer' },
  isExpanded: false,
  onScreen: { first: 0, last: 1, of: 2 },
}
const NOTICE: RenderPropsOf['UserMessage'] = {
  text: 'Agent "review" completed',
  origin: { kind: 'task-notification' },
  isExpanded: false,
  task: { id: 'a1', status: 'completed' },
}
const ASSISTANT: RenderPropsOf['AssistantMessage'] = { text: '**Hecho**: el test pasa.', isFirstOfReply: true }
const TOOL_USE: RenderPropsOf['ToolUse'] = {
  tool_use_id: 'toolu_1',
  tool: 'Bash',
  input: { command: 'ls' },
  isRunning: false,
  isErrored: false,
  isInterrupted: false,
  output: { stdout: 'a\nb', stderr: '', interrupted: false },
}
const TOOL_RESULT: RenderPropsOf['ToolResult'] = {
  tool_use_id: 'toolu_1',
  tool: 'Bash',
  output: { stdout: 'a\nb', stderr: '', interrupted: false },
  isErrored: false,
}
const TOOL_GROUP: RenderPropsOf['ToolGroup'] = {
  calls: [
    { tool_use_id: 't1', tool: 'Read', input: { file_path: '/a' }, isRunning: false, isErrored: false, isInterrupted: false },
    { tool_use_id: 't2', tool: 'Read', input: { file_path: '/b' }, isRunning: false, isErrored: false, isInterrupted: false },
  ],
  isActive: false,
  isExpanded: false,
}

test('colors and frames', () => {
  const s = SURFACES.classic
  expect(kindOf('Bash')).toBe('run')
  expect(kindOf('mcp__github__get_issue')).toBe('mcp')
  expect(kindOf('constructor')).toBe('other')

  expect(callColor(TOOL_USE, s.accent)).toBe(SYNTAX.keyword)
  expect(callColor({ ...TOOL_USE, isRunning: true }, s.accent)).toBe(s.accent)
  expect(callColor({ ...TOOL_USE, isErrored: true }, s.accent)).toBe(SYNTAX.error)
  expect(callColor({ ...TOOL_USE, isErrored: true, isInterrupted: true }, s.accent)).toBe(SYNTAX.comment)

  expect(groupColor(TOOL_GROUP.calls, false, s.accent)).toBe(SYNTAX.number)
  expect(groupColor(TOOL_GROUP.calls, true, s.accent)).toBe(s.accent)
  const mixed = [...TOOL_GROUP.calls, { tool: 'Grep', input: {}, isRunning: false, isErrored: false, isInterrupted: false }]
  expect(groupColor(mixed, false, s.accent)).toBe(SYNTAX.comment)

  expect(isPersons(USER)).toBe(true)
  expect(isPersons({ ...USER, origin: { kind: 'unclassified' }, from: { name: 'reviewer' } })).toBe(false)
  // An unstamped row (a teammate block, an idle notice) is never taken for the person's prompt.
  expect(isPersons({ ...USER, origin: { kind: 'unclassified' } })).toBe(false)
  expect(isPersons({ ...USER, origin: { kind: 'slack-ping' } })).toBe(true)
  // The accent is a blue of its own: a running call never looks like a finished read.
  expect(SURFACES.classic.accent).not.toBe(SYNTAX.number)
  expect(SURFACES.newui.accent).not.toBe(SYNTAX.number)
  expect(userColor(NOTICE, s.accent)).toBe(SYNTAX.field)
  expect(userColor({ ...NOTICE, task: { status: 'failed' } }, s.accent)).toBe(SYNTAX.error)

  const look = { color: SYNTAX.string, border: 'hover', surface: 'editor', isWashed: false } as const
  expect(frame(look, 'tint', s)).toMatchObject({ borderColor: CLEAR, hover: { borderColor: SYNTAX.string, backgroundColor: `${SYNTAX.string}1a` } })
  expect(frame(look, 'tint', s).backgroundColor).toBeUndefined()
  expect(frame(look, 'solid', s)).toMatchObject({ backgroundColor: s.editor })
  expect(frame(look, 'none', s).backgroundColor).toBeUndefined()
})

test('on desktop each row is framed around the engine own drawing; elsewhere it is left alone', async ($, on) => {
  // Nothing draws beneath a plugin in a test: this hook stands for the engine, and records the props it got.
  const seen: unknown[] = []
  on('ui.render', ($, e) => {
    seen.push(e.props)
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  const check = async (ui: { find: (q: { type?: string; key?: string; text?: string }) => Promise<unknown>; unmount: () => Promise<void> }, surface: string, props: unknown) => {
    expect(await ui.find({ type: 'Text', text: 'engine' })).toBeDefined()
    if (surface === 'desktop') expect(await ui.find({ type: 'Box', key: 'darcula' })).toBeDefined()
    else expect(await ui.find({ type: 'Box', key: 'darcula' })).toBeUndefined()
    // The engine's row is handed the props exactly as they came: onScreen included.
    expect(seen.at(-1)).toEqual(props)
    await ui.unmount()
  }

  for (const surface of [...SURFACE_LIST, 'vscode', 'mobile'] as const) {
    await check(await $.ui.mount({ plugin: PLUGIN, surface, component: 'UserMessage', props: USER }), surface, USER)
    await check(await $.ui.mount({ plugin: PLUGIN, surface, component: 'AssistantMessage', props: ASSISTANT }), surface, ASSISTANT)
    await check(await $.ui.mount({ plugin: PLUGIN, surface, component: 'ToolUse', props: TOOL_USE }), surface, TOOL_USE)
    await check(await $.ui.mount({ plugin: PLUGIN, surface, component: 'ToolResult', props: TOOL_RESULT }), surface, TOOL_RESULT)
    await check(await $.ui.mount({ plugin: PLUGIN, surface, component: 'ToolGroup', props: TOOL_GROUP }), surface, TOOL_GROUP)
  }
})

test('rows that are left to the engine on desktop too', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const cases = [
    await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'ToolGroup', props: { ...TOOL_GROUP, isExpanded: true } }),
    await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AssistantMessage', props: { ...ASSISTANT, text: '  ' } }),
    await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'ToolResult', props: { ...TOOL_RESULT, output: undefined } }),
  ]
  for (const ui of cases) {
    expect(await ui.drawn()).toMatchObject({ type: 'Text' })
    await ui.unmount()
  }
})

test('the default look: classic Darcula, tinted', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'ToolUse', props: TOOL_USE })
  const box = await ui.find({ type: 'Box', key: 'darcula' })
  expect(box?.props).toMatchObject({ borderStyle: 'round', borderColor: SYNTAX.keyword, backgroundColor: `${SYNTAX.keyword}1a` })
  await ui.unmount()

  const notice = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'UserMessage', props: NOTICE })
  expect((await notice.find({ type: 'Box', key: 'darcula' }))?.props).toMatchObject({ borderColor: CLEAR })
  await notice.unmount()
})

test('New UI, solid panels', { options: { variant: 'newui', background: 'solid' } }, async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const user = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'UserMessage', props: USER })
  expect((await user.find({ type: 'Box', key: 'darcula' }))?.props).toMatchObject({
    borderColor: SURFACES.newui.accent,
    backgroundColor: SURFACES.newui.panel,
  })
  await user.unmount()

  const reply = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AssistantMessage', props: ASSISTANT })
  expect((await reply.find({ type: 'Box', key: 'darcula' }))?.props).toMatchObject({ backgroundColor: SURFACES.newui.editor })
  expect(await reply.drawn()).toMatchObject({ type: 'Box', hover: { borderColor: SYNTAX.string } })
  await reply.unmount()
})
