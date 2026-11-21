// Turns a household's tasks into a calendar feed (iCalendar text). Pure, so it can be tested alone.

type MonthDay = { by: 'date'; day: number } | { by: 'weekday'; week: number; weekday: number }
type Repeat =
  | { kind: 'weekly'; days: number[] }
  | { kind: 'interval'; everyDays: number }
  | { kind: 'monthly'; every: number; on: MonthDay }
type Chore = { id: string; repeat: Repeat; assignment: { kind: string }; paused?: boolean }
type Task = {
  id: string
  choreId?: string
  title: string
  icon: string
  points: number
  due: string
  assigneeId: string | null
  completedAt?: string
  note?: string
  steps?: { text: string }[]
}
type Member = { id: string; name: string; order?: number }
export type Row = { kind: string; data: unknown; deleted: boolean }

// ---- dates as YYYY-MM-DD, with no time zone involved ----

const iso = (d: Date) => d.toISOString().slice(0, 10)
const at = (s: string) => new Date(`${s}T00:00:00Z`)
const addDays = (s: string, n: number) => iso(new Date(at(s).getTime() + n * 86_400_000))

function monthDate(on: MonthDay, year: number, month: number) {
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  if (on.by === 'date') return iso(new Date(Date.UTC(year, month, Math.min(on.day, last))))
  if (on.week === 5) {
    const end = new Date(Date.UTC(year, month, last)).getUTCDay()
    return iso(new Date(Date.UTC(year, month, last - ((end - on.weekday + 7) % 7))))
  }
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay()
  return iso(new Date(Date.UTC(year, month, 1 + ((on.weekday - first + 7) % 7) + (on.week - 1) * 7)))
}

/** The scheduled date after `due`, or null for chores that only repeat once they are done. */
function following(r: Repeat, due: string) {
  if (r.kind === 'weekly') {
    for (let i = 1; i <= 7; i++) {
      const day = addDays(due, i)
      if (r.days.includes(at(day).getUTCDay())) return day
    }
    return null
  }
  if (r.kind === 'monthly') {
    const d = at(due)
    return monthDate(r.on, d.getUTCFullYear(), d.getUTCMonth() + Math.max(1, r.every))
  }
  return null
}

// ---- iCalendar text ----

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** Lines may be at most 75 bytes; longer ones continue on the next line after a space. */
function fold(line: string) {
  const enc = new TextEncoder()
  const out: string[] = []
  let cur = ''
  let size = 0
  for (const ch of line) {
    const n = enc.encode(ch).length
    if (size + n > 73) {
      out.push(cur)
      cur = ' '
      size = 1
    }
    cur += ch
    size += n
  }
  out.push(cur)
  return out.join('\r\n')
}

const HORIZON_DAYS = 60

/**
 * The feed for a household. `who` limits it to one person's tasks plus anything up for grabs.
 * Repeating chores are projected `HORIZON_DAYS` ahead; overdue tasks are shown on today.
 */
export function buildFeed(rows: Row[], opts: { who?: string; today: string; now?: Date }) {
  const live = rows.filter((r) => !r.deleted)
  const of = <T>(kind: string) => live.filter((r) => r.kind === kind).map((r) => r.data as T)
  const household = (of<{ pausedSince?: string }>('household')[0] ?? {})
  const members = of<Member>('member').sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const chores = new Map(of<Chore>('chore').map((c) => [c.id, c]))
  const name = (id: string | null) => members.find((m) => m.id === id)?.name
  const horizon = addDays(opts.today, HORIZON_DAYS)
  const stamp = (opts.now ?? new Date()).toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z'

  const events: string[] = []
  const add = (uid: string, day: string, t: Task, assignee: string | null, overdue: boolean) => {
    if (opts.who && assignee && assignee !== opts.who) return
    const whoLabel = !opts.who && assignee ? ` · ${name(assignee) ?? ''}` : !assignee ? ' · up for grabs' : ''
    const details = [
      t.note,
      ...(t.steps ?? []).map((s) => `- ${s.text}`),
      `Worth ${t.points} ${t.points === 1 ? 'point' : 'points'} in HomeManager.`,
    ].filter(Boolean)
    events.push(
      [
        'BEGIN:VEVENT',
        `UID:${uid}@homemanager`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${day.replace(/-/g, '')}`,
        `DTEND;VALUE=DATE:${addDays(day, 1).replace(/-/g, '')}`,
        `SUMMARY:${esc(`${t.icon} ${t.title}${whoLabel}${overdue ? ' (overdue)' : ''}`)}`,
        `DESCRIPTION:${esc(details.join('\n'))}`,
        'TRANSP:TRANSPARENT',
        'END:VEVENT',
      ]
        .map(fold)
        .join('\r\n'),
    )
  }

  for (const t of of<Task>('task')) {
    if (t.completedAt) continue
    const chore = t.choreId ? chores.get(t.choreId) : undefined
    if (t.choreId && (household.pausedSince || chore?.paused)) continue
    const overdue = t.due < opts.today
    add(t.id, overdue ? opts.today : t.due, t, t.assigneeId, overdue)
    if (!chore) continue
    // Later occurrences, as they will fall if each one is done on time.
    let day: string | null = t.due
    let assignee = t.assigneeId
    for (let i = 0; i < 80; i++) {
      day = following(chore.repeat, day)
      if (!day || day > horizon) break
      if (chore.assignment.kind === 'alternate' && members.length > 1) {
        const at = members.findIndex((m) => m.id === assignee)
        assignee = members[(at + 1) % members.length].id
      }
      if (day > opts.today) add(`${chore.id}-${day}`, day, t, assignee, false)
    }
  }

  return (
    [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//HomeManager//Chores//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:HomeManager${opts.who && name(opts.who) ? ` (${esc(name(opts.who)!)})` : ''}`,
      'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
      'X-PUBLISHED-TTL:PT1H',
      ...events,
      'END:VCALENDAR',
    ].join('\r\n') + '\r\n'
  )
}
