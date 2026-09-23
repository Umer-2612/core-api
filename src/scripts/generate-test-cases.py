#!/usr/bin/env python3
"""Generates dsa-test-cases.generated.json: 15-20 verified test cases per question
in seed-questions.ts. Each case's expected_output is computed by actually running a
reference solution through judge-service's live /execute endpoint (never hand-computed),
so run judge-service locally first (npm run dev in judge-service, or via docker compose)
before running this. Re-run whenever a question's prompt/format changes or new questions
are added (extend SOL and GENERATORS below for each new title).

    python3 src/scripts/generate-test-cases.py
"""
import json
import random
import urllib.request

random.seed(42)

JUDGE_URL = "http://localhost:4001/execute"


def run(code, stdin):
    body = json.dumps({"language_id": 71, "code": code, "stdin": stdin}).encode()
    req = urllib.request.Request(JUDGE_URL, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())
    if not data.get("success") or not data.get("status") or data["status"].get("description") != "Accepted":
        raise RuntimeError(f"Run failed: {json.dumps(data)[:500]} | stdin={stdin[:200]}")
    return data["stdout"]


# ---- reference solutions ----

SOL = {}

SOL["Two Sum"] = """
lines = __import__('sys').stdin.read().split('\\n')
nums = list(map(int, lines[0].split()))
target = int(lines[1])
seen = {}
for i, n in enumerate(nums):
    c = target - n
    if c in seen:
        print(seen[c], i)
        break
    seen[n] = i
"""

SOL["Reverse Words in a String"] = """
s = input()
print(' '.join(s.split()[::-1]))
"""

SOL["Valid Parentheses"] = """
s = input()
stack = []
pairs = {')':'(', ']':'[', '}':'{'}
valid = True
for c in s:
    if c in '([{':
        stack.append(c)
    elif c in ')]}':
        if not stack or stack.pop() != pairs[c]:
            valid = False
            break
print(str(valid and not stack).lower())
"""

SOL["Maximum Subarray Sum"] = """
nums = list(map(int, input().split()))
best = cur = nums[0]
for x in nums[1:]:
    cur = max(x, cur + x)
    best = max(best, cur)
print(best)
"""

SOL["Longest Substring Without Repeating Characters"] = """
s = input()
seen = {}
start = 0
best = 0
for i, c in enumerate(s):
    if c in seen and seen[c] >= start:
        start = seen[c] + 1
    seen[c] = i
    best = max(best, i - start + 1)
print(best)
"""

SOL["Binary Search"] = """
nums = list(map(int, input().split()))
target = int(input())
lo, hi = 0, len(nums) - 1
ans = -1
while lo <= hi:
    mid = (lo + hi) // 2
    if nums[mid] == target:
        ans = mid
        break
    elif nums[mid] < target:
        lo = mid + 1
    else:
        hi = mid - 1
print(ans)
"""

SOL["Merge Two Sorted Arrays"] = """
a = list(map(int, input().split()))
b = list(map(int, input().split()))
print(' '.join(map(str, sorted(a + b))))
"""

SOL["Nth Fibonacci Number"] = """
n = int(input())
a, b = 0, 1
for _ in range(n):
    a, b = b, a + b
print(a)
"""

SOL["Palindrome Check"] = """
s = input()
cleaned = ''.join(c.lower() for c in s if c != ' ')
print(str(cleaned == cleaned[::-1]).lower())
"""

SOL["Climbing Stairs"] = """
n = int(input())
a, b = 1, 1
for _ in range(n):
    a, b = b, a + b
print(a)
"""

SOL["Find the Missing Number"] = """
nums = list(map(int, input().split()))
n = len(nums)
print(n * (n + 1) // 2 - sum(nums))
"""

SOL["Most Frequent Character"] = """
s = input()
counts = {}
for c in s:
    counts[c] = counts.get(c, 0) + 1
best_c, best_n = None, -1
for c in s:
    if counts[c] > best_n:
        best_n = counts[c]
        best_c = c
print(best_c)
"""

SOL["Valid Anagram"] = """
a = input()
b = input()
print(str(sorted(a) == sorted(b)).lower())
"""

SOL["Rotate Array"] = """
nums = list(map(int, input().split()))
k = int(input())
n = len(nums)
k = k % n if n else 0
rotated = nums[-k:] + nums[:-k] if k else nums[:]
print(' '.join(map(str, rotated)))
"""

SOL["Number of Islands"] = """
import sys
data = sys.stdin.read().split('\\n')
r, c = map(int, data[0].split())
grid = [list(map(int, data[1 + i].split())) for i in range(r)]
seen = [[False]*c for _ in range(r)]
count = 0
for i in range(r):
    for j in range(c):
        if grid[i][j] == 1 and not seen[i][j]:
            count += 1
            stack = [(i, j)]
            seen[i][j] = True
            while stack:
                x, y = stack.pop()
                for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
                    nx, ny = x+dx, y+dy
                    if 0 <= nx < r and 0 <= ny < c and grid[nx][ny] == 1 and not seen[nx][ny]:
                        seen[nx][ny] = True
                        stack.append((nx, ny))
print(count)
"""

