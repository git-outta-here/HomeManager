import { useState } from 'react'
import { setMe, setupHousehold } from '../store'
import { createHousehold, joinHousehold, syncConfigured } from '../sync'
import type { State } from '../types'
import { Avatar } from '../ui'

export default function Setup() {
  const [joining, setJoining] = useState(false)
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [examples, setExamples] = useState(true)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const ready = joining ? code.trim().length >= 4 : a.trim() && b.trim()

  const submit = async () => {
    if (!ready || busy) return
    if (!joining) {
      setupHousehold([a.trim(), b.trim()], examples)
      // If this fails (offline, say) the app still works; sync can be retried from settings.
      createHousehold().catch(() => {})
      return
    }
    setBusy(true)
    setError('')
    try {
      await joinHousehold(code)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join. Try again.')
      setBusy(false)
    }
  }

  return (
    <div className="setup">
      <img src="/icon.svg" alt="" className="setup-logo" />
      <h1>HomeManager</h1>
      <p className="lede">Share the chores, earn the points, cash them in.</p>
      <form
        className="card form"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        {syncConfigured && (
          <div className="seg">
            <button type="button" className={!joining ? 'on' : ''} onClick={() => setJoining(false)}>
              New household
            </button>
            <button type="button" className={joining ? 'on' : ''} onClick={() => setJoining(true)}>
              Join with a code
            </button>
          </div>
        )}
        {joining ? (
          <>
            <label>
              Invite code
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="From your partner's Chores tab"
                autoCapitalize="characters"
                autoComplete="off"
                autoFocus
              />
            </label>
            {error && <p className="note danger">{error}</p>}
          </>
        ) : (
          <>
            <label>
              Your name
              <input value={a} onChange={(e) => setA(e.target.value)} autoFocus autoComplete="off" />
            </label>
            <label>
              Your partner's name
              <input value={b} onChange={(e) => setB(e.target.value)} autoComplete="off" />
            </label>
            <label className="check">
              <input type="checkbox" checked={examples} onChange={(e) => setExamples(e.target.checked)} />
              Start with example chores and rewards
            </label>
          </>
        )}
        <button className="primary" disabled={!ready || busy}>
          {joining ? (busy ? 'Joining…' : 'Join') : 'Get started'}
        </button>
      </form>
    </div>
  )
}

/** Shown on a phone that has the household's data but does not yet know whose phone it is. */
export function WhoAmI({ state }: { state: State }) {
  return (
    <div className="setup">
      <h1>Which one are you?</h1>
      <p className="lede">Tasks you tick off on this phone will be credited to you.</p>
      {state.members.map((m) => (
        <button key={m.id} className="card who-pick" onClick={() => setMe(m.id)}>
          <Avatar member={m} />
          {m.name}
        </button>
      ))}
    </div>
  )
}
