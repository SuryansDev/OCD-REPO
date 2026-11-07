/**
 * CSES Problem Set Helper
 * Provides parsing, URL resolution, and official problem titles for CSES problems.
 */

// Popular & standard CSES Problem Set mapping (ID -> Title)
export const CSES_PROBLEMS: Record<string, string> = {
  // Introductory Problems
  '1068': 'Weird Algorithm',
  '1083': 'Missing Number',
  '1069': 'Repetitions',
  '1094': 'Increasing Array',
  '1070': 'Permutations',
  '1071': 'Number Spiral',
  '1072': 'Two Knights',
  '1092': 'Two Sets',
  '1617': 'Bit Strings',
  '1618': 'Trailing Zeros',
  '1754': 'Coin Piles',
  '1755': 'Palindrome Reorder',
  '2205': 'Gray Code',
  '2165': 'Tower of Hanoi',
  '1622': 'Creating Strings',
  '1623': 'Apple Division',
  '1624': 'Chessboard and Queens',
  '2431': 'Digit Queries',
  '2162': 'Josephus Problem I',
  '2163': 'Josephus Problem II',
  '2430': 'Grid Paths',

  // Sorting and Searching
  '1621': 'Distinct Numbers',
  '1084': 'Apartments',
  '1090': 'Ferris Wheel',
  '1091': 'Concert Tickets',
  '1619': 'Restaurant Customers',
  '1629': 'Movie Festival',
  '1640': 'Sum of Two Values',
  '1643': 'Maximum Subarray Sum',
  '1074': 'Stick Lengths',
  '2183': 'Missing Coin Sum',
  '2216': 'Collecting Numbers',
  '2217': 'Collecting Numbers II',
  '1141': 'Playlist',
  '1073': 'Towers',
  '1163': 'Traffic Lights',
  '2168': 'Nested Ranges Check',
  '2169': 'Nested Ranges Count',
  '1164': 'Room Allocation',
  '1620': 'Factory Machines',
  '1630': 'Tasks and Deadlines',
  '1631': 'Reading Books',
  '1641': 'Sum of Three Values',
  '1642': 'Sum of Four Values',
  '1660': 'Subarray Sums I',
  '1661': 'Subarray Sums II',
  '1662': 'Subarray Divisibility',
  '2428': 'Subarray Distinct Values',
  '1085': 'Array Division',
  '1076': 'Sliding Window Median',
  '1077': 'Sliding Window Cost',
  '1632': 'Movie Festival II',
  '1644': 'Maximum Subarray Sum II',

  // Dynamic Programming
  '1633': 'Dice Combinations',
  '1634': 'Minimizing Coins',
  '1635': 'Coin Combinations I',
  '1636': 'Coin Combinations II',
  '1637': 'Removing Digits',
  '1638': 'Grid Paths',
  '1158': 'Book Shop',
  '1746': 'Array Description',
  '2413': 'Counting Towers',
  '1639': 'Edit Distance',
  '1744': 'Rectangle Cutting',
  '1745': 'Money Sums',
  '1097': 'Removal Game',
  '1093': 'Two Sets II',
  '1145': 'Increasing Subsequence',
  '1140': 'Projects',
  '1653': 'Elevator Rides',
  '2181': 'Counting Tilings',
  '2220': 'Counting Numbers',

  // Graph Algorithms
  '1192': 'Counting Rooms',
  '1193': 'Labyrinth',
  '1666': 'Building Roads',
  '1667': 'Message Route',
  '1668': 'Building Teams',
  '1669': 'Round Trip',
  '1194': 'Monsters',
  '1671': 'Shortest Routes I',
  '1672': 'Shortest Routes II',
  '1673': 'High Score',
  '1195': 'Flight Discount',
  '1196': 'Flight Routes',
  '1197': 'Cycle Finding',
  '1675': 'Road Preparation',
  '1676': 'Road Construction',
  '1679': 'Course Schedule',
  '1680': 'Longest Flight Route',
  '1681': 'Game Routes',
  '1202': 'Investigation',
  '1750': 'Planets Queries I',
  '1751': 'Planets Queries II',
  '1160': 'Planets Cycles',
  '1678': 'Round Trip II',
  '1682': 'Flight Routes Check',
  '1683': 'Planets and Kingdoms',
  '1684': 'Giant Pizza',
  '1686': 'Coin Collector',
  '1694': 'Download Speed',
  '1695': 'Police Chase',
  '1696': 'School Dance',
  '1711': 'Distinct Routes',

  // Range Queries
  '1646': 'Static Range Sum Queries',
  '1647': 'Static Range Minimum Queries',
  '1648': 'Dynamic Range Sum Queries',
  '1649': 'Dynamic Range Minimum Queries',
  '1650': 'Range Xor Queries',
  '1651': 'Range Update Queries',
  '1652': 'Forest Queries',
  '1734': 'Prefix Sum Queries',
  '1735': 'Range Updates and Sums',
  '1736': 'Polynomial Queries',
  '1737': 'Range Queries and Copies',
  '1739': 'Forest Queries II',
  '1749': 'List Removals',
  '2166': 'Prefix Sum Queries',
  '2206': 'Pizzeria Queries',
  '1143': 'Hotel Queries',
  '1144': 'Salary Queries',
  '1190': 'Subarray Sum Queries',
  '2416': 'Increasing Array Queries',
  '1732': 'Distinct Values Queries',

  // Tree Algorithms
  '1674': 'Subordinates',
  '1130': 'Tree Matching',
  '1131': 'Tree Diameter',
  '1132': 'Tree Distances I',
  '1133': 'Tree Distances II',
  '1687': 'Company Queries I',
  '1688': 'Company Queries II',
  '1135': 'Distance Queries',
  '1136': 'Counting Paths',
  '1137': 'Subtree Queries',
  '1138': 'Path Queries',
  '2134': 'Path Queries II',
  '1139': 'Distinct Colors',
  '2079': 'Finding a Centroid',
  '2080': 'Fixed-Length Paths I',
  '2081': 'Fixed-Length Paths II',

  // Mathematics
  '1081': 'Common Divisors',
  '1082': 'Sum of Divisors',
  '1712': 'Exponentiation II',
  '1713': 'Counting Divisors',
  '1715': 'Creating Strings II',
  '1716': 'Distributing Apples',
  '1717': 'Christmas Party',
  '2164': 'Josephus Queries',
  '2182': 'Divisor Analysis',
  '2185': 'Prime Multiples',
  '2417': 'Counting Coprime Pairs',
  '1095': 'Exponentiation',
  '1722': 'Fibonacci Numbers',
  '1723': 'Graph Paths I',
  '1724': 'Graph Paths II',
  '1725': 'Dice Probability',
  '1726': 'Moving Robots',
  '1727': 'Candy Lottery',
  '1728': 'Inversion Probability',
  '1729': 'Stick Game',
  '1730': 'Nim Game I',

  // String Algorithms
  '1731': 'Word Combinations',
  '1753': 'String Matching',
  '1110': 'Finding Borders',
  '1111': 'Finding Periods',
  '1112': 'Minimal Rotation',
  '2102': 'Finding Patterns',
  '2103': 'Counting Patterns',
  '2104': 'Pattern Positions',
  '2105': 'Distinct Substrings',
  '2106': 'Repeating Substring',
  '2107': 'String Functions',
  '2110': 'Substring Order I',
  '2111': 'Substring Order II',
  '2112': 'Substring Distribution',

  // Geometry
  '2189': 'Point Location Test',
  '2190': 'Line Segment Intersection',
  '2191': 'Polygon Area',
  '2192': 'Point in Polygon',
  '2193': 'Polygon Lattice Points',
  '2194': 'Minimum Euclidean Distance',
  '2195': 'Convex Hull',
};