SOL["Merge Overlapping Intervals"] = """
import sys
data = sys.stdin.read().split('\\n')
n = int(data[0])
intervals = []
for i in range(n):
    s, e = map(int, data[1+i].split())
    intervals.append((s, e))
intervals.sort()
merged = []
for s, e in intervals:
    if merged and s <= merged[-1][1]:
        merged[-1] = (merged[-1][0], max(merged[-1][1], e))
    else:
        merged.append((s, e))
for s, e in merged:
    print(s, e)
"""

SOL["Longest Common Prefix"] = """
import sys
data = sys.stdin.read().split('\\n')
n = int(data[0])
words = [data[1+i] for i in range(n)]
prefix = words[0] if words else ''
for w in words[1:]:
    while not w.startswith(prefix):
        prefix = prefix[:-1]
        if not prefix:
            break
    if not prefix:
        break
print(prefix)
"""

SOL["Kth Largest Element"] = """
nums = list(map(int, input().split()))
k = int(input())
print(sorted(nums, reverse=True)[k-1])
"""

SOL["Minimum Coins for an Amount"] = """
amount = int(input())
coins = list(map(int, input().split()))
INF = float('inf')
dp = [0] + [INF] * amount
for i in range(1, amount+1):
    for c in coins:
        if c <= i and dp[i-c] + 1 < dp[i]:
            dp[i] = dp[i-c] + 1
print(dp[amount] if dp[amount] != INF else -1)
"""

SOL["Count Set Bits"] = """
n = int(input())
print(bin(n).count('1'))
"""

SOL["Longest Increasing Subsequence"] = """
nums = list(map(int, input().split()))
if not nums:
    print(0)
else:
    dp = [1]*len(nums)
    for i in range(len(nums)):
        for j in range(i):
            if nums[j] < nums[i]:
                dp[i] = max(dp[i], dp[j]+1)
    print(max(dp))
"""

SOL["Edit Distance"] = """
a = input()
b = input()
m, n = len(a), len(b)
dp = [[0]*(n+1) for _ in range(m+1)]
for i in range(m+1):
    dp[i][0] = i
for j in range(n+1):
    dp[0][j] = j
for i in range(1, m+1):
    for j in range(1, n+1):
        if a[i-1] == b[j-1]:
            dp[i][j] = dp[i-1][j-1]
        else:
            dp[i][j] = 1 + min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
print(dp[m][n])
"""

SOL["0/1 Knapsack"] = """
import sys
data = sys.stdin.read().split('\\n')
n, cap = map(int, data[0].split())
items = []
for i in range(n):
    w, v = map(int, data[1+i].split())
    items.append((w, v))
dp = [0]*(cap+1)
for w, v in items:
    for c in range(cap, w-1, -1):
        dp[c] = max(dp[c], dp[c-w] + v)
print(dp[cap])
"""

SOL["Next Greater Element"] = """
nums = list(map(int, input().split()))
n = len(nums)
res = [-1]*n
stack = []
for i in range(n):
    while stack and nums[stack[-1]] < nums[i]:
        res[stack.pop()] = nums[i]
    stack.append(i)
print(' '.join(map(str, res)))
"""

SOL["Tree Height"] = """
import sys
data = sys.stdin.read().split('\\n')
n = int(data[0])
children = {i: [] for i in range(1, n+1)}
for i in range(n-1):
    p, c = map(int, data[1+i].split())
    children[p].append(c)

def height(node):
    if not children[node]:
        return 0
    return 1 + max(height(c) for c in children[node])

print(height(1) if n > 0 else 0)
"""

SOL["Kth Smallest Element"] = """
nums = list(map(int, input().split()))
k = int(input())
print(sorted(nums)[k-1])
"""

SOL["Word Break"] = """
s = input()
words = set(input().split())
n = len(s)
dp = [False]*(n+1)
dp[0] = True
for i in range(1, n+1):
    for j in range(i):
        if dp[j] and s[j:i] in words:
            dp[i] = True
            break
print(str(dp[n]).lower())
"""

SOL["Count Subsets With a Given Sum"] = """
nums = list(map(int, input().split()))
target = int(input())
dp = [0]*(target+1)
dp[0] = 1
for x in nums:
    for c in range(target, x-1, -1):
        dp[c] += dp[c-x]
print(dp[target])
"""

SOL["Combination Sum Count"] = """
nums = list(map(int, input().split()))
target = int(input())
dp = [0]*(target+1)
dp[0] = 1
for x in sorted(nums):
    for c in range(x, target+1):
        dp[c] += dp[c-x]
print(dp[target])
"""

