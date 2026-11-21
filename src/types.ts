export type Member = { id: string; name: string; color: string }

export type Repeat =
  | { kind: 'weekly'; days: number[] } // fixed days of the week, 0 = Sunday
  | { kind: 'interval'; everyDays: number } // N days after it was last done
  | { kind: 'monthly'; every: number; on: MonthDay } // every N months, on a date or a weekday

/** A day within a month: a date (1 to 31, clamped to the month's length) or e.g. the 2nd Tuesday. */
export type MonthDay =
  | { by: 'date'; day: number }
  | { by: 'weekday'; week: 1 | 2 | 3 | 4 | 5; weekday: number } // week 5 means the last one

/** One line of a checklist. */
export type Step = { text: string; done?: boolean }

export type Assignment =
  | { kind: 'anyone' }
  | { kind: 'member'; memberId: string }
  | { kind: 'alternate' }

export type Chore = {
  id: string
  title: string
  icon: string
  points: number
  repeat: Repeat
  assignment: Assignment
  /** Paused chores are hidden from Today and earn no overdue bonus. */
  paused?: boolean
  note?: string
  /** Checklist copied, unticked, onto each new occurrence. */
  steps?: string[]
}

/** One thing to do: either an occurrence of a chore or a one-off. */
export type Task = {
  id: string
  choreId?: string
  title: string
  icon: string
  points: number
  due: string // YYYY-MM-DD, local
  assigneeId: string | null
  completedBy?: string
  completedAt?: string // ISO timestamp
  pointsAwarded?: number
  /** Ids of members who said thanks for this. */
  thanks?: string[]
  note?: string
  steps?: Step[]
}

export type Reward = { id: string; title: string; icon: string; cost: number }

export type Redemption = {
  id: string
  title: string
  icon: string
  cost: number
  memberId: string
  at: string
}

export type State = {
  household: {
    weeklyGoal: number
    goalReward: string
    /** What the weekly points winner gets. */
    weeklyPrize?: string
    /** Hide the head-to-head and show only the team goal. */
    hideRace?: boolean
    /** Holiday mode: the day it was switched on, while it is on. */
    pausedSince?: string
    /** Past holidays as [first day, last day], so streaks survive them. */
    holidays?: [string, string][]
  }
  members: Member[]
  chores: Chore[]
  tasks: Task[]
  rewards: Reward[]
  redemptions: Redemption[]
}
