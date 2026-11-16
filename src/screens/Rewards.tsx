import { useState } from 'react'
import { balance } from '../logic'
import { addReward, deleteReward, redeem, undoRedemption } from '../store'
import type { Member, State } from '../types'
import { Avatar, Empty, Section } from '../ui'

const REWARD_ICONS = ['🎬', '😴', '🎟️', '🍜', '☕', '💆', '🍰', '🎮', '🛍️', '🎁']

export default function Rewards({ state, me, onRedeem }: { state: State; me: Member; onRedeem: () => void }) {
  const bank = balance(state, me.id)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState('')
  const [cost, setCost] = useState(30)
  const [icon, setIcon] = useState(REWARD_ICONS[0])
  const log = [...state.redemptions].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 15)

  return (
    <>
      <div className="card bank">
        <div>
          <div className="note">{me.name}'s points to spend</div>
          <div className="bank-big">⭐ {bank}</div>
        </div>
        <Avatar member={me} />
      </div>

      <Section title="Rewards">
        {state.rewards.length === 0 && <Empty icon="🎁">Add a reward you would both work for.</Empty>}
        <div className="rewards">
          {[...state.rewards]
            .sort((a, b) => a.cost - b.cost)
            .map((r) => {
              const short = r.cost - bank
              return (
                <div className="card reward" key={r.id}>
                  <div className="reward-icon">{r.icon}</div>
                  <div className="reward-title">{r.title}</div>
                  {editing ? (
                    <button className="ghost danger" onClick={() => deleteReward(r.id)}>
                      Remove
                    </button>
                  ) : (
                    <button
                      className="primary small"
                      disabled={short > 0}
                      onClick={() => {
                        redeem(r.id, me.id)
                        onRedeem()
                      }}
                    >
                      {short > 0 ? `${short} more` : `Redeem · ${r.cost}`}
                    </button>
                  )}
                </div>
              )
            })}
        </div>

        {adding ? (
          <form
            className="card form"
            onSubmit={(e) => {
              e.preventDefault()
              if (!title.trim() || cost < 1) return
              addReward({ title: title.trim(), icon, cost })
              setTitle('')
              setAdding(false)
            }}
          >
            <label>
              Reward
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Breakfast in bed" autoFocus autoComplete="off" />
            </label>
            <div className="icons">
              {REWARD_ICONS.map((i) => (
                <button type="button" key={i} className={i === icon ? 'on' : ''} onClick={() => setIcon(i)} aria-pressed={i === icon}>
                  {i}
                </button>
              ))}
            </div>
            <label>
              Cost in points
              <input type="number" min={1} value={cost} onChange={(e) => setCost(Number(e.target.value))} />
            </label>
            <div className="row">
              <button type="button" className="ghost" onClick={() => setAdding(false)}>
                Cancel
              </button>
              <button className="primary small" disabled={!title.trim()}>
                Add reward
              </button>
            </div>
          </form>
        ) : (
          <div className="row">
            <button className="link" onClick={() => setAdding(true)}>
              + Add a reward
            </button>
            {state.rewards.length > 0 && (
              <button className="link" onClick={() => setEditing(!editing)}>
                {editing ? 'Done' : 'Edit list'}
              </button>
            )}
          </div>
        )}
      </Section>

      {log.length > 0 && (
        <Section title="Redeemed">
          <div className="card list">
            {log.map((r) => {
              const m = state.members.find((x) => x.id === r.memberId)
              return (
                <div className="list-row" key={r.id}>
                  <span className="task-icon">{r.icon}</span>
                  <span className="task-text">
                    <span className="task-title">{r.title}</span>
                    <span className="task-meta">
                      {m?.name} · {new Date(r.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · {r.cost} points
                    </span>
                  </span>
                  <button className="ghost" onClick={() => undoRedemption(r.id)}>
                    Undo
                  </button>
                </div>
              )
            })}
          </div>
        </Section>
      )}
    </>
  )
}
