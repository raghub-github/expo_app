import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseServiceRole } from '@/lib/supabaseServiceRole'

/** Values of unified_ticket_title — insert only when ticket_groups.ticket_title matches. */
const UNIFIED_TICKET_TITLE_ENUM = new Set([
  'ORDER_DELAYED',
  'ORDER_NOT_RECEIVED',
  'WRONG_ITEM_DELIVERED',
  'ITEM_MISSING',
  'ORDER_CANCELLED_WRONG',
  'PAYMENT_ISSUE',
  'REFUND_NOT_PROCESSED',
  'ORDER_DAMAGED',
  'ORDER_QUALITY_ISSUE',
  'RIDER_NOT_ARRIVED',
  'RIDER_BEHAVIOUR_ISSUE',
  'MERCHANT_NOT_PREPARING',
  'DELIVERY_ADDRESS_WRONG',
  'ORDER_NOT_ASSIGNED',
  'ORDER_REASSIGNMENT_NEEDED',
  'ACCOUNT_ISSUE',
  'PAYMENT_METHOD_ISSUE',
  'WALLET_ISSUE',
  'COUPON_NOT_APPLYING',
  'APP_TECHNICAL_ISSUE',
  'PROFILE_UPDATE_ISSUE',
  'ADDRESS_MANAGEMENT_ISSUE',
  'NOTIFICATION_NOT_RECEIVING',
  'EARNINGS_NOT_CREDITED',
  'WALLET_WITHDRAWAL_ISSUE',
  'APP_CRASH_OR_BUG',
  'LOCATION_TRACKING_ISSUE',
  'RIDER_ORDER_NOT_RECEIVING',
  'ONBOARDING_ISSUE',
  'DOCUMENT_VERIFICATION_ISSUE',
  'DUTY_LOG_ISSUE',
  'RATING_DISPUTE',
  'PAYOUT_DELAYED',
  'PAYOUT_NOT_RECEIVED',
  'SETTLEMENT_DISPUTE',
  'COMMISSION_DISPUTE',
  'MENU_UPDATE_ISSUE',
  'STORE_STATUS_ISSUE',
  'MERCHANT_ORDER_NOT_RECEIVING',
  'MERCHANT_APP_TECHNICAL_ISSUE',
  'VERIFICATION_ISSUE',
  'OTHER',
  'FEEDBACK',
  'COMPLAINT',
  'SUGGESTION',
  'CORPORATE_WEB',
])

function coerceUnifiedTicketTitle(raw: string | null | undefined): string {
  if (!raw) return 'OTHER'
  const t = raw.trim().toUpperCase().replace(/\s+/g, '_')
  return UNIFIED_TICKET_TITLE_ENUM.has(t) ? t : 'OTHER'
}

const CORPORATE_GROUP_ID = Number.parseInt(process.env.CORPORATE_TICKET_GROUP_ID ?? '58', 10)

/** Match `ticket_titles` row for corporates web (see drizzle/0097_ticket_titles.sql). */
const CORPORATE_CATALOG_SERVICE = process.env.CORPORATE_TICKET_TITLE_SERVICE_TYPE ?? 'GENERAL'
const CORPORATE_CATALOG_SECTION = process.env.CORPORATE_TICKET_TITLE_SECTION ?? 'CORPORATE'
const CORPORATE_CATALOG_SOURCE = process.env.CORPORATE_TICKET_TITLE_SOURCE_ROLE ?? 'WEB_FORM'

/** Mirrors corporates form selects — used for readable description lines. */
const TEAM_SIZE_LABELS: Record<string, string> = {
  '': 'Select team size',
  '1-50': '1 – 50',
  '51-200': '51 – 200',
  '201-1000': '201 – 1,000',
  '1000+': '1,000+',
}

const PROGRAMME_LABELS: Record<string, string> = {
  '': 'What are you interested in?',
  meals: 'Employee meals / cafeteria',
  events: 'Events & bulk orders',
  billing: 'Central billing & GST',
  'multi-city': 'Multi-city / pilot',
  other: 'Other / not sure yet',
}

