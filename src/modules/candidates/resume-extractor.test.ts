import { describe, expect, it } from "vitest";
import { extractFromText } from "@modules/candidates/resume-extractor";

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

  it("extracts a bulleted skills list", () => {
    const text = ["Jane Doe", "", "Skills", "• TypeScript", "• Node.js", "• PostgreSQL"].join("\n");

    const result = extractFromText(text);

    expect(result.skills).toEqual(["TypeScript", "Node.js", "PostgreSQL"]);
  });

  it("extracts a comma-separated skills list under a category label", () => {
    const text = ["Jane Doe", "", "Skills", "Languages: TypeScript, Python, Go"].join("\n");

    const result = extractFromText(text);

    expect(result.skills).toEqual(["TypeScript", "Python", "Go"]);
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

    expect(result.skills).toEqual(["TypeScript"]);
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

    expect(result.skills).toEqual(
      expect.arrayContaining(["AWS", "EKS", "CloudFormation", "EC2", "Azure", "AKS", "Bot Services", "Docker"]),
    );
    expect(result.skills).not.toContain("AWS(EKS");
    expect(result.skills).not.toContain("Azure (AKS");
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

    expect(result.skills).toEqual(
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
  });
});
