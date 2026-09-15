// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse: (buf: Buffer) => Promise<{ text: string }> = require('pdf-parse');

import type { ParsedResume } from '@shared/interfaces/models.interface';

// ─── Section dictionary ───────────────────────────────────────────────────────

const PARSED_SECTIONS: Record<string, string[]> = {
  summary: [
    'summary', 'professional summary', 'career summary',
    'profile', 'professional profile',
    'objective', 'career objective', 'objectives',
    'about', 'about me', 'overview', 'introduction',
  ],
  skills: [
    'skills', 'skills & expertise', 'technical skills', 'core skills',
    'core competencies', 'key skills', 'competencies',
    'technologies', 'technology', 'tools', 'tools & technologies',
    'expertise', 'technical expertise', 'areas of expertise',
    'technical stack', 'stack',
    'top skills',       // LinkedIn PDF sidebar
  ],
  experience: [
    'experience', 'work experience', 'professional experience',
    'employment', 'employment history', 'work history', 'career history',
    'positions', 'position',
  ],
  education: [
    'education', 'academic background', 'academic qualifications',
    'qualifications', 'educational background',
  ],
};

// Additional section headers used ONLY as stop-markers (not parsed)
const STOP_ONLY: string[] = [
  'projects', 'project', 'personal projects', 'side projects', 'key projects',
  'certifications', 'certification', 'certificates', 'licenses',
  'awards', 'honors', 'achievements',
  'publications', 'research',
  'languages', 'spoken languages',
  'courses', 'training',
  'volunteer', 'volunteering', 'volunteer work',
  'interests', 'hobbies', 'activities', 'extracurriculars', 'extras',
  'references', 'additional', 'additional information',
  'recognition', 'recognition & leadership',
  'portfolio', 'my portfolio',
  'additional skills',
];

const ALL_TITLES = [...Object.values(PARSED_SECTIONS).flat(), ...STOP_ONLY];

// ─── Regexes ──────────────────────────────────────────────────────────────────

const EMAIL_RE = /([a-zA-Z0-9._%+\-]+)@([\da-zA-Z.\-]+)\.([a-zA-Z]{2,})/;
const PHONE_RE = /((?:\+?\d{1,3}[\s\-]?)?\(?\d{2,4}\)?[\s.\-]?\d{3}[\s.\-]?\d{3,5})/;

