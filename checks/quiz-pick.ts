import {
  DEBRIEF_QUIZ_P,
  importanceForCourse,
  pickCourseReview,
  pickDebriefMix,
  shouldOfferDebriefQuiz,
} from "../server/quizPick.js";
import type { Catalog } from "../server/catalog.js";

let failures = 0;

function fail(why: string): void {
  failures += 1;
  console.log(`FAIL ${why}`);
}

const mix = pickDebriefMix({
  related: ["hashing", "sorting", "linear-sorting", "avl"],
  decayed: ["hoeffding", "hashing", "chebyshev", "bfs"],
});
if (mix.slice(0, 3).join(",") !== "hashing,sorting,linear-sorting") {
  fail(`local 3 expected hashing,sorting,linear-sorting got ${mix.slice(0, 3)}`);
}
if (mix.slice(3).join(",") !== "hoeffding,chebyshev") {
  fail(`decay 2 expected hoeffding,chebyshev got ${mix.slice(3)}`);
}
if (new Set(mix).size !== mix.length) fail("debrief mix repeated a concept");
if (mix.length > 5) fail("debrief mix longer than 5");

const shortLocal = pickDebriefMix({
  related: ["hashing"],
  decayed: ["hoeffding", "chebyshev"],
});
if (shortLocal[0] !== "hashing") fail("keeps the lecture concept");
if (shortLocal.length !== 3) fail(`short lecture should be 1+2, got ${shortLocal.length}`);

const review = pickCourseReview(
  ["svd", "eigen", "svd", "projections", "subspaces", "geometry-equations"],
  { svd: 0.9, eigen: 0.1, projections: 0.2, subspaces: 0.15, "geometry-equations": 0.8 },
);
if (review.length !== 5) fail(`review should be 5, got ${review.length}`);
if (new Set(review).size !== 5) fail("review repeated a concept");
if (review[0] !== "eigen") fail(`coldest first, got ${review[0]}`);
if (review.includes("geometry-equations") && review.indexOf("subspaces") > review.indexOf("geometry-equations")) {
  fail("colder subspaces should rank before geometry");
}

const toy: Catalog = {
  courses: [{ id: "c", title: "C", instructors: "", sourceUrl: "https://example.com" }],
  concepts: {
    root: { name: "Root" },
    hashing: { name: "Hashing", parentId: "root", seeAlso: ["sorting"] },
    sorting: { name: "Sorting", parentId: "root" },
    leaf: { name: "Leaf", parentId: "hashing" },
  },
  lectures: {
    c: [
      { n: 1, title: "A", url: "https://example.com", conceptIds: ["hashing"] },
      { n: 2, title: "B", url: "https://example.com", conceptIds: ["hashing", "sorting"] },
      { n: 3, title: "C", url: "https://example.com", conceptIds: ["leaf"] },
    ],
  },
  blurbs: {},
};
const hits = ["hashing", "sorting", "leaf"];
const imp = importanceForCourse(toy, "c", hits);
if (!(imp.hashing > imp.sorting && imp.sorting > imp.leaf)) {
  fail(`importance hashing>sorting>leaf got ${JSON.stringify(imp)}`);
}
const weighted = pickCourseReview(hits, { hashing: 0.9, sorting: 0.9, leaf: 0 }, imp);
if (weighted[0] !== "hashing") {
  fail(`important hashing should beat a cold leaf, got ${weighted[0]}`);
}

if (shouldOfferDebriefQuiz(() => 0.1) !== true) fail("0.1 should offer");
if (shouldOfferDebriefQuiz(() => DEBRIEF_QUIZ_P) !== false) fail("p itself is not below threshold");
if (shouldOfferDebriefQuiz(() => 0.9) !== false) fail("0.9 should not offer");

if (failures) throw new Error(`${failures} quiz-pick check(s) failed`);
console.log(`ok mix ${mix.join(", ")}`);
console.log(`ok review ${review.join(", ")}`);
console.log(`ok weighted ${weighted.join(", ")}`);