SOL["Spiral Matrix Order"] = """
import sys
data = sys.stdin.read().split('\\n')
r, c = map(int, data[0].split())
grid = [list(map(int, data[1+i].split())) for i in range(r)]
res = []
top, bottom, left, right = 0, r-1, 0, c-1
while top <= bottom and left <= right:
    for j in range(left, right+1):
        res.append(grid[top][j])
    top += 1
    for i in range(top, bottom+1):
        res.append(grid[i][right])
    right -= 1
    if top <= bottom:
        for j in range(right, left-1, -1):
            res.append(grid[bottom][j])
        bottom -= 1
    if left <= right:
        for i in range(bottom, top-1, -1):
            res.append(grid[i][left])
        left += 1
print(' '.join(map(str, res)))
"""

SOL["Rotate Matrix 90 Degrees"] = """
import sys
data = sys.stdin.read().split('\\n')
n = int(data[0])
grid = [list(map(int, data[1+i].split())) for i in range(n)]
rotated = [[grid[n-1-j][i] for j in range(n)] for i in range(n)]
for row in rotated:
    print(' '.join(map(str, row)))
"""

SOL["Find the Duplicate Number"] = """
nums = list(map(int, input().split()))
seen = set()
for x in nums:
    if x in seen:
        print(x)
        break
    seen.add(x)
"""

SOL["Container With Most Water"] = """
heights = list(map(int, input().split()))
l, r = 0, len(heights)-1
best = 0
while l < r:
    best = max(best, (r-l) * min(heights[l], heights[r]))
    if heights[l] < heights[r]:
        l += 1
    else:
        r -= 1
print(best)
"""

SOL["Trapping Rain Water"] = """
heights = list(map(int, input().split()))
n = len(heights)
if n == 0:
    print(0)
else:
    left_max = [0]*n
    right_max = [0]*n
    left_max[0] = heights[0]
    for i in range(1, n):
        left_max[i] = max(left_max[i-1], heights[i])
    right_max[n-1] = heights[n-1]
    for i in range(n-2, -1, -1):
        right_max[i] = max(right_max[i+1], heights[i])
    total = sum(min(left_max[i], right_max[i]) - heights[i] for i in range(n))
    print(total)
"""

SOL["Course Schedule"] = """
import sys
from collections import deque
data = sys.stdin.read().split('\\n')
n = int(data[0])
m = int(data[1])
adj = {i: [] for i in range(n)}
indeg = [0]*n
for i in range(m):
    a, b = map(int, data[2+i].split())
    adj[b].append(a)
    indeg[a] += 1
q = deque([i for i in range(n) if indeg[i] == 0])
visited = 0
while q:
    node = q.popleft()
    visited += 1
    for nxt in adj[node]:
        indeg[nxt] -= 1
        if indeg[nxt] == 0:
            q.append(nxt)
print(str(visited == n).lower())
"""

SOL["Shortest Path in an Unweighted Graph"] = """
import sys
from collections import deque
data = sys.stdin.read().split('\\n')
n, m = map(int, data[0].split())
adj = {i: [] for i in range(n)}
for i in range(m):
    u, v = map(int, data[1+i].split())
    adj[u].append(v)
    adj[v].append(u)
src, dst = map(int, data[1+m].split())
dist = {src: 0}
q = deque([src])
while q:
    node = q.popleft()
    if node == dst:
        break
    for nxt in adj[node]:
        if nxt not in dist:
            dist[nxt] = dist[node] + 1
            q.append(nxt)
print(dist.get(dst, -1))
"""

SOL["GCD and LCM"] = """
import math
a, b = map(int, input().split())
g = math.gcd(a, b)
print(g, a*b//g)
"""

SOL["Count Primes"] = """
n = int(input())
if n < 2:
    print(0)
else:
    sieve = [True]*(n+1)
    sieve[0] = sieve[1] = False
    for i in range(2, int(n**0.5)+1):
        if sieve[i]:
            for j in range(i*i, n+1, i):
                sieve[j] = False
    print(sum(sieve))
"""

SOL["Single Number"] = """
nums = list(map(int, input().split()))
res = 0
for x in nums:
    res ^= x
print(res)
"""

# ---- test case inputs (stdin strings) ----

CASES = {}

CASES["Two Sum"] = [
    "2 7 11 15\n9",
    "3 2 4\n6",
    "3 3\n6",
    "1 2 3 4 5\n9",
    "-3 4 3 90\n0",
    "0 4 3 0\n0",
    "1 5 11 15\n26",
    "-1 -2 -3 -4 -5\n-8",
    "5 75 25\n100",
    "10 20 30 40 50\n70",
    "8 8\n16",
    "100 200 300 400\n700",
    "-10 10\n0",
    "1 3 5 7 9 11\n20",
    "4 4 4 4\n8",
    "1000000 -1000000\n0",
    "2 5 5 11\n10",
    "1 2 3 4 5 6 7 8 9 10\n19",
    "1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20\n39",
]

