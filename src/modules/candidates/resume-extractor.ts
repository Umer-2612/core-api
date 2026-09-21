import pdfParse from "pdf-parse";

export interface ParsedResumeExperience {
  role: string;
  company: string;
  years: string;
  bullets: string[];
}

/** One category from a skills list, e.g. { category: "Databases", items: [...] }.
 * `category` is "" when the resume lists skills with no category label at all. */
export interface SkillGroup {
  category: string;
  items: string[];
}

/** Any resume section besides summary/skills/experience (which get dedicated
 * parsing above): education, certificates, achievements, projects, languages,
 * or anything else this specific resume happens to have. Nothing is dropped:
 * a section this parser has never seen before still shows up here, keyed by
 * whatever heading text the resume itself used. */
export interface ResumeSection {
  heading: string;
  items: string[];
}

export interface ParsedResume {
  full_name: string;
  email: string | null;
  phone: string | null;
  summary: string | null;
  skills: SkillGroup[];
  experience: ParsedResumeExperience[];
  sections: ResumeSection[];
}

// ─── Section dictionary ─────────────────────────────────────────────────────
// Only summary/skills/experience get dedicated structured parsing below.
// Everything else (education, certificates, achievements, projects, ...) is
// captured generically into `sections`, so a header spelling this dictionary
// doesn't recognize still comes through (see isGenericHeaderCandidate).

const PARSED_SECTIONS: Record<string, string[]> = {
  summary: [
    "summary",
    "professional summary",
    "career summary",
    "profile",
    "professional profile",
    "objective",
    "career objective",
    "objectives",
    "about",
    "about me",
    "overview",
    "introduction",
  ],
  skills: [
    "skills",
    "skills & expertise",
    "technical skills",
    "core skills",
    "core competencies",
    "key skills",
    "competencies",
    "technologies",
    "technology",
    "tools",
    "tools & technologies",
    "expertise",
    "technical expertise",
    "areas of expertise",
    "technical stack",
    "stack",
    "top skills", // LinkedIn PDF sidebar
  ],
  experience: [
    "experience",
    "work experience",
    "professional experience",
    "employment",
    "employment history",
    "work history",
    "career history",
    "positions",
    "position",
  ],
};

// Known spellings for generic (non-specially-parsed) sections. Not exhaustive
// by design, anything not listed here still gets picked up by the all-caps
// fallback in isGenericHeaderCandidate, this list only exists so common
// lowercase/mixed-case headers (e.g. "Education") are recognized reliably.
const GENERIC_SECTION_TITLES: string[] = [
  "education",
  "academic background",
  "academic qualifications",
  "qualifications",
  "educational background",
  "projects",
  "project",
  "personal projects",
  "side projects",
  "key projects",
  "certifications",
  "certification",
  "certificates",
  "licenses",
  "awards",
  "honors",
  "achievements",
  "publications",
  "research",
  "languages",
  "spoken languages",
  "courses",
  "training",
  "volunteer",
  "volunteering",
  "volunteer work",
  "interests",
  "hobbies",
  "activities",
  "extracurriculars",
  "extras",
  "references",
  "additional",
  "additional information",
  "recognition",
  "recognition & leadership",
  "portfolio",
  "my portfolio",
  "additional skills",
];

const ALL_TITLES = [...Object.values(PARSED_SECTIONS).flat(), ...GENERIC_SECTION_TITLES];

// ─── Regexes ─────────────────────────────────────────────────────────────────

const EMAIL_RE = /([a-zA-Z0-9._%+-]+)@([\da-zA-Z.-]+)\.([a-zA-Z]{2,})/;
const PHONE_RE = /((?:\+?\d{1,3}[\s-]?)?\(?\d{2,4}\)?[\s.-]?\d{3}[\s.-]?\d{3,5})/;

