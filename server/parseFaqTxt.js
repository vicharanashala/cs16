/**
 * parseFaqTxt.js — Parses FAQ.txt into structured FAQ data
 *
 * Strategy:
 *  1. Split on the QA separator line to get TOC and QA sections.
 *  2. Parse the TOC to get section titles and question IDs.
 *  3. In the QA section, split on lines that START with "N.M " (strict line-start
 *     match only) to avoid false splits on cross-references like "(see §4.5)".
 *  4. Within each block, find the first "§" that follows the question text to
 *     extract the answer.
 */

const fs = require('fs');
const path = require('path');

function parseFAQtxt(faqPath) {
  // Determine FAQ.txt path with clear defaults and fallbacks
  let resolvedPath;

  if (faqPath) {
    // Explicit path provided (for testing or override)
    resolvedPath = faqPath;
  } else if (process.env.FAQ_TXT_PATH) {
    // Environment variable takes precedence
    resolvedPath = process.env.FAQ_TXT_PATH;
  } else {
    // Default: look in project root (where package.json is)
    resolvedPath = path.join(__dirname, '../FAQ.txt');
  }

  // Resolve to absolute path for clarity in error messages
  const absolutePath = path.resolve(resolvedPath);

  // Validate file exists with clear error message
  if (!fs.existsSync(absolutePath)) {
    const errorMsg = [
      `\n❌ FAQ.txt not found at: ${absolutePath}`,
      `\n📍 Expected locations (in order of priority):`,
      `   1. Environment variable: FAQ_TXT_PATH=${process.env.FAQ_TXT_PATH || '(not set)'}`,
      `   2. Project root (default): ${path.join(__dirname, '../FAQ.txt')}`,
      `   3. Custom path: pass path to parseFAQtxt(path)`,
      `\n📋 To fix:`,
      `   - Place FAQ.txt in the project root (cs16/FAQ.txt)`,
      `   - Or set FAQ_TXT_PATH environment variable to the correct path`,
      `\n📚 Example:`,
      `   export FAQ_TXT_PATH=/path/to/FAQ.txt`,
      `   npm run seed`,
    ].join('\n');
    throw new Error(errorMsg);
  }

  const raw = fs.readFileSync(absolutePath, 'utf8');

  // ── 1. Split TOC from QA ────────────────────────────────────────────────────
  // The separator is a long line of "=" and "QA" repeated
  const sepIdx = raw.indexOf('===');
  if (sepIdx === -1) throw new Error('FAQ.txt: cannot find QA separator');

  const tocSection = raw.substring(0, sepIdx);
  const qaSection  = raw.substring(sepIdx);

  // ── 2. Parse TOC ────────────────────────────────────────────────────────────
  const sections = [];
  let currentSection = null;

  for (const rawLine of tocSection.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    // Section heading: "N. Title" (N = 1–2 digits, no decimal)
    const secMatch = line.match(/^(\d+)\.\s+(.+?)(?:\s*§)?\s*$/);
    if (secMatch && !line.match(/^\d+\.\d+/)) {
      if (currentSection) sections.push(currentSection);
      currentSection = {
        number: parseInt(secMatch[1]),
        title: secMatch[2].trim(),
        questions: []
      };
      continue;
    }

    // Question entries: one or more "N.M Question text" on the same line
    // (some lines concatenate multiple questions without newlines)
    const qPattern = /(\d+)\.(\d+)\s+([\s\S]+?)(?=\s*\d+\.\d+\s+|$)/g;
    let m;
    while ((m = qPattern.exec(line)) !== null) {
      if (currentSection) {
        const qText = m[3].trim().replace(/\s*§\s*$/, '');
        if (qText) {
          currentSection.questions.push({
            id: `${m[1]}.${m[2]}`,
            question: qText
          });
        }
      }
    }
  }
  if (currentSection) sections.push(currentSection);

  // ── 3. Split QA section into per-question blocks ────────────────────────────
  // Only match "N.M " at the very start of a line (after optional whitespace).
  // This prevents cross-references like "(see §4.5)" from being treated as headers.
  const lines = qaSection.split(/\r?\n/);
  const blocks = []; // { id, lines[] }
  let currentBlock = null;

  for (const line of lines) {
    // Strict line-start match: optional leading whitespace, then "N.M " or "N.M\t"
    const headerMatch = line.match(/^\s*(\d+)\.(\d+)\s+/);
    if (headerMatch) {
      if (currentBlock) blocks.push(currentBlock);
      currentBlock = {
        id: `${headerMatch[1]}.${headerMatch[2]}`,
        lines: [line]
      };
    } else if (currentBlock) {
      currentBlock.lines.push(line);
    }
  }
  if (currentBlock) blocks.push(currentBlock);

  // ── 4. Extract answer from each block ───────────────────────────────────────
  // Each block looks like:
  //   "N.M Question text"
  //   "§ Answer text..."
  //   (possibly more answer lines)
  //
  // The "§" marks the start of the answer. Everything before it (on the same
  // line or on earlier lines) is the question text we already have from the TOC.

  const answerMap = {};

  for (const block of blocks) {
    const fullText = block.lines.join('\n');

    // Find the first "§" in the block — that's where the answer starts
    const sepPos = fullText.indexOf('§');
    if (sepPos === -1) continue;

    const answerRaw = fullText.substring(sepPos + 1);

    // Clean up: collapse whitespace, remove stray section-title lines
    const answer = answerRaw
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => {
        if (!l) return false;
        // Drop lines that are just section headings like "2. Timing and dates §"
        if (/^\d+\.\s+[^.?!]+(?:\s*§)?\s*$/.test(l) && !l.includes('?')) return false;
        return true;
      })
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (answer) {
      answerMap[block.id] = answer;
    }
  }

  // ── 5. Build FAQ list ────────────────────────────────────────────────────────
  const faqs = [];

  for (const section of sections) {
    const sectionTag = section.title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 30);

    for (const q of section.questions) {
      const answer = answerMap[q.id];
      if (!answer) continue;

      // Sanity check: skip if the "answer" looks like a question (starts with a
      // question word or ends with "?") — this catches any remaining parse errors.
      const looksLikeQuestion =
        /^(what|when|where|who|why|how|is|are|can|do|does|did|will|would|should|could)\b/i.test(answer) &&
        answer.trim().endsWith('?');

      if (looksLikeQuestion) continue;

      faqs.push({
        sectionNumber: section.number,
        sectionTitle:  section.title,
        questionId:    q.id,
        title:         q.question,
        description:   q.question,
        finalAnswer:   answer,
        tags:          [sectionTag, q.id]
      });
    }
  }

  return { sections, faqs, answerMap };
}

module.exports = parseFAQtxt;