CASES["Reverse Words in a String"] = [
    "the sky is blue",
    "hello world",
    "singleword",
    "a b c d e f g",
    "Hello   World",
    "one",
    "  leading and trailing  ",
    "x y",
    "multiple   spaces   here",
    "The Quick Brown Fox Jumps",
    "a",
    "z y x w v u t s r q",
    "word",
    "1 2 3 4 5 6 7 8 9 10",
    "Testing one two three",
    "backwards forwards",
    "   multiple     internal    spaces   here   too   ",
]

CASES["Valid Parentheses"] = [
    "{[()]}",
    "()",
    "()[]{}",
    "(]",
    "([)]",
    "{[]}",
    "(((())))",
    "(()",
    "())",
    "[",
    "]",
    "{{{{}}}}",
    "()()()",
    "([{}])",
    "((()))",
    ")))",
    "{[(])}",
    "[({})]",
]

CASES["Maximum Subarray Sum"] = [
    "-2 1 -3 4 -1 2 1 -5 4",
    "1",
    "-1",
    "5 4 -1 7 8",
    "-5 -4 -3 -2 -1",
    "1 2 3 4 5",
    "-1 -2 -3 4 5 -1",
    "0 0 0 0",
    "100 -1 -1 -1 100",
    "-1 -2 -3 -100 -1",
    "3 -2 5 -1",
    "1 -1 1 -1 1",
    "2 3 -2 4 -1 2 1 -5 4",
    "-8 3 -1 4 -8",
    "10",
    "-10",
    "5 -1 5 -1 5",
    "1 2 -1 -2 3 4",
    "9 -1 -2 -3 8 7",
]

CASES["Longest Substring Without Repeating Characters"] = [
    "abcabcbb",
    "bbbbb",
    "pwwkew",
    "a",
    "au",
    "dvdf",
    "abba",
    "tmmzuxt",
    "abcdefg",
    "aab",
    "abcdeabcde",
    "zzzzzzzzzz",
    "abcdefgabcdefg",
    "xyzxyzxyz",
    "aA",
    "112233",
    "thequickbrownfox",
    "aaaaaaaaaab",
]

CASES["Binary Search"] = [
    "1 3 5 7 9 11\n7",
    "1 2 3 4 5\n1",
    "1 2 3 4 5\n5",
    "1 2 3 4 5\n6",
    "5\n5",
    "5\n3",
    "1 3 5 7 9\n4",
    "-10 -5 0 5 10\n0",
    "-10 -5 0 5 10\n-10",
    "2 4 6 8 10 12 14\n14",
    "1 1 1 1 1\n1",
    "10 20 30 40 50 60 70 80 90 100\n55",
    "1 2\n1",
    "1 2\n2",
    "0\n0",
    "-100 -50 0 50 100\n100",
    "1 3 5 7 9 11 13 15 17 19\n1",
    "1 3 5 7 9 11 13 15 17 19\n19",
    "1 3 5 7 9 11 13 15 17 19\n10",
    "100 200 300 400 500\n300",
]

CASES["Merge Two Sorted Arrays"] = [
    "1 3 5\n2 4 6",
    "1 2 3\n4 5 6",
    "-5 -3 -1\n-4 -2 0",
    "1\n2",
    "5\n1",
    "1 1 1\n1 1 1",
    "\n1 2 3",
    "1 2 3\n\n",
    "-10 0 10\n-5 5 15",
    "2 4 6 8 10\n1 3 5 7 9",
    "100\n50",
    "0 0 0\n0 0 0",
    "-100 -50\n0 50 100",
    "1 3 5 7 9 11 13\n2 4 6 8 10 12 14",
    "7\n7",
    "1 2 3 4 5\n1 2 3 4 5",
    "-1\n1",
    "1000 2000\n1500",
]

CASES["Nth Fibonacci Number"] = [
    "10", "0", "1", "2", "3", "5", "6", "7", "15", "20",
    "25", "30", "4", "8", "9", "12", "18", "22", "28", "35",
]

CASES["Palindrome Check"] = [
    "A man a plan a canal Panama",
    "race a car",
    "Was it a car or a cat I saw",
    "a",
    "ab",
    "abba",
    "Able was I ere I saw Elba",
    "hello",
    "Madam",
    "No lemon no melon",
    "12321",
    "12345",
    "Never odd or even",
    "Do geese see God",
    "not a palindrome",
    "x",
    "xx",
    "xy",
    "Step on no pets",
]

CASES["Climbing Stairs"] = [
    "5", "1", "2", "3", "4", "0", "6", "7", "8", "10",
    "12", "15", "18", "20", "22", "25", "28", "30", "9",
]

CASES["Find the Missing Number"] = [
    "3 0 1",
    "0",
    "1",
    "0 1 2 4 5",
    "1 2",
    "9 6 4 2 3 5 7 0 1",
    "1 2 3 4 6 7 8 9 10",
    "0 2",
    "1 0",
    "2 0 1 4",
    "0 1 3",
    "8 7 6 5 4 3 2 1",
    "5 4 3 1 0",
    "9 8 7 6 5 4 3 2 1 0",
    "0",
]

