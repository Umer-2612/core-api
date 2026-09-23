import "reflect-metadata";
import "@shared/config/env";
import { logger } from "@shared/utils/logger";
import { connectDatabase, disconnectDatabase, prisma } from "@/db/prisma";

const QUESTIONS = [
  {
    title: "Two Sum",
    prompt:
      "Given an array of integers `nums` and an integer `target`, return the indices of the two numbers that add up to `target`.\n\n" +
      "Read the array and target from stdin (space-separated numbers on the first line, the target on the second), " +
      "and print the two indices, space-separated, to stdout.\n\n" +
      "Example\nInput:\n2 7 11 15\n9\nOutput:\n0 1",
    difficulty: "easy" as const,
    starter_code: {
      javascript: "// Read nums from the first line, target from the second, print \"i j\"\n",
      python: "# Read nums from the first line, target from the second, print \"i j\"\n",
      java: "// Read nums from the first line, target from the second, print \"i j\"\npublic class Main {\n    public static void main(String[] args) {\n\n    }\n}\n",
      cpp: "// Read nums from the first line, target from the second, print \"i j\"\n#include <iostream>\nusing namespace std;\n\nint main() {\n\n    return 0;\n}\n",
    },
  },
  {
    title: "Reverse Words in a String",
    prompt:
      "Given a string `s`, reverse the order of the words in it. Words are separated by single spaces, " +
      "and the result should have no leading or trailing spaces.\n\n" +
      "Read one line from stdin and print the reversed-word string to stdout.\n\n" +
      "Example\nInput:\nthe sky is blue\nOutput:\nblue is sky the",
    difficulty: "easy" as const,
    starter_code: {
      javascript: "// Read a line from stdin, print the words in reverse order\n",
      python: "# Read a line from stdin, print the words in reverse order\n",
      java: "// Read a line from stdin, print the words in reverse order\npublic class Main {\n    public static void main(String[] args) {\n\n    }\n}\n",
      cpp: "// Read a line from stdin, print the words in reverse order\n#include <iostream>\nusing namespace std;\n\nint main() {\n\n    return 0;\n}\n",
    },
  },
  {
    title: "Valid Parentheses",
    prompt:
      "Given a string containing only the characters `(`, `)`, `{`, `}`, `[`, `]`, determine if it is valid: every " +
      "opening bracket is closed by the same type of bracket, in the correct order.\n\n" +
      "Read one line from stdin and print `true` or `false` to stdout.\n\n" +
      "Example\nInput:\n{[()]}\nOutput:\ntrue",
    difficulty: "medium" as const,
    starter_code: {
      javascript: "// Read a line from stdin, print true or false\n",
      python: "# Read a line from stdin, print true or false\n",
      java: "// Read a line from stdin, print true or false\npublic class Main {\n    public static void main(String[] args) {\n\n    }\n}\n",
      cpp: "// Read a line from stdin, print true or false\n#include <iostream>\nusing namespace std;\n\nint main() {\n\n    return 0;\n}\n",
    },
  },
];

async function main() {
  await connectDatabase();

  const existing = await prisma.question.count();
  if (existing > 0) {
    logger.info(`${existing} question(s) already seeded, skipping.`);
    await disconnectDatabase();
    return;
  }

  await prisma.question.createMany({ data: QUESTIONS });
  logger.info(`Seeded ${QUESTIONS.length} DSA questions.`);
  await disconnectDatabase();
}

main().catch((err) => {
  logger.error(`Seed failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
