import { useState } from 'react'
import { addDays, bonusDay, bounty, diffDays, dueLabel, parseYmd, urgency, ymd } from '../logic'
import { canNotify, notifyPartner } from '../reminders'
import { completeTask, setHoliday, skipTask, toggleStep, toggleThanks, uncompleteTask } from '../store'
import type { Member, State, Task } from '../types'
import { Avatar, Empty, Section, tint } from '../ui'

type Props = { state: State; me: Member; today: string; onDone: (points: number) => void; onEdit: (t: Task) => void }

export default function Today({ state, me, today, onDone, onEdit }: Props) {
  const [showAll, setShowAll] = useState(false)
  const holiday = state.household.pausedSince
  const paused = new Set(state.chores.filter((c) => c.paused).map((c) => c.id))
  const open = state.tasks
    .filter((t) => !t.completedAt && !(t.choreId && (holiday || paused.has(t.choreId))))
    .sort((a, b) => a.due.localeCompare(b.due) || a.title.localeCompare(b.title))
  const overdue = open.filter((t) => t.due < today)
  const due = open.filter((t) => t.due === today)
  const later = open.filter((t) => t.due > today)

  const weekAgo = addDays(today, -6)
  const recent = state.tasks
    .filter((t) => t.completedAt && ymd(new Date(t.completedAt)) >= weekAgo)
    .sort((a, b) => (a.completedAt! < b.completedAt! ? 1 : -1))
    .slice(0, 12)
  const doneToday = recent.some((t) => ymd(new Date(t.completedAt!)) === today)

  const card = (t: Task) => (
    <TaskCard key={t.id} task={t} state={state} me={me} today={today} onDone={onDone} onEdit={onEdit} />
  )

  return (
    <>
      {holiday && (
        <div className="card holiday">
          <div>
            <b>🏖️ Holiday mode is on</b>
            <div className="note">Chores are paused and nothing gains overdue points.</div>
          </div>
          <button className="primary small" onClick={() => setHoliday(false)}>
            We're back
          </button>
        </div>
      )}

      {overdue.length > 0 && (
        <Section title="Overdue" count={overdue.length}>
          {overdue.map(card)}
        </Section>
      )}

      {(!holiday || due.length > 0) && (
        <Section title="Due today" count={due.length}>
          {due.length ? (
            due.map(card)
          ) : (
            <Empty icon={doneToday ? '🎉' : '🌤️'}>
              {doneToday ? 'Everything for today is done.' : 'Nothing due today.'}
            </Empty>
          )}
        </Section>
      )}

      {later.length > 0 && (
        <Section title="Coming up" count={later.length}>
          {(showAll ? later : later.slice(0, 4)).map(card)}
          {later.length > 4 && (
            <button className="link" onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Show fewer' : `Show all ${later.length}`}
            </button>
          )}
        </Section>
      )}

      {recent.length > 0 && (
        <Section title="Recent activity">
          <div className="card list">
            {recent.map((t) => (
              <ActivityRow key={t.id} task={t} state={state} me={me} today={today} />
            ))}
          </div>
        </Section>
      )}
    </>
  )
}

function dayLabel(day: string, today: string) {
  const d = diffDays(today, day)
  if (d === 0) return 'Today'
  if (d === 1) return 'Yesterday'
  return parseYmd(day).toLocaleDateString(undefined, { weekday: 'long' })
}