CASES["Most Frequent Character"] = [
    "abracadabra",
    "aabbcc",
    "z",
    "aaaa",
    "abcabcabc",
    "xxyyyzz",
    "mississippi",
    "aabbbcc",
    "hello world",
    "programming",
    "banana",
    "112233",
    "qwerty",
    "aabbccddeeffgghhii",
    "xyzzyx",
]

CASES["Valid Anagram"] = [
    "listen\nsilent",
    "hello\nworld",
    "abc\ncba",
    "a\na",
    "a\nb",
    "aabbcc\nabcabc",
    "anagram\nnagaram",
    "rat\ncar",
    "\n\n",
    "abcd\ndcba",
    "aaa\naaa",
    "aaa\naab",
    "programming\nmingrogpram",
    "xyz\nzyx",
    "test\ntest",
]

CASES["Rotate Array"] = [
    "1 2 3 4 5 6 7\n3",
    "1 2 3\n0",
    "1 2 3\n1",
    "1 2 3\n3",
    "1 2 3\n4",
    "1\n5",
    "1 2\n1",
    "-1 -100 3 99\n2",
    "1 2 3 4 5\n2",
    "10 20 30 40 50\n10",
    "5 4 3 2 1\n2",
    "1 2 3 4 5 6 7 8 9 10\n5",
    "0 0 0\n1",
    "1 2 3 4\n100",
    "9 8 7\n7",
]

CASES["Number of Islands"] = [
    "3 3\n1 1 0\n0 1 0\n0 0 1",
    "1 1\n0",
    "1 1\n1",
    "2 2\n1 1\n1 1",
    "2 2\n0 0\n0 0",
    "4 4\n1 1 0 0\n1 1 0 0\n0 0 1 0\n0 0 0 1",
    "3 3\n1 0 1\n0 1 0\n1 0 1",
    "5 5\n1 1 1 0 0\n1 1 0 0 0\n0 0 1 0 0\n0 0 0 1 1\n0 0 0 1 1",
    "1 5\n1 0 1 0 1",
    "5 1\n1\n0\n1\n0\n1",
    "3 4\n0 0 0 0\n0 1 1 0\n0 0 0 0",
    "2 3\n1 1 1\n1 1 1",
    "4 4\n0 0 0 0\n0 0 0 0\n0 0 0 0\n0 0 0 0",
    "3 3\n1 1 1\n1 1 1\n1 1 1",
    "6 6\n1 0 0 0 0 1\n0 0 0 0 0 0\n0 0 1 1 0 0\n0 0 1 1 0 0\n0 0 0 0 0 0\n1 0 0 0 0 1",
]

CASES["Merge Overlapping Intervals"] = [
    "4\n1 3\n2 6\n8 10\n15 18",
    "1\n1 5",
    "2\n1 2\n3 4",
    "2\n1 4\n2 3",
    "3\n1 4\n4 5\n6 7",
    "5\n1 3\n2 4\n5 7\n6 8\n9 10",
    "3\n1 10\n2 3\n4 5",
    "2\n0 0\n0 0",
    "4\n1 2\n2 3\n3 4\n4 5",
    "3\n-5 -1\n-3 0\n1 5",
    "6\n1 2\n3 5\n4 8\n9 10\n2 6\n15 18",
    "2\n1 100\n50 60",
    "1\n5 5",
    "4\n10 20\n1 2\n3 4\n25 30",
]

CASES["Longest Common Prefix"] = [
    "3\nflower\nflow\nflight",
    "3\ndog\nracecar\ncar",
    "1\nalone",
    "2\nsame\nsame",
    "3\ninterview\ninternet\ninternal",
    "4\nabc\nabcd\nabcde\nab",
    "2\n\nabc",
    "3\naaa\naaa\naaa",
    "5\ngo\ngopher\ngolang\ngoogle\ngood",
    "2\nabcdef\nxyz",
    "3\nprefix\npreach\nprepare",
    "2\na\na",
    "4\ntest\ntesting\ntester\ntested",
]

CASES["Kth Largest Element"] = [
    "3 2 1 5 6 4\n2",
    "3 2 3 1 2 4 5 5 6\n4",
    "1\n1",
    "5 5 5 5\n2",
    "-1 -2 -3 -4\n1",
    "10 9 8 7 6 5 4 3 2 1\n5",
    "1 2 3 4 5\n1",
    "1 2 3 4 5\n5",
    "100 200 300\n2",
    "7 7 7 1 1 1\n3",
    "-5 0 5\n2",
    "9\n1",
    "4 4 4 4 4\n1",
]

