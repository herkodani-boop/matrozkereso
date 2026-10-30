import { NextRequest, NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  adminCategoryConfig,
  cleanAdminSearch,
  isAdminCategory,
  pickEditableFields,
  requireAdminAccess,
  type AdminCategory,
} from "@/lib/admin-platform"

export const dynamic = "force-dynamic"

const PAGE_SIZE_MAX = 50
const USER_BAN_DURATION = "876000h"

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export async function GET(request: NextRequest) {
  const result = await requireAdminAccess()
  if (!result.access) return errorResponse(result.error, result.status)

  const params = request.nextUrl.searchParams
  const categoryParam = params.get("category")
  if (categoryParam === "reports") {
    const reportReason = params.get("deletionReason") ?? "all"
    if (!["all", "expired", "admin", "owner", "not_deleted", "unknown"].includes(reportReason)) {
      return errorResponse("Érvénytelen hirdetéstörlési ok szűrő.", 400)
    }
    const requestedReportStatus = params.get("status") ?? "all"
    if (!["all", "active", "deleted"].includes(requestedReportStatus)) {
      return errorResponse("Érvénytelen szűrő.", 400)
    }
    const reportStatus: "all" | "active" | "deleted" = requestedReportStatus === "deleted"
      ? "deleted"
      : requestedReportStatus === "active"
        ? "active"
        : "all"
    const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1)
    const pageSize = Math.min(
      PAGE_SIZE_MAX,
      Math.max(1, Number.parseInt(params.get("pageSize") ?? "25", 10) || 25),
    )
    const search = cleanAdminSearch(params.get("search")).toLocaleLowerCase("hu")
    const reportSortColumns = [
      "listing_title",
      "reporter_name",
      "report_type",
      "evaluation_status",
      "extra_text",
      "created_at",
      "listing_deletion_reason",
      "is_deleted",
    ]
    const requestedSort = params.get("sort") ?? "created_at"
    const sortColumn = reportSortColumns.includes(requestedSort) ? requestedSort : "created_at"
    const ascending = params.get("direction") === "asc"
    try {
      const reportData = await loadAdminReports(
        result.access.adminClient,
        page,
        pageSize,
        search,
        reportStatus,
        reportReason,
        sortColumn,
        ascending,
      )
      return NextResponse.json(reportData)
    } catch (error) {
      console.error("Admin bejelentések betöltési hiba:", error)
      if (isMissingReportSchema(error)) {
        return errorResponse(
          "A bejelentések vagy a hirdetés törlési okainak adatbázis-migrációja hiányzik. Futtasd le az ad-report-review-migration.sql és az admin-listing-report-reasons-migration.sql fájlokat a Supabase SQL Editorban.",
          500,
        )
      }
      return errorResponse("A bejelentések nem tölthetők be.", 500)
    }
  }
  if (!isAdminCategory(categoryParam)) return errorResponse("Érvénytelen kategória.", 400)

  const category = categoryParam
  const config = adminCategoryConfig[category]
  const status = params.get("status") ?? (category === "users" ? "all" : "active")
  const validStatuses = category === "users"
    ? ["all", "active", "reported", "deleted"]
    : ["all", "active", "deleted", "reported"]
  if (!validStatuses.includes(status)) {
    return errorResponse("Érvénytelen szűrő.", 400)
  }

  async function loadAdminReports(
    client: SupabaseClient,
    page: number,
    pageSize: number,
    search: string,
    status: "all" | "active" | "deleted",
    deletionReason: string,
    sortColumn: string,
    ascending: boolean,
  ) {
    const reports: Array<Record<string, unknown>> = []
    const reportPageSize = 1000
    for (let from = 0; ; from += reportPageSize) {
      const { data, error } = await client
        .from("ad_reports")
        .select("id, ad_id, user_id, report_type, evaluation_status, is_deleted, extra_text, created_at")
        .order("created_at", { ascending: false })
        .range(from, from + reportPageSize - 1)
      if (error) throw error
      reports.push(...(data ?? []))
      if ((data?.length ?? 0) < reportPageSize) break
    }

    const adIds = [...new Set(reports.map((report) => String(report.ad_id)))]
    const userIds = [...new Set(reports.map((report) => String(report.user_id)))]
    const listingsById = new Map<string, {
      title: string
      is_deleted: boolean
      is_active: boolean
      start_date: string | null
      end_date: string | null
      deleted_at: string | null
      deletion_reason: string | null
    }>()
    const usersById = new Map<string, string>()
    for (let from = 0; from < adIds.length; from += 500) {
      const { data, error } = await client
        .from("ads")
        .select("id, title, is_deleted, is_active, start_date, end_date, deleted_at, deletion_reason")
        .in("id", adIds.slice(from, from + 500))
      if (error) throw error
      for (const listing of data ?? []) {
        listingsById.set(String(listing.id), {
          title: String(listing.title ?? ""),
          is_deleted: listing.is_deleted === true,
          is_active: listing.is_active === true,
          start_date: typeof listing.start_date === "string" ? listing.start_date : null,
          end_date: typeof listing.end_date === "string" ? listing.end_date : null,
          deleted_at: typeof listing.deleted_at === "string" ? listing.deleted_at : null,
          deletion_reason: typeof listing.deletion_reason === "string" ? listing.deletion_reason : null,
        })
      }
    }
    for (let from = 0; from < userIds.length; from += 500) {
      const { data, error } = await client
        .from("users")
        .select("id, full_name")
        .in("id", userIds.slice(from, from + 500))
      if (error) throw error
      for (const user of data ?? []) usersById.set(String(user.id), String(user.full_name ?? ""))
    }

    const rows: Array<Record<string, unknown>> = reports.map((report): Record<string, unknown> => {
      const adId = String(report.ad_id)
      const userId = String(report.user_id)
      const listing = listingsById.get(adId)
      const expiryDate = listing?.end_date || listing?.start_date
      const reportDate = new Date().toISOString().slice(0, 10)
      const expiredByReportTime = Boolean(
        listing
        && expiryDate
        && expiryDate < reportDate,
      )
      const expiredByDeletionTime = Boolean(
        listing?.is_deleted
        && listing.deleted_at
        && expiryDate
        && expiryDate < listing.deleted_at.slice(0, 10),
      )
      const listingDeletionReason = listing
        ? listing.deletion_reason
          ?? (listing.is_deleted
            ? expiredByDeletionTime ? "expired" : "unknown"
            : expiredByReportTime ? "expired" : "not_deleted")
        : "unknown"
      return {
        ...report,
        listing_title: listing?.title ?? "Ismeretlen hirdetés",
        listing_deletion_reason: listingDeletionReason,
        reporter_name: usersById.get(userId) ?? "Ismeretlen felhasználó",
      }
    }).filter((report) => (
      status === "all"
      || status === "deleted" && report.is_deleted === true
      || status === "active" && report.is_deleted === false
    ) && (
      deletionReason === "all" || report.listing_deletion_reason === deletionReason
    ) && (!search || [
      report.listing_title,
      report.reporter_name,
      report.report_type,
      report.evaluation_status,
      report.extra_text,
      report.listing_deletion_reason,
    ].some((value) => String(value ?? "").toLocaleLowerCase("hu").includes(search))))

    rows.sort((first, second) => {
      const firstValue = first[sortColumn]
      const secondValue = second[sortColumn]
      const comparison = typeof firstValue === "boolean" && typeof secondValue === "boolean"
        ? Number(firstValue) - Number(secondValue)
        : String(firstValue ?? "").localeCompare(
            String(secondValue ?? ""),
            "hu",
            { sensitivity: "base", numeric: true },
          )
      if (comparison !== 0) return ascending ? comparison : -comparison
      return String(first.id).localeCompare(String(second.id))
    })

    const start = (page - 1) * pageSize
    return {
      rows: rows.slice(start, start + pageSize),
      page,
      pageSize,
      matchCount: rows.length,
      counts: {
        total: reports.length,
        active: reports.filter((report) => report.is_deleted === false).length,
        reported: reports.filter((report) => report.is_deleted === false).length,
        deleted: reports.filter((report) => report.is_deleted === true).length,
      },
    }
  }

  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1)
  const pageSize = Math.min(
    PAGE_SIZE_MAX,
    Math.max(1, Number.parseInt(params.get("pageSize") ?? "25", 10) || 25),
  )
  const search = cleanAdminSearch(params.get("search"))
  const requestedSort = params.get("sort") ?? "created_at"
  const sortColumn = config.sortableColumns.includes(requestedSort) ? requestedSort : "created_at"
  const ascending = params.get("direction") === "asc"
  const client = result.access.adminClient

  if (category === "users") {
    try {
      return NextResponse.json(await loadAdminUsers(client, {
        page,
        pageSize,
        search,
        sortColumn,
        ascending,
        status,
      }))
    } catch (error) {
      console.error("Admin felhasználói összesítések betöltési hiba:", error)
      if (isMissingListingReasonSchema(error)) {
        return errorResponse(
          "A hirdetés törlési okainak és felhasználói összesítőinek adatbázis-migrációja hiányzik. Futtasd le az admin-listing-report-reasons-migration.sql fájlt a Supabase SQL Editorban.",
          500,
        )
      }
      return errorResponse("A felhasználói lista nem tölthető be.", 500)
    }
  }

  const countRows = async (isDeleted: boolean) => {
    const { count, error } = await client
      .from(config.table)
      .select("id", { count: "exact", head: true })
      .eq("is_deleted", isDeleted)
    if (error) throw error
    return count ?? 0
  }

  try {
    let totalCount: number
    let activeCount: number
    let deletedCount: number
    let reportedCount = 0
    let reportedAdIds: string[] = []
    const reportsByAdId = new Map<string, { count: number; types: Set<string> }>()

    if (category === "listings") {
      const [
        { count: allAdsCount, error: allAdsError },
        { count: activeAdsCount, error: activeAdsError },
        deletedAdsCount,
      ] = await Promise.all([
        client.from("ads").select("id", { count: "exact", head: true }),
        client.from("ads").select("id", { count: "exact", head: true }).eq("is_deleted", false).eq("is_active", true),
        countRows(true),
      ])
      if (allAdsError || activeAdsError) {
        throw allAdsError ?? activeAdsError
      }

      const reportPageSize = 1000
      for (let from = 0; ; from += reportPageSize) {
        const { data: reportRows, error: reportIdsError } = await client
          .from("ad_reports")
          .select("ad_id, report_type")
          .eq("is_deleted", false)
          .order("id", { ascending: true })
          .range(from, from + reportPageSize - 1)
        if (reportIdsError) throw reportIdsError
        for (const report of reportRows ?? []) {
          const adId = String(report.ad_id)
          const summary = reportsByAdId.get(adId) ?? { count: 0, types: new Set<string>() }
          summary.count += 1
          summary.types.add(String(report.report_type))
          reportsByAdId.set(adId, summary)
        }
        if ((reportRows?.length ?? 0) < reportPageSize) break
      }

      totalCount = allAdsCount ?? 0
      activeCount = activeAdsCount ?? 0
      deletedCount = deletedAdsCount
      reportedAdIds = [...reportsByAdId.keys()]
      reportedCount = reportedAdIds.length
    } else {
      const [active, deleted] = await Promise.all([countRows(false), countRows(true)])
      activeCount = active
      deletedCount = deleted
      totalCount = active + deleted
    }

    if (status === "reported" && category !== "listings") {
      return NextResponse.json({
        rows: [],
        page,
        pageSize,
        matchCount: 0,
        counts: { total: totalCount, active: activeCount, reported: reportedCount, deleted: deletedCount },
      })
    }

    let sortedListingIds: string[] | null = null
    let matchCount: number | null = null
    const creatorNameByUserId = new Map<string, string>()
    if (category === "listings" && (sortColumn === "report_count" || sortColumn === "creator_name")) {
      const candidates: Array<{ id: string; userId: string }> = []
      const idPageSize = 1000
      for (let from = 0; ; from += idPageSize) {
        let idQuery = client.from("ads").select("id, user_id")
        if (status === "active") idQuery = idQuery.eq("is_deleted", false).eq("is_active", true)
        else if (status === "deleted") idQuery = idQuery.eq("is_deleted", true)
        if (search) {
          const pattern = `*${search}*`
          idQuery = idQuery.or(config.searchColumns.map((column) => `${column}.ilike.${pattern}`).join(","))
        }
        const { data: idRows, error: idError } = await idQuery
          .order("id", { ascending: true })
          .range(from, from + idPageSize - 1)
        if (idError) throw idError
        for (const row of idRows ?? []) {
          const id = String(row.id)
          if (status !== "reported" || reportsByAdId.has(id)) {
            candidates.push({ id, userId: String(row.user_id ?? "") })
          }
        }
        if ((idRows?.length ?? 0) < idPageSize) break
      }

      if (sortColumn === "creator_name") {
        const userIds = [...new Set(candidates.map((candidate) => candidate.userId).filter(Boolean))]
        for (let from = 0; from < userIds.length; from += 500) {
          const { data: profiles, error: profilesError } = await client
            .from("users")
            .select("id, full_name")
            .in("id", userIds.slice(from, from + 500))
          if (profilesError) throw profilesError
          for (const profile of profiles ?? []) {
            creatorNameByUserId.set(String(profile.id), String(profile.full_name ?? ""))
          }
        }
      }

      candidates.sort((first, second) => {
        const comparison = sortColumn === "report_count"
          ? (reportsByAdId.get(first.id)?.count ?? 0) - (reportsByAdId.get(second.id)?.count ?? 0)
          : (creatorNameByUserId.get(first.userId) ?? "").localeCompare(
              creatorNameByUserId.get(second.userId) ?? "",
              "hu",
              { sensitivity: "base" },
            )
        if (comparison !== 0) return ascending ? comparison : -comparison
        return first.id.localeCompare(second.id)
      })
      sortedListingIds = candidates.slice((page - 1) * pageSize, page * pageSize).map((candidate) => candidate.id)
      matchCount = candidates.length
      if (sortedListingIds.length === 0) {
        return NextResponse.json({
          rows: [],
          page,
          pageSize,
          matchCount,
          counts: { total: totalCount, active: activeCount, reported: reportedCount, deleted: deletedCount },
        })
      }
    }

    let query = client
      .from(config.table)
      .select("*", { count: "exact" })
      .order(
        sortColumn === "report_count" || sortColumn === "creator_name" ? "created_at" : sortColumn,
        { ascending, nullsFirst: false },
      )

    if (sortedListingIds) {
      query = query.in("id", sortedListingIds)
    } else {
      query = query.range((page - 1) * pageSize, page * pageSize - 1)
    }

    if (status === "active") {
      query = query.eq("is_deleted", false)
      if (category === "listings") query = query.eq("is_active", true)
    } else if (status === "deleted") {
      query = query.eq("is_deleted", true)
    } else if (status === "reported" && category === "listings" && !sortedListingIds) {
      if (reportedAdIds.length === 0) {
        return NextResponse.json({
          rows: [],
          page,
          pageSize,
          matchCount: 0,
          counts: { total: totalCount, active: activeCount, reported: reportedCount, deleted: deletedCount },
        })
      }
      query = query.in("id", reportedAdIds)
    }

    if (search) {
      const pattern = `*${search}*`
      const searchFilter = config.searchColumns.map((column) => `${column}.ilike.${pattern}`).join(",")
      query = query.or(searchFilter)
    }

    const { data, count, error } = await query
    if (error) throw error

    const reportDetailsByAdId = new Map<string, Array<Record<string, unknown>>>()
    if (category === "listings" && data?.length) {
      const { data: pageReports, error: pageReportsError } = await client
        .from("ad_reports")
        .select("id, ad_id, user_id, report_type, evaluation_status, extra_text, created_at")
        .in("ad_id", data.map((row) => String(row.id)))
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
      if (pageReportsError) throw pageReportsError

      const reporterIds = new Set<string>()
      for (const report of pageReports ?? []) {
        const adId = String(report.ad_id)
        const details = reportDetailsByAdId.get(adId) ?? []
        details.push({ ...report })
        reportDetailsByAdId.set(adId, details)
        reporterIds.add(String(report.user_id))
      }

      const userIds = [...new Set([
        ...data.map((row) => String(row.user_id)),
        ...reporterIds,
      ].filter(Boolean))]
      if (userIds.length > 0) {
        for (let from = 0; from < userIds.length; from += 500) {
          const { data: profiles, error: profilesError } = await client
            .from("users")
            .select("id, full_name")
            .in("id", userIds.slice(from, from + 500))
          if (profilesError) throw profilesError
          for (const profile of profiles ?? []) {
            creatorNameByUserId.set(String(profile.id), String(profile.full_name ?? ""))
          }
        }
      }

      for (const details of reportDetailsByAdId.values()) {
        for (const detail of details) {
          detail.reporter_name = creatorNameByUserId.get(String(detail.user_id)) || "Ismeretlen felhasználó"
        }
      }
    }

    const rows = (data ?? []).map((row) => {
      const item: Record<string, unknown> = { ...(row as Record<string, unknown>) }
      if (category === "listings" && status === "reported") {
        const summary = reportsByAdId.get(String(item.id)) ?? { count: 0, types: new Set<string>() }
        item.report_count = summary.count
        item.report_types = [...summary.types].join(", ")
      }
      if (category === "listings") {
        const summary = reportsByAdId.get(String(item.id)) ?? { count: 0, types: new Set<string>() }
        item.report_count = summary.count
        item.creator_name = creatorNameByUserId.get(String(item.user_id)) || "Ismeretlen felhasználó"
        item.report_details = reportDetailsByAdId.get(String(item.id)) ?? []
      }
      return item
    })

    if (category === "listings" && sortedListingIds) {
      const rowById = new Map(rows.map((row) => [row.id, row]))
      rows.splice(0, rows.length, ...sortedListingIds.flatMap((id) => {
        const row = rowById.get(id)
        if (!row) return []
        const summary = reportsByAdId.get(id) ?? { count: 0, types: new Set<string>() }
        row.report_count = summary.count
        row.report_types = [...summary.types].join(", ")
        return [row]
      }))
    }

    return NextResponse.json({
      rows,
      page,
      pageSize,
      matchCount: matchCount ?? count ?? 0,
      counts: {
        total: totalCount,
        active: activeCount,
        reported: reportedCount,
        deleted: deletedCount,
      },
    })
  } catch (error) {
    console.error("Admin lista betöltési hiba:", error)
    return errorResponse("Nem sikerült betölteni a kategória adatait.", 500)
  }
}

