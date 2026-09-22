import pdfParse from "pdf-parse";

/** Also reused for education entries: `role`/`company` become degree/institution
 * there (the same title-left, date-right shape a resume uses for jobs is what
 * most resumes use for degrees too, so this parses and displays the same way). */
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

/** Any resume section besides summary/skills/experience/education (which get
 * dedicated parsing): certificates, achievements, projects, languages, or
 * anything else this specific resume happens to have. Nothing is dropped: a
 * section this parser has never seen before still shows up here, keyed by
 * whatever heading text the resume itself used. */
export interface ResumeSection {
  heading: string;
  items: string[];
}

/** A hyperlink found anywhere in the PDF (LinkedIn/GitHub/portfolio in the
 * header, a project's repo link, a certificate's badge link, ...). `label` is
 * the exact resume text the link is attached to (e.g. "LinkedIn", "Github
 * Repo"), found by matching the link's position on the page to the text
 * sitting at that position, not a synthetic domain-based guess, so the
 * frontend can turn that same text inline into a link wherever it's
 * rendered, instead of listing links separately from the words they belong
 * to. These are link annotations, not visible text, "LinkedIn" on the page
 * has no URL in it, the URL only exists as the click target, so this can
 * only be found by reading the PDF's annotations directly (see
 * extractResumeFromPdf), not by scanning extracted text. `extractFromText`
 * alone always returns none. */
export interface ExtractedLink {
  label: string;
  url: string;
}

export interface ParsedResume {
  full_name: string;
  email: string | null;
  phone: string | null;
  summary: string | null;
  skills: SkillGroup[];
  experience: ParsedResumeExperience[];
  education: ParsedResumeExperience[];
  sections: ResumeSection[];
  links: ExtractedLink[];
}

// ─── Section dictionary ─────────────────────────────────────────────────────
// Summary/skills/experience/education get dedicated structured parsing below.
// Everything else (certificates, achievements, projects, languages, ...) is
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
  education: ["education", "academic background", "academic qualifications", "qualifications", "educational background"],
};

// Known spellings for generic (non-specially-parsed) sections. Not exhaustive
// by design, anything not listed here still gets picked up by the all-caps
// fallback in isGenericHeaderCandidate, this list only exists so common
// lowercase/mixed-case headers (e.g. "Certificates") are recognized reliably.
const GENERIC_SECTION_TITLES: string[] = [
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
// "05/23" or "09/2019": numeric MM/YY or MM/YYYY dates. Tried before the bare
// \d{4} alternative below so "09/2019" matches whole, not just its "2019"
// tail, a partial match would leave a stray "09/" stuck on the role/company.
const NUMERIC_DATE = "\\d{1,2}/\\d{2,4}";
const DATE_TOKEN = `(?:${MONTH}|${NUMERIC_DATE}|\\d{4})`;
const DATE_RANGE_RE = new RegExp(`(${DATE_TOKEN})\\s*[-–—to]+\\s*(${DATE_TOKEN}|present|current)`, "i");
const DATE_AT_END_RE = new RegExp(`(${DATE_TOKEN})\\s*[-–—to]+\\s*(${DATE_TOKEN}|present|current)\\s*$`, "i");
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
  const { text, links } = await extractTextAndLinks(buffer);
  return { ...extractFromText(text), links };
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
    education: parseExperience(special.education ?? ""),
    sections: generic,
    links: [],
  };
}

// ─── Link extraction ────────────────────────────────────────────────────────
// A resume's "LinkedIn | Github | Portfolio" header (and a project's repo
// link, a certificate's badge link, ...) is a PDF link annotation: the visible
// text has no URL in it, the URL only exists as the click target. Reading it
// means hooking pdf-parse's page-render callback to also read each page's
// annotations, alongside the text extraction it already does per page.

const KNOWN_LINK_LABELS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /linkedin\.com/i, label: "LinkedIn" },
  { pattern: /github\.com/i, label: "GitHub" },
  { pattern: /gitlab\.com/i, label: "GitLab" },
  { pattern: /^mailto:/i, label: "Email" },
  { pattern: /credly\.com/i, label: "Credly" },
];

/** Fallback for when no text sits under the link's own rect (an image-based
 * link, or a rect that just doesn't line up with any text item): guesses a
 * label from the domain instead. Exported since it's also directly useful on
 * its own (a good label for a URL, independent of any PDF). */
export function labelForUrl(url: string): string {
  for (const { pattern, label } of KNOWN_LINK_LABELS) {
    if (pattern.test(url)) return label;
  }
  try {
    return new URL(url).hostname.replace(/^www\./, "") || "Link";
  } catch {
    return "Link";
  }
}

/** Mirrors pdf-parse's default page-render text join exactly (same
 * newline-on-Y-change logic) so hooking it for annotations doesn't change
 * what extractFromText sees. */
