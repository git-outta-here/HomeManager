import type { MonthDay, Repeat, State, Task } from './types'

type Household = State['household']

// ---- dates (all local, as YYYY-MM-DD strings) ----

const pad = (n: number) => String(n).padStart(2, '0')

export const ymd = (d: Date = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const parseYmd = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const addDays = (s: string, n: number) => {
  const d = parseYmd(s)
  d.setDate(d.getDate() + n)
  return ymd(d)
}

export const diffDays = (a: string, b: string) =>
  Math.round((parseYmd(a).getTime() - parseYmd(b).getTime()) / 86_400_000)

/** Monday of the week containing `s`. */
export const weekStart = (s: string) => addDays(s, -((parseYmd(s).getDay() + 6) % 7))

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function dueLabel(due: string, today: string) {
  const d = diffDays(due, today)
  if (d < 0) return d === -1 ? '1 day overdue' : `${-d} days overdue`
  if (d === 0) return 'Today'
  if (d === 1) return 'Tomorrow'
  return parseYmd(due).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export type Urgency = 'verylate' | 'late' | 'today' | 'soon' | 'later'

/** How pressing a due date is, which decides the colour a task is shown in. */
export function urgency(due: string, today: string): Urgency {
  const d = diffDays(due, today)
  if (d <= -3) return 'verylate'
  if (d < 0) return 'late'
  if (d === 0) return 'today'
  return d === 1 ? 'soon' : 'later'
}

const ORDINALS = ['', 'First', 'Second', 'Third', 'Fourth', 'Last']
const nth = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`

export function repeatLabel(r: Repeat) {
  if (r.kind === 'monthly') {
    const day = r.on.by === 'date' ? `the ${nth(r.on.day)}` : `${ORDINALS[r.on.week].toLowerCase()} ${DAY_NAMES[r.on.weekday]}`
    if (r.every === 1) return `Monthly on the ${day.replace(/^the /, '')}`
    return `Every ${r.every === 12 ? 'year' : `${r.every} months`} on the ${day.replace(/^the /, '')}`
  }
  if (r.kind === 'interval')
    return r.everyDays === 1 ? 'The day after it is done' : `${r.everyDays} days after it is done`
  if (r.days.length === 7) return 'Every day'
  return [...r.days]
    .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
    .map((d) => DAY_NAMES[d])
    .join(', ')
}

// ---- recurrence ----

/** First scheduled day strictly after `after`. */
function nextWeekly(days: number[], after: string) {
  for (let i = 1; i <= 7; i++) {
    const day = addDays(after, i)
    if (days.includes(parseYmd(day).getDay())) return day
  }
  return addDays(after, 1)
}

/** The date in a month (month counted from 0, and may run past 11) that a monthly rule lands on. */
export function monthDate(on: MonthDay, year: number, month: number) {
  const last = new Date(year, month + 1, 0).getDate()
  if (on.by === 'date') return ymd(new Date(year, month, Math.min(on.day, last)))
  if (on.week === 5) {
    const end = new Date(year, month, last)
    return ymd(new Date(year, month, last - ((end.getDay() - on.weekday + 7) % 7)))
  }
  const first = new Date(year, month, 1).getDay()
  return ymd(new Date(year, month, 1 + ((on.weekday - first + 7) % 7) + (on.week - 1) * 7))
}

export function firstDue(r: Repeat, today: string) {
  if (r.kind === 'weekly') return nextWeekly(r.days, addDays(today, -1))
  if (r.kind === 'interval') return today
  const d = parseYmd(today)
  const thisMonth = monthDate(r.on, d.getFullYear(), d.getMonth())
  return thisMonth >= today ? thisMonth : monthDate(r.on, d.getFullYear(), d.getMonth() + 1)
}

/** Due date of the occurrence that follows one due on `prevDue` and done (or skipped) on `doneDate`. */
export function nextDue(r: Repeat, prevDue: string, doneDate: string) {
  if (r.kind === 'interval') return addDays(doneDate, r.everyDays)
  if (r.kind === 'monthly') {
    // Step on from the month it was due in, so "every 3 months" keeps its rhythm when done late.
    const d = parseYmd(prevDue)
    for (let m = d.getMonth() + r.every; ; m += r.every) {
      const day = monthDate(r.on, d.getFullYear(), m)
      if (day > doneDate && day > prevDue) return day
    }
  }
  return nextWeekly(r.days, prevDue > doneDate ? prevDue : doneDate)
}

// ---- points ----

/** Bonus for an overdue task: +1 per day late, capped at the task's own value. */
export function bounty(t: Task, today: string) {
  return Math.min(Math.max(0, diffDays(today, t.due)), t.points)
}

const doneDay = (t: Task) => ymd(new Date(t.completedAt!))

export function pointsBetween(tasks: Task[], memberId: string, from: string, toExclusive: string) {
  let sum = 0
  for (const t of tasks) {
    if (t.completedBy !== memberId || !t.completedAt) continue
    const d = doneDay(t)
    if (d >= from && d < toExclusive) sum += t.pointsAwarded ?? 0
  }
  return sum
}

export const weekPoints = (tasks: Task[], memberId: string, today: string) =>
  pointsBetween(tasks, memberId, weekStart(today), addDays(weekStart(today), 7))

/** Spendable points: everything earned minus everything redeemed. */
export function balance(s: State, memberId: string) {
  const earned = s.tasks.reduce(
    (n, t) => n + (t.completedBy === memberId ? (t.pointsAwarded ?? 0) : 0),
    0,
  )
  const spent = s.redemptions.reduce((n, r) => n + (r.memberId === memberId ? r.cost : 0), 0)
  return earned - spent
}

/** Consecutive days with at least one completion; today not yet counting against you. */
export function dayStreak(tasks: Task[], memberId: string, today: string, h: Household) {
  const days = new Set<string>()
  for (const t of tasks) if (t.completedBy === memberId && t.completedAt) days.add(doneDay(t))
  let day = days.has(today) ? today : addDays(today, -1)
  let n = 0
  // Holiday days neither add to a streak nor break it.
  for (;;) {
    if (days.has(day)) n++
    else if (!isHoliday(h, day)) break
    day = addDays(day, -1)
  }
  return n
}

export function isHoliday(h: Household, day: string) {
  if (h.pausedSince && day >= h.pausedSince) return true
  return (h.holidays ?? []).some(([from, to]) => day >= from && day <= to)
}

/** The date overdue bonuses are counted up to: frozen at the start of a holiday. */
export const bonusDay = (h: Household, today: string) =>
  h.pausedSince && h.pausedSince < today ? h.pausedSince : today

/** How many times in a row a chore was done on or before its due date. */
export function onTimeStreak(tasks: Task[], choreId: string) {
  const done = tasks
    .filter((t) => t.choreId === choreId && t.completedAt)
    .sort((a, b) => (a.completedAt! < b.completedAt! ? 1 : -1))
  let n = 0
  for (const t of done) {
    if (doneDay(t) > t.due) break
    n++
  }
  return n
}

// ---- fairness ----

export type Share = Record<string, number>

/** Points per person for each of the last `weeks` weeks (oldest first), and completions per chore. */
export function fairness(s: State, today: string, weeks: number) {
  const thisWeek = weekStart(today)
  const from = addDays(thisWeek, -7 * (weeks - 1))
  const byWeek = Array.from({ length: weeks }, (_, i) => ({ start: addDays(from, 7 * i), points: {} as Share }))
  const byChore = new Map<string, { title: string; icon: string; count: Share; total: number }>()
  const totals: Share = {}
  for (const t of s.tasks) {
    if (!t.completedAt || !t.completedBy) continue
    const day = doneDay(t)
    if (day < from) continue
    const week = byWeek[Math.floor(diffDays(day, from) / 7)]
    if (!week) continue
    const who = t.completedBy
    week.points[who] = (week.points[who] ?? 0) + (t.pointsAwarded ?? 0)
    totals[who] = (totals[who] ?? 0) + (t.pointsAwarded ?? 0)
    const key = t.choreId ?? 'one-off'
    const row = byChore.get(key) ?? { title: t.choreId ? t.title : 'One-off tasks', icon: t.choreId ? t.icon : '✅', count: {}, total: 0 }
    row.count[who] = (row.count[who] ?? 0) + 1
    row.total++
    if (t.choreId) Object.assign(row, { title: t.title, icon: t.icon })
    byChore.set(key, row)
  }
  return { byWeek, byChore: [...byChore.values()].sort((a, b) => b.total - a.total), totals }
}