type Body = {
  name?: string
  email?: string
  company?: string
  phone?: string
  city?: string
  teamSize?: string
  programme?: string
  message?: string
}

type TicketGroupRow = Record<string, unknown>

function labelTeamSize(value: string | undefined): string {
  const v = value?.trim() ?? ''
  return TEAM_SIZE_LABELS[v] ?? (v || '—')
}

function labelProgramme(value: string | undefined): string {
  const v = value?.trim() ?? ''
  return PROGRAMME_LABELS[v] ?? (v || '—')
}

function buildDescription(
  b: Required<Pick<Body, 'name' | 'email' | 'company' | 'message'>> & Body,
  ctx: {
    groupId: number
    groupName: string | null
    groupTicketTitle: string | null
    catalogTitleCode: string | null
    catalogTitleText: string | null
  }
): string {
  const lines: string[] = []
  lines.push(
    ctx.groupName
      ? `Ticket group (id ${ctx.groupId}): ${ctx.groupName}`
      : `Ticket group id: ${ctx.groupId}`
  )
  if (ctx.groupTicketTitle) {
    lines.push(`Group ticket_title (from ticket_groups): ${ctx.groupTicketTitle}`)
  }
  if (ctx.catalogTitleCode) {
    lines.push(`Catalog title_code (ticket_titles): ${ctx.catalogTitleCode}`)
    if (ctx.catalogTitleText) {
      lines.push(`Catalog title_text: ${ctx.catalogTitleText}`)
    }
  }
  lines.push(
    '',
    'Name:',
    b.name,
    '',
    'Work email:',
    b.email,
    '',
    'Company:',
    b.company,
    '',
    'Phone:',
    b.phone?.trim() || '—',
    '',
    'City / offices',
    'e.g. Bengaluru, Mumbai',
    b.city?.trim() || '—',
    '',
    'Team size',
    'Select team size',
    labelTeamSize(b.teamSize),
    '',
    'Programme',
    'What are you interested in?',
    labelProgramme(b.programme),
    '',
    'How can we help?',
    b.message.trim()
  )
  return lines.join('\n')
}

async function loadTicketGroup(admin: SupabaseClient, groupId: number) {
  if (!admin || !Number.isFinite(groupId) || groupId <= 0) {
    return { groupName: null as string | null, groupTicketTitle: null as string | null }
  }
  const { data, error } = await admin.from('ticket_groups').select('*').eq('id', groupId).maybeSingle()
  if (error || !data || typeof data !== 'object') {
    return { groupName: null, groupTicketTitle: null }
  }
  const row = data as TicketGroupRow
  const name =
    row.name != null && String(row.name).trim()
      ? String(row.name).trim()
      : row.group_name != null && String(row.group_name).trim()
        ? String(row.group_name).trim()
        : null
  const ticketTitleRaw = row.ticket_title ?? row.title
  const groupTicketTitle =
    ticketTitleRaw != null && String(ticketTitleRaw).trim() ? String(ticketTitleRaw).trim() : null
  return { groupName: name, groupTicketTitle }
}

type CatalogTitle = { titleCode: string; titleText: string }

async function loadTicketTitleFromCatalog(
  admin: SupabaseClient,
  groupId: number
): Promise<CatalogTitle | null> {
  if (!Number.isFinite(groupId) || groupId <= 0) return null

  const specific = await admin
    .from('ticket_titles')
    .select('title_code, title_text')
    .eq('group_id', groupId)
    .eq('is_active', true)
    .eq('service_type', CORPORATE_CATALOG_SERVICE)
    .eq('ticket_section', CORPORATE_CATALOG_SECTION)
    .eq('source_role', CORPORATE_CATALOG_SOURCE)
    .order('display_order', { ascending: true, nullsFirst: false })
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle()

  const pick = (row: { title_code?: string | null; title_text?: string | null } | null) => {
    const code = row?.title_code != null && String(row.title_code).trim() ? String(row.title_code).trim() : ''
    if (!code) return null
    const text = row?.title_text != null ? String(row.title_text).trim() : ''
    return { titleCode: code, titleText: text }
  }

  if (!specific.error && specific.data) {
    const p = pick(specific.data)
    if (p) return p
  }

  const fallback = await admin
    .from('ticket_titles')
    .select('title_code, title_text')
    .eq('group_id', groupId)
    .eq('is_active', true)
    .order('display_order', { ascending: true, nullsFirst: false })
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (fallback.error || !fallback.data) return null
  return pick(fallback.data)
}

