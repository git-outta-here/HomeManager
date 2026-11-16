import { useState } from 'react'
import { onTimeStreak, repeatLabel } from '../logic'
import { resetAll, setHoliday, uncompleteTask, updateHousehold } from '../store'
import { createHousehold, disconnect, retrySync, useSync, type SyncStatus } from '../sync'
import type { Chore, State } from '../types'
import { Avatar, Empty, Section } from '../ui'

const SYNC_TEXT: Record<SyncStatus, string> = {
  off: '',
  unlinked: 'This phone is not syncing yet.',
  connecting: 'Connecting…',
  live: 'In sync with your household.',
  offline: 'Offline. Changes are saved here and will be sent when you reconnect.',
}

export default function Chores({ state, onEdit }: { state: State; onEdit: (c: Chore) => void }) {
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
              return (
                <button className="list-row" key={c.id} onClick={() => onEdit(c)}>
                  <span className="task-icon">{c.icon}</span>
                  <span className="task-text">
                    <span className="task-title">{c.title}</span>
                    <span className="task-meta">
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
                      {t.icon} {t.title}
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
