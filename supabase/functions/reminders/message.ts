// Works out what one person's daily reminder should say. Pure, so it can be tested on its own.

type Task = {
  title: string
  icon: string
  due: string
  assigneeId: string | null
  choreId?: string
  completedAt?: string
}
type Chore = { id: string; paused?: boolean }
type Household = { pausedSince?: string }
export type Row = { kind: string; data: unknown; deleted: boolean }

/** The date (YYYY-MM-DD) and hour (0 to 23) it currently is in a time zone. */
export function localNow(tz: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)!.value
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) }
}

/** The notification for this person today, or null when nothing is waiting for them. */
export function reminderFor(rows: Row[], memberId: string, today: string) {
  const live = rows.filter((r) => !r.deleted)
  const household = (live.find((r) => r.kind === 'household')?.data ?? {}) as Household
  const paused = new Set(
    live.filter((r) => r.kind === 'chore' && (r.data as Chore).paused).map((r) => (r.data as Chore).id),
  )
  const waiting = live
    .filter((r) => r.kind === 'task')
    .map((r) => r.data as Task)
    .filter(
      (t) =>
        !t.completedAt &&
        t.due <= today &&
        (t.assigneeId === memberId || !t.assigneeId) &&
        !(t.choreId && (household.pausedSince || paused.has(t.choreId))),
    )
    .sort((a, b) => a.due.localeCompare(b.due) || a.title.localeCompare(b.title))
  if (!waiting.length) return null

  const overdue = waiting.filter((t) => t.due < today).length
  if (waiting.length === 1) {
    const t = waiting[0]
    return { title: `${t.icon} ${t.title}`, body: overdue ? 'Overdue. Worth bonus points if you do it today.' : 'Due today.' }
  }
  const names = waiting.slice(0, 3).map((t) => t.title)
  const more = waiting.length - names.length
  return {
    title: `${waiting.length} things to do today${overdue ? ` (${overdue} overdue)` : ''}`,
    body: names.join(', ') + (more ? `, and ${more} more` : ''),
  }
}