function isMissingReportSchema(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const details = error as { code?: unknown; message?: unknown }
  return details.code === "42703"
    || details.code === "PGRST204"
    || typeof details.message === "string"
      && /(is_deleted|evaluation_status|deletion_reason).*(column|schema cache)|(column|schema cache).*(is_deleted|evaluation_status|deletion_reason)/i.test(details.message)
}

function isMissingListingReasonSchema(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const details = error as { code?: unknown; message?: unknown }
  return details.code === "PGRST202"
    || details.code === "42703"
    || typeof details.message === "string"
      && /(admin_user_listing_report_metrics|deletion_reason).*(function|column|schema cache)|(function|column|schema cache).*(admin_user_listing_report_metrics|deletion_reason)/i.test(details.message)
}

async function loadAdminUsers(
  client: SupabaseClient,
  options: {
    page: number
    pageSize: number
    search: string
    sortColumn: string
    ascending: boolean
    status: string
  },
) {
  const { data: metricRows, error: metricsError } = await client.rpc("admin_user_listing_report_metrics")
  if (metricsError) throw metricsError

  const metricsByUserId = new Map<string, {
    adminDeletedListings: number
    validReportsReceived: number
    pendingReportsReceived: number
    invalidReportsSent: number
  }>()
  for (const row of metricRows ?? []) {
    metricsByUserId.set(String(row.user_id), {
      adminDeletedListings: Number(row.admin_deleted_listings ?? 0),
      validReportsReceived: Number(row.valid_reports_received ?? 0),
      pendingReportsReceived: Number(row.pending_reports_received ?? 0),
      invalidReportsSent: Number(row.invalid_reports_sent ?? 0),
    })
  }

  const users: Array<Record<string, unknown>> = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client
      .from("users")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, from + 999)
    if (error) throw error
    users.push(...(data ?? []) as Array<Record<string, unknown>>)
    if ((data?.length ?? 0) < 1000) break
  }

  const emailByUserId = new Map<string, string>()
  const bannedUntilByUserId = new Map<string, string | null>()
  for (let page = 1; ; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    for (const user of data.users) {
      emailByUserId.set(user.id, user.email ?? "")
      bannedUntilByUserId.set(user.id, user.banned_until ?? null)
    }
    if (data.users.length < 1000) break
  }

  type AdminUserRow = Record<string, unknown> & {
    id: string
    email: string
    banned_until: string | null
    admin_deleted_listings: number
    valid_reports_received: number
    pending_reports_received: number
    invalid_reports_sent: number
  }
  const rows: AdminUserRow[] = users.map((user) => {
    const id = String(user.id)
    const metrics = metricsByUserId.get(id) ?? {
      adminDeletedListings: 0,
      validReportsReceived: 0,
      pendingReportsReceived: 0,
      invalidReportsSent: 0,
    }
    return {
      ...user,
      id,
      email: emailByUserId.get(id) ?? String(user.email ?? ""),
      banned_until: bannedUntilByUserId.get(id) ?? null,
      admin_deleted_listings: metrics.adminDeletedListings,
      valid_reports_received: metrics.validReportsReceived,
      pending_reports_received: metrics.pendingReportsReceived,
      invalid_reports_sent: metrics.invalidReportsSent,
    }
  })

  const search = options.search.toLocaleLowerCase("hu")
  const filteredRows = rows.filter((row) => (
    (options.status === "all"
      || options.status === "active" && row.is_deleted !== true
      || options.status === "deleted" && row.is_deleted === true
      || options.status === "reported" && (
        row.admin_deleted_listings > 0
        || row.valid_reports_received > 0
        || row.pending_reports_received > 0
        || row.invalid_reports_sent > 0
      ))
    && (!search || [row.full_name, row.email, row.phone]
      .some((value) => String(value ?? "").toLocaleLowerCase("hu").includes(search)))
  ))
  filteredRows.sort((first, second) => {
    const metricSortColumns = [
      "admin_deleted_listings",
      "received_reports",
      "invalid_reports_sent",
    ]
    const firstValue = options.sortColumn === "received_reports"
      ? first.valid_reports_received + first.pending_reports_received
      : first[options.sortColumn]
    const secondValue = options.sortColumn === "received_reports"
      ? second.valid_reports_received + second.pending_reports_received
      : second[options.sortColumn]
    const comparison = metricSortColumns.includes(options.sortColumn)
      ? Number(firstValue ?? 0) - Number(secondValue ?? 0)
      : String(firstValue ?? "").localeCompare(
          String(secondValue ?? ""),
          "hu",
          { sensitivity: "base" },
        )
    if (comparison !== 0) return options.ascending ? comparison : -comparison
    return String(first.id).localeCompare(String(second.id))
  })

  return {
    rows: filteredRows.slice((options.page - 1) * options.pageSize, options.page * options.pageSize),
    page: options.page,
    pageSize: options.pageSize,
    matchCount: filteredRows.length,
    counts: {
      total: rows.length,
      active: rows.filter((row) => row.is_deleted !== true).length,
      reported: rows.filter((row) => (
        row.admin_deleted_listings > 0
        || row.valid_reports_received > 0
        || row.pending_reports_received > 0
        || row.invalid_reports_sent > 0
      )).length,
      deleted: rows.filter((row) => row.is_deleted === true).length,
    },
  }
}