function joinTextItems(items: Array<{ str: string; transform: number[] }>): string {
  let lastY: number | undefined;
  let text = "";
  for (const item of items) {
    text += lastY === item.transform[5] || lastY === undefined ? item.str : `\n${item.str}`;
    lastY = item.transform[5];
  }
  return text;
}

/** The exact resume text a link is attached to, e.g. "LinkedIn" or "Github
 * Repo": a link annotation's rect gives its position on the page, and a text
 * item's transform gives its own, so the text items whose position falls
 * inside the link's rect are what's actually underlined/clickable. This is
 * what makes the link attach to the resume's own wording instead of a
 * synthetic domain-based label. */
function labelFromAnnotationRect(rect: number[], items: Array<{ str: string; transform: number[] }>): string {
  const [x0, y0, x1, y1] = rect;
  return items
    .filter((it) => {
      const x = it.transform[4];
      const y = it.transform[5];
      return x >= x0 - 2 && x <= x1 + 2 && y >= y0 - 2 && y <= y1 + 2;
    })
    .map((it) => it.str)
    .join("")
    .trim();
}

async function extractTextAndLinks(buffer: Buffer): Promise<{ text: string; links: ExtractedLink[] }> {
  const seen = new Set<string>();
  const links: ExtractedLink[] = [];

  // pageData is pdf.js's Page object; @types/pdf-parse types it as `any` since
  // pdf-parse doesn't depend on pdfjs-dist's own types.
  const pagerender = async (pageData: any): Promise<string> => {
    const [textContent, annotations] = await Promise.all([
      pageData.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false }),
      pageData.getAnnotations().catch(() => []),
    ]);

    for (const annotation of annotations) {
      const url = typeof annotation?.url === "string" ? annotation.url.trim() : "";
      if (!url || seen.has(url)) continue;
      seen.add(url);
      const rectLabel = Array.isArray(annotation.rect) ? labelFromAnnotationRect(annotation.rect, textContent.items) : "";
      links.push({ label: rectLabel || labelForUrl(url), url });
    }

    return joinTextItems(textContent.items);
  };

  const { text } = await pdfParse(buffer, { pagerender });
  return { text, links };
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

type SpecialKey = "summary" | "skills" | "experience" | "education";

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

/** Justified-text PDFs sometimes stretch inter-word gaps into literal extra
 * space characters (seen on some templates' "TOOLS & TECHNOLOGIES:" lines
 * specifically, while everything else on the same resume stays single-
 * spaced), so an exact-equality dictionary lookup on a header needs its
 * whitespace collapsed first, or "tools  &  technologies" silently never
 * matches "tools & technologies" and the whole section falls back to being
 * captured generically instead of getting its dedicated parsing. */
function normalizeHeaderText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function findSpecialKey(normalized: string): SpecialKey | null {
  for (const [key, titles] of Object.entries(PARSED_SECTIONS)) {
    if (titles.includes(normalized)) return key as SpecialKey;
  }
  return null;
}

interface DetectedHeader {
  index: number;
  raw: string;
  specialKey: SpecialKey | null;
  /** Content already on the header's own line, past a colon, e.g. the
   * "Adobe Workfront; Quickbase; ..." in "TOOLS & TECHNOLOGIES: Adobe
   * Workfront; Quickbase; ...", when the resume has no separate line for the
   * header, just "HEADER: content" all in one. */
  inlineContent: string | null;
}

