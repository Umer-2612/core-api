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
