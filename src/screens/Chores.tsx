import { useEffect, useState } from 'react'
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
import { calendarFeedUrl, createHousehold, shortcutUrl, disconnect, retrySync, useSync, type SyncStatus } from '../sync'
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

      {linked && <CalendarFeed me={me} />}
      {linked && <Siri me={me} />}

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

/** A private link that shows upcoming tasks in a calendar app. */
function CalendarFeed({ me }: { me: Member }) {
  const [mine, setMine] = useState(true)
  const [url, setUrl] = useState<string | null | undefined>(undefined)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let current = true
    setCopied(false)
    void calendarFeedUrl(mine ? me.id : undefined).then((u) => current && setUrl(u))
    return () => {
      current = false
    }
  }, [mine, me.id])

  return (
    <Section title="Calendar">
      <div className="card form">
        <p className="plain">See what is coming up in your phone's calendar.</p>
        <div className="seg">
          <button type="button" className={mine ? 'on' : ''} onClick={() => setMine(true)}>
            Just {me.name}'s
          </button>
          <button type="button" className={!mine ? 'on' : ''} onClick={() => setMine(false)}>
            Everyone's
          </button>
        </div>
        {url === undefined ? (
          <p className="note">Loading…</p>
        ) : url === null ? (
          <p className="note">The calendar feed is not available right now. Check your connection and reopen this tab.</p>
        ) : (
          <>
            <div className="row">
              <a className="primary small" href={url.replace(/^https:/, 'webcal:')}>
                Add to calendar
              </a>
              <button
                className="ghost"
                onClick={() => void navigator.clipboard?.writeText(url).then(() => setCopied(true), () => setCopied(false))}
              >
                {copied ? 'Copied' : 'Copy link'}
              </button>
            </div>
            <p className="note">
              "Add to calendar" works with Apple Calendar. For Google Calendar, copy the link and use Other calendars, then
              From URL. Calendars refresh on their own schedule, so changes can take a few hours to appear. Anyone with
              the link can see your tasks, so keep it private.
            </p>
          </>
        )}
      </div>
    </Section>
  )
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      className="primary small"
      onClick={() => void navigator.clipboard?.writeText(text).then(() => setCopied(true), () => setCopied(false))}
    >
      {copied ? 'Copied' : label}
    </button>
  )
}

/** Links for the iPhone Shortcuts app, so tasks can be added and read out by voice. */
function Siri({ me }: { me: Member }) {
  const [url, setUrl] = useState<string | null | undefined>(undefined)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let current = true
    void shortcutUrl(me.id).then((u) => current && setUrl(u))
    return () => {
      current = false
    }
  }, [me.id])

  return (
    <Section title="Siri">
      <div className="card form">
        <p className="plain">Add a task or hear today's list by voice, using the Shortcuts app on your iPhone.</p>
        {url === undefined ? (
          <p className="note">Loading…</p>
        ) : url === null ? (
          <p className="note">Siri links are not available right now. Check your connection and reopen this tab.</p>
        ) : !open ? (
          <button className="link" onClick={() => setOpen(true)}>
            Show me how to set it up
          </button>
        ) : (
          <>
            <h3 className="sub">"Add a chore"</h3>
            <ol className="steps-list">
              <li>
                <CopyButton text={url} label="Copy the add link" />
              </li>
              <li>In the Shortcuts app tap +, then add the action Ask for Input. Set its question to "What needs doing?".</li>
              <li>Add the action Get Contents of URL and paste the link into it.</li>
              <li>
                Tap the arrow on that action. Set Method to POST and Request Body to JSON. Add a text field with the key{' '}
                <b>title</b> and choose Ask for Input (or Provided Input) as its value.
              </li>
              <li>Add the action Speak Text, or Show Result, so Siri reads the answer back.</li>
              <li>Name the shortcut "Add a chore". Then say "Hey Siri, add a chore".</li>
            </ol>
            <p className="note">
              You can end with a day or a person, such as "return the shoes on Friday" or "book the dentist tomorrow for
              me". With no day it is due today, and with no person it is up for grabs.
            </p>

            <h3 className="sub">"What's on my list"</h3>
            <ol className="steps-list">
              <li>
                <CopyButton text={`${url}&list=1`} label="Copy the list link" />
              </li>
              <li>Make a new shortcut with Get Contents of URL and paste the link. Leave Method as GET.</li>
              <li>Add Speak Text, and name the shortcut "What's on my list".</li>
            </ol>
            <p className="note">
              These links are for {me.name} on this phone, and they can add tasks to your household. Keep them private.
            </p>
          </>
        )}
      </div>
    </Section>
  )
}
