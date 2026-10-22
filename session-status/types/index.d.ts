export type StatusKind = 'working' | 'attention' | 'background' | 'idle' | 'error' | 'stopped'

/** How the main conversation's last turn ended: what the band shows while no turn runs. */
export type Outcome = 'idle' | 'error' | 'stopped'

/** What the band's info line shows about the session, read at the session's start and each turn's end. */
export type SessionInfo = {
  project: string | null
  /** The git branch, when the session's folder is in a repository. */
  branch: string | null
}

declare module 'claude-code' {
  interface PluginState {
    'session-status': {
      outcome: Outcome
      /** Calls waiting on the person, as `<loop>:<tool>:<input>` (`main` for the main conversation). */
      asks: string[]
      /** Background work in flight when the main turn last stopped (shells, subagents, workflows, monitors). */
      background: number
      info: SessionInfo
      title: string | null
      isEditing: boolean
    }
  }
}