/**
 * Extracts CSES task ID from raw input or URL.
 * Supports:
 * - https://cses.fi/problemset/task/1068
 * - https://cses.fi/problemset/view/1068
 * - https://cses.fi/123/task/1068
 * - cses.fi/problemset/task/1068
 * - cses: 1068 / cses-1068 / cses 1068 / cses#1068
 */
export function extractCsesTaskId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();

  // Shorthand formats: cses: 1068, cses 1068, cses-1068, cses#1068
  const shorthandMatch = trimmed.match(/^cses\s*[:\-\/#]?\s*(\d+)$/i);
  if (shorthandMatch) {
    return shorthandMatch[1];
  }

  // CSES URLs
  if (trimmed.toLowerCase().includes('cses.fi')) {
    const taskMatch = trimmed.match(/(?:task|view|result)\/([a-zA-Z0-9_\-]+)/i);
    if (taskMatch) {
      return taskMatch[1];
    }
    const fallbackMatch = trimmed.match(/cses\.fi\/.*?(\d+)/i);
    if (fallbackMatch) {
      return fallbackMatch[1];
    }
  }

  return null;
}

/**
 * Generates canonical CSES problem link.
 */
export function getCsesTaskUrl(taskId: string): string {
  return `https://cses.fi/problemset/task/${encodeURIComponent(taskId)}`;
}

/**
 * Formats a friendly problem title for CSES tasks.
 */
export function formatCsesTaskTitle(taskId: string): string {
  const cleanId = taskId.trim();
  const knownTitle = CSES_PROBLEMS[cleanId];
  if (knownTitle) {
    return `${knownTitle} (CSES #${cleanId})`;
  }
  return `CSES Task #${cleanId}`;
}
