import { useState } from 'react'
import { dueLabel, onTimeStreak, repeatLabel, urgency } from '../logic'
import {
  disableReminders,
  enableReminders,
  reminderAvailability,
  sendTestReminder,
  setDoneAlerts,
  updateReminder,
  useDoneAlerts,
  useReminderHour,
} from '../reminders'
import { resetAll, setHoliday, uncompleteTask, updateHousehold } from '../store'
import { createHousehold, disconnect, retrySync, useSync, type SyncStatus } from '../sync'
import type { Chore, Member, State } from '../types'
import { Avatar, Empty, Section } from '../ui'

const SYNC_TEXT: Record<SyncStatus, string> = {
  off: '',
  unlinked: 'This phone is not syncing yet.',
  connecting: 'Connecting…',
  live: 'In sync with your household.',
  offline: 'Offline. Changes are saved here and will be sent when you reconnect.',
}

export default function Chores({ state, me, today, onEdit }: { state: State; me: Member; today: string; onEdit: (c: Chore) => void }) {
  const [confirmReset, setConfirmReset] = useState(false)
  const sync = useSync()
  const linked = !!sync.code
  const history = state.tasks
    .filter((t) => t.completedAt)
    .sort((a, b) => (a.completedAt! < b.completedAt! ? 1 : -1))
    .slice(0, 30)

  const whoLabel = (c: Chore) =>
    c.assignment.kind === 'anyone'
      ? 'Anyone'
      : c.assignment.kind === 'alternate'
        ? 'Take turns'
        : (state.members.find((m) => m.id === (c.assignment as { memberId: string }).memberId)?.name ?? '')

  return (
    <>
      <Section title="Repeating chores" count={state.chores.length}>
        {state.chores.length === 0 ? (
          <Empty icon="📋">No chores yet. Tap + to add your first one.</Empty>
        ) : (
          <div className="card list">
            {[...state.chores].sort((a, b) => a.title.localeCompare(b.title)).map((c) => {
              const streak = onTimeStreak(state.tasks, c.id)
              const next = state.tasks.find((t) => t.choreId === c.id && !t.completedAt)
              const resting = c.paused || !!state.household.pausedSince || !next
              return (
                <button className="list-row" key={c.id} onClick={() => onEdit(c)}>
                  <span className="task-icon">{c.icon}</span>
                  <span className="task-text">
                    <span className="task-title">{c.title}</span>
                    <span className="task-meta">
                      {!resting && (
                        <span className={`dot u-${urgency(next.due, today)}`} title={dueLabel(next.due, today)} />
                      )}
                      {c.paused ? '⏸ Paused' : repeatLabel(c.repeat)} · {whoLabel(c)}
                      {!c.paused && streak > 1 && ` · 🔥 ${streak} on time`}
                    </span>
                  </span>
                  <span className="pts">+{c.points}</span>
                  <span className="chev">›</span>
                </button>
              )
            })}
          </div>
        )}
      </Section>

      <Section title="History">
        {history.length === 0 ? (
          <Empty icon="🕰️">Completed tasks will show up here.</Empty>
        ) : (
          <div className="card list">
            {history.map((t) => {
              const m = state.members.find((x) => x.id === t.completedBy)
              return (
                <div className="list-row" key={t.id}>
                  {m && <Avatar member={m} small />}
                  <span className="task-text">
                    <span className="task-title">
                      <span className="emo">{t.icon}</span>
                      {t.title}
                    </span>
                    <span className="task-meta">
                      {m?.name} ·{' '}
                      {new Date(t.completedAt!).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                    </span>
                  </span>
                  <span className="pts">+{t.pointsAwarded}</span>
                  <button className="ghost" onClick={() => uncompleteTask(t.id)}>
                    Undo
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </Section>

      <Section title="Settings">
        <div className="card form">
          <label>
            Weekly team goal (points)
            <input
              type="number"
              min={1}
              value={state.household.weeklyGoal}
              onChange={(e) => updateHousehold({ weeklyGoal: Math.max(1, Number(e.target.value)) })}
            />
          </label>
          <label>
            Reward for hitting it together
            <input
              value={state.household.goalReward}
              onChange={(e) => updateHousehold({ goalReward: e.target.value })}
              placeholder="e.g. Takeaway night"
            />
          </label>
          <label>
            Prize for the weekly winner
            <input
              value={state.household.weeklyPrize ?? ''}
              onChange={(e) => updateHousehold({ weeklyPrize: e.target.value || undefined })}
              placeholder="e.g. Loser makes Sunday breakfast"
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={!state.household.hideRace}
              onChange={(e) => updateHousehold({ hideRace: e.target.checked ? undefined : true })}
            />
            Show the weekly head-to-head
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={!!state.household.pausedSince}
              onChange={(e) => setHoliday(e.target.checked)}
            />
            Holiday mode (pause all chores)
          </label>
          {confirmReset ? (
            <div className="row">
              <button className="ghost" onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
              <button
                className="ghost danger"
                onClick={() => {
                  void disableReminders()
                  disconnect()
                  resetAll()
                }}
              >
                {linked ? 'Yes, remove from this phone' : 'Yes, erase everything'}
              </button>
            </div>
          ) : (
            <button className="ghost danger" onClick={() => setConfirmReset(true)}>
              {linked ? 'Remove this phone from the household' : 'Erase all data and start over'}
            </button>
          )}
        </div>
      </Section>

      {linked && <Reminders me={me} partner={state.members.find((m) => m.id !== me.id)} />}

      {sync.status !== 'off' && (
        <Section title="Sync">
          <div className="card form">
            <p className="plain">
              <span className={`dot ${sync.status}`} /> {SYNC_TEXT[sync.status]}
            </p>
            {sync.code && (
              <div>
                <div className="note">Invite code for your partner's phone</div>
                <div className="code">{sync.code}</div>
              </div>
            )}
            {sync.status === 'unlinked' && (
              <button className="primary small" onClick={() => createHousehold().catch(() => {})}>
                Turn on sync
              </button>
            )}
            {sync.status === 'offline' && (
              <button className="ghost" onClick={retrySync}>
                Try again
              </button>
            )}
          </div>
        </Section>
      )}
    </>
  )
}

const HOURS = Array.from({ length: 24 }, (_, h) => h)
const hourLabel = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

const UNAVAILABLE = {
  nosync: '',
  install:
    'To get reminders on an iPhone, add HomeManager to your Home Screen (Share, then Add to Home Screen) and open it from there.',
  unsupported: 'This browser cannot show reminders.',
  blocked: 'Notifications are blocked for HomeManager. Allow them in your phone settings to use reminders.',
}

/** A daily notification on this phone, sent only on days when its owner has something due. */
function Reminders({ me, partner }: { me: Member; partner?: Member }) {
  const hour = useReminderHour()
  const doneAlerts = useDoneAlerts()
  const [pick, setPick] = useState(hour ?? 18)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const available = reminderAvailability()

  const run = (job: () => Promise<unknown>, done = '') => {
    setBusy(true)
    setNote('')
    job()
      .then(() => setNote(done))
      .catch((e: Error) => setNote(e.message))
      .finally(() => setBusy(false))
  }

  return (
    <Section title="Reminders">
      <div className="card form">
        {available !== 'ok' && hour === null ? (
          <p className="plain">{UNAVAILABLE[available as keyof typeof UNAVAILABLE]}</p>
        ) : (
          <>
            <label>
              Remind {me.name} on this phone at
              <select
                value={hour ?? pick}
                disabled={busy}
                onChange={(e) => {
                  const h = Number(e.target.value)
                  setPick(h)
                  if (hour !== null) run(() => updateReminder({ hour: h }))
                }}
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {hourLabel(h)}
                  </option>
                ))}
              </select>
            </label>
            <p className="note">Sent only on days when you have something due or overdue, and never in holiday mode.</p>
            {hour !== null && partner && (
              <>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={doneAlerts}
                    disabled={busy}
                    onChange={(e) => run(() => setDoneAlerts(e.target.checked))}
                  />
                  Also tell me when {partner.name} finishes something
                </label>
                <p className="note">Nudges from {partner.name} always come through while reminders are on.</p>
              </>
            )}
            {hour === null ? (
              <button className="primary small" disabled={busy} onClick={() => run(() => enableReminders(pick, me.id))}>
                Turn on reminders
              </button>
            ) : (
              <div className="row">
                <button className="ghost" disabled={busy} onClick={() => run(sendTestReminder, 'Test sent. It should arrive within a few seconds.')}>
                  Send a test
                </button>
                <button className="ghost danger" disabled={busy} onClick={() => run(disableReminders)}>
                  Turn off
                </button>
              </div>
            )}
          </>
        )}
        {note && <p className="note">{note}</p>}
      </div>
    </Section>
  )
}
