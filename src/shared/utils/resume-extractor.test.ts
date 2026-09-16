import { describe, expect, it } from "vitest";
import { extractFromText } from "@shared/utils/resume-extractor";

describe("extractFromText", () => {
  it("extracts name, email, phone, skills, and experience from a typical resume", () => {
    const text = `
John Smith
john.smith@example.com
+1 415 555 0134

Summary
Backend engineer with 6 years of experience building distributed systems.

Skills
Node.js, TypeScript, PostgreSQL, Docker, AWS

Experience
Senior Backend Engineer at Acme Corp
Jan 2022 - Present
- Led migration from MongoDB to Postgres
- Owned the payments service

Software Engineer at Beta Inc
Jun 2019 - Dec 2021
- Built the notifications pipeline
`.trim();

    const result = extractFromText(text);

    expect(result.full_name).toBe("John Smith");
    expect(result.email).toBe("john.smith@example.com");
    expect(result.phone).toContain("415");
    expect(result.skills).toEqual(expect.arrayContaining(["Node.js", "TypeScript", "PostgreSQL", "Docker", "AWS"]));
    expect(result.experience.length).toBeGreaterThanOrEqual(1);
    expect(result.experience[0].role).toContain("Senior Backend Engineer");
    expect(result.experience[0].company).toContain("Acme Corp");
  });

  it("falls back gracefully when the text has no clear resume structure", () => {
    const result = extractFromText("just some random unstructured text with no sections");

    expect(result.email).toBeNull();
    expect(result.phone).toBeNull();
    expect(result.skills).toEqual([]);
    expect(result.experience).toEqual([]);
    expect(typeof result.full_name).toBe("string");
  });

  it("normalizes an ALL CAPS name to title case", () => {
    const text = `
VIRAL DESHLE
viral@example.com
Software Engineer
`.trim();

    const result = extractFromText(text);
    expect(result.full_name).toBe("Viral Deshle");
  });

  it("skips a section header in favor of a real name line elsewhere", () => {
    const text = `
Skills
Priya Nair
Software Engineer
priya.nair@example.com
`.trim();

    const result = extractFromText(text);
    expect(result.full_name).toBe("Priya Nair");
  });
});
