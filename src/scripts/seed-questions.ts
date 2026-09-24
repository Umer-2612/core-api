import "reflect-metadata";
import "@shared/config/env";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { toJsonValue } from "@modules/candidates/candidate-profile.repository";
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

interface GeneratedTestCase {
  input: string;
  expected_output: string;
  locked: boolean;
}

/** dsa-test-cases.generated.json (verified test cases per question title, see that
 * file's generation notes) is optional at the type level: seeding still works with
 * empty test_cases before it exists, it just means no round can be graded yet. */
function loadGeneratedTestCases(): Record<string, GeneratedTestCase[]> {
  const path = join(__dirname, "dsa-test-cases.generated.json");
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf-8")) as Record<string, GeneratedTestCase[]>;
}

/** Real, runnable starter code per language: stdin is already read into `lines`
 * before the candidate's code runs, and the whole thing compiles and echoes the
 * input straight back out of the box, so hitting Run before writing anything
 * still works, it just isn't the right answer yet. One instruction line per
 * question, embedded as the comment marking where to write the real logic,
 * instead of hand-writing six near-identical scaffolds every time. */
function starterCode(instruction: string): Record<string, string> {
  return {
    javascript: `const lines = require("fs").readFileSync(0, "utf-8").split("\\n");

// ${instruction}
console.log(lines.join("\\n"));
`,
    python: `import sys

lines = sys.stdin.read().split("\\n")

# ${instruction}
print("\\n".join(lines))
`,
    java: `import java.io.*;
import java.util.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        List<String> lines = new ArrayList<>();
        String line;
        while ((line = br.readLine()) != null) lines.add(line);

        // ${instruction}
        System.out.println(String.join("\\n", lines));
    }
}
`,
    cpp: `#include <iostream>
#include <vector>
#include <string>
using namespace std;

int main() {
    vector<string> lines;
    string line;
    while (getline(cin, line)) lines.push_back(line);

    // ${instruction}
    for (auto& l : lines) cout << l << "\\n";
    return 0;
}
`,
    c: `#include <stdio.h>
#include <string.h>

int main() {
    char line[4096];

    // ${instruction}
    while (fgets(line, sizeof(line), stdin)) {
        printf("%s", line);
    }
    return 0;
}
`,
    go: `package main

import (
	"bufio"
	"fmt"
	"os"
)

func main() {
	scanner := bufio.NewScanner(os.Stdin)
	var lines []string
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
	}

	// ${instruction}
	for _, l := range lines {
		fmt.Println(l)
	}
}
`,
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
  {
    title: "Longest Increasing Subsequence",
    prompt:
      "Given an array of integers, find the length of the longest strictly increasing subsequence (elements " +
      "don't need to be contiguous, just in increasing order and in their original relative order).\n\n" +
      "Read the array (space-separated) from stdin, print that length.\n\n" +
      "Example\nInput:\n10 9 2 5 3 7 101 18\nOutput:\n4",
    difficulty: "medium",
    tags: ["dynamic-programming", "arrays"],
    starter_code: starterCode("Read the array, print the length of the longest increasing subsequence"),
  },
  {
    title: "Edit Distance",
    prompt:
      "Given two strings, find the minimum number of single-character insertions, deletions, or substitutions " +
      "needed to turn the first string into the second.\n\n" +
      "Read two lines from stdin, print the minimum number of operations.\n\n" +
      "Example\nInput:\ncat\ncut\nOutput:\n1",
    difficulty: "hard",
    tags: ["dynamic-programming", "strings"],
    starter_code: starterCode("Read two lines, print the minimum edit distance between them"),
  },
  {
    title: "0/1 Knapsack",
    prompt:
      "You have a knapsack with a weight capacity and a list of items, each with a weight and a value. Each " +
      "item can be taken at most once. Maximize the total value without exceeding the capacity.\n\n" +
      "Read the item count `n` and capacity on the first line, then `n` lines of `weight value`, print the " +
      "maximum achievable value.\n\n" +
      "Example\nInput:\n3 50\n10 60\n20 100\n30 120\nOutput:\n220",
    difficulty: "hard",
    tags: ["dynamic-programming"],
    starter_code: starterCode("Read the items and capacity, print the maximum value that fits"),
  },
  {
    title: "Next Greater Element",
    prompt:
      "Given an array, for each element find the next element to its right that's strictly greater than it, " +
      "or `-1` if none exists.\n\n" +
      "Read the array (space-separated) from stdin, print the result array, space-separated.\n\n" +
      "Example\nInput:\n4 5 2 10 8\nOutput:\n5 10 10 -1 -1",
    difficulty: "medium",
    tags: ["stack", "arrays"],
    starter_code: starterCode("Read the array, print each element's next greater element or -1"),
  },
  {
    title: "Tree Height",
    prompt:
      "A tree with `n` nodes, numbered `1` to `n`, rooted at node `1`, is described by `n - 1` parent-child " +
      "edges. Find its height: the number of edges on the longest path from the root to any leaf.\n\n" +
      "Read `n` on the first line, then `n - 1` lines of `parent child`, print the height.\n\n" +
      "Example\nInput:\n6\n1 2\n1 3\n2 4\n2 5\n3 6\nOutput:\n2",
    difficulty: "medium",
    tags: ["trees", "recursion"],
    starter_code: starterCode("Read the tree's edges, print its height in edges"),
  },
  {
    title: "Kth Smallest Element",
    prompt:
      "Given an array of integers and an integer `k`, find the kth smallest element (1st smallest is the " +
      "minimum).\n\n" +
      "Read the array on line one (space-separated), `k` on line two, print the kth smallest value.\n\n" +
      "Example\nInput:\n7 10 4 3 20 15\n3\nOutput:\n7",
    difficulty: "easy",
    tags: ["arrays", "sorting"],
    starter_code: starterCode("Read the array and k, print the kth smallest element"),
  },
  {
    title: "Word Break",
    prompt:
      "Given a string and a dictionary of words, determine whether the string can be fully split into a " +
      "sequence of one or more dictionary words (words may be reused).\n\n" +
      "Read the string on line one, the dictionary (space-separated) on line two, print `true` or `false`.\n\n" +
      "Example\nInput:\npineapple\npine apple\nOutput:\ntrue",
    difficulty: "hard",
    tags: ["dynamic-programming", "strings"],
    starter_code: starterCode("Read the string and dictionary, print whether it can be segmented"),
  },
  {
    title: "Count Subsets With a Given Sum",
    prompt:
      "Given an array of positive integers and a target sum, count how many subsets (by position, so " +
      "duplicate values at different positions count separately) add up exactly to the target.\n\n" +
      "Read the array on line one (space-separated), the target on line two, print the count.\n\n" +
      "Example\nInput:\n1 2 3 3\n6\nOutput:\n3",
    difficulty: "hard",
    tags: ["dynamic-programming", "backtracking"],
    starter_code: starterCode("Read the array and target, print how many subsets sum to it"),
  },
  {
    title: "Combination Sum Count",
    prompt:
      "Given an array of distinct positive integers and a target, count how many unique combinations of them " +
      "(each number reusable any number of times, order doesn't matter) add up exactly to the target.\n\n" +
      "Read the array on line one (space-separated), the target on line two, print the count.\n\n" +
      "Example\nInput:\n2 3 6 7\n7\nOutput:\n2",
    difficulty: "hard",
    tags: ["backtracking", "recursion"],
    starter_code: starterCode("Read the array and target, print how many combinations (reuse allowed) sum to it"),
  },
  {
    title: "Spiral Matrix Order",
    prompt:
      "Given a matrix, return all of its elements in spiral order, starting from the top-left and moving " +
      "clockwise, spiraling inward.\n\n" +
      "Read the row and column counts on the first line, then that many rows of space-separated values, print " +
      "the elements in spiral order, space-separated.\n\n" +
      "Example\nInput:\n3 3\n1 2 3\n4 5 6\n7 8 9\nOutput:\n1 2 3 6 9 8 7 4 5",
    difficulty: "medium",
    tags: ["matrix", "arrays"],
    starter_code: starterCode("Read the matrix, print its elements in clockwise spiral order"),
  },
  {
    title: "Rotate Matrix 90 Degrees",
    prompt:
      "Given an `n x n` matrix, rotate it 90 degrees clockwise, in place conceptually (you can build a new one).\n\n" +
      "Read `n` on the first line, then `n` rows of space-separated values, print the rotated matrix, one row " +
      "per line.\n\n" +
      "Example\nInput:\n2\n1 2\n3 4\nOutput:\n3 1\n4 2",
    difficulty: "medium",
    tags: ["matrix"],
    starter_code: starterCode("Read the matrix, print it rotated 90 degrees clockwise"),
  },
  {
    title: "Find the Duplicate Number",
    prompt:
      "You're given `n + 1` integers, each in the range `1` to `n`, with exactly one value repeated (possibly " +
      "more than once). Find that repeated value.\n\n" +
      "Read the integers (space-separated) from stdin, print the duplicate.\n\n" +
      "Example\nInput:\n1 3 4 2 2\nOutput:\n2",
    difficulty: "medium",
    tags: ["arrays", "two-pointers"],
    starter_code: starterCode("Read the integers, print the one that repeats"),
  },
  {
    title: "Container With Most Water",
    prompt:
      "Given an array of non-negative heights, where each represents a vertical line at that index, find two " +
      "lines that together with the x-axis form a container holding the most water. Print the maximum area.\n\n" +
      "Read the heights (space-separated) from stdin, print the maximum area.\n\n" +
      "Example\nInput:\n1 2 4 3\nOutput:\n4",
    difficulty: "medium",
    tags: ["arrays", "two-pointers"],
    starter_code: starterCode("Read the heights, print the maximum container area"),
  },
  {
    title: "Trapping Rain Water",
    prompt:
      "Given an array of non-negative heights representing an elevation map, compute how much rainwater it " +
      "can trap between the bars after it rains.\n\n" +
      "Read the heights (space-separated) from stdin, print the total trapped water.\n\n" +
      "Example\nInput:\n3 0 2 0 4\nOutput:\n7",
    difficulty: "hard",
    tags: ["arrays", "two-pointers", "stack"],
    starter_code: starterCode("Read the heights, print the total trapped rainwater"),
  },
  {
    title: "Course Schedule",
    prompt:
      "There are `n` courses numbered `0` to `n - 1` and a list of prerequisite pairs `a b`, meaning course " +
      "`a` requires course `b` to be completed first. Determine whether it's possible to finish all courses " +
      "(i.e. there's no cycle in the prerequisites).\n\n" +
      "Read `n` on line one, the number of prerequisite pairs `m` on line two, then `m` lines of `a b`, print " +
      "`true` or `false`.\n\n" +
      "Example\nInput:\n4\n3\n1 0\n2 1\n3 2\nOutput:\ntrue",
    difficulty: "hard",
    tags: ["graphs"],
    starter_code: starterCode("Read the courses and prerequisites, print whether all can be completed"),
  },
  {
    title: "Shortest Path in an Unweighted Graph",
    prompt:
      "Given an undirected, unweighted graph and two nodes, find the length (number of edges) of the shortest " +
      "path between them, or `-1` if they aren't connected.\n\n" +
      "Read `n` (nodes) and `m` (edges) on the first line, then `m` lines of `u v`, then a line with the " +
      "source and destination, print the shortest path length.\n\n" +
      "Example\nInput:\n5 5\n0 1\n1 2\n2 3\n3 4\n0 4\n0 3\nOutput:\n2",
    difficulty: "medium",
    tags: ["graphs"],
    starter_code: starterCode("Read the graph and the two nodes, print the shortest path length via BFS"),
  },
  {
    title: "GCD and LCM",
    prompt:
      "Given two positive integers, find their greatest common divisor and least common multiple.\n\n" +
      "Read two integers (space-separated) from stdin, print the GCD and LCM, space-separated.\n\n" +
      "Example\nInput:\n12 18\nOutput:\n6 36",
    difficulty: "easy",
    tags: ["math"],
    starter_code: starterCode("Read two integers, print their GCD and LCM"),
  },
  {
    title: "Count Primes",
    prompt:
      "Given a non-negative integer `n`, count how many prime numbers are less than or equal to `n`.\n\n" +
      "Read `n` from stdin, print that count.\n\n" +
      "Example\nInput:\n10\nOutput:\n4",
    difficulty: "easy",
    tags: ["math"],
    starter_code: starterCode("Read n, print how many primes are <= n"),
  },
  {
    title: "Single Number",
    prompt:
      "Given an array where every element appears exactly twice except for one, which appears exactly once, " +
      "find that single element. Aim for an approach that doesn't use extra space for counting.\n\n" +
      "Read the array (space-separated) from stdin, print the single element.\n\n" +
      "Example\nInput:\n4 1 2 1 2\nOutput:\n4",
    difficulty: "easy",
    tags: ["bit-manipulation", "arrays"],
    starter_code: starterCode("Read the array, print the element that doesn't have a pair"),
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

  const generatedTestCases = loadGeneratedTestCases();
  const rawData = QUESTIONS.map((question) => ({
    ...question,
    test_cases: generatedTestCases[question.title] ?? [],
  }));
  const missingTestCases = rawData.filter((q) => q.test_cases.length === 0).map((q) => q.title);

  await prisma.question.createMany({
    data: rawData.map((question) => ({ ...question, test_cases: toJsonValue(question.test_cases) })),
  });
  logger.info(`Seeded ${QUESTIONS.length} DSA questions.`);
  if (missingTestCases.length > 0) {
    logger.warn(`${missingTestCases.length} question(s) seeded with no test cases yet: ${missingTestCases.join(", ")}`);
  }
  await disconnectDatabase();
}

main().catch((err) => {
  logger.error(`Seed failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
