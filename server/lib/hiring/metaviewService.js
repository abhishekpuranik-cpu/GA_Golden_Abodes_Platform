/** Direct Metaview MCP client — no Anthropic proxy required. */

import { pickFirstEmail, pickFirstPhone } from './contact.js';

function trimEnv(k) {
  const v = process.env[k];
  return typeof v === 'string' ? v.trim() : '';
}

function mcpUrl() {
  return trimEnv('METAVIEW_MCP_URL') || 'https://mcp.metaview.ai/mcp';
}

export function metaviewConfigured() {
  return !!trimEnv('METAVIEW_OAUTH_TOKEN');
}

export function sourcingModeAvailable() {
  return metaviewConfigured() ? 'auto' : 'manual';
}

function parseSsePayload(text) {
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line.startsWith('data: ')) continue;
    const data = JSON.parse(line.slice(6));
    if (data.error) {
      throw new Error(data.error.message || JSON.stringify(data.error));
    }
    return data.result;
  }
  throw new Error('Empty Metaview MCP response');
}

function parseToolText(result) {
  if (result?.isError) {
    const errText = result.content?.[0]?.text || 'Metaview tool error';
    throw new Error(String(errText).slice(0, 500));
  }
  const text = result?.content?.[0]?.text;
  if (!text) return result || {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function mcpToolsCall(name, args) {
  if (!metaviewConfigured()) {
    throw new Error('Metaview sourcing is not configured — set METAVIEW_OAUTH_TOKEN in .env');
  }
  const token = trimEnv('METAVIEW_OAUTH_TOKEN');
  const res = await fetch(mcpUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      Accept: 'application/json, text/event-stream'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name,
        arguments: {
          ...args,
          rationale: args.rationale || 'GA Hiring module sync'
        }
      }
    })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Metaview MCP HTTP ${res.status}: ${errText.slice(0, 300)}`);
  }
  return parseToolText(parseSsePayload(await res.text()));
}

function formatMonthYear(d) {
  if (!d?.year) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const m = d.month ? months[d.month - 1] : '';
  return m ? `${m} ${d.year}` : String(d.year);
}

export function normalizeFullProfile(row) {
  const p = row.profile || {};
  const summary = (row.summary || [])
    .map((s) => ({
      title: s.title || '',
      description: s.description || ''
    }))
    .filter((s) => s.description);

  return {
    metaviewCandidateId: String(row.candidate_id || row.id || ''),
    name: row.name || '',
    linkedinUrl: row.linkedin_url || row.linkedinUrl || '',
    pack: row.pack ?? null,
    summary,
    location: p.location || p.current_location || '',
    headline: p.headline || p.title || '',
    experience: (p.experience || []).map((e) => ({
      jobTitle: e.job_title || e.title || '',
      company: e.company?.name || e.company_name || '',
      companyIndustry: e.company?.industry || '',
      department: e.department || '',
      managementLevel: e.management_level || '',
      location: e.location || '',
      start: formatMonthYear(e.start_date),
      end: formatMonthYear(e.end_date),
      current: !e.end_date,
      description: e.description || ''
    })),
    education: (p.education || []).map((e) => ({
      institution: e.institution || e.school || '',
      degree: e.degree || e.field || '',
      start: formatMonthYear(e.start_date),
      end: formatMonthYear(e.end_date)
    })),
    skills: p.skills || [],
    languages: p.languages || [],
    emails: (p.emails || p.email_addresses || [])
      .map((e) => pickFirstEmail(e))
      .filter(Boolean),
    phones: (p.phones || p.phone_numbers || [])
      .map((ph) => pickFirstPhone(ph))
      .filter(Boolean)
  };
}

function mapCandidate(c) {
  const highlights = (c.summary || [])
    .map((s) => [s.title, s.description].filter(Boolean).join(': '))
    .filter(Boolean)
    .join('\n');
  const profile = c.profile ? normalizeFullProfile(c) : null;
  const email = pickFirstEmail(
    c.email,
    c.emails,
    c.contact_email,
    c.primary_email,
    profile?.emails,
    c.profile?.emails,
    c.profile?.email,
    c.profile?.email_addresses
  );
  const phone = pickFirstPhone(
    c.phone,
    c.phones,
    c.contact_phone,
    c.mobile,
    c.primary_phone,
    profile?.phones,
    c.profile?.phones,
    c.profile?.phone,
    c.profile?.phone_numbers
  );
  return {
    metaviewCandidateId: String(c.candidate_id || c.id || ''),
    name: c.name || 'Unknown',
    email,
    phone,
    linkedinUrl: c.linkedin_url || c.linkedinUrl || profile?.linkedinUrl || '',
    currentCompany: c.current_company || c.currentCompany || profile?.experience?.[0]?.company || '',
    cityCurrent: profile?.location || c.city_current || '',
    highlights: highlights || profile?.summary?.map((s) => s.description).join('\n') || '',
    profileSnapshot: profile
  };
}

export async function getSearchStatus(searchId) {
  const parsed = await mcpToolsCall('get_search_details', { search_id: searchId });
  return {
    phase: parsed.phase || parsed.status || 'unknown',
    packCount: parsed.packs?.length ?? parsed.pack_count ?? null,
    calibration: parsed.calibration || null,
    message: parsed.next || parsed.message || null
  };
}

function buildSourcingBrief(requisition) {
  return [
    `Find candidates for: ${requisition.role}`,
    requisition.projectName ? `Project: ${requisition.projectName}` : '',
    requisition.department ? `Department: ${requisition.department}` : '',
    requisition.location ? `Location: ${requisition.location}` : '',
    requisition.brief ? `Job description / requirements:\n${requisition.brief}` : '',
    requisition.experienceMinYears != null
      ? `Experience: ${requisition.experienceMinYears}-${requisition.experienceMaxYears ?? '?'} years`
      : '',
    requisition.bandMinPaise && requisition.bandMaxPaise
      ? `CTC band: ₹${(requisition.bandMinPaise / 10000000).toFixed(1)}–${(requisition.bandMaxPaise / 10000000).toFixed(1)} LPA`
      : '',
    requisition.headcount > 1 ? `Headcount: ${requisition.headcount}` : ''
  ].filter(Boolean).join('\n');
}

/** Public Metaview web URL for a sourcing search. */
export function metaviewWebSearchUrl(searchId) {
  if (!searchId) return null;
  return `https://my.metaview.app/sourcing/${encodeURIComponent(String(searchId))}`;
}

