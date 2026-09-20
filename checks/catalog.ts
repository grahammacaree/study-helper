import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadCatalog, relatedConcepts } from "../server/catalog.js";
import {
  fusedCitableResults,
  isReviewLectureTitle,
  isStudyConcept,
} from "../server/conceptShape.js";
import { coursesForConcept, lecturesForConcept } from "../server/library.js";

const catalog = await loadCatalog();
let failures = 0;

function fail(why: string): void {
  failures += 1;
  console.log(`FAIL ${why}`);
}

if (!isReviewLectureTitle("13 Quiz 1 review")) {
  fail("quiz review is a recap lecture");
}
if (!isReviewLectureTitle("Final course review")) {
  fail("final course review is a recap lecture");
}
if (isReviewLectureTitle("Hashing")) fail("Hashing is not a recap lecture");
if (isStudyConcept("Algorithms course synthesis", "algorithms-course-synthesis")) {
  fail("course synthesis is not a study concept");
}
if (!isStudyConcept("Hashing", "hashing")) fail("Hashing is a study concept");
if (!isStudyConcept("Algorithms", "algorithms")) {
  fail("a domain root is still a library ancestor");
}
if (fusedCitableResults("LLN and CLT").join() !== "lln,clt") {
  fail("LLN and CLT is two independently citable results");
}
if (fusedCitableResults("Limit theorems").length) {
  fail("a family bucket is not a fused pair");
}
if (fusedCitableResults("Adam’s law and Eve’s law").length) {
  fail("Adam/Eve are duals of one operator, not two citable mashups");
}
if (fusedCitableResults("Hashing").length) fail("Hashing is a single idea");
if (fusedCitableResults("BFS and DFS").join() !== "bfs,dfs") {
  fail("BFS and DFS should split like named search algorithms");
}

const conceptIds = new Set(Object.keys(catalog.concepts));
for (const [id, def] of Object.entries(catalog.concepts)) {
  if (!isStudyConcept(def.name, id)) {
    fail(`${id} (${def.name}) is a recap, not a study concept`);
  }
  const fused = fusedCitableResults(def.name, id);
  if (fused.length) {
    fail(`${id} mashes ${fused.join(" + ")} into one leaf; split and tag both`);
  }
  if (def.parentId) {
    if (!conceptIds.has(def.parentId)) fail(`parent ${def.parentId} of ${id} is unknown`);
    if (def.parentId === id) fail(`${id} is its own parent`);
  }
  for (const other of def.seeAlso ?? []) {
    if (!conceptIds.has(other)) fail(`seeAlso ${other} from ${id} is unknown`);
  }
}

for (const [id, def] of Object.entries(catalog.concepts)) {
  const seen = new Set<string>();
  let cur: string | undefined = id;
  while (cur) {
    if (seen.has(cur)) {
      fail(`parent cycle at ${id}`);
      break;
    }
    seen.add(cur);
    cur = catalog.concepts[cur]?.parentId;
  }
}

for (const course of catalog.courses) {
  const lectures = catalog.lectures[course.id] ?? [];
  if (!lectures.length) fail(`${course.id} has no lectures`);
  const nums = new Set<number>();
  for (const lec of lectures) {
    if (nums.has(lec.n)) fail(`${course.id} duplicate lecture ${lec.n}`);
    nums.add(lec.n);
    if (!lec.title.trim()) fail(`${course.id} #${lec.n} empty title`);
    if (!lec.url.startsWith("http")) fail(`${course.id} #${lec.n} missing url`);
    if (!lec.conceptIds.length) continue;
    for (const cid of lec.conceptIds) {
      if (!conceptIds.has(cid)) {
        fail(`${course.id} #${lec.n} unknown concept ${cid}`);
      }
    }
  }
  const md = await readFile(
    join(process.cwd(), "courses", course.id, "course.md"),
    "utf8",
  );
  if (md.length > 4000) fail(`${course.id} course.md looks like a note dump`);
}

if (catalog.concepts.poisson?.parentId !== "discrete-named") {
  fail("poisson should sit under named discrete distributions");
}
if (catalog.concepts["limit-theorems"]?.name === "LLN and CLT") {
  fail("limit-theorems is the family, not a mashed LLN+CLT leaf");
}
if (catalog.concepts.lln?.parentId !== "limit-theorems") {
  fail("lln should sit under limit theorems");
}
if (catalog.concepts.clt?.parentId !== "limit-theorems") {
  fail("clt should sit under limit theorems");
}
const lec29 = (catalog.lectures["stat-110"] ?? []).find((l) => l.n === 29);
if (!lec29?.conceptIds.includes("lln") || !lec29.conceptIds.includes("clt")) {
  fail("Stat 110 lecture 29 should tag both lln and clt");
}

if (!relatedConcepts(catalog.concepts, "poisson").some((r) => r.id === "discrete-named")) {
  fail("relatedConcepts should include the parent");
}

const learningSources = coursesForConcept(catalog, "statistical-learning");
if (!learningSources.some((c) => c.id === "learning-from-data")) {
  fail("statistical-learning should source Learning from Data, not a random open course");
}
if (learningSources.some((c) => c.id === "algorithms-6006")) {
  fail("statistical-learning should not source 6.006");
}

const learningLectures = lecturesForConcept(catalog, {}, "statistical-learning");
if (!learningLectures.some((l) => l.courseTitle === "Learning from Data")) {
  fail("statistical-learning From lectures should include Learning from Data");
}

if (failures) throw new Error(`${failures} catalog check(s) failed`);
console.log(
  `ok ${catalog.courses.length} courses, ${conceptIds.size} concepts`,
);