export async function POST(request: Request) {
  const admin = getSupabaseServiceRole()
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: 'Server is not configured for ticket creation (Supabase service role).' },
      { status: 503 }
    )
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 })
  }

  const name = body.name?.trim() ?? ''
  const email = body.email?.trim() ?? ''
  const company = body.company?.trim() ?? ''
  const message = body.message?.trim() ?? ''
  if (!name || !email || !company) {
    return NextResponse.json(
      { ok: false, error: 'Name, work email, and company are required.' },
      { status: 400 }
    )
  }
  if (!message) {
    return NextResponse.json(
      { ok: false, error: 'Please fill in “How can we help?” — it is required.' },
      { status: 400 }
    )
  }

  const { groupName, groupTicketTitle } = await loadTicketGroup(admin, CORPORATE_GROUP_ID)
  const catalogTitle = await loadTicketTitleFromCatalog(admin, CORPORATE_GROUP_ID)
  const resolvedTicketTitle = coerceUnifiedTicketTitle(
    catalogTitle?.titleCode ?? groupTicketTitle
  )

  const subject = `Corporate enquiry — ${company}`.slice(0, 500)
  const description = buildDescription(
    { ...body, name, email, company, message },
    {
      groupId: CORPORATE_GROUP_ID,
      groupName,
      groupTicketTitle,
      catalogTitleCode: catalogTitle?.titleCode ?? null,
      catalogTitleText: catalogTitle?.titleText ?? null,
    }
  ).slice(0, 12000)

  const row: Record<string, unknown> = {
    ticket_type: 'NON_ORDER_RELATED',
    ticket_source: 'OTHER_CORPORATE',
    service_type: 'GENERAL',
    ticket_title: resolvedTicketTitle,
    ticket_category: 'OTHER',
    order_id: null,
    customer_id: null,
    rider_id: null,
    merchant_store_id: null,
    merchant_parent_id: null,
    raised_by_type: 'SYSTEM',
    raised_by_id: null,
    raised_by_name: name,
    raised_by_mobile: body.phone?.trim() || null,
    raised_by_email: email,
    subject,
    description,
    attachments: null,
    priority: 'MEDIUM',
    status: 'OPEN',
    metadata: {
      source: 'gatimitra_corporates_web',
      team_size: body.teamSize?.trim() || null,
      programme: body.programme?.trim() || null,
      city: body.city?.trim() || null,
      ticket_group_id: Number.isFinite(CORPORATE_GROUP_ID) ? CORPORATE_GROUP_ID : null,
      ticket_group_name: groupName,
      ticket_group_ticket_title: groupTicketTitle,
      ticket_titles_code: catalogTitle?.titleCode ?? null,
      ticket_titles_text: catalogTitle?.titleText ?? null,
    },
    tags: ['corporate', 'web-enquiry'],
  }

  if (Number.isFinite(CORPORATE_GROUP_ID) && CORPORATE_GROUP_ID > 0) {
    row.group_id = CORPORATE_GROUP_ID
  }

  const { data, error } = await admin.from('unified_tickets').insert(row).select('id, ticket_id').single()

  if (error) {
    const msg = error.message ?? 'Insert failed'
    const hint =
      msg.includes('OTHER_CORPORATE') || msg.includes('invalid input value for enum')
        ? ' Run drizzle/0095_corporate_enquiry_ticket_source.sql on the database to add OTHER_CORPORATE.'
        : ''
    return NextResponse.json({ ok: false, error: msg + hint, code: error.code }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    id: data?.id,
    ticket_id: data?.ticket_id,
  })
}
