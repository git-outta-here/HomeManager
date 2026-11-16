import { useState } from 'react'
import { ymd } from '../logic'
import { addChore, addOneOff, deleteChore, setChorePaused, updateChore } from '../store'
import type { Assignment, Chore, Repeat, State } from '../types'
import { ICONS } from '../ui'

const POINTS = [1, 2, 3, 5, 8, 10]
const DAYS: [number, string][] = [[1, 'M'], [2, 'T'], [3, 'W'], [4, 'T'], [5, 'F'], [6, 'S'], [0, 'S']]
const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

type Props = { state: State; chore?: Chore; onClose: () => void }

export default function AddSheet({ state, chore, onClose }: Props) {
  const editing = !!chore
  const [repeating, setRepeating] = useState(editing)
  const [title, setTitle] = useState(chore?.title ?? '')
  const [icon, setIcon] = useState(chore?.icon ?? '✅')
  const [points, setPoints] = useState(chore?.points ?? 3)
  // 'anyone' | 'alternate' | a member id
  const [who, setWho] = useState<string>(
    chore ? (chore.assignment.kind === 'member' ? chore.assignment.memberId : chore.assignment.kind) : 'anyone',
  )
  const [due, setDue] = useState(ymd())
  const [mode, setMode] = useState<Repeat['kind']>(chore?.repeat.kind ?? 'weekly')
  const [days, setDays] = useState<number[]>(
    chore?.repeat.kind === 'weekly' ? chore.repeat.days : [new Date().getDay()],
  )
  const [every, setEvery] = useState(chore?.repeat.kind === 'interval' ? chore.repeat.everyDays : 3)

  const valid = title.trim() && points >= 1 && points <= 999 && (!repeating || mode === 'interval' || days.length > 0) && (repeating || due)

  const submit = () => {
    if (!valid) return
    if (repeating) {
      const assignment: Assignment =
        who === 'anyone' || who === 'alternate' ? { kind: who } : { kind: 'member', memberId: who }
      const repeat: Repeat =
        mode === 'weekly' ? { kind: 'weekly', days } : { kind: 'interval', everyDays: Math.max(1, every) }
      const input = { title: title.trim(), icon, points, repeat, assignment }
      if (chore) updateChore(chore.id, input)
      else addChore(input)
    } else {
      addOneOff({
        title: title.trim(),
        icon,
        points,
        due,
        assigneeId: who === 'anyone' || who === 'alternate' ? null : who,
      })
    }
    onClose()
  }

  const whoOptions: [string, string][] = [
    ['anyone', 'Anyone'],
    ...state.members.map((m): [string, string] => [m.id, m.name]),
    ...(repeating ? [['alternate', 'Take turns'] as [string, string]] : []),
  ]

  return (
    <div className="scrim" onClick={onClose}>
      <form
        className="sheet form"
        role="dialog"
        aria-label={editing ? 'Edit chore' : 'Add'}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="sheet-head">
          <h2>{editing ? 'Edit chore' : 'Add'}</h2>
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
        </div>

        {!editing && (
          <div className="seg">
            <button type="button" className={!repeating ? 'on' : ''} onClick={() => { setRepeating(false); if (who === 'alternate') setWho('anyone') }}>
              One-off task
            </button>
            <button type="button" className={repeating ? 'on' : ''} onClick={() => setRepeating(true)}>
              Repeating chore
            </button>
          </div>
        )}

        <label>
          What needs doing?
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={repeating ? 'e.g. Water the plants' : 'e.g. Return shoes to the store'}
            autoFocus={!editing}
            autoComplete="off"
          />
        </label>

        <fieldset>
          <legend>Icon</legend>
          <div className="icons">
            {ICONS.map((i) => (
              <button type="button" key={i} className={i === icon ? 'on' : ''} onClick={() => setIcon(i)} aria-pressed={i === icon}>
                {i}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>Points</legend>
          <div className="chips">
            {POINTS.map((p) => (
              <button type="button" key={p} className={p === points ? 'on' : ''} onClick={() => setPoints(p)} aria-pressed={p === points}>
                {p}
              </button>
            ))}
            <input
              className={POINTS.includes(points) ? 'chip-input' : 'chip-input on'}
              type="number"
              inputMode="numeric"
              min={1}
              max={999}
              value={points || ''}
              onChange={(e) => setPoints(Math.floor(Number(e.target.value)))}
              aria-label="Other number of points"
              placeholder="Other"
            />
          </div>
        </fieldset>

        <fieldset>
          <legend>Who</legend>
          <div className="chips">
            {whoOptions.map(([v, label]) => (
              <button type="button" key={v} className={v === who ? 'on' : ''} onClick={() => setWho(v)} aria-pressed={v === who}>
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        {!repeating ? (
          <label>
            Due
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
        ) : (
          <fieldset>
            <legend>Repeats</legend>
            <div className="seg">
              <button type="button" className={mode === 'weekly' ? 'on' : ''} onClick={() => setMode('weekly')}>
                On set days
              </button>
              <button type="button" className={mode === 'interval' ? 'on' : ''} onClick={() => setMode('interval')}>
                After it's done
              </button>
            </div>
            {mode === 'weekly' ? (
              <div className="chips days">
                {DAYS.map(([d, label]) => (
                  <button
                    type="button"
                    key={d}
                    className={days.includes(d) ? 'on' : ''}
                    aria-pressed={days.includes(d)}
                    aria-label={DAY_FULL[d]}
                    onClick={() => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d])}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="every">
                Due again
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={every}
                  onChange={(e) => setEvery(Number(e.target.value))}
                  aria-label="Days after it is done"
                />
                {every === 1 ? 'day' : 'days'} after it's done
              </div>
            )}
          </fieldset>
        )}

        <button className="primary" disabled={!valid}>
          {editing ? 'Save' : repeating ? 'Add chore' : 'Add task'}
        </button>
        {chore && (
          <button
            type="button"
            className="ghost"
            onClick={() => {
              setChorePaused(chore.id, !chore.paused)
              onClose()
            }}
          >
            {chore.paused ? 'Resume chore' : 'Pause chore'}
          </button>
        )}
        {chore && (
          <button
            type="button"
            className="ghost danger"
            onClick={() => {
              deleteChore(chore.id)
              onClose()
            }}
          >
            Delete chore
          </button>
        )}
      </form>
    </div>
  )
}