CASES["Minimum Coins for an Amount"] = [
    "11\n1 2 5",
    "0\n1 2 5",
    "3\n2",
    "7\n2 4",
    "1\n1",
    "100\n1 5 10 25",
    "6\n1 3 4",
    "27\n1 5 10 25",
    "10\n2 5",
    "9\n3",
    "50\n1 5 10 20",
    "13\n1 3 4 5",
    "1000\n1 100 500",
]

CASES["Count Set Bits"] = [
    "29", "0", "1", "2", "7", "8", "15", "16", "255",
    "1024", "1023", "100", "31", "63", "1000000",
]

CASES["Longest Increasing Subsequence"] = [
    "10 9 2 5 3 7 101 18",
    "0 1 0 3 2 3",
    "7 7 7 7 7",
    "1",
    "1 2 3 4 5",
    "5 4 3 2 1",
    "1 3 6 7 9 4 10 5 6",
    "10 22 9 33 21 50 41 60",
    "3 10 2 1 20",
    "50 3 10 7 40 80",
    "1 2",
    "2 1",
    "4 10 4 3 8 9",
]

CASES["Edit Distance"] = [
    "cat\ncut",
    "horse\nros",
    "\n\n",
    "a\n\n",
    "\na",
    "abc\nabc",
    "kitten\nsitting",
    "intention\nexecution",
    "abcdef\nazced",
    "sunday\nsaturday",
    "flaw\nlawn",
    "abc\nyabd",
]

CASES["0/1 Knapsack"] = [
    "3 50\n10 60\n20 100\n30 120",
    "1 10\n5 10",
    "1 4\n5 10",
    "2 3\n1 6\n2 10",
    "4 10\n5 10\n4 40\n6 30\n3 50",
    "3 4\n1 1\n3 4\n4 5",
    "5 15\n1 1\n3 4\n4 5\n5 6\n2 3",
    "2 50\n10 60\n40 200",
    "1 0\n1 10",
]

CASES["Next Greater Element"] = [
    "4 5 2 10 8",
    "1",
    "5 4 3 2 1",
    "1 2 3 4 5",
    "1 3 2 4",
    "2 2 2",
    "10 5 12 3 8 20",
    "13 7 6 12",
    "9 1 2 3 4",
    "100 99 98",
]

CASES["Tree Height"] = [
    "6\n1 2\n1 3\n2 4\n2 5\n3 6",
    "1",
    "2\n1 2",
    "3\n1 2\n2 3",
    "4\n1 2\n1 3\n1 4",
    "7\n1 2\n1 3\n2 4\n2 5\n3 6\n3 7",
    "5\n1 2\n2 3\n3 4\n4 5",
    "8\n1 2\n2 3\n2 4\n4 5\n4 6\n1 7\n7 8",
]

CASES["Kth Smallest Element"] = [
    "7 10 4 3 20 15\n3",
    "1\n1",
    "5 5 5 5\n1",
    "1 2 3 4 5\n1",
    "1 2 3 4 5\n5",
    "-5 -1 -3\n2",
    "10 9 8 7 6\n5",
    "100 50 25\n2",
    "3 1 2\n2",
    "9 9 9 1\n2",
]

CASES["Word Break"] = [
    "pineapple\npine apple",
    "applepie\napple pie",
    "catsanddog\ncats sand and dog",
    "leetcode\nleet code",
    "goodmorning\ngood morning morn ing",
    "abcd\nab cd",
    "abcd\na abc",
    "hello\nhe llo",
    "aaaaaaa\naaaa aa",
    "impossibleword\nim possible",
    "notthere\nnope",
    "x\nx",
]

CASES["Count Subsets With a Given Sum"] = [
    "1 2 3 3\n6",
    "1 1 1 1\n2",
    "5\n5",
    "5\n10",
    "1 2 3 4 5\n5",
    "2 2 2 2\n4",
    "1 1 1 1 1\n3",
    "10 5 2 3\n5",
    "3 3 3\n6",
    "1 2 3\n0",
]

CASES["Combination Sum Count"] = [
    "2 3 6 7\n7",
    "2 3 5\n8",
    "2\n1",
    "1\n5",
    "3 5 7\n10",
    "2 4\n8",
    "5\n5",
    "2 3\n0",
    "1 2\n4",
]

CASES["Spiral Matrix Order"] = [
    "3 3\n1 2 3\n4 5 6\n7 8 9",
    "1 1\n5",
    "1 4\n1 2 3 4",
    "4 1\n1\n2\n3\n4",
    "2 2\n1 2\n3 4",
    "3 4\n1 2 3 4\n5 6 7 8\n9 10 11 12",
    "4 3\n1 2 3\n4 5 6\n7 8 9\n10 11 12",
    "5 5\n1 2 3 4 5\n6 7 8 9 10\n11 12 13 14 15\n16 17 18 19 20\n21 22 23 24 25",
]