/** One completed task. You can thank your partner for theirs, and undo your own from today. */
function ActivityRow({ task: t, state, me, today }: { task: Task; state: State; me: Member; today: string }) {
  const doer = state.members.find((m) => m.id === t.completedBy)
  const day = ymd(new Date(t.completedAt!))
  const mine = t.completedBy === me.id
  const thankedByMe = !!t.thanks?.includes(me.id)
  const thankers = state.members.filter((m) => m.id !== t.completedBy && t.thanks?.includes(m.id))

  return (
    <div className="list-row">
      {doer && <Avatar member={doer} small />}
      <span className="task-text">
        <span className="task-title">
          <span className="emo">{t.icon}</span>
          {t.title}
        </span>
        <span className="task-meta">
          {mine ? 'You' : (doer?.name ?? 'Someone')} · {dayLabel(day, today)}
        </span>
        {mine && thankers.length > 0 && (
          <span className="task-meta">❤️ {thankers.map((m) => m.name).join(' and ')} said thanks</span>
        )}
      </span>
      <span className="pts">+{t.pointsAwarded}</span>
      {mine ? (
        day === today && (
          <button className="ghost" onClick={() => uncompleteTask(t.id)}>
            Undo
          </button>
        )
      ) : (
        <button
          className={thankedByMe ? 'thanks on' : 'thanks'}
          onClick={() => toggleThanks(t.id, me.id)}
          aria-pressed={thankedByMe}
          aria-label={`Thank ${doer?.name ?? 'them'} for ${t.title}`}
        >
          {thankedByMe ? '❤️' : '🤍'} Thanks
        </button>
      )}
    </div>
  )
}

function TaskCard({ task: t, state, me, today, onDone, onEdit }: Props & { task: Task }) {
  const [open, setOpen] = useState(false)
  const who = state.members.find((m) => m.id === t.assigneeId)
  const bonus = bounty(t, bonusDay(state.household, today))
  const steps = t.steps ?? []
  const partner = state.members.find((m) => m.id !== me.id)
  const nudgeable = !!partner && canNotify() && t.assigneeId !== me.id
  const [nudge, setNudge] = useState('')
  const sendNudge = () => {
    setNudge('Sending…')
    notifyPartner('nudge', t.id, me.id)
      .then((sent) => setNudge(sent ? `${partner!.name} has been nudged.` : `${partner!.name} does not have reminders switched on yet.`))
      .catch((e: Error) => setNudge(e.message))
  }
  const ticked = steps.filter((x) => x.done).length

  return (
    <div className={`task u-${urgency(t.due, today)}`}>
      <div className="task-row">
        <button
          className="tick"
          style={tint(me)}
          aria-label={`Mark ${t.title} done`}
          onClick={() => {
            onDone(completeTask(t.id, me.id))
            // Tells the other phone, if its owner asked to hear about finished tasks.
            void notifyPartner('done', t.id, me.id).catch(() => {})
          }}
        />
        <button className="task-body" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className="task-icon">{t.icon}</span>
          <span className="task-text">
            <span className="task-title">{t.title}</span>
            <span className="task-meta">
              {dueLabel(t.due, today)} · {who ? who.name : 'Up for grabs'}
              {t.choreId ? ' · ↻' : ''}
              {steps.length > 0 && ` · ☑ ${ticked}/${steps.length}`}
              {t.note && ' · 📝'}
            </span>
          </span>
        </button>
        {who && <Avatar member={who} small />}
        <span className={bonus ? 'pts hot' : 'pts'}>
          +{t.points + bonus}
          {bonus > 0 && ' 🔥'}
        </span>
      </div>
      {open && (
        <div className="task-more">
          {t.note && <p className="task-note">{t.note}</p>}
          {steps.length > 0 && (
            <div className="steps">
              {steps.map((x, i) => (
                <label key={i} className={x.done ? 'step done' : 'step'}>
                  <input type="checkbox" checked={!!x.done} onChange={() => toggleStep(t.id, i)} />
                  <span>{x.text}</span>
                </label>
              ))}
            </div>
          )}
          {nudge && <p className="task-note">{nudge}</p>}
          <div className="task-actions">
            {bonus > 0 && (
              <span className="note">
                {t.points} points + {bonus} overdue bonus
              </span>
            )}
            {nudgeable && (
              <button className="ghost" disabled={nudge === 'Sending…'} onClick={sendNudge}>
                👋 Nudge {partner!.name}
              </button>
            )}
            {t.choreId ? (
              <button className="ghost" onClick={() => skipTask(t.id)}>
                Skip this time
              </button>
            ) : (
              <button className="ghost" onClick={() => onEdit(t)}>
                Edit
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
