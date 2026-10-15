import { teachingFormatIssues } from "../server/teachingFormat.js";

let failures = 0;

function fail(why: string): void {
  failures += 1;
  console.log(`FAIL ${why}`);
}

if (teachingFormatIssues("A tree has $|E| = |V| - 1$.").length) {
  fail("balanced inline math should pass");
}

if (teachingFormatIssues("Show\n$$\n|E|=|V|-1\n$$\n.").length) {
  fail("balanced display math should pass");
}

if (teachingFormatIssues("see $a =\nb$ next").length) {
  fail("inline math split across one linebreak should pass");
}

if (teachingFormatIssues("price is \\$5 not maths").length) {
  fail("escaped dollar should pass");
}

if (teachingFormatIssues("use `|E|` in prose").length) {
  fail("backtick code should not count dollars");
}

const stray = teachingFormatIssues(
  "acyclic with $|E| = $|V| - 1$. The $|E| = |V| - 1$ identity.",
);
if (!stray.some((m) => /unclosed \$/.test(m))) {
  fail("stray $ before |V| must report unclosed $ (graph-theory footgun)");
}

const odd = teachingFormatIssues("starts $x and never closes");
if (!odd.some((m) => /unclosed \$/.test(m))) {
  fail("odd opening $ should fail");
}

const display = teachingFormatIssues("$$\n|E|=n\n");
if (!display.some((m) => /unclosed \$\$/.test(m))) {
  fail("unclosed $$ should fail");
}

if (failures) {
  console.log(`${failures} teaching-format check(s) failed`);
  process.exit(1);
}
console.log("ok teaching-format");
