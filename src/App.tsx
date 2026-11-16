import { useMemo, useRef, useState, type CSSProperties } from 'react'
import { weekPoints } from './logic'
import { setMe, useStore, useToday } from './store'
import type { Chore } from './types'
import { Avatar, tint } from './ui'
import AddSheet from './screens/AddSheet'
import Chores from './screens/Chores'
import Rewards from './screens/Rewards'
import Scoreboard from './screens/Scoreboard'
import Setup, { WhoAmI } from './screens/Setup'
import Today from './screens/Today'

type Tab = 'today' | 'scores' | 'rewards' | 'chores'
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'today', label: 'Today', icon: '☀️' },
  { id: 'scores', label: 'Scores', icon: '🏆' },
  { id: 'rewards', label: 'Rewards', icon: '🎁' },
  { id: 'chores', label: 'Chores', icon: '📋' },
]

const CONFETTI = ['#F2684A', '#1E9E94', '#F5B841', '#7C6CF2', '#4FB0F0']

function Burst({ points }: { points: number }) {
  const bits = useMemo(
    () =>
      Array.from({ length: 30 }, (_, i) => ({
        '--x': `${(Math.random() - 0.5) * 340}px`,
        '--y': `${-(100 + Math.random() * 280)}px`,
        '--r': `${Math.random() * 720 - 360}deg`,
        '--d': `${Math.random() * 0.12}s`,
        background: CONFETTI[i % CONFETTI.length],
      })),
    [],
  )
  return (
    <div className="burst" aria-hidden="true">
      {bits.map((b, i) => (
        <i key={i} style={b as CSSProperties} />
      ))}
      <div className="burst-pts">{points ? `+${points}` : '🎁'}</div>
    </div>
  )
}

export default function App() {
  const { state, me } = useStore()
  const today = useToday()
  const [tab, setTabState] = useState<Tab>('today')
  const setTab = (t: Tab) => {
    setTabState(t)
    window.scrollTo(0, 0)
  }
  const [sheet, setSheet] = useState<{ chore?: Chore } | null>(null)
  const [burst, setBurst] = useState<{ key: number; points: number } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  if (!state) return <Setup />

  const current = state.members.find((m) => m.id === me)
  if (!current) return <WhoAmI state={state} />

  const celebrate = (points: number) => {
    clearTimeout(timer.current)
    setBurst({ key: Date.now(), points })
    timer.current = setTimeout(() => setBurst(null), 1500)
  }

  return (
    <div className="app" style={tint(current)}>
      <header className="top">
        <div>
          <div className="eyebrow">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
          <h1>{TABS.find((t) => t.id === tab)!.label}</h1>
        </div>
        <div className="who" role="group" aria-label="Who is using the app">
          {state.members.map((m) => (
            <button
              key={m.id}
              className={m.id === current.id ? 'who-btn on' : 'who-btn'}
              style={tint(m)}
              onClick={() => setMe(m.id)}
              aria-pressed={m.id === current.id}
            >
              <Avatar member={m} small />
              <span>{m.name}</span>
              {!state.household.hideRace && <b>{weekPoints(state.tasks, m.id, today)}</b>}
            </button>
          ))}
        </div>
      </header>

      <main>
        {tab === 'today' && <Today state={state} me={current} today={today} onDone={celebrate} />}
        {tab === 'scores' && <Scoreboard state={state} today={today} />}
        {tab === 'rewards' && <Rewards state={state} me={current} onRedeem={() => celebrate(0)} />}
        {tab === 'chores' && <Chores state={state} onEdit={(chore) => setSheet({ chore })} />}
      </main>

      <nav className="tabs">
        {TABS.slice(0, 2).map((t) => (
          <TabButton key={t.id} t={t} on={tab === t.id} onClick={() => setTab(t.id)} />
        ))}
        <button className="add" onClick={() => setSheet({})} aria-label="Add a task or chore">
          +
        </button>
        {TABS.slice(2).map((t) => (
          <TabButton key={t.id} t={t} on={tab === t.id} onClick={() => setTab(t.id)} />
        ))}
      </nav>

      {sheet && <AddSheet state={state} chore={sheet.chore} onClose={() => setSheet(null)} />}
      {burst && <Burst key={burst.key} points={burst.points} />}
    </div>
  )
}

function TabButton({
  t,
  on,
  onClick,
}: {
  t: { label: string; icon: string }
  on: boolean
  onClick: () => void
}) {
  return (
    <button className={on ? 'tab on' : 'tab'} onClick={onClick} aria-current={on ? 'page' : undefined}>
      <span className="tab-icon">{t.icon}</span>
      {t.label}
    </button>
  )
}
