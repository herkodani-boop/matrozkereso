"use client"

import { useCallback, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { authorizedFetch, boatColor } from "./crew-data"

// A "Csapataim" oldal adatai: csapatok tagokkal, eseményekkel és válaszokkal (/api/crew/teams).

export type TeamMember = {
  id: string
  name: string
  avatarUrl: string | null
  phone: string | null
  email: string | null
  // Konkrét poszt (pl. "Kormányos"); az általános "Csapattag" helyett null.
  role: string | null
  isCaptain: boolean
}

export type TeamEvent = {
  id: string
  title: string
  type: string
  startDate: string
  endDate: string | null
  location: string
  note: string
  // userId → confirmed / declined / pending / unset
  answers: Record<string, string>
}

export type TeamView = {
  boatId: string
  name: string
  type: string
  harbor: string
  imageUrl: string | null
  // A saját hajó csapata: csak olvasható nézet, a kezelés a Hajóm oldalon van.
  own: boolean
  memberSince: string | null
  captainId: string
  members: TeamMember[]
  events: TeamEvent[]
  color: string
}

export type TeamPeople = Record<string, { name: string; avatarUrl: string | null }>

export type MyAnswer = "confirmed" | "declined" | "open"

const OWN_COLOR = "#e8833a"

export function myAnswer(event: TeamEvent, userId: string | null): MyAnswer {
  const status = userId ? event.answers[userId] : undefined
  return status === "confirmed" ? "confirmed" : status === "declined" ? "declined" : "open"
}

// Elöl a saját csapat, utána a többi névsorban; a színek a kezdőlap csapatlistájával egyeznek.
export function orderTeams(teams: Omit<TeamView, "color">[]): TeamView[] {
  const own = teams.filter((team) => team.own).sort((first, second) => first.name.localeCompare(second.name, "hu"))
  const others = teams.filter((team) => !team.own).sort((first, second) => first.name.localeCompare(second.name, "hu"))
  return [...own.map((team) => ({ ...team, color: OWN_COLOR })), ...others.map((team, index) => ({ ...team, color: boatColor(index) }))]
}

// Ki jön: a válaszolók, és aki a csapatból még nem válaszolt.
export function attendance(event: TeamEvent, members: TeamMember[]) {
  const confirmed = Object.keys(event.answers).filter((id) => event.answers[id] === "confirmed")
  const declined = Object.keys(event.answers).filter((id) => event.answers[id] === "declined")
  const answered = new Set([...confirmed, ...declined])
  const unanswered = members.filter((member) => !answered.has(member.id)).map((member) => member.id)
  return { confirmed, declined, unanswered }
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

export function monthStartKey(year: number, month: number) {
  return dateKey(new Date(year, month, 1, 12))
}

// A hónap rácsa hétfőtől vasárnapig, teljes hetekkel (a szomszéd hónapok napjaival kiegészítve).
export function monthGrid(year: number, month: number): { key: string; day: number; inMonth: boolean }[] {
  const first = new Date(year, month, 1, 12)
  const offset = (first.getDay() + 6) % 7
  const start = new Date(year, month, 1 - offset, 12)
  const last = new Date(year, month + 1, 0, 12)
  const days = offset + last.getDate()
  const total = Math.ceil(days / 7) * 7
  return Array.from({ length: total }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index, 12)
    return { key: dateKey(date), day: date.getDate(), inMonth: date.getMonth() === month }
  })
}

// Az esemény napjai (többnaposnál mindegyik, legfeljebb két hét).
export function eventDays(startDate: string, endDate: string | null): string[] {
  const start = new Date(`${startDate}T12:00:00`)
  const end = endDate && endDate > startDate ? new Date(`${endDate}T12:00:00`) : start
  const days: string[] = []
  for (let date = start; date <= end && days.length < 14; date = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 12)) {
    days.push(dateKey(date))
  }
  return days
}

// Napok, amikor két különböző csapatodnak is van eseménye, és egyiket sem mondtad le.
export function findClashes(teams: TeamView[], userId: string | null, fromKey: string) {
  const byDay = new Map<string, { team: TeamView; event: TeamEvent }[]>()
  for (const team of teams) {
    for (const event of team.events) {
      if (myAnswer(event, userId) === "declined") continue
      for (const day of eventDays(event.startDate, event.endDate)) {
        if (day < fromKey) continue
        byDay.set(day, [...(byDay.get(day) ?? []), { team, event }])
      }
    }
  }
  return Array.from(byDay.entries())
    .filter(([, items]) => new Set(items.map((item) => item.team.boatId)).size > 1)
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([day, items]) => ({ day, items }))
}

type TeamsState = { status: "loading" | "ready" | "error"; teams: TeamView[]; people: TeamPeople }

export function useTeams(userId: string | null) {
  const [state, setState] = useState<TeamsState>({ status: "loading", teams: [], people: {} })
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!userId) return
    let active = true
    const now = new Date()
    authorizedFetch(`/api/crew/teams?from=${monthStartKey(now.getFullYear(), now.getMonth())}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then((data: { teams?: Omit<TeamView, "color">[]; people?: TeamPeople }) => {
        if (active) setState({ status: "ready", teams: orderTeams(data.teams ?? []), people: data.people ?? {} })
      })
      .catch((error) => {
        console.error("Csapataim betöltési hiba:", error)
        if (active) setState({ status: "error", teams: [], people: {} })
      })
    return () => {
      active = false
    }
  }, [userId, reloadKey])

  // A saját válasz helyben frissül, újratöltés nélkül.
  const setAnswer = useCallback((eventId: string, status: "confirmed" | "declined") => {
    if (!userId) return
    setState((previous) => ({
      ...previous,
      teams: previous.teams.map((team) => ({
        ...team,
        events: team.events.map((event) => (event.id === eventId ? { ...event, answers: { ...event.answers, [userId]: status } } : event)),
      })),
    }))
  }, [userId])

  const reload = useCallback(() => setReloadKey((key) => key + 1), [])

  return { ...state, setAnswer, reload }
}

// Kilépés a csapatból (team-leave-migration.sql): a válaszok törlődnek, a kapitány értesítést kap.
export async function leaveTeam(boatId: string) {
  const { error } = await supabase.rpc("leave_boat_team", { target_boat_id: boatId })
  if (error) {
    console.error("Kilépési hiba:", error)
    throw new Error("A kilépés most nem sikerült. Próbáld újra.")
  }
}