const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\\w*[\\s,]+\\d{4}";
const DATE_RANGE_RE = new RegExp(`(${MONTH}|\\d{4})\\s*[-–—to]+\\s*(${MONTH}|\\d{4}|present|current)`, "i");
const DATE_AT_END_RE = new RegExp(`(${MONTH}|\\d{4})\\s*[-–—to]+\\s*(${MONTH}|\\d{4}|present|current)\\s*$`, "i");
const YEAR_ONLY_RE = /\b(19|20)\d{2}\b/;
const BULLET_LINE_RE = /^[•●○▪▸◦·\-*]\s*/;
// Google Docs → PDF exports often render a nested list's second level as the
// plain letter "o" rather than a real bullet glyph. Requiring a space then an
// uppercase letter/digit/paren keeps this from matching real words like "of".
const SUB_BULLET_RE = /^o\s+(?=[A-Z0-9(])/;

// Context signals used to score name candidates.
const JOB_TITLE_RE =
  /engineer|developer|designer|manager|analyst|consultant|architect|specialist|coordinator|director|officer|lead|intern|executive|programmer|scientist/i;
const CONTACT_CONTEXT_RE = /[@+]|\d{7,}/;

// ─── Main entry ──────────────────────────────────────────────────────────────

export async function extractResumeFromPdf(buffer: Buffer): Promise<ParsedResume> {
  const { text } = await pdfParse(buffer);
  return extractFromText(text);
}

export function extractFromText(rawText: string): ParsedResume {
  const lines = rawText
    .split("\n")
    .map((l) => l.replace(/\r|\t/g, "").trim())
    .filter((l) => l.length > 0);

  const email = EMAIL_RE.exec(rawText)?.[0]?.toLowerCase() ?? null;
  const phone = extractPhone(rawText);
  const { special, generic } = buildSections(lines);

  return {
    full_name: extractName(lines),
    email,
    phone,
    summary: special.summary?.replace(/\n+/g, " ").trim().slice(0, 600) ?? null,
    skills: parseSkills(special.skills ?? ""),
    experience: parseExperience(special.experience ?? ""),
    sections: generic,
  };
}

function extractPhone(rawText: string): string | null {
  const match = PHONE_RE.exec(rawText);
  if (!match) return null;
  const digits = match[0].replace(/\D/g, "");
  return digits.length >= 10 ? match[0].trim() : null;
}

// ─── Section outline ────────────────────────────────────────────────────────
// Walks the resume once, finds every line that looks like a section header
// (either a known spelling from the dictionaries above, or a novel one this
// parser has never seen), and slices the lines between consecutive headers.
// This is what lets an unfamiliar resume's sections still come through in
// `sections` instead of being silently dropped: nothing depends on the header
// text being on a fixed list, only on it looking like a header.

type SpecialKey = "summary" | "skills" | "experience";

// A section header this parser has no name for: short, ALL CAPS (many resume
// templates render headers this way), not contact-like. Title Case headers
// aren't matched here on purpose, a short Title Case line is indistinguishable
// from a "Role - Company" job line without knowing which section we're in.
const GENERIC_HEADER_RE = /^[A-Z][A-Z0-9 &/'-]{1,38}$/;

function isGenericHeaderCandidate(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.split(/\s+/).length > 5) return false;
  if (CONTACT_CONTEXT_RE.test(trimmed)) return false;
  return GENERIC_HEADER_RE.test(trimmed);
}

function findSpecialKey(lower: string): SpecialKey | null {
  for (const [key, titles] of Object.entries(PARSED_SECTIONS)) {
    if (titles.includes(lower)) return key as SpecialKey;
  }
  return null;
}

interface DetectedHeader {
  index: number;
  raw: string;
  specialKey: SpecialKey | null;
}

function detectHeaders(lines: string[]): DetectedHeader[] {
  const genericTitleSet = new Set(GENERIC_SECTION_TITLES.map((t) => t.toLowerCase()));
  const seen = new Set<string>();
  const headers: DetectedHeader[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase().trim();
    const specialKey = findSpecialKey(lower);
    const isKnown = specialKey !== null || genericTitleSet.has(lower);

    if (isKnown) {
      if (seen.has(lower)) continue; // only the first occurrence starts a new section
      seen.add(lower);
      headers.push({ index: i, raw: line, specialKey });
      continue;
    }

    if (isGenericHeaderCandidate(line) && !seen.has(lower)) {
      seen.add(lower);
      headers.push({ index: i, raw: line, specialKey: null });
    }
  }

  return headers;
}

/** "PROJECTS" -> "Projects", "Work History" untouched (already readable). */
function toDisplayHeading(raw: string): string {
  const trimmed = raw.trim();
  if (!/[a-z]/.test(trimmed)) {
    return trimmed
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
  return trimmed;
}

/** Every non-empty line becomes its own item (bullet marker stripped if
 * present). Deliberately doesn't try to merge wrapped lines here: unlike a
 * job's bullet list, sections like Education mix free-form multi-line
 * entries in too many different shapes to guess reliably without AI. */
function parseGenericSectionItems(lines: string[]): string[] {
  return lines
    .map((line) => line.replace(BULLET_LINE_RE, "").replace(SUB_BULLET_RE, "").trim())
    .filter((line) => line.length > 0);
}

function buildSections(lines: string[]): { special: Partial<Record<SpecialKey, string>>; generic: ResumeSection[] } {
  const headers = detectHeaders(lines);
  const special: Partial<Record<SpecialKey, string>> = {};
  const generic: ResumeSection[] = [];

  for (let h = 0; h < headers.length; h++) {
    const start = headers[h].index + 1;
    const end = h + 1 < headers.length ? headers[h + 1].index : lines.length;
    const contentLines = lines.slice(start, end);
    if (contentLines.length === 0) continue;

    if (headers[h].specialKey) {
      if (!special[headers[h].specialKey!]) special[headers[h].specialKey!] = contentLines.join("\n");
      continue;
    }

    const items = parseGenericSectionItems(contentLines);
    if (items.length > 0) generic.push({ heading: toDisplayHeading(headers[h].raw), items });
  }

  return { special, generic };
}

// ─── Name extraction ─────────────────────────────────────────────────────────

const HEADERS_SET = new Set([...ALL_TITLES, "contact", "contact info", "contact information"].map((t) => t.toLowerCase()));
// Lines that are clearly not name lines.
const SKIP_LINE = /[@\d|⋄•]|^https?:|^www\.|^\(/i;
const MULTI_SEP = /[|⋄]{2}/;
// A word that can legally appear in a person's name.
const TITLE_CASE_WORD = /^[A-Z][a-záéíóúàèìòùäëïöü'-]*\.?$/;
const ALL_CAPS_WORD = /^[A-Z]{2,}$/;
const isNameWord = (w: string) => TITLE_CASE_WORD.test(w) || ALL_CAPS_WORD.test(w);

interface NameCandidate {
  name: string;
  idx: number;
  score: number;
}

function extractName(lines: string[]): string {
  const candidates: NameCandidate[] = [];

  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    const line = lines[i].trim();
    if (!line || line.length < 2 || line.length > 50) continue;
    if (SKIP_LINE.test(line)) continue;
    if (MULTI_SEP.test(line)) continue;
    if (HEADERS_SET.has(line.toLowerCase())) continue;

    const words = line.split(/\s+/);
    if (words.length < 2 || words.length > 4) continue;
    if (!words.every(isNameWord)) continue;

    // Score: earlier position wins, but context clues can overcome position.
    let score = Math.max(0, 20 - i);

    const nextLine = lines.slice(i + 1, i + 5).find((l) => l.trim().length > 0) ?? "";
    if (JOB_TITLE_RE.test(nextLine)) score += 20; // "Software Engineer @..." follows, strong name signal
    if (CONTACT_CONTEXT_RE.test(nextLine)) score += 15; // phone/email row follows, name signal

    const hasInitial = words.some((w) => /^[A-Z]\.$/.test(w));
    if (hasInitial) score -= 5;
    if (words.length === 4) score -= 3;

    candidates.push({ name: line, idx: i, score });
  }

  if (candidates.length === 0) return fallbackName(lines);

  candidates.sort((a, b) => b.score - a.score || a.idx - b.idx);
  let best = candidates[0];

  // If the winner has a middle initial (e.g. "Patel Yash A."), look for the
  // same core words in natural order among other candidates ("Yash Patel").
  const bestWords = best.name.split(/\s+/);
  if (bestWords.some((w) => /^[A-Z]\.$/.test(w))) {
    const coreWords = bestWords.filter((w) => !/^[A-Z]\.$/.test(w)).map((w) => w.toLowerCase());
    for (const candidate of candidates.slice(1)) {
      const words = candidate.name.split(/\s+/).map((w) => w.toLowerCase());
      if (words.length === coreWords.length && words.every((w) => coreWords.includes(w))) {
        best = candidate;
        break;
      }
    }
  }

  let name = best.name;

  // Normalize ALL CAPS to Title Case ("VIRAL DESHLE" -> "Viral Deshle").
  const nameWords = name.split(/\s+/);
  if (nameWords.every((w) => ALL_CAPS_WORD.test(w))) {
    name = nameWords.map((w) => w[0] + w.slice(1).toLowerCase()).join(" ");
  }

  // Remove a trailing middle initial as a safety net.
  name = name.replace(/\s+[A-Z]\.\s*$/, "").trim();

  return name || fallbackName(lines);
}

function fallbackName(lines: string[]): string {
  const skip = /[@\d:]|^https?|^www\./i;
  for (const line of lines.slice(0, 5)) {
    if (!skip.test(line) && line.length > 1 && line.length < 60) return line;
  }
  return "Unknown";
}

// ─── Skills parser ───────────────────────────────────────────────────────────

const TRAILING_FILLER = /\b(and|or|the|a|an|to|for|in|of|at|with|by|from|that|using)\s*$/i;
const PAGE_NUMBER = /^\d+\s*[/\\]\s*\d+$/;
const IS_URL = /^https?:\/\//i;

/** Splits on `,` like String.split, but ignores commas nested inside "(...)"
 * so "AWS(EKS, CloudFormation), Docker" doesn't shred the parenthetical group. */
function splitTopLevelCommas(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);

    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

// "Label(sub1, sub2)" or "Label (sub1, sub2)": a category name immediately
// followed by its own self-contained parenthetical sub-list.
const LABELED_GROUP_RE = /^([^()]+?)\s*\(([^()]+)\)$/;

/** Expands a "Label(sub1, sub2)" item into [Label, sub1, sub2]; passes any
 * other item through unchanged. */
function expandLabeledGroup(item: string): string[] {
  const match = LABELED_GROUP_RE.exec(item);
  if (!match) return [item];
  return [match[1], ...match[2].split(",")];
}

/** Rejoins a line onto the previous one when the previous line ends with an
 * unclosed "(": PDFs often wrap a parenthetical skills group mid-group. */
function mergeWrappedParenLines(lines: string[]): string[] {
  const merged: string[] = [];
  let depth = 0;

  for (const line of lines) {
    if (depth > 0 && merged.length > 0) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${line}`.trim();
    } else {
      merged.push(line);
    }

    for (const ch of line) {
      if (ch === "(") depth++;
      else if (ch === ")") depth = Math.max(0, depth - 1);
    }
  }

  return merged;
}

const SKILL_TITLE_SET = new Set(ALL_TITLES.map((t) => t.toLowerCase()));

function cleanSkillItems(raw: string[]): string[] {
  return [
    ...new Set(
      raw
        .map((s) => s.replace(/\s+/g, " ").trim())
        .filter((s) => s.length > 1 && s.length <= 50)
        .filter((s) => {
          if (SKILL_TITLE_SET.has(s.toLowerCase())) return false;
          if (PAGE_NUMBER.test(s)) return false; // "1 / 3"
          if (IS_URL.test(s)) return false;
          if (/^[a-z]/.test(s)) return false; // sentence continuation (starts lowercase)
          if (s.endsWith(".") || s.endsWith(",")) return false; // sentence fragment
          if (TRAILING_FILLER.test(s)) return false; // "Continuous Integration and"
          if (/\)$/.test(s) && !s.includes("(")) return false; // stray closing paren "SSM)"
          if (s.includes("(") && !s.includes(")")) return false; // stray opening paren "AWS (Lambda"

          // Any multi-word item where half or more words start lowercase is a prose fragment.
          const words = s.split(/\s+/);
          if (words.length >= 2) {
            const lowercaseCount = words.filter((w) => /^[a-z]/.test(w)).length;
            if (lowercaseCount / words.length >= 0.5) return false;
          }
          return true;
        }),
    ),
  ].slice(0, 40);
}

/** Preserves the resume's own category structure ("Languages: TypeScript,
 * Python" / "Databases: Postgres, Redis" become two separate groups) instead
 * of flattening every category into one undifferentiated list. Lines with no
 * "Category:" label are collected into a single group with category: "". */
function parseSkills(text: string): SkillGroup[] {
  if (!text) return [];

  const rawLines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const lines = mergeWrappedParenLines(rawLines);

  const groups: SkillGroup[] = [];
  const ungrouped: string[] = [];

  for (const line of lines) {
    const stripped = line.replace(BULLET_LINE_RE, "");

    // "Category: item1, item2", colon may have zero or more spaces after it.
    const subCategoryMatch = /^([^:]{1,50}):\s*(.+)$/.exec(stripped);
    if (subCategoryMatch) {
      const items = cleanSkillItems(splitTopLevelCommas(subCategoryMatch[2]).flatMap(expandLabeledGroup));
      if (items.length > 0) groups.push({ category: subCategoryMatch[1].trim(), items });
    } else {
      ungrouped.push(...stripped.split(/[,|•·]+/).flatMap(expandLabeledGroup));
    }
  }

  const ungroupedItems = cleanSkillItems(ungrouped);
  if (ungroupedItems.length > 0) groups.push({ category: "", items: ungroupedItems });

  return groups;
}

// ─── Experience parser ───────────────────────────────────────────────────────

function isSectionHeader(line: string): boolean {
  const lower = line.toLowerCase().trim();
  return ALL_TITLES.some((t) => t.toLowerCase() === lower || t.toUpperCase() === line.trim());
}

function parseExperience(text: string): ParsedResumeExperience[] {
  if (!text) return [];

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const jobs: ParsedResumeExperience[] = [];

  let role = "";
  let company = "";
  let years = "";
  let bullets: string[] = [];
  let hasEntry = false;

  const flush = () => {
    if (hasEntry) {
      jobs.push({ role: role.trim(), company: company.trim(), years: years.trim(), bullets });
    }
    role = "";
    company = "";
    years = "";
    bullets = [];
    hasEntry = false;
  };

  const ROLE_AT_COMPANY_RE = /^(.+?)\s+(?:at|@)\s+(.+)$/;
  // "Role - Company" or "Role – Company": common when there's no "at"/"@" separator.
  // Bounded to short, period-free lines so it doesn't swallow a wrapped bullet
  // sentence that merely happens to contain a hyphen.
  const ROLE_DASH_COMPANY_RE = /^([^-–—]{2,60}?)\s*[-–—]\s*([^-–—]{2,80})$/;

  for (const line of lines) {
    if (BULLET_LINE_RE.test(line)) {
      const bulletText = line.replace(BULLET_LINE_RE, "").trim();
      if (bulletText) bullets.push(bulletText);
      continue;
    }

    if (SUB_BULLET_RE.test(line)) {
      const bulletText = line.replace(SUB_BULLET_RE, "").trim();
      if (bulletText) bullets.push(bulletText);
      continue;
    }

    if (isSectionHeader(line)) {
      flush();
      continue;
    }

    // "Role at Company" always starts a new entry, regardless of what came before.
    // Excludes lines ending in "." (a real header never does, but a wrapped
    // bullet continuation that happens to contain " at " often does).
    const atMatch = ROLE_AT_COMPANY_RE.exec(line);
    if (atMatch && !line.endsWith(".")) {
      flush();
      role = atMatch[1].trim();
      company = atMatch[2].trim();
      hasEntry = true;
      continue;
    }

    // "Role Title    Jan 2020 - Present": the non-date prefix is the role, and this
    // starts a new entry too. A bare date with nothing before it isn't a new entry
    // on its own, it's just the date for whatever entry is already open, handled
    // by the standalone date-range check below.
    const endDateMatch = DATE_AT_END_RE.exec(line);
    if (endDateMatch) {
      const titlePart = line.slice(0, endDateMatch.index).trim();
      if (titlePart) {
        flush();
        role = titlePart;
        years = endDateMatch[0].trim();
        hasEntry = true;
        continue;
      }
    }

    if (DATE_RANGE_RE.test(line) && line.split(/\s+/).length <= 8) {
      // A second date range with no new role in between means a new entry started
      // without ever matching "Role at Company", flush what we had first.
      if (years) flush();
      years = line.trim();
      hasEntry = true;
      continue;
    }

    if (YEAR_ONLY_RE.test(line) && line.split(/\s+/).length <= 4) {
      if (!years) {
        years = line.trim();
        hasEntry = true;
      }
      continue;
    }

    // "Role - Company" always starts a new entry too, same as "Role at Company".
    const dashMatch = ROLE_DASH_COMPANY_RE.exec(line);
    if (dashMatch && line.split(/\s+/).length <= 12 && !line.endsWith(".")) {
      flush();
      role = dashMatch[1].trim();
      company = dashMatch[2].trim();
      hasEntry = true;
      continue;
    }

    if (!role) {
      role = line;
      hasEntry = true;
    } else if (!company) {
      company = line;
      hasEntry = true;
    } else if (bullets.length > 0) {
      // Wrapped continuation of the previous bullet (PDF line-wrap, no marker).
      bullets[bullets.length - 1] = `${bullets[bullets.length - 1]} ${line}`.trim();
    }
    // Extra descriptive line with nothing to attach to: ignore it.
  }
  flush();

  return jobs.slice(0, 15);
}