type AdminMutation = {
  category?: unknown
  id?: unknown
  fields?: unknown
  action?: unknown
  evaluationStatus?: unknown
}

export async function PATCH(request: NextRequest) {
  return handleMutation(request, "update")
}

export async function POST(request: NextRequest) {
  return handleMutation(request, "action")
}

async function handleMutation(request: NextRequest, operation: "update" | "action") {
  const result = await requireAdminAccess()
  if (!result.access) return errorResponse(result.error, result.status)

  let body: AdminMutation
  try {
    body = (await request.json()) as AdminMutation
  } catch {
    return errorResponse("Érvénytelen kérés.", 400)
  }

  if (typeof body.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.id)) {
    return errorResponse("Érvénytelen azonosító.", 400)
  }
  const categoryParam = typeof body.category === "string" ? body.category : null
  const isReportEvaluation = categoryParam === "reports" && operation === "action"
  if (categoryParam === null || (!isAdminCategory(categoryParam) && !isReportEvaluation)) {
    return errorResponse("Érvénytelen kategória.", 400)
  }
  if (isReportEvaluation) {
    const evaluationStatus = body.evaluationStatus === "valid" || body.evaluationStatus === "invalid"
      ? body.evaluationStatus
      : null
    if (body.action !== "evaluate" || !evaluationStatus) {
      return errorResponse("Érvénytelen bejelentésértékelés.", 400)
    }

    const { data, error } = await result.access.adminClient.rpc("admin_review_ad_report", {
      p_report_id: body.id,
      p_decision: evaluationStatus,
    })
    if (error) {
      console.error("Admin bejelentésértékelési hiba:", error)
      return errorResponse("Nem sikerült értékelni a bejelentést.", 500)
    }
    if (data !== true) return errorResponse("A bejelentés nem található.", 404)
    return NextResponse.json({ ok: true })
  }

  if (!isAdminCategory(categoryParam)) return errorResponse("Érvénytelen kategória.", 400)
  const category: AdminCategory = categoryParam
  const client = result.access.adminClient

  if (operation === "action") {
    if (category === "users") {
      return handleUserAction(body.id, body.action, result.access.userId, client)
    }
    if (body.action !== "delete") return errorResponse("Érvénytelen művelet.", 400)

    if (category === "boats") {
      const { data, error } = await client.rpc("admin_soft_delete_boat", { p_boat_id: body.id })
      if (error) {
        console.error("Admin hajó soft delete hiba:", error)
        return errorResponse("Nem sikerült törölni a hajót és kapcsolódó adatait.", 500)
      }
      if (!data) return errorResponse("A hajó nem található, vagy már törölve lett.", 404)
      return NextResponse.json({ ok: true })
    }

    const deleteFields: Record<string, unknown> = {
      is_deleted: true,
      deleted_at: new Date().toISOString(),
    }
    if (category === "listings") deleteFields.deletion_reason = "admin"

    const { data, error } = await client
      .from(adminCategoryConfig[category].table)
      .update(deleteFields)
      .eq("id", body.id)
      .eq("is_deleted", false)
      .select("id")
      .maybeSingle()
    if (error) {
      console.error("Admin soft delete hiba:", error)
      return errorResponse("Nem sikerült törölni az elemet.", 500)
    }
    if (!data) return errorResponse("Az elem nem található, vagy már törölve lett.", 404)
    return NextResponse.json({ ok: true })
  }

  const fields = pickEditableFields(category, body.fields)
  if (!fields) return errorResponse("Nincs módosítható adat, vagy érvénytelen mező szerepel a kérésben.", 400)

  const { data, error } = await client
    .from(adminCategoryConfig[category].table)
    .update(fields)
    .eq("id", body.id)
    .eq("is_deleted", false)
    .select("*")
    .maybeSingle()

  if (error) {
    console.error("Admin szerkesztési hiba:", error)
    return errorResponse("Nem sikerült menteni a módosításokat.", 500)
  }
  if (!data) return errorResponse("Az elem nem található, vagy már törölve lett.", 404)

  return NextResponse.json({ row: data })
}

