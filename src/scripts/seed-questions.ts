import "reflect-metadata";
import "@shared/config/env";
import { logger } from "@shared/utils/logger";
import { connectDatabase, disconnectDatabase, prisma } from "@/db/prisma";

type Difficulty = "easy" | "medium" | "hard";

interface SeedQuestion {
  title: string;
  prompt: string;
  difficulty: Difficulty;
  tags: string[];
  starter_code: Record<string, string>;
}

/** All starter code is just a same-shaped "read this, print that" reminder per language,
 * not real boilerplate, the candidate writes the whole program. One instruction line per
 * question instead of repeating four near-identical comments by hand each time. */
function starterCode(instruction: string): Record<string, string> {
  return {
    javascript: `// ${instruction}\n`,
    python: `# ${instruction}\n`,
    java: `// ${instruction}\npublic class Main {\n    public static void main(String[] args) {\n\n    }\n}\n`,
    cpp: `// ${instruction}\n#include <iostream>\nusing namespace std;\n\nint main() {\n\n    return 0;\n}\n`,
  };
}

const QUESTIONS: SeedQuestion[] = [
  {
    title: "Two Sum",
    prompt:
      "Given an array of integers `nums` and an integer `target`, return the indices of the two numbers that add up to `target`.\n\n" +
      "Read the array and target from stdin (space-separated numbers on the first line, the target on the second), " +
      "and print the two indices, space-separated, to stdout.\n\n" +
      "Example\nInput:\n2 7 11 15\n9\nOutput:\n0 1",
    difficulty: "easy",
    tags: ["arrays", "hash-map"],
    starter_code: starterCode('Read nums from the first line, target from the second, print "i j"'),
  },
  {
    title: "Reverse Words in a String",
    prompt:
      "Given a string `s`, reverse the order of the words in it. Words are separated by single spaces, " +
      "and the result should have no leading or trailing spaces.\n\n" +
      "Read one line from stdin and print the reversed-word string to stdout.\n\n" +
      "Example\nInput:\nthe sky is blue\nOutput:\nblue is sky the",
    difficulty: "easy",
    tags: ["strings"],
    starter_code: starterCode("Read a line from stdin, print the words in reverse order"),
  },
  {
    title: "Valid Parentheses",
    prompt:
      "Given a string containing only the characters `(`, `)`, `{`, `}`, `[`, `]`, determine if it is valid: every " +
      "opening bracket is closed by the same type of bracket, in the correct order.\n\n" +
      "Read one line from stdin and print `true` or `false` to stdout.\n\n" +
      "Example\nInput:\n{[()]}\nOutput:\ntrue",
    difficulty: "medium",
    tags: ["stack", "strings"],
    starter_code: starterCode("Read a line from stdin, print true or false"),
  },
  {
    title: "Maximum Subarray Sum",
    prompt:
      "Given an array of integers (possibly negative), find the largest sum of any contiguous subarray.\n\n" +
      "Read the array (space-separated) from stdin, print the maximum subarray sum.\n\n" +
      "Example\nInput:\n-2 1 -3 4 -1 2 1 -5 4\nOutput:\n6",
    difficulty: "medium",
    tags: ["arrays", "dynamic-programming"],
    starter_code: starterCode("Read the array, print the maximum contiguous-subarray sum"),
  },
  {
    title: "Longest Substring Without Repeating Characters",
    prompt:
      "Given a string, find the length of the longest substring that has no repeated characters.\n\n" +
      "Read one line from stdin, print that length.\n\n" +
      "Example\nInput:\nabcabcbb\nOutput:\n3",
    difficulty: "medium",
    tags: ["strings", "sliding-window"],
    starter_code: starterCode("Read a line, print the length of the longest substring with no repeats"),
  },
  {
    title: "Binary Search",
    prompt:
      "Given a sorted array of integers and a target value, return the index of the target, or -1 if it isn't present.\n\n" +
      "Read the sorted array (space-separated) on the first line, the target on the second, print the index.\n\n" +
      "Example\nInput:\n1 3 5 7 9 11\n7\nOutput:\n3",
    difficulty: "easy",
    tags: ["binary-search", "arrays"],
    starter_code: starterCode("Read the sorted array and target, print the target's index or -1"),
  },
  {
    title: "Merge Two Sorted Arrays",
    prompt:
      "Given two arrays already sorted in ascending order, merge them into one sorted array.\n\n" +
      "Read the first array on line one, the second on line two (both space-separated), print the merged, " +
      "sorted, space-separated array.\n\n" +
      "Example\nInput:\n1 3 5\n2 4 6\nOutput:\n1 2 3 4 5 6",
    difficulty: "easy",
    tags: ["arrays", "two-pointers"],
    starter_code: starterCode("Read two sorted arrays, print them merged and sorted"),
  },
  {
    title: "Nth Fibonacci Number",
    prompt:
      "The Fibonacci sequence starts 0, 1, 1, 2, 3, 5, 8, ... where each number is the sum of the two before it.\n\n" +
      "Read an integer `n` (0-indexed) from stdin, print the nth Fibonacci number. Use an iterative approach, " +
      "not naive recursion, `n` can be large enough that recursion would be too slow.\n\n" +
      "Example\nInput:\n10\nOutput:\n55",
    difficulty: "easy",
    tags: ["dynamic-programming", "math"],
    starter_code: starterCode("Read n, print the nth Fibonacci number iteratively"),
  },
  {
    title: "Palindrome Check",
    prompt:
      "Given a string, determine whether it reads the same forwards and backwards, ignoring case and spaces.\n\n" +
      "Read one line from stdin, print `true` or `false`.\n\n" +
      "Example\nInput:\nA man a plan a canal Panama\nOutput:\ntrue",
    difficulty: "easy",
    tags: ["strings", "two-pointers"],
    starter_code: starterCode("Read a line, print true or false, ignoring case and spaces"),
  },
  {
    title: "Climbing Stairs",
    prompt:
      "You're climbing a staircase with `n` steps. Each move you can climb either 1 or 2 steps. " +
      "Count how many distinct ways there are to reach the top.\n\n" +
      "Read `n` from stdin, print the number of distinct ways.\n\n" +
      "Example\nInput:\n5\nOutput:\n8",
    difficulty: "easy",
    tags: ["dynamic-programming"],
    starter_code: starterCode("Read n, print the number of distinct ways to climb n stairs"),
  },
  {
    title: "Find the Missing Number",
    prompt:
      "You're given `n` distinct integers taken from the range `0` to `n` inclusive, with exactly one number missing.\n\n" +
      "Read the `n` integers (space-separated) from stdin, print the missing number.\n\n" +
      "Example\nInput:\n3 0 1\nOutput:\n2",
    difficulty: "easy",
    tags: ["arrays", "math"],
    starter_code: starterCode("Read the numbers, print the one missing from the 0..n range"),
  },
  {
    title: "Most Frequent Character",
    prompt:
      "Given a string, find the character that appears most often. If there's a tie, print whichever of the " +
      "tied characters appears first in the string.\n\n" +
      "Read one line from stdin, print that single character.\n\n" +
      "Example\nInput:\nabracadabra\nOutput:\na",
    difficulty: "easy",
    tags: ["strings", "hash-map"],
    starter_code: starterCode("Read a line, print its most frequent character (first on a tie)"),
  },
  {
    title: "Valid Anagram",
    prompt:
      "Given two strings, determine whether the second is an anagram of the first (same letters, same counts, " +
      "any order).\n\n" +
      "Read two lines from stdin, print `true` or `false`.\n\n" +
      "Example\nInput:\nlisten\nsilent\nOutput:\ntrue",
    difficulty: "easy",
    tags: ["strings", "hash-map"],
    starter_code: starterCode("Read two lines, print whether the second is an anagram of the first"),
  },
  {
    title: "Rotate Array",
    prompt:
      "Given an array and an integer `k`, rotate the array to the right by `k` positions.\n\n" +
      "Read the array on line one (space-separated), `k` on line two, print the rotated array, space-separated.\n\n" +
      "Example\nInput:\n1 2 3 4 5 6 7\n3\nOutput:\n5 6 7 1 2 3 4",
    difficulty: "medium",
    tags: ["arrays"],
    starter_code: starterCode("Read the array and k, print the array rotated right by k"),
  },
  {
    title: "Number of Islands",
    prompt:
      "Given a grid of `0`s (water) and `1`s (land), count the number of islands. An island is a group of `1`s " +
      "connected horizontally or vertically (not diagonally).\n\n" +
      "Read the row and column counts on the first line, then that many lines of space-separated `0`/`1` values, " +
      "print the number of islands.\n\n" +
      "Example\nInput:\n3 3\n1 1 0\n0 1 0\n0 0 1\nOutput:\n2",
    difficulty: "hard",
    tags: ["graphs", "matrix"],
    starter_code: starterCode("Read the grid, print the number of connected land islands"),
  },
  {
    title: "Merge Overlapping Intervals",
    prompt:
      "Given a list of intervals, merge every pair that overlaps and return the resulting non-overlapping " +
      "intervals, sorted by start.\n\n" +
      "Read the interval count on the first line, then that many lines of `start end`, print the merged " +
      "intervals in the same `start end` format, one per line, sorted.\n\n" +
      "Example\nInput:\n4\n1 3\n2 6\n8 10\n15 18\nOutput:\n1 6\n8 10\n15 18",
    difficulty: "medium",
    tags: ["arrays", "sorting"],
    starter_code: starterCode("Read the intervals, print the merged, non-overlapping, sorted intervals"),
  },
  {
    title: "Longest Common Prefix",
    prompt:
      "Given a list of strings, find the longest string that is a prefix of every one of them. Print an empty " +
      "line if there's no common prefix.\n\n" +
      "Read the string count on the first line, then that many strings, one per line, print the longest common " +
      "prefix.\n\n" +
      "Example\nInput:\n3\nflower\nflow\nflight\nOutput:\nfl",
    difficulty: "easy",
    tags: ["strings"],
    starter_code: starterCode("Read the strings, print their longest common prefix"),
  },
  {
    title: "Kth Largest Element",
    prompt:
      "Given an array of integers and an integer `k`, find the kth largest element (1st largest is the maximum).\n\n" +
      "Read the array on line one (space-separated), `k` on line two, print the kth largest value.\n\n" +
      "Example\nInput:\n3 2 1 5 6 4\n2\nOutput:\n5",
    difficulty: "medium",
    tags: ["arrays", "sorting"],
    starter_code: starterCode("Read the array and k, print the kth largest element"),
  },
  {
    title: "Minimum Coins for an Amount",
    prompt:
      "Given a target amount and a list of coin denominations (unlimited supply of each), find the minimum " +
      "number of coins needed to make exactly that amount, or `-1` if it can't be made.\n\n" +
      "Read the amount on line one, the denominations on line two (space-separated), print the minimum coin " +
      "count.\n\n" +
      "Example\nInput:\n11\n1 2 5\nOutput:\n3",
    difficulty: "hard",
    tags: ["dynamic-programming", "greedy"],
    starter_code: starterCode("Read the amount and denominations, print the minimum number of coins"),
  },
  {
    title: "Count Set Bits",
    prompt:
      "Given a non-negative integer, count how many `1` bits are in its binary representation.\n\n" +
      "Read the integer from stdin, print the count of set bits.\n\n" +
      "Example\nInput:\n29\nOutput:\n4",
    difficulty: "easy",
    tags: ["bit-manipulation", "math"],
    starter_code: starterCode("Read the integer, print how many bits in its binary form are 1"),
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