const DATE_RANGE_RE = /((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*[\s,]+\d{4}|\d{4})\s*[-–—to]+\s*((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*[\s,]+\d{4}|\d{4}|present|current)/i;
const DATE_AT_END_RE = /((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*[\s,]+\d{4}|\d{4})\s*[-–—to]+\s*((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*[\s,]+\d{4}|\d{4}|present|current)\s*$/i;
const YEAR_ONLY_RE = /\b(19|20)\d{2}\b/;
const BULLET_LINE_RE = /^[•▪▸◦·\-\*]\s*/;

// Context signals used to score name candidates
const JOB_TITLE_RE = /engineer|developer|designer|manager|analyst|consultant|architect|specialist|coordinator|director|officer|lead|intern|executive|programmer|scientist/i;
const CONTACT_CONTEXT_RE = /[@+]|\d{7,}/;

// ─── Main entry ───────────────────────────────────────────────────────────────

export async function extractResumeFromPdf(buffer: Buffer): Promise<ParsedResume> {
  const data = await pdfParse(buffer);
  return extractFromText(data.text);
}

export function extractFromText(rawText: string): ParsedResume {
  const lines = rawText
    .split('\n')
    .map(l => l.replace(/\r|\t/g, '').trim())
    .filter(l => l.length > 0);

  const cleaned = lines.join('\n') + '\n{end}';

  const email = EMAIL_RE.exec(rawText)?.[0]?.toLowerCase() ?? null;
  const phone = (() => {
    const m = PHONE_RE.exec(rawText);
    if (!m) return null;
    const digits = m[0].replace(/\D/g, '');
    return digits.length >= 10 ? m[0].trim() : null;
  })();

  const sections: Record<string, string> = {};
  for (const [key, titles] of Object.entries(PARSED_SECTIONS)) {
    for (const title of titles) {
      if (sections[key]) break;

      const otherTitles = ALL_TITLES
        .filter(t => t.toLowerCase() !== title.toLowerCase())
        .map(escapeRegex)
        .join('|');

      const re = new RegExp(
        `(?:^|\\n)${escapeRegex(title)}\\s*:?\\s*\\n([\\s\\S]*?)(?:\\n(?:${otherTitles})\\s*\\n|\\n\\{end\\})`,
        'i',
      );

      const match = re.exec(cleaned);
      if (match?.[1]?.trim()) {
        sections[key] = match[1].trim();
      }
    }
  }

  const full_name = extractName(lines);

  return {
    full_name,
    email,
    phone,
    summary: sections['summary']?.replace(/\n+/g, ' ').trim().slice(0, 600) ?? null,
    skills: parseSkills(sections['skills'] ?? ''),
    experience: parseExperience(sections['experience'] ?? ''),
  };
}

// ─── Name extraction ──────────────────────────────────────────────────────────

function extractName(lines: string[]): string {
  const HEADERS_SET = new Set(
    [...ALL_TITLES, 'contact', 'contact info', 'contact information'].map(t => t.toLowerCase()),
  );

  // Lines that are clearly not name lines
  const SKIP_LINE = /[@\d|⋄•]|^https?:|^www\.|^\(/i;
  const MULTI_SEP = /[|⋄]{2}/;

  // A word that can legally appear in a person's name
  const TITLE_CASE_WORD = /^[A-Z][a-záéíóúàèìòùäëïöü'-]*\.?$/;
  const ALL_CAPS_WORD = /^[A-Z]{2,}$/;
  const isNameWord = (w: string) => TITLE_CASE_WORD.test(w) || ALL_CAPS_WORD.test(w);

  interface Candidate { name: string; idx: number; score: number }
  const candidates: Candidate[] = [];

  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    const line = lines[i].trim();
    if (!line || line.length < 2 || line.length > 50) continue;
    if (SKIP_LINE.test(line)) continue;
    if (MULTI_SEP.test(line)) continue;
    if (HEADERS_SET.has(line.toLowerCase())) continue;

    const words = line.split(/\s+/);
    if (words.length < 2 || words.length > 4) continue;
    if (!words.every(isNameWord)) continue;

    // Score: earlier position wins, but context clues can overcome position
    let score = Math.max(0, 20 - i);

    const nextLine = lines.slice(i + 1, i + 5).find(l => l.trim().length > 0) ?? '';
    if (JOB_TITLE_RE.test(nextLine)) score += 20;   // "Software Engineer @..." follows → strong name signal
    if (CONTACT_CONTEXT_RE.test(nextLine)) score += 15; // phone/email row follows → name signal

    const hasInitial = words.some(w => /^[A-Z]\.$/.test(w));
    if (hasInitial) score -= 5;
    if (words.length === 4) score -= 3;

    candidates.push({ name: line, idx: i, score });
  }

  if (candidates.length === 0) return fallbackName(lines);

  candidates.sort((a, b) => b.score - a.score || a.idx - b.idx);
  let best = candidates[0];

  // If the winner has a middle initial (e.g. "Patel Yash A."), look for the
  // same core words in natural order among other candidates ("Yash Patel")
  const bestWords = best.name.split(/\s+/);
  if (bestWords.some(w => /^[A-Z]\.$/.test(w))) {
    const coreWords = bestWords.filter(w => !/^[A-Z]\.$/.test(w)).map(w => w.toLowerCase());
    for (const c of candidates.slice(1)) {
      const cWords = c.name.split(/\s+/).map(w => w.toLowerCase());
      if (cWords.length === coreWords.length && cWords.every(w => coreWords.includes(w))) {
        best = c;
        break;
      }
    }
  }

  let name = best.name;

  // Normalize ALL CAPS → Title Case ("VIRAL DESHLE" → "Viral Deshle")
  const nameWords = name.split(/\s+/);
  if (nameWords.every(w => ALL_CAPS_WORD.test(w))) {
    name = nameWords.map(w => w[0] + w.slice(1).toLowerCase()).join(' ');
  }

  // Remove trailing middle initial as a safety net
  name = name.replace(/\s+[A-Z]\.\s*$/, '').trim();

  return name || fallbackName(lines);
}

// ─── Skills parser ────────────────────────────────────────────────────────────

function parseSkills(text: string): string[] {
  if (!text) return [];

  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const collected: string[] = [];

  for (const line of lines) {
    // Strip leading bullet character with or without a following space
    const stripped = line.replace(/^[•▪▸◦·\-\*]\s*/, '');

    // "Category: item1, item2" — colon may have zero or more spaces after it
    const subCategoryMatch = /^([^:]{1,50}):\s*(.+)$/.exec(stripped);
    if (subCategoryMatch) {
      const items = subCategoryMatch[2]
        .split(',')
        .map(s => s.replace(/\s+/g, ' ').trim())
        .filter(s => s.length > 1 && s.length <= 50);
      collected.push(...items);
    } else {
      const items = stripped
        .split(/[,|•·]+/)
        .map(s => s.replace(/\s+/g, ' ').trim())
        .filter(s => s.length > 1 && s.length <= 50);
      collected.push(...items);
    }
  }

  const titleSet = new Set(ALL_TITLES.map(t => t.toLowerCase()));

  // Patterns that identify non-skill garbage
  const TRAILING_FILLER = /\b(and|or|the|a|an|to|for|in|of|at|with|by|from|that|using)\s*$/i;
  const PAGE_NUMBER = /^\d+\s*[/\\]\s*\d+$/;
  const IS_URL = /^https?:\/\//i;

  return [
    ...new Set(
      collected.filter(s => {
        if (titleSet.has(s.toLowerCase())) return false;
        if (s.length < 2 || s.length > 50) return false;
        if (PAGE_NUMBER.test(s)) return false;        // "1 / 3"
        if (IS_URL.test(s)) return false;             // stray URLs
        if (/^[a-z]/.test(s)) return false;           // sentence continuation (starts lowercase)
        if (s.endsWith('.') || s.endsWith(',')) return false; // sentence fragment
        if (TRAILING_FILLER.test(s)) return false;    // "Continuous Integration and"
        if (/\)$/.test(s) && !s.includes('(')) return false;    // stray closing paren "SSM)"
        if (s.includes('(') && !s.includes(')')) return false; // stray opening paren "AWS (Lambda"
        // Any multi-word item where half or more words start lowercase → prose fragment
        const words = s.split(/\s+/);
        if (words.length >= 2) {
          const lowercaseCount = words.filter(w => /^[a-z]/.test(w)).length;
          if (lowercaseCount / words.length >= 0.5) return false;
        }
        return true;
      })
    ),
  ].slice(0, 40);
}

// ─── Experience parser ────────────────────────────────────────────────────────

interface JobEntry {
  role: string;
  company: string;
  years: string;
  bullets: string[];
}

function parseExperience(text: string): JobEntry[] {
  if (!text) return [];

  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const jobs: JobEntry[] = [];

  let role = '';
  let company = '';
  let years = '';
  let bullets: string[] = [];

  const flush = () => {
    if (role || company) {
      jobs.push({ role: role.trim(), company: company.trim(), years: years.trim(), bullets });
    }
    role = ''; company = ''; years = ''; bullets = [];
  };

  for (const line of lines) {
    if (BULLET_LINE_RE.test(line)) {
      const text = line.replace(/^[•▪▸◦·\-\*]\s*/, '').trim();
      if (text) bullets.push(text);
      continue;
    }

    if (isSectionHeader(line)) {
      flush();
      continue;
    }

    const endDateMatch = DATE_AT_END_RE.exec(line);
    if (endDateMatch) {
      const titlePart = line.slice(0, endDateMatch.index).trim();
      const datePart = endDateMatch[0].trim();
      flush();
      role = titlePart || '';
      years = datePart;
      continue;
    }

    if (DATE_RANGE_RE.test(line) && line.split(/\s+/).length <= 8) {
      if (role) {
        years = line.trim();
        flush();
      } else {
        years = line.trim();
      }
      continue;
    }

    if (YEAR_ONLY_RE.test(line) && line.split(/\s+/).length <= 4) {
      if (!years) years = line.trim();
      continue;
    }

    const atMatch = /^(.+?)\s+(?:at|@)\s+(.+)$/.exec(line);
    if (atMatch && !years) {
      flush();
      role = atMatch[1].trim();
      company = atMatch[2].trim();
      continue;
    }

    if (years && role && !company) {
      company = line;
    } else if (!role) {
      role = line;
    } else if (!company) {
      company = line;
    }
  }
  flush();

  return jobs.slice(0, 15);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isSectionHeader(line: string): boolean {
  const lower = line.toLowerCase().trim();
  return ALL_TITLES.some(t => t.toLowerCase() === lower || t.toUpperCase() === line.trim());
}

function fallbackName(lines: string[]): string {
  const skip = /[@\d:]|^https?|^www\./i;
  for (const line of lines.slice(0, 5)) {
    if (!skip.test(line) && line.length > 1 && line.length < 60) return line;
  }
  return 'Unknown';
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