async function handleUserAction(
  userId: string,
  action: unknown,
  currentAdminId: string,
  client: import("@supabase/supabase-js").SupabaseClient,
) {
  if (userId === currentAdminId) return errorResponse("A saját admin fiókodat nem módosíthatod innen.", 400)
  if (action !== "delete" && action !== "restore") return errorResponse("Érvénytelen művelet.", 400)

  const { data: profile, error: profileError } = await client
    .from("users")
    .select("is_deleted")
    .eq("id", userId)
    .maybeSingle()
  if (profileError) {
    console.error("Admin felhasználó lekérdezési hiba:", profileError)
    return errorResponse("Nem sikerült betölteni a felhasználót.", 500)
  }
  if (!profile) return errorResponse("A felhasználó nem található.", 404)
  if (action === "restore") {
    if (!profile.is_deleted) return errorResponse("A felhasználó nincs törölve.", 400)

    const { data: authResult, error: authError } = await client.auth.admin.updateUserById(userId, {
      ban_duration: "none",
    })
    if (authError || !authResult.user) {
      console.error("Admin Supabase Auth felhasználó-visszaállítási hiba:", authError)
      return errorResponse("Nem sikerült visszaállítani a felhasználó belépési jogosultságát.", 500)
    }

    const { data, error } = await client.rpc("admin_restore_user", { p_user_id: userId })
    if (error || !data) {
      const { error: rollbackError } = await client.auth.admin.updateUserById(userId, {
        ban_duration: USER_BAN_DURATION,
      })
      if (rollbackError) console.error("Admin felhasználótiltás visszaállítása sikertelen:", rollbackError)
      if (error) console.error("Admin felhasználó visszaállítási RPC hiba:", error)
      return errorResponse(
        error ? "Nem sikerült visszaállítani a felhasználót és a törléskor vele együtt törölt adatait." : "A felhasználó már nincs törölve.",
        error ? 500 : 404,
      )
    }
    return NextResponse.json({ ok: true })
  }

  if (action === "delete") {
    if (profile.is_deleted) return errorResponse("A felhasználó már törölve lett.", 400)

    const { data: authResult, error: authError } = await client.auth.admin.updateUserById(userId, {
      ban_duration: USER_BAN_DURATION,
    })
    if (authError || !authResult.user) {
      console.error("Admin Supabase Auth felhasználómódosítási hiba:", authError)
      return errorResponse("Nem sikerült letiltani a felhasználó belépését.", 500)
    }

    const { data, error: deleteError } = await client.rpc("admin_soft_delete_user", { p_user_id: userId })
    if (deleteError || !data) {
      const { error: rollbackError } = await client.auth.admin.updateUserById(userId, { ban_duration: "none" })
      if (rollbackError) console.error("Admin felhasználótiltás visszaállítása sikertelen:", rollbackError)
      if (deleteError) console.error("Admin felhasználó soft delete hiba:", deleteError)
      return errorResponse("Nem sikerült törölni a felhasználót és kapcsolódó adatait.", deleteError ? 500 : 404)
    }
    return NextResponse.json({ ok: true })
  }

  return errorResponse("Érvénytelen művelet.", 400)
}
