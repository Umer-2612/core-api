import { describe, expect, it } from "vitest";
import { extractFromText, labelForUrl, type SkillGroup } from "@modules/candidates/resume-extractor";

function flatSkills(groups: SkillGroup[]): string[] {
  return groups.flatMap((g) => g.items);
}

describe("extractFromText", () => {
  it("extracts name, email, and phone from a typical resume header", () => {
    const text = [
      "Jane Doe",
      "Software Engineer",
      "jane.doe@example.com | +1 415-555-0132",
      "",
      "Summary",
      "Backend engineer with 5 years of experience building APIs.",
      "",
      "Skills",
      "TypeScript, Node.js, PostgreSQL, Docker",
      "",
      "Experience",
      "Backend Engineer at Acme Corp",
      "Jan 2021 - Present",
      "- Built the payments service",
      "- Cut API latency by 40%",
    ].join("\n");

    const result = extractFromText(text);

    expect(result.full_name).toBe("Jane Doe");
    expect(result.email).toBe("jane.doe@example.com");
    expect(result.phone).toContain("415-555-0132");
  });

  it("extracts a bulleted skills list with no category as one ungrouped group", () => {
    const text = ["Jane Doe", "", "Skills", "• TypeScript", "• Node.js", "• PostgreSQL"].join("\n");

    const result = extractFromText(text);

    expect(result.skills).toEqual([{ category: "", items: ["TypeScript", "Node.js", "PostgreSQL"] }]);
  });

  it("keeps each skills category as its own group instead of flattening them together", () => {
    const text = ["Jane Doe", "", "Skills", "Languages: TypeScript, Python, Go", "Databases: Postgres, Redis"].join("\n");

    const result = extractFromText(text);

    expect(result.skills).toEqual([
      { category: "Languages", items: ["TypeScript", "Python", "Go"] },
      { category: "Databases", items: ["Postgres", "Redis"] },
    ]);
  });

  it("filters prose fragments and stray punctuation out of the skills list", () => {
    const text = [
      "Jane Doe",
      "",
      "Skills",
      "TypeScript",
      "led a team of engineers", // prose fragment, starts lowercase
      "AWS (Lambda", // stray opening paren
      "1 / 3", // page number
    ].join("\n");

    const result = extractFromText(text);

    expect(flatSkills(result.skills)).toEqual(["TypeScript"]);
  });

  it("extracts a job entry with a role, company, date range, and bullets", () => {
    const text = [
      "Jane Doe",
      "",
      "Experience",
      "Backend Engineer at Acme Corp",
      "Jan 2021 - Present",
      "- Built the payments service",
      "- Cut API latency by 40%",
    ].join("\n");

    const result = extractFromText(text);

    expect(result.experience).toHaveLength(1);
    expect(result.experience[0]).toMatchObject({
      role: "Backend Engineer",
      company: "Acme Corp",
      years: "Jan 2021 - Present",
      bullets: ["Built the payments service", "Cut API latency by 40%"],
    });
  });

  it("extracts multiple job entries, ended by a section header", () => {
    const text = [
      "Jane Doe",
      "",
      "Experience",
      "Backend Engineer at Acme Corp",
      "Jan 2021 - Present",
      "- Built the payments service",
      "Frontend Engineer at Widgets Inc",
      "Jun 2018 - Dec 2020",
      "- Shipped the dashboard redesign",
      "",
      "Education",
      "BS Computer Science",
    ].join("\n");

    const result = extractFromText(text);

    expect(result.experience).toHaveLength(2);
    expect(result.experience[0]?.company).toBe("Acme Corp");
    expect(result.experience[1]?.company).toBe("Widgets Inc");
  });

  it("expands parenthetical sub-groups in a skills category instead of shredding them", () => {
    const text = [
      "Jane Doe",
      "",
      "Skills",
      "Cloud & Infrastructure: AWS(EKS, CloudFormation, EC2), Azure (AKS, Bot Services), Docker",
    ].join("\n");

    const result = extractFromText(text);
    const skills = flatSkills(result.skills);

    expect(skills).toEqual(
      expect.arrayContaining(["AWS", "EKS", "CloudFormation", "EC2", "Azure", "AKS", "Bot Services", "Docker"]),
    );
    expect(skills).not.toContain("AWS(EKS");
    expect(skills).not.toContain("Azure (AKS");
  });

  it("merges a parenthetical skills group that wraps across a PDF line break", () => {
    const text = [
      "Jane Doe",
      "",
      "Skills",
      "Cloud: AWS(EKS, CloudFormation, EC2), Azure (AKS, Bot Services, Pipelines,",
      "Multi Tenant), Docker",
    ].join("\n");

    const result = extractFromText(text);

    expect(flatSkills(result.skills)).toEqual(
      expect.arrayContaining(["Azure", "AKS", "Bot Services", "Pipelines", "Multi Tenant", "Docker"]),
    );
  });

  it("extracts a job entry using '●' bullets and a literal 'o' sub-bullet marker", () => {
    // Common Google Docs → PDF export artifact: top-level bullets render as
    // "●" and second-level bullets render as the plain letter "o".
    const text = [
      "Jane Doe",
      "",
      "Experience",
      "●",
      "Backend Engineer - Acme Corp",
      "Jan 2021 - Present",
      "o Built the payments service",
      "o Cut API latency by 40%",
    ].join("\n");

    const result = extractFromText(text);

    expect(result.experience).toHaveLength(1);
    expect(result.experience[0]).toMatchObject({
      role: "Backend Engineer",
      company: "Acme Corp",
      years: "Jan 2021 - Present",
      bullets: ["Built the payments service", "Cut API latency by 40%"],
    });
  });

  it("merges a wrapped bullet continuation line (no marker) into the previous bullet", () => {
    const text = [
      "Jane Doe",
      "",
      "Experience",
      "Backend Engineer - Acme Corp",
      "Jan 2021 - Present",
      "o Built a changeset content search on OpenSearch with SNS/SQS replication across the",
      "deployment, letting business teams search before/after values instead of opening each by hand.",
    ].join("\n");

    const result = extractFromText(text);

    expect(result.experience[0]?.bullets).toEqual([
      "Built a changeset content search on OpenSearch with SNS/SQS replication across the deployment, " +
        "letting business teams search before/after values instead of opening each by hand.",
    ]);
  });

  it("segments multiple '●' / 'o'-bulleted jobs without cross-contaminating bullets", () => {
    const text = [
      "Jane Doe",
      "",
      "Experience",
      "●",
      "Software Engineer Intern - Apple",
      "Mar 2026 - Sep 2026",
      "o Built scheduled updates across 5 SEO services in Java",
      "o Fixed a Cassandra issue that unblocked 100 stuck changesets",
      "●",
      "Jr Backend Engineer - WebOsmotic Private Limited",
      "Apr 2024 - Jun 2025",
      "o Built a Teams bot as an Azure multi-tenant service",
    ].join("\n");

    const result = extractFromText(text);

    expect(result.experience).toHaveLength(2);
    expect(result.experience[0]).toMatchObject({
      role: "Software Engineer Intern",
      company: "Apple",
      years: "Mar 2026 - Sep 2026",
    });
    expect(result.experience[0]?.bullets).toHaveLength(2);
    expect(result.experience[1]).toMatchObject({
      role: "Jr Backend Engineer",
      company: "WebOsmotic Private Limited",
      years: "Apr 2024 - Jun 2025",
    });
    expect(result.experience[1]?.bullets).toEqual(["Built a Teams bot as an Azure multi-tenant service"]);
  });

  it("doesn't mistake a wrapped bullet continuation containing ' at ' for a new job entry", () => {
    // The continuation ends in "." and has no date near it, a real "Role at
    // Company" header line never does either, so this shouldn't start a new entry.
    const text = [
      "Jane Doe",
      "",
      "Experience",
      "Backend Engineer - Acme Corp",
      "Jan 2021 - Present",
      "o Converted all timestamps to UTC to eliminate",
      "multi-timezone inconsistencies at the source.",
      "o Shipped the payments service",
    ].join("\n");

    const result = extractFromText(text);

    expect(result.experience).toHaveLength(1);
    expect(result.experience[0]?.bullets).toEqual([
      "Converted all timestamps to UTC to eliminate multi-timezone inconsistencies at the source.",
      "Shipped the payments service",
    ]);
  });

  it("falls back to Unknown when every early line looks like contact info", () => {
    const text = ["jane.doe@example.com", "555-0132", "linkedin.com/in/jane123", "Portfolio: janedoe.dev"].join("\n");

    const result = extractFromText(text);

    expect(result.full_name).toBe("Unknown");
  });

  it("normalizes an ALL CAPS name to Title Case", () => {
    const text = ["VIRAL DESHLE", "Software Engineer", "viral@example.com"].join("\n");

    const result = extractFromText(text);

    expect(result.full_name).toBe("Viral Deshle");
  });

  it("returns null for email and phone when neither is present", () => {
    const text = ["Jane Doe", "Software Engineer"].join("\n");

    const result = extractFromText(text);

    expect(result.email).toBeNull();
    expect(result.phone).toBeNull();
  });

  it("returns empty skills and experience when those sections are absent", () => {
    const text = ["Jane Doe", "Software Engineer", "jane@example.com"].join("\n");

    const result = extractFromText(text);

    expect(result.skills).toEqual([]);
    expect(result.experience).toEqual([]);
    expect(result.education).toEqual([]);
    expect(result.sections).toEqual([]);
    expect(result.links).toEqual([]);
  });

  it("labels a known domain (LinkedIn, GitHub, ...) and falls back to the hostname", () => {
    expect(labelForUrl("https://www.linkedin.com/in/jane")).toBe("LinkedIn");
    expect(labelForUrl("https://github.com/jane")).toBe("GitHub");
    expect(labelForUrl("mailto:jane@example.com")).toBe("Email");
    expect(labelForUrl("https://www.janedoe.dev/")).toBe("janedoe.dev");
    expect(labelForUrl("not a url")).toBe("Link");
  });

  it("extracts the name from a 'Name | phone | email | ...' single-line contact header", () => {
    const text = [
      "MEENA CHANDRASEKARAN | 123.456.7890 | meena@example.com | Los Angeles, CA | LinkedIn Profile",
      "Agile Project Management | Resource Planning | Budget Optimization",
      "",
      "Experience",
    ].join("\n");

    const result = extractFromText(text);

    expect(result.full_name).toBe("Meena Chandrasekaran");
  });

  it("doesn't mistake a pipe-joined tagline (no contact info) for a name header", () => {
    const text = ["Software Development | Responsive Web Design | Cross-Functional Collaboration"].join("\n");

    const result = extractFromText(text);

    expect(result.full_name).toBe("Unknown");
  });

  it("splits a comma-separated 'Role, Company' job header with an MM/YYYY date", () => {
    const text = [
      "Jane Doe",
      "",
      "Experience",
      "Production Management Specialist, United States Army 09/2019 – Present",
      "Directed logistics for supply chain operations.",
    ].join("\n");

    const result = extractFromText(text);

    expect(result.experience).toHaveLength(1);
    expect(result.experience[0]).toMatchObject({
      role: "Production Management Specialist",
      company: "United States Army",
      years: "09/2019 – Present",
    });
  });

  it("splits a comma-separated job header with an MM/YY date", () => {
    const text = ["Jane Doe", "", "Experience", "Medical Office Manager, Veridale 05/23 – Present"].join("\n");

    const result = extractFromText(text);

    expect(result.experience[0]).toMatchObject({ role: "Medical Office Manager", company: "Veridale", years: "05/23 – Present" });
  });

  it("recovers a second comma-separated entry with no date, after a normal one", () => {
    // Common in an education/certifications list: several "Title, Issuer"
    // lines in a row, most with no date at all.
    const text = [
      "Jane Doe",
      "",
      "Education",
      "General Education Degree, Foreman College",
      "CPR Certification, American Red Cross",
    ].join("\n");

    const result = extractFromText(text);

    expect(result.education).toHaveLength(2);
    expect(result.education[0]).toMatchObject({ role: "General Education Degree", company: "Foreman College" });
    expect(result.education[1]).toMatchObject({ role: "CPR Certification", company: "American Red Cross" });
  });

  it("treats a lone bullet marker's next line as its text when that line isn't a new entry header", () => {
    // Some templates split the bullet glyph and its text onto separate lines
    // entirely (unlike the "●" / "o" case, there's no marker at all on the
    // text's own line). The distinguishing signal is whether the *next* line
    // after the lone marker looks like a job header itself or not.
    const text = [
      "Jane Doe",
      "",
      "Experience",
      "Backend Engineer, Acme Corp Jan 2021 - Present",
      "•",
      "Built the payments service and cut API latency by shipping a cache layer",
    ].join("\n");

    const result = extractFromText(text);

    expect(result.experience).toHaveLength(1);
    expect(result.experience[0]).toMatchObject({ role: "Backend Engineer", company: "Acme Corp" });
    expect(result.experience[0]?.bullets).toEqual([
      "Built the payments service and cut API latency by shipping a cache layer",
    ]);
  });

  it("doesn't swallow a real job header as bullet text after a lone per-job marker", () => {
    // The opposite case: the lone marker here is a per-job marker with no
    // text of its own, so the next line (a real job header) must still be
    // parsed as one, not consumed as this marker's "bullet".
    const text = ["Jane Doe", "", "Experience", "●", "Backend Engineer - Acme Corp", "Jan 2021 - Present"].join("\n");

    const result = extractFromText(text);

    expect(result.experience).toHaveLength(1);
    expect(result.experience[0]).toMatchObject({ role: "Backend Engineer", company: "Acme Corp", years: "Jan 2021 - Present" });
  });

  it("doesn't mistake a wrapped bullet continuation containing a comma for a new entry", () => {
    // A wrapped continuation with no period, no "at", no "-", but exactly
    // one comma, must still merge into the previous bullet, not start a
    // phantom new entry, once this entry's bullets have already started.
    const text = [
      "Jane Doe",
      "",
      "Experience",
      "Backend Engineer at Acme Corp",
      "Jan 2021 - Present",
      "- Initiated a project automating regulatory document ingestion,",
      "version diffing, and compliance reporting for internal teams",
    ].join("\n");

    const result = extractFromText(text);

    expect(result.experience).toHaveLength(1);
    expect(result.experience[0]?.bullets).toEqual([
      "Initiated a project automating regulatory document ingestion, version diffing, and compliance reporting for internal teams",
    ]);
  });

  it("splits a semicolon-delimited skills list under a category label", () => {
    const text = ["Jane Doe", "", "Skills", "Tools & Technologies: Squarespace; Photoshop; Canva; Square"].join("\n");

    const result = extractFromText(text);

    expect(result.skills).toEqual([{ category: "Tools & Technologies", items: ["Squarespace", "Photoshop", "Canva", "Square"] }]);
  });

  it("recognizes a 'HEADER: inline content' skills line with no separate header line", () => {
    const text = ["Jane Doe", "", "TOOLS & TECHNOLOGIES: Adobe Workfront; Quickbase; Asana"].join("\n");

    const result = extractFromText(text);

    expect(flatSkills(result.skills)).toEqual(expect.arrayContaining(["Adobe Workfront", "Quickbase", "Asana"]));
  });

  it("doesn't promote a Title Case skills sub-category label to its own top-level section", () => {
    // "Languages:" here is a skills sub-category, not a resume section on its
    // own, only an ALL CAPS "HEADER:" line should ever be promoted like that.
    const text = ["Jane Doe", "", "Skills", "Languages: English, French"].join("\n");

    const result = extractFromText(text);

    expect(result.sections).toEqual([]);
    expect(result.skills).toEqual([{ category: "Languages", items: ["English", "French"] }]);
  });

  it("parses education the same structured way as experience (title, subtitle, date)", () => {
    const text = [
      "Jane Doe",
      "",
      "Experience",
      "Backend Engineer at Acme Corp",
      "Jan 2021 - Present",
      "- Built the payments service",
      "",
      "Education",
      "BS Computer Science, State University 2016 - 2020",
    ].join("\n");

    const result = extractFromText(text);

    expect(result.education).toHaveLength(1);
    expect(result.education[0]).toMatchObject({
      role: "BS Computer Science",
      company: "State University",
      years: "2016 - 2020",
    });
    expect(result.sections).toEqual([]);
  });

  it("splits two education entries when the bullet marker prefixes the institution+date line directly", () => {
    // Unlike Experience's lone "●" (always alone on its own line), some
    // templates put the marker right on the institution+date line itself,
    // with the degree on the next, unmarked line. Each "●"-marked line here
    // still ends in a real date, so it must still start a new entry, not
    // get swallowed as a bullet of whatever entry came before it.
    const text = [
      "Jane Doe",
      "",
      "Education",
      "● Atlantic University, Dublin, Ireland Sep 2022 - Sep 2023",
      "Masters of Science in Computing",
      "● Some College, Surat, India Oct 2018 - May 2022",
      "Bachelors of Technology in Computer Engineering",
    ].join("\n");

    const result = extractFromText(text);

    expect(result.education).toHaveLength(2);
    expect(result.education[0]).toMatchObject({ years: "Sep 2022 - Sep 2023", company: "Masters of Science in Computing" });
    expect(result.education[1]).toMatchObject({ years: "Oct 2018 - May 2022", company: "Bachelors of Technology in Computer Engineering" });
  });

  it("doesn't mistake a bullet mentioning a hyphenated word for a new entry header", () => {
    const text = [
      "Jane Doe",
      "",
      "Experience",
      "Backend Engineer - Acme Corp",
      "Jan 2021 - Present",
      "●",
      "Built and deployed a multi-tenant service used across many teams",
    ].join("\n");

    const result = extractFromText(text);

    expect(result.experience).toHaveLength(1);
    expect(result.experience[0]?.bullets).toEqual(["Built and deployed a multi-tenant service used across many teams"]);
  });

  it("splits a dash job header with a space on only one side of the dash", () => {
    // Some resumes are inconsistent about spacing: "Intern- Company" (no
    // space before the dash) rather than "Intern - Company". Must still
    // split, not get swallowed as a bullet of whatever entry came before it.
    const text = [
      "Jane Doe",
      "",
      "Experience",
      "●",
      "Software Engineer Intern- WebOsmotic Private Limited",
      "Oct 2023 - Mar 2024",
      "o Built core backend for an internal platform",
    ].join("\n");

    const result = extractFromText(text);

    expect(result.experience).toHaveLength(1);
    expect(result.experience[0]).toMatchObject({
      role: "Software Engineer Intern",
      company: "WebOsmotic Private Limited",
      years: "Oct 2023 - Mar 2024",
    });
    expect(result.experience[0]?.bullets).toEqual(["Built core backend for an internal platform"]);
  });

  it("captures a known-but-not-specially-parsed section like certificates", () => {
    const text = [
      "Jane Doe",
      "",
      "Certificates",
      "• AWS Certified Solutions Architect",
      "• MongoDB Search Badge",
    ].join("\n");

    const result = extractFromText(text);

    expect(result.sections).toContainEqual({
      heading: "Certificates",
      entries: [
        { title: "AWS Certified Solutions Architect", bullets: [] },
        { title: "MongoDB Search Badge", bullets: [] },
      ],
    });
  });

  it("groups a bulleted generic section's sub-bullets under their own title, merging wrapped lines", () => {
    const text = [
      "Jane Doe",
      "",
      "Projects",
      "● Realtime Meeting Intelligence - Github Repo",
      "o Developed AI meeting assistants for Microsoft Teams, streaming real-time",
      "audio/video to power contextual insights.",
      "o Architected the media pipeline for high-throughput,",
      "low-latency handling.",
      "● Second Project",
      "o A single bullet here",
    ].join("\n");

    const result = extractFromText(text);

    expect(result.sections).toContainEqual({
      heading: "Projects",
      entries: [
        {
          title: "Realtime Meeting Intelligence - Github Repo",
          bullets: [
            "Developed AI meeting assistants for Microsoft Teams, streaming real-time audio/video to power contextual insights.",
            "Architected the media pipeline for high-throughput, low-latency handling.",
          ],
        },
        { title: "Second Project", bullets: ["A single bullet here"] },
      ],
    });
  });

  it("doesn't merge separate unmarked lines in a generic section with no bullets at all", () => {
    // Education-style list: several genuinely distinct "Degree, Institution"
    // lines with no bullet marker anywhere in the section. Must stay one
    // entry per line, not merge into one blob just because they're unmarked.
    const text = [
      "Jane Doe",
      "",
      "Achievements",
      "General Education Degree, Foreman College",
      "CPR Certification, American Red Cross",
    ].join("\n");

    const result = extractFromText(text);

    expect(result.sections).toContainEqual({
      heading: "Achievements",
      entries: [
        { title: "General Education Degree, Foreman College", bullets: [] },
        { title: "CPR Certification, American Red Cross", bullets: [] },
      ],
    });
  });

  it("discovers an ALL CAPS section heading it has no name for, instead of dropping it", () => {
    const text = ["Jane Doe", "", "PATENTS", "• Method for distributed cache invalidation, US1234567"].join("\n");

    const result = extractFromText(text);

    expect(result.sections).toContainEqual({
      heading: "Patents",
      entries: [{ title: "Method for distributed cache invalidation, US1234567", bullets: [] }],
    });
  });

  it("doesn't mistake a Title Case job header for a new section", () => {
    // Only ALL CAPS lines are treated as novel headers; a short Title Case
    // line inside Experience is far more likely to be a job title.
    const text = [
      "Jane Doe",
      "",
      "Experience",
      "Backend Engineer - Acme Corp",
      "Jan 2021 - Present",
      "- Built the payments service",
    ].join("\n");

    const result = extractFromText(text);

    expect(result.sections).toEqual([]);
    expect(result.experience).toHaveLength(1);
  });
});