CASES["Rotate Matrix 90 Degrees"] = [
    "2\n1 2\n3 4",
    "1\n5",
    "3\n1 2 3\n4 5 6\n7 8 9",
    "4\n1 2 3 4\n5 6 7 8\n9 10 11 12\n13 14 15 16",
    "2\n0 1\n1 0",
]

CASES["Find the Duplicate Number"] = [
    "1 3 4 2 2",
    "1 1",
    "3 1 3 4 2",
    "2 2 2 2 2",
    "1 2 3 4 5 6 7 8 9 5",
    "5 4 3 2 1 1",
    "1 2 2",
    "4 3 1 2 4",
]

CASES["Container With Most Water"] = [
    "1 2 4 3",
    "1 1",
    "4 3 2 1 4",
    "1 2 1",
    "1 8 6 2 5 4 8 3 7",
    "2 2 2 2 2",
    "1 2 3 4 5 6 7 8 9 10",
    "10 1 1 1 1 1 1 1 1 10",
    "5 1",
    "1 5",
]

CASES["Trapping Rain Water"] = [
    "3 0 2 0 4",
    "0 1 0 2 1 0 1 3 2 1 2 1",
    "4 2 0 3 2 5",
    "0 0 0 0",
    "5 4 3 2 1",
    "1 2 3 4 5",
    "3 3 3 3",
    "0",
    "2 0 2",
    "5 0 5 0 5 0 5",
]

CASES["Course Schedule"] = [
    "4\n3\n1 0\n2 1\n3 2",
    "2\n1\n1 0",
    "2\n2\n1 0\n0 1",
    "1\n0",
    "3\n0",
    "5\n4\n1 0\n2 0\n3 1\n4 2",
    "3\n3\n0 1\n1 2\n2 0",
    "6\n5\n1 0\n2 0\n3 1\n3 2\n5 4",
]

CASES["Shortest Path in an Unweighted Graph"] = [
    "5 5\n0 1\n1 2\n2 3\n3 4\n0 4\n0 3",
    "2 1\n0 1\n0 1",
    "3 0\n0 2",
    "1 0\n0 0",
    "4 3\n0 1\n1 2\n2 3\n0 3",
    "6 6\n0 1\n1 2\n2 3\n3 4\n4 5\n0 5\n0 3",
    "3 2\n0 1\n1 2\n0 2",
]

CASES["GCD and LCM"] = [
    "12 18", "1 1", "7 13", "100 75", "8 12", "17 5",
    "1000000 500000", "9 3", "6 4", "48 18", "2 3", "100 1",
]

CASES["Count Primes"] = [
    "10", "0", "1", "2", "3", "20", "100", "1000", "50", "17", "30", "2",
]

CASES["Single Number"] = [
    "4 1 2 1 2",
    "1",
    "2 2 1",
    "-1 -1 -2",
    "0 0 5",
    "7 3 3 7 9",
    "100 200 100",
    "1 2 3 2 1",
    "5 5 8",
    "10 20 10",
]

# ---- top-up cases for anything that came out under 15 after the first pass ----

