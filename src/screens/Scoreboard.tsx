import { addDays, balance, dayStreak, diffDays, fairness, parseYmd, pointsBetween, weekStart } from '../logic'
import type { Member, State } from '../types'
import { Avatar, Section, tint } from '../ui'

export default function Scoreboard({ state, today }: { state: State; today: string }) {
  const start = weekStart(today)
  const rows = state.members.map((m) => ({
    m,
    week: pointsBetween(state.tasks, m.id, start, addDays(start, 7)),
    last: pointsBetween(state.tasks, m.id, addDays(start, -7), start),
    streak: dayStreak(state.tasks, m.id, today, state.household),
    bank: balance(state, m.id),
  }))
  const top = Math.max(...rows.map((r) => r.week))
  const tied = rows.every((r) => r.week === top)
  const total = rows.reduce((n, r) => n + r.week, 0)
  const goal = state.household.weeklyGoal
  const daysLeft = diffDays(addDays(start, 7), today)

  const lastTop = Math.max(...rows.map((r) => r.last))
  const lastWinner = rows.filter((r) => r.last === lastTop)
  const { hideRace, weeklyPrize } = state.household

  return (
    <>
      {!hideRace && <Section title="This week">
        <div className="card">
          {rows.map((r) => (
            <div className="score" key={r.m.id} style={tint(r.m)}>
              <Avatar member={r.m} />
              <div className="score-main">
                <div className="score-line">
                  <span className="score-name">
                    {r.m.name} {!tied && r.week === top && <span title="In the lead">👑</span>}
                  </span>
                  <span className="score-pts">{r.week}</span>
                </div>
                <div className="bar">
                  <div style={{ width: `${top ? (r.week / top) * 100 : 0}%` }} />
                </div>
              </div>
            </div>
          ))}
          <p className="note">
            {top === 0
              ? 'No points yet this week. First one to tick something off takes the lead.'
              : tied
                ? 'Neck and neck.'
                : `${rows.find((r) => r.week === top)!.m.name} leads by ${top - Math.min(...rows.map((r) => r.week))}.`}{' '}
            Resets in {daysLeft} {daysLeft === 1 ? 'day' : 'days'}.
          </p>
          {weeklyPrize && (
            <p className="note">
              🏅 Winner's prize: <b>{weeklyPrize}</b>
            </p>
          )}
        </div>
      </Section>}

      <Section title="Team goal">
        <div className="card">
          <div className="score-line">
            <span className="score-name">
              {total >= goal ? '🎉 Goal reached' : `${goal - total} points to go`}
            </span>
            <span className="score-pts">
              {total}
              <small> / {goal}</small>
            </span>
          </div>
          <div className="bar team">
            {rows.map((r) => (
              <div key={r.m.id} style={{ ...tint(r.m), width: `${Math.min(1, r.week / Math.max(goal, total)) * 100}%` }} />
            ))}
          </div>
          {state.household.goalReward && (
            <p className="note">
              {total >= goal ? 'You have both earned: ' : 'Hit it together to earn: '}
              <b>{state.household.goalReward}</b>
            </p>
          )}
        </div>
      </Section>

      <Section title="Streaks and bank">
        <div className="duo">
          {rows.map((r) => (
            <div className="card stat" key={r.m.id} style={tint(r.m)}>
              <div className="stat-name">{r.m.name}</div>
              {hideRace && (
                <>
                  <div className="stat-big">{r.week}</div>
                  <div className="note">points this week</div>
                </>
              )}
              <div className="stat-big">
                {r.streak ? '🔥' : '💤'} {r.streak}
              </div>
              <div className="note">day streak</div>
              <div className="stat-big">⭐ {r.bank}</div>
              <div className="note">points to spend</div>
            </div>
          ))}
        </div>
      </Section>

      <Fairness state={state} today={today} />

      {!hideRace && lastTop > 0 && (
        <Section title="Last week">
          <div className="card">
            <p className="plain">
              {lastWinner.length > 1
                ? `A draw at ${lastTop} points each.`
                : `${lastWinner[0].m.name} won, ${rows.map((r) => r.last).sort((a, b) => b - a).join(' to ')}.`}
            </p>
            {weeklyPrize && lastWinner.length === 1 && (
              <p className="note">
                🏅 {lastWinner[0].m.name} claims: <b>{weeklyPrize}</b>
              </p>
            )}
          </div>
        </Section>
      )}
    </>
  )
}

const WEEKS = 6

/** A bar split between the two of you, in proportion to each person's number. */
function Split({ members, values }: { members: Member[]; values: Record<string, number> }) {
  const total = members.reduce((n, m) => n + (values[m.id] ?? 0), 0)
  return (
    <div className="bar split">
      {members.map((m) => (
        <div key={m.id} style={{ ...tint(m), width: `${total ? ((values[m.id] ?? 0) / total) * 100 : 0}%` }} />
      ))}
    </div>
  )
}

/** Who has done what over the last few weeks, by points and by chore. */
function Fairness({ state, today }: { state: State; today: string }) {
  const { byWeek, byChore, totals } = fairness(state, today, WEEKS)
  const all = state.members.reduce((n, m) => n + (totals[m.id] ?? 0), 0)
  if (!all) return null
  const numbers = (values: Record<string, number>) => state.members.map((m) => values[m.id] ?? 0).join(' · ')

  return (
    <Section title="Who did what">
      <div className="card">
        <div className="fair-head">
          {state.members.map((m) => (
            <span key={m.id} className="fair-key" style={tint(m)}>
              <i /> {m.name} {Math.round(((totals[m.id] ?? 0) / all) * 100)}%
            </span>
          ))}
        </div>
        <p className="note">Share of all points over the last {WEEKS} weeks.</p>

        <h3 className="sub">Points each week</h3>
        {byWeek.map((w, i) => (
          <div className="fair-row" key={w.start}>
            <span className="fair-label">
              {i === WEEKS - 1 ? 'This week' : parseYmd(w.start).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
            </span>
            <Split members={state.members} values={w.points} />
            <span className="fair-num">{numbers(w.points)}</span>
          </div>
        ))}

        <h3 className="sub">Times done, by chore</h3>
        {byChore.slice(0, 8).map((c) => (
          <div className="fair-row" key={c.title}>
            <span className="fair-label">
              <span className="emo">{c.icon}</span>
              {c.title}
            </span>
            <Split members={state.members} values={c.count} />
            <span className="fair-num">{numbers(c.count)}</span>
          </div>
        ))}
      </div>
    </Section>
  )
}
