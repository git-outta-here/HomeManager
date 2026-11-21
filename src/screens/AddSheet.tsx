import { useState } from 'react'
import { ymd } from '../logic'
import { addChore, addOneOff, deleteChore, deleteTask, setChorePaused, updateChore, updateOneOff } from '../store'
import type { Assignment, Chore, MonthDay, Repeat, State, Task } from '../types'
import { ICONS } from '../ui'

const POINTS = [1, 2, 3, 5, 8, 10]
const DAYS: [number, string][] = [[1, 'M'], [2, 'T'], [3, 'W'], [4, 'T'], [5, 'F'], [6, 'S'], [0, 'S']]
const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const WEEKS: [number, string][] = [[1, 'First'], [2, 'Second'], [3, 'Third'], [4, 'Fourth'], [5, 'Last']]
const EVERY: [number, string][] = [[1, 'Every month'], [2, 'Every 2 months'], [3, 'Every 3 months'], [6, 'Every 6 months'], [12, 'Every year']]

/** Adds a task or chore, or edits the chore or one-off task passed in. */
type Props = { state: State; chore?: Chore; task?: Task; onClose: () => void }

export default function AddSheet({ state, chore, task, onClose }: Props) {
  const editing = !!chore || !!task
  const from = chore ?? task
  const [repeating, setRepeating] = useState(!!chore)
  const [title, setTitle] = useState(from?.title ?? '')
  const [icon, setIcon] = useState(from?.icon ?? '✅')
  const [points, setPoints] = useState(from?.points ?? 3)
  // 'anyone' | 'alternate' | a member id
  const [who, setWho] = useState<string>(
    chore
      ? chore.assignment.kind === 'member'
        ? chore.assignment.memberId
        : chore.assignment.kind
      : (task?.assigneeId ?? 'anyone'),
  )
  const [due, setDue] = useState(task?.due ?? ymd())
  const [note, setNote] = useState(from?.note ?? '')
  const [steps, setSteps] = useState(
    (chore?.steps ?? task?.steps?.map((x) => x.text) ?? []).join('\n'),
  )
  const [extras, setExtras] = useState(!!(from?.note || from?.steps?.length))
  const monthly = chore?.repeat.kind === 'monthly' ? chore.repeat : undefined
  const [months, setMonths] = useState(monthly?.every ?? 1)
  const [on, setOn] = useState<MonthDay>(monthly?.on ?? { by: 'date', day: new Date().getDate() })
  const [mode, setMode] = useState<Repeat['kind']>(chore?.repeat.kind ?? 'weekly')
  const [days, setDays] = useState<number[]>(
    chore?.repeat.kind === 'weekly' ? chore.repeat.days : [new Date().getDay()],
  )
  const [every, setEvery] = useState(chore?.repeat.kind === 'interval' ? chore.repeat.everyDays : 3)

  const valid = title.trim() && points >= 1 && points <= 999 && (!repeating || mode !== 'weekly' || days.length > 0) && (repeating || due)

  const noteText = note.trim() || undefined
  const lines = steps.split('\n').map((l) => l.trim()).filter(Boolean)

  const submit = () => {
    if (!valid) return
    if (repeating) {
      const assignment: Assignment =
        who === 'anyone' || who === 'alternate' ? { kind: who } : { kind: 'member', memberId: who }
      const repeat: Repeat =
        mode === 'weekly'
          ? { kind: 'weekly', days }
          : mode === 'interval'
            ? { kind: 'interval', everyDays: Math.max(1, every) }
            : { kind: 'monthly', every: months, on: on.by === 'date' ? { by: 'date', day: Math.min(31, Math.max(1, on.day)) } : on }
      const input = { title: title.trim(), icon, points, repeat, assignment, note: noteText, steps: lines.length ? lines : undefined }
      if (chore) updateChore(chore.id, input)
      else addChore(input)
    } else {
      const input = {
        title: title.trim(),
        icon,
        points,
        due,
        assigneeId: who === 'anyone' || who === 'alternate' ? null : who,
        note: noteText,
        // Steps already ticked stay ticked when a task is edited.
        steps: lines.length ? lines.map((text) => ({ text, done: task?.steps?.find((x) => x.text === text)?.done })) : undefined,
      }
      if (task) updateOneOff(task.id, input)
      else addOneOff(input)
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
        aria-label={chore ? 'Edit chore' : task ? 'Edit task' : 'Add'}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="sheet-head">
          <h2>{chore ? 'Edit chore' : task ? 'Edit task' : 'Add'}</h2>
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
              value={POINTS.includes(points) ? '' : points || ''}
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
                Weekly
              </button>
              <button type="button" className={mode === 'interval' ? 'on' : ''} onClick={() => setMode('interval')}>
                After done
              </button>
              <button type="button" className={mode === 'monthly' ? 'on' : ''} onClick={() => setMode('monthly')}>
                Monthly
              </button>
            </div>
            {mode === 'monthly' ? (
              <div className="monthly">
                <select value={months} onChange={(e) => setMonths(Number(e.target.value))} aria-label="How often">
                  {EVERY.map(([n, label]) => (
                    <option key={n} value={n}>
                      {label}
                    </option>
                  ))}
                </select>
                <div className="seg">
                  <button type="button" className={on.by === 'date' ? 'on' : ''} onClick={() => setOn({ by: 'date', day: new Date().getDate() })}>
                    On a date
                  </button>
                  <button type="button" className={on.by === 'weekday' ? 'on' : ''} onClick={() => setOn({ by: 'weekday', week: 1, weekday: 6 })}>
                    On a weekday
                  </button>
                </div>
                {on.by === 'date' ? (
                  <div className="every">
                    On day
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={31}
                      value={on.day || ''}
                      onChange={(e) => setOn({ by: 'date', day: Math.floor(Number(e.target.value)) })}
                      aria-label="Day of the month"
                    />
                    of the month
                  </div>
                ) : (
                  <div className="every">
                    <select value={on.week} onChange={(e) => setOn({ ...on, week: Number(e.target.value) as 1 | 2 | 3 | 4 | 5 })} aria-label="Which week">
                      {WEEKS.map(([n, label]) => (
                        <option key={n} value={n}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <select value={on.weekday} onChange={(e) => setOn({ ...on, weekday: Number(e.target.value) })} aria-label="Day of the week">
                      {DAYS.map(([d]) => (
                        <option key={d} value={d}>
                          {DAY_FULL[d]}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {on.by === 'date' && on.day > 28 && <p className="note">In shorter months it falls on the last day.</p>}
              </div>
            ) : mode === 'weekly' ? (
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

        {!extras && (
          <button type="button" className="link" onClick={() => setExtras(true)}>
            + Add notes or a checklist
          </button>
        )}
        {extras && <>
        <label>
          Notes (optional)
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder={repeating ? 'e.g. Bags are under the sink' : 'e.g. Receipt is in the glovebox'}
          />
        </label>
        <label>
          Checklist (optional, one step per line)
          <textarea
            value={steps}
            onChange={(e) => setSteps(e.target.value)}
            rows={3}
            placeholder={'e.g.\nStrip the bed\nWash the sheets'}
          />
        </label>
        </>}

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
        {from && (
          <button
            type="button"
            className="ghost danger"
            onClick={() => {
              if (chore) deleteChore(chore.id)
              else deleteTask(from.id)
              onClose()
            }}
          >
            {chore ? 'Delete chore' : 'Delete task'}
          </button>
        )}
      </form>
    </div>
  )
}
