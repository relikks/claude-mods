import { expect, test } from 'claude-code/testing'

import { askKey, ofLoop, shownKind, textOn, tint } from '../hooks/register'

const BAND = {
  plugin: 'session-status',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 60,
    scroll: { offset: 0, bodyRows: 19 },
    view: {},
  },
} as const

const WORKING = { ...BAND, props: { ...BAND.props, isWorking: true } } as const

test('colors and state rules', () => {
  expect(textOn('#f59e0b')).toBe('#111111')
  expect(textOn('#2563eb')).toBe('#ffffff')
  expect(textOn('red')).toBe('#ffffff')
  expect(tint('#2563eb')).toBe('#2563eb1f')
  expect(tint('red')).toBe(undefined)
  expect(askKey(undefined, 'Bash', { command: 'ls' })).toBe('main:Bash:{"command":"ls"}')
  expect(askKey('a1', 'Bash', undefined)).toBe('a1:Bash:')
  expect(ofLoop(askKey(undefined, 'Edit', {}), undefined)).toBe(true)
  expect(ofLoop(askKey('a1', 'Edit', {}), undefined)).toBe(false)

  // No turn running: never working nor "needs you", whatever was left over (a missed turn end, a subagent).
  expect(shownKind(false, ['main:Bash:'], 'idle', 0)).toBe('idle')
  expect(shownKind(false, [], 'error', 2)).toBe('error')
  expect(shownKind(false, [], 'stopped', 0)).toBe('stopped')
  // A turn running: "needs you" while a call waits on the person, working otherwise.
  expect(shownKind(true, [], 'error', 0)).toBe('working')
  expect(shownKind(true, ['a1:Edit:{}'], 'idle', 0)).toBe('attention')
  // The main turn stopped with work in flight that will wake it: 'in the background', not waiting.
  expect(shownKind(false, [], 'idle', 2)).toBe('background')
})

test('the band follows the engine and the person, not the tool calls', async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))
  on('session.id', () => ({ value: 'test-session' }))
  const store = new Map<string, unknown>()
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => {
    store.set(e.key, e.value)
    return { value: undefined }
  })
  // The desktop app's session tools answer the title; set_session_title records what it was sent.
  const sent: unknown[] = []
  on('mcp.call', (_, e) => {
    if (e.tool === 'set_session_title') sent.push(e.args)
    const text = JSON.stringify({ title: 'Título de la app' })
    return { value: { content: [{ type: 'text', text }], isError: false } }
  })
  // A settings hook that answers the request itself stands beneath when `autoApprove` is set.
  let autoApprove = false
  on('classic.PermissionRequest', () => (autoApprove ? { decision: { behavior: 'allow' as const } } : {}))
  on('classic.PostToolUse', () => ({}))
  on('classic.PermissionDenied', () => ({}))
  on('classic.StopFailure', () => ({}))
  on('classic.Stop', () => ({}))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const label = async (props: typeof BAND | typeof WORKING) => {
    const ui = await $.ui.mount({ ...props, surface: 'desktop' })
    const pill = await ui.find({ type: 'Text', text: /^(Trabajando|Te necesita|En segundo plano|Esperando tu mensaje|Error|Detenida)$/ })
    await ui.unmount()
    return pill?.text
  }

  // On every surface the band starts waiting, with the app's title.
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /Esperando/ }))?.text).toBe('Esperando tu mensaje')
    expect((await ui.find({ type: 'Text', text: /de la app/ }))?.text).toBe('Título de la app')
    await ui.unmount()
  }

  // Tool calls (a subagent's, a workflow's) never make the band work: only the engine's isWorking does.
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(await label(BAND)).toBe('Esperando tu mensaje')
  expect(await label(WORKING)).toBe('Trabajando')

  // A dialog put to the person: "needs you" until the call ran.
  await $.classic.PermissionRequest({ tool_name: 'Edit', tool_input: {} })
  expect(await label(WORKING)).toBe('Te necesita')
  // The turn ended meanwhile (its end missed): the band does not stay on "needs you".
  expect(await label(BAND)).toBe('Esperando tu mensaje')
  await $.classic.PostToolUse({ tool_name: 'Edit', tool_input: {}, tool_response: {}, tool_use_id: 't1' })
  expect(await label(WORKING)).toBe('Trabajando')

  // A subagent's ask is settled by its own denial, and does not touch the main conversation's.
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: {}, agent_id: 'a1' })
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: {} })
  await $.classic.PermissionDenied({ tool_name: 'Bash', tool_input: {}, tool_use_id: 't2', reason: 'no', agent_id: 'a1' })
  expect(await label(WORKING)).toBe('Te necesita')
  await $.classic.PostToolUse({ tool_name: 'Bash', tool_input: {}, tool_response: {}, tool_use_id: 't3' })
  expect(await label(WORKING)).toBe('Trabajando')

  // Two parallel calls of one tool: the one that needed no dialog finishing does not hide the other's.
  await $.classic.PermissionRequest({ tool_name: 'WebFetch', tool_input: { url: 'https://new.example' } })
  await $.classic.PostToolUse({ tool_name: 'WebFetch', tool_input: { url: 'https://known.example' }, tool_response: {}, tool_use_id: 't4' })
  expect(await label(WORKING)).toBe('Te necesita')
  await $.classic.PostToolUse({ tool_name: 'WebFetch', tool_input: { url: 'https://new.example' }, tool_response: {}, tool_use_id: 't5' })
  expect(await label(WORKING)).toBe('Trabajando')

  // A request a hook answered never reaches the person.
  autoApprove = true
  await $.classic.PermissionRequest({ tool_name: 'Write', tool_input: { file_path: 'x' } })
  expect(await label(WORKING)).toBe('Trabajando')
  autoApprove = false

  // The main turn stopped with a workflow still running: in the background, not waiting.
  await $.classic.Stop({ stop_hook_active: false, background_tasks: [{ id: 'w1', type: 'workflow', status: 'running', description: 'review' }] })
  expect(await label(BAND)).toBe('En segundo plano')
  await $.classic.Stop({ stop_hook_active: false, background_tasks: [] })
  expect(await label(BAND)).toBe('Esperando tu mensaje')

  // An API error of the main turn shows once no turn runs.
  await $.classic.StopFailure({ error: 'rate_limit' })
  expect(await label(BAND)).toBe('Error')

  // The title is edited in place and sent to the app.
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await $.ui.press({ plugin: 'session-status', key: 'title' })
  await $.ui.input({ plugin: 'session-status', key: 'title-input', text: '  Mi   sesión larga  ' })
  expect((await ui.find({ type: 'Text', text: /Mi sesi/ }))?.text).toBe('Mi sesión larga')
  expect(sent).toEqual([{ session_id: 'self', title: 'Mi sesión larga' }])
  await ui.unmount()
})