EXTRA_CASES = {
    "Merge Overlapping Intervals": [
        "4\n1 5\n6 10\n11 15\n2 3",
    ],
    "Longest Common Prefix": [
        "3\nabc\nabd\nabe",
        "2\nxyz\nxyzabc",
    ],
    "Kth Largest Element": [
        "6 6 6 6 6 6\n3",
        "1 2\n2",
    ],
    "Minimum Coins for an Amount": [
        "5\n1",
        "2\n3 5",
    ],
    "Longest Increasing Subsequence": [
        "1 1 1 1",
        "9 8 7 6 5 4 3 2 1 10",
    ],
    "Edit Distance": [
        "abcdefgh\nabcdefgh",
        "xyz\nabc",
        "programming\nprogram",
    ],
    "0/1 Knapsack": [
        "2 100\n50 60\n50 60",
        "3 6\n2 3\n3 4\n4 5",
        "4 10\n1 1\n2 2\n3 3\n4 4",
        "1 1\n1 1",
        "5 100\n10 10\n20 20\n30 30\n40 40\n50 50",
        "2 1\n5 10\n5 10",
    ],
    "Next Greater Element": [
        "1 1 1 1",
        "5 4 3 2 1 6",
        "3 8 4 1 2",
        "6 5 4 3 2 1 10",
        "1 2 1 2 1",
    ],
    "Tree Height": [
        "9\n1 2\n2 3\n3 4\n4 5\n5 6\n6 7\n7 8\n8 9",
        "3\n1 2\n1 3",
        "10\n1 2\n1 3\n1 4\n1 5\n1 6\n1 7\n1 8\n1 9\n1 10",
        "6\n1 2\n2 3\n1 4\n4 5\n4 6",
        "4\n1 2\n2 3\n2 4",
        "5\n1 2\n1 3\n3 4\n3 5",
        "12\n1 2\n2 3\n3 4\n4 5\n5 6\n6 7\n1 8\n8 9\n9 10\n1 11\n11 12",
    ],
    "Kth Smallest Element": [
        "-1 -2 -3 -4 -5\n3",
        "8 1 3 5 2\n4",
        "6 6 6\n2",
        "20 10 30 40\n1",
        "3 1 2\n3",
    ],
    "Word Break": [
        "abcabc\nabc",
        "wordbreak\nword break problem",
        "xyzxyz\nxy z",
    ],
    "Count Subsets With a Given Sum": [
        "4 2 3 5\n8",
        "1 2 3 4 5\n15",
        "7 3 2 5 8\n10",
        "1 1 1 1 1 1\n3",
        "6 2 3 4\n6",
    ],
    "Combination Sum Count": [
        "3 4 5\n12",
        "1\n3",
        "2 5\n10",
        "3 6 9\n9",
        "4 6\n12",
        "7\n14",
    ],
    "Spiral Matrix Order": [
        "2 3\n1 2 3\n4 5 6",
        "3 2\n1 2\n3 4\n5 6",
        "1 5\n1 2 3 4 5",
        "5 1\n1\n2\n3\n4\n5",
        "2 4\n1 2 3 4\n5 6 7 8",
        "4 4\n1 2 3 4\n5 6 7 8\n9 10 11 12\n13 14 15 16",
        "1 2\n7 8",
    ],
    "Rotate Matrix 90 Degrees": [
        "5\n1 2 3 4 5\n6 7 8 9 10\n11 12 13 14 15\n16 17 18 19 20\n21 22 23 24 25",
        "2\n5 6\n7 8",
        "3\n0 0 0\n0 1 0\n0 0 0",
        "1\n0",
        "3\n9 8 7\n6 5 4\n3 2 1",
        "2\n1 1\n1 1",
        "4\n1 0 0 0\n0 1 0 0\n0 0 1 0\n0 0 0 1",
        "3\n2 4 6\n8 10 12\n14 16 18",
        "2\n-1 -2\n-3 -4",
        "3\n1 1 1\n2 2 2\n3 3 3",
    ],
    "Find the Duplicate Number": [
        "1 2 3 4 5 6 7 8 9 10 10",
        "6 1 2 3 4 5 6",
        "1 4 4 2 3",
        "3 3",
        "1 2 3 4 4",
        "2 1 3 4 4 5",
        "7 3 1 2 4 5 6 7",
    ],
    "Container With Most Water": [
        "3 9 2 5 10 6",
        "6 6 6 6",
        "1 3 2 5 25 24 5",
        "0 2 0",
        "8 7 6 5 4 3 2 1",
    ],
    "Trapping Rain Water": [
        "4 2 3",
        "1 0 1",
        "2 1 0 1 2",
        "5 5 1 7 1 1 5 2 7 6",
        "0 5 0 5 0",
    ],
    "Course Schedule": [
        "5\n5\n1 0\n2 0\n3 1\n3 2\n4 3",
        "4\n4\n1 0\n2 0\n3 0\n0 3",
        "2\n0",
        "3\n2\n1 0\n2 0",
        "7\n6\n1 0\n2 1\n3 2\n4 3\n5 4\n6 5",
        "4\n2\n1 0\n3 2",
        "5\n0",
    ],
    "Shortest Path in an Unweighted Graph": [
        "4 4\n0 1\n1 2\n2 3\n0 3\n1 3",
        "5 4\n0 1\n1 2\n3 4\n0 2\n2 2",
        "6 5\n0 1\n1 2\n2 3\n3 4\n4 5\n0 5",
        "3 3\n0 1\n1 2\n0 2\n0 1",
        "2 0\n0 1",
        "4 3\n0 1\n1 2\n2 3\n0 1",
        "7 6\n0 1\n1 2\n2 3\n3 4\n4 5\n5 6\n0 6",
        "5 5\n0 1\n0 2\n0 3\n0 4\n1 2\n1 4",
    ],
    "GCD and LCM": [
        "5 15",
        "9 27",
        "13 26",
    ],
    "Count Primes": [
        "5",
        "200",
        "40",
    ],
}

for _title, _extra in EXTRA_CASES.items():
    CASES[_title].extend(_extra)


def main():
    output = {}
    total_cases = 0
    for title, sol in SOL.items():
        cases = CASES.get(title)
        if not cases:
            print(f"MISSING CASES for {title}")
            continue
        entries = []
        for idx, stdin in enumerate(cases):
            try:
                stdout = run(sol, stdin)
            except Exception as e:
                print(f"ERROR {title} case {idx}: {e}")
                continue
            entries.append({
                "input": stdin,
                "expected_output": stdout,
                "locked": idx >= 3,
            })
        output[title] = entries
        total_cases += len(entries)
        print(f"{title}: {len(entries)} cases")

    with open("src/scripts/dsa-test-cases.generated.json", "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nTOTAL questions: {len(output)}, TOTAL cases: {total_cases}")


if __name__ == "__main__":
    main()