export async function startSearch(requisition) {
  const parsed = await mcpToolsCall('send_sourcing_message', {
    message: buildSourcingBrief(requisition),
    mode: 'source'
  });
  return { searchId: parsed.search_id || parsed.searchId || null };
}

/** Push updated JD / constraints into an existing Metaview search. */
export async function refineSearch(searchId, requisition) {
  const message = [
    'Please update the Ideal Candidate Profile and refine the search using these revised requirements:',
    buildSourcingBrief(requisition),
    'Then search for more candidates matching the updated ICP.'
  ].join('\n\n');
  return mcpToolsCall('send_sourcing_message', {
    search_id: searchId,
    message
  });
}

export async function fetchCandidateProfile(searchId, metaviewCandidateId) {
  let offset = 0;
  const limit = 50;
  const target = String(metaviewCandidateId);

  while (offset < 500) {
    const parsed = await mcpToolsCall('list_sourcing_candidates', {
      search_id: searchId,
      limit,
      offset,
      detail_level: 'full'
    });
    const batch = parsed.candidates || [];
    const found = batch.find((c) => String(c.candidate_id || c.id) === target);
    if (found) return normalizeFullProfile(found);
    if (batch.length < limit) break;
    offset += limit;
  }
  return null;
}

export async function pullCandidates(searchId) {
  const all = [];
  let offset = 0;
  const limit = 50;

  while (true) {
    const parsed = await mcpToolsCall('list_sourcing_candidates', {
      search_id: searchId,
      limit,
      offset,
      detail_level: 'full'
    });
    const batch = parsed.candidates || [];
    for (const c of batch) {
      const mapped = mapCandidate(c);
      if (mapped.metaviewCandidateId) all.push(mapped);
    }
    if (batch.length < limit) break;
    offset += limit;
    if (offset >= 500) break;
  }
  return all;
}

export async function pushFeedback(searchId, metaviewCandidateId, verdict, note) {
  const accepted = ['YES', 'NO', 'MAYBE'].includes(verdict) ? verdict : 'MAYBE';
  await mcpToolsCall('give_sourcing_feedback', {
    search_id: searchId,
    feedbacks: [{
      candidate_id: metaviewCandidateId,
      accepted,
      text: note || ''
    }]
  });
  return { ok: true };
}