function detectHeaders(lines: string[]): DetectedHeader[] {
  const genericTitleSet = new Set(GENERIC_SECTION_TITLES.map((t) => t.toLowerCase()));
  const classifyWholeLine = (text: string): SpecialKey | null | undefined => {
    const normalized = normalizeHeaderText(text);
    const specialKey = findSpecialKey(normalized);
    if (specialKey !== null) return specialKey;
    if (genericTitleSet.has(normalized)) return null;
    if (isGenericHeaderCandidate(text)) return null;
    return undefined; // not a header at all
  };
  // Only an ALL CAPS prefix is eligible for "HEADER: inline content" on one
  // line. A Title Case "Category:" label (e.g. a skills sub-category like
  // "Languages: TypeScript, Python") must never be promoted to a top-level
  // section on its own, only a real header like "TOOLS & TECHNOLOGIES:" is.
  const classifyInlinePrefix = (text: string): SpecialKey | null | undefined => {
    if (!isGenericHeaderCandidate(text)) return undefined;
    return findSpecialKey(normalizeHeaderText(text));
  };

  const seen = new Set<string>();
  const headers: DetectedHeader[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const normalized = normalizeHeaderText(line);

    const wholeLineKey = classifyWholeLine(line);
    if (wholeLineKey !== undefined && !seen.has(normalized)) {
      seen.add(normalized);
      headers.push({ index: i, raw: line, specialKey: wholeLineKey, inlineContent: null });
      continue;
    }

    const inlineSplit = /^(.{2,45}?):\s+(.+)$/.exec(line);
    if (inlineSplit) {
      const prefixNormalized = normalizeHeaderText(inlineSplit[1]);
      const inlineKey = classifyInlinePrefix(inlineSplit[1]);
      if (inlineKey !== undefined && !seen.has(prefixNormalized)) {
        seen.add(prefixNormalized);
        headers.push({ index: i, raw: inlineSplit[1], specialKey: inlineKey, inlineContent: inlineSplit[2].trim() });
      }
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
/** Every bullet-marked line (top-level "●" or sub "o ") becomes its own
 * item, with an unmarked line merged into the previous item as a wrapped
 * continuation (PDF line-wrap, same as parseExperience's bullets), but only
 * when this section actually uses bullet markers at all: an Education-style
 * list of several genuinely separate, unmarked lines ("Degree, Institution"
 * one per line, no markers anywhere) must stay one line per item instead,
 * merging those would glue unrelated entries together. */
function parseGenericSectionItems(lines: string[]): string[] {
  const hasBullets = lines.some((l) => BULLET_LINE_RE.test(l) || SUB_BULLET_RE.test(l));
  const items: string[] = [];

  for (const line of lines) {
    if (BULLET_LINE_RE.test(line)) {
      const text = line.replace(BULLET_LINE_RE, "").trim();
      if (text) items.push(text);
      continue;
    }
    if (SUB_BULLET_RE.test(line)) {
      const text = line.replace(SUB_BULLET_RE, "").trim();
      if (text) items.push(text);
      continue;
    }
    if (hasBullets && items.length > 0) {
      items[items.length - 1] = `${items[items.length - 1]} ${line}`.trim();
    } else {
      items.push(line);
    }
  }

  return items;
}

function buildSections(lines: string[]): { special: Partial<Record<SpecialKey, string>>; generic: ResumeSection[] } {
  const headers = detectHeaders(lines);
  const special: Partial<Record<SpecialKey, string>> = {};
  const generic: ResumeSection[] = [];

  for (let h = 0; h < headers.length; h++) {
    const start = headers[h].index + 1;
    const end = h + 1 < headers.length ? headers[h + 1].index : lines.length;
    const contentLines = headers[h].inlineContent ? [headers[h].inlineContent!, ...lines.slice(start, end)] : lines.slice(start, end);
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
    const rawLine = lines[i].trim();
    if (!rawLine) continue;

    // "Name | phone | email | location | LinkedIn" all on one line: the name
    // is hidden behind SKIP_LINE (the line as a whole has digits/@/"|" in
    // it), so also try just its first segment, but only when the rest of the
    // line actually looks like contact info, a tagline ("Skill | Skill |
    // Skill") is pipe-joined too and must not be mistaken for this.
    const candidateTexts = [rawLine];
    if (rawLine.includes("|")) {
      const [first, ...rest] = rawLine.split("|");
      if (CONTACT_CONTEXT_RE.test(rest.join("|"))) candidateTexts.unshift(first.trim());
    }

    for (const line of candidateTexts) {
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
      if (line !== rawLine) score += 15; // pulled from a confirmed contact-info line, strong signal

      const hasInitial = words.some((w) => /^[A-Z]\.$/.test(w));
      if (hasInitial) score -= 5;
      if (words.length === 4) score -= 3;

      candidates.push({ name: line, idx: i, score });
    }
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

/** Splits on any of `delimiters` like String.split, but ignores delimiters
 * nested inside "(...)" so "AWS(EKS, CloudFormation), Docker" doesn't shred
 * the parenthetical group. Skills lists use "," or ";" depending on the
 * resume template, both are handled the same way. */
function splitTopLevelDelimited(s: string, delimiters: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);

    if (depth === 0 && delimiters.includes(ch)) {
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
  return [match[1], ...match[2].split(/[,;]/)];
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
      const items = cleanSkillItems(splitTopLevelDelimited(subCategoryMatch[2], ",;").flatMap(expandLabeledGroup));
      if (items.length > 0) groups.push({ category: subCategoryMatch[1].trim(), items });
    } else {
      ungrouped.push(...stripped.split(/[,;|•·]+/).flatMap(expandLabeledGroup));
    }
  }

  const ungroupedItems = cleanSkillItems(ungrouped);
  if (ungroupedItems.length > 0) groups.push({ category: "", items: ungroupedItems });

  return groups;
}

// ─── Experience parser ───────────────────────────────────────────────────────

function isSectionHeader(line: string): boolean {
  const normalized = normalizeHeaderText(line);
  return ALL_TITLES.some((t) => normalizeHeaderText(t) === normalized);
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
  // sentence that merely happens to contain a hyphen. Requires actual spaces
  // around the dash (not just \s*): otherwise a bullet mentioning a
  // hyphenated compound word ("multi-tenant", "well-known", ...) matches too,
  // since a bare hyphen has none of the whitespace a real "Role - Company"
  // separator always does.
  const ROLE_DASH_COMPANY_RE = /^([^-–—]{2,60}?)\s+[-–—]\s+([^-–—]{2,80})$/;
  // "Role, Company" (or "Degree, Institution"): the other very common header
  // separator besides "at"/"-". Only a single comma is unambiguous, "A, B, C"
  // could be a role plus a two-part location or company name, not a role and
  // company, so that's left as one combined field rather than guessed at.
  const TITLE_COMMA_SUBTITLE_RE = /^([^,]{2,60}),\s*([^,]{2,80})$/;

  // A lone bullet marker on its own line means two different things
  // depending on the template: sometimes it's a per-job marker with no text
  // of its own (the actual role/company/date follows as normal lines), other
  // times it's the bullet marker and the achievement text just starts fresh
  // on the next line because of how the PDF's columns split. Telling them
  // apart means checking whether that next line looks like a new entry
  // header itself, not just "is there a following line".
  const looksLikeEntryHeader = (line: string): boolean => {
    if (!line || BULLET_LINE_RE.test(line) || SUB_BULLET_RE.test(line)) return false;
    if (ROLE_AT_COMPANY_RE.test(line) && !line.endsWith(".")) return true;
    if (DATE_AT_END_RE.test(line)) return true;
    if (DATE_RANGE_RE.test(line) && line.split(/\s+/).length <= 8) return true;
    const dashMatch = ROLE_DASH_COMPANY_RE.exec(line);
    if (dashMatch && line.split(/\s+/).length <= 12 && !line.endsWith(".")) return true;
    const commaMatch = TITLE_COMMA_SUBTITLE_RE.exec(line);
    if (commaMatch && line.split(/\s+/).length <= 16 && !line.endsWith(".")) return true;
    return false;
  };

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    if (BULLET_LINE_RE.test(line)) {
      const bulletText = line.replace(BULLET_LINE_RE, "").trim();
      if (!bulletText) {
        if (i + 1 < lines.length && !looksLikeEntryHeader(lines[i + 1])) bullets.push(lines[++i]);
        continue;
      }
      if (!looksLikeEntryHeader(bulletText)) {
        bullets.push(bulletText);
        continue;
      }
      // The marker prefixes this entry's own header line directly (common
      // for Education, where a per-entry "●" sits right on the institution
      // + date line, not alone on its own line the way Experience uses it),
      // not a supporting bullet. Falls through to the header checks below
      // using the marker-stripped text, same as any other unmarked line.
      line = bulletText;
    } else if (SUB_BULLET_RE.test(line)) {
      const bulletText = line.replace(SUB_BULLET_RE, "").trim();
      if (!bulletText) continue;
      if (!looksLikeEntryHeader(bulletText)) {
        bullets.push(bulletText);
        continue;
      }
      line = bulletText;
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
    // by the standalone date-range check below. When the prefix itself is
    // "Role, Company" (single comma), split it the same way the standalone
    // comma check below does, rather than dumping the whole thing into role.
    const endDateMatch = DATE_AT_END_RE.exec(line);
    if (endDateMatch) {
      const titlePart = line.slice(0, endDateMatch.index).trim();
      if (titlePart) {
        flush();
        const titleCommaMatch = TITLE_COMMA_SUBTITLE_RE.exec(titlePart);
        if (titleCommaMatch) {
          role = titleCommaMatch[1].trim();
          company = titleCommaMatch[2].trim();
        } else {
          role = titlePart;
        }
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

    // "Role, Company" with no date at all on the line (common for education
    // and certification lists: "Degree, Institution", one per line, often
    // with no date anywhere). Same single-comma guard as above, plus: only
    // once the current entry has no bullets yet. Unlike "at"/"-", a bare
    // comma is common in ordinary prose too, so without this a wrapped
    // bullet continuation that happens to contain one comma (no period, no
    // "at"/"-") would get misread as a new entry, a real header never
    // appears once its own entry's bullets have already started.
    const commaMatch = TITLE_COMMA_SUBTITLE_RE.exec(line);
    if (commaMatch && bullets.length === 0 && line.split(/\s+/).length <= 16 && !line.endsWith(".")) {
      flush();
      role = commaMatch[1].trim();
      company = commaMatch[2].trim();
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
    // Extra descriptive line (prose, or a sub-group label like "Revenue
    // Growth" within one job's bullets) with nothing to safely attach to:
    // ignore it rather than guessing, a wrong guess here would corrupt an
    // already-correctly-parsed entry, which is worse than losing this line.
  }
  flush();

  return jobs.slice(0, 15);
}
