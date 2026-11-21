// Understands what was said to Siri, e.g. "return the shoes on Friday for Kayli". Pure and testable.

type Member = { id: string; name: string }

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const at = (s: string) => new Date(`${s}T00:00:00Z`)
const addDays = (s: string, n: number) => new Date(at(s).getTime() + n * 86_400_000).toISOString().slice(0, 10)

/**
 * Splits a spoken phrase into a task title, a due date and who it is for.
 * Understood at the end of the phrase, in either order: "today", "tonight", "tomorrow",
 * "on Friday" / "Friday", "this weekend", "next week", and "for me" / "for <name>".
 * Anything else stays in the title. With no date it is due today; with no person it is up for grabs.
 */
export function parseSpoken(text: string, today: string, members: Member[], speaker?: string) {
  let rest = text.trim().replace(/[.!?]+$/, '').replace(/\s+/g, ' ')
  let due: string | undefined
  let assigneeId: string | null | undefined

  for (let pass = 0; pass < 2; pass++) {
    const who = /\s+for (me|myself|[\p{L}'-]+)$/iu.exec(rest)
    if (who && assigneeId === undefined) {
      const word = who[1].toLowerCase()
      const member = word === 'me' || word === 'myself' ? members.find((m) => m.id === speaker) : members.find((m) => m.name.toLowerCase() === word)
      if (member) {
        assigneeId = member.id
        rest = rest.slice(0, who.index)
        continue
      }
    }
    const when = /\s+(today|tonight|tomorrow|this weekend|next week|(?:on |this |next )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday))$/i.exec(rest)
    if (when && due === undefined) {
      const word = when[1].toLowerCase()
      const weekday = at(today).getUTCDay()
      if (word === 'today' || word === 'tonight') due = today
      else if (word === 'tomorrow') due = addDays(today, 1)
      else if (word === 'this weekend') due = addDays(today, weekday === 0 ? 0 : 6 - weekday) // Saturday, or today if Sunday
      else if (word === 'next week') due = addDays(today, ((8 - weekday) % 7) || 7) // next Monday
      else due = addDays(today, ((DAYS.indexOf(when[2].toLowerCase()) - weekday + 7) % 7) || 7) // the next such day
      rest = rest.slice(0, when.index)
    }
  }

  const title = rest.trim()
  return {
    title: title ? title[0].toUpperCase() + title.slice(1) : '',
    due: due ?? today,
    assigneeId: assigneeId ?? null,
  }
}

/** "today", "tomorrow" or "on Friday 27 November", for reading back. */
export function sayDay(due: string, today: string) {
  if (due === today) return 'today'
  if (due === addDays(today, 1)) return 'tomorrow'
  return 'on ' + at(due).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
}

/** A sentence listing what is waiting for one person today. */
export function sayList(titles: string[], overdue: number) {
  if (!titles.length) return 'Nothing is due today. Enjoy it.'
  const names = titles.length === 1 ? titles[0] : `${titles.slice(0, -1).join(', ')} and ${titles[titles.length - 1]}`
  const count = titles.length === 1 ? 'one thing' : `${titles.length} things`
  return `You have ${count} to do today: ${names}.${overdue ? ` ${overdue === 1 ? 'One is' : `${overdue} are`} overdue.` : ''}`
}
