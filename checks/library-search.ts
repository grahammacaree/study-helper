import { searchLibrary } from "../web/src/librarySearch.js";
import type { ConceptDef, KnowledgeEntry } from "../server/types.js";

let failures = 0;

function fail(why: string): void {
  failures += 1;
  console.log(`FAIL ${why}`);
}

const concepts: Record<string, ConceptDef> = {
  "differential-equations": { name: "Differential equations" },
  "first-order-ode": {
    name: "First-order ODEs",
    parentId: "differential-equations",
  },
  hashing: { name: "Hashing", parentId: "algorithms" },
  algorithms: { name: "Algorithms" },
};

const unlocked = new Set([
  "differential-equations",
  "first-order-ode",
  "hashing",
  "algorithms",
]);

const knowledge: KnowledgeEntry[] = [
  {
    id: "first-order-ode",
    status: "known",
    note: "Field picture before formulas.",
    theorems: [
      {
        title: "Existence and uniqueness",
        claim:
          "Through a point where $f$ and $\\partial f/\\partial y$ are continuous, $y'=f(x,y)$ has a unique solution.",
        status: "asserted",
      },
    ],
  },
];

const teachings = {
  hashing: "Simple uniform hashing; expected chain length is the load factor.",
};

const eu = searchLibrary("existence uniqueness", unlocked, concepts, knowledge, teachings);
if (!eu.some((h) => h.id === "first-order-ode")) {
  fail("existence/uniqueness should hit first-order-ode via theorem title");
}
if (eu[0]?.id !== "first-order-ode") {
  fail("theorem title hits should rank above weaker matches");
}

const hash = searchLibrary("load factor", unlocked, concepts, knowledge, teachings);
if (!hash.some((h) => h.id === "hashing")) {
  fail("teaching text should be searchable");
}

const nameHit = searchLibrary("hash", unlocked, concepts, knowledge, teachings);
if (!nameHit.some((h) => h.id === "hashing" && h.where === "name")) {
  fail("concept names should match");
}

if (searchLibrary("x", unlocked, concepts, knowledge, teachings).length) {
  fail("queries shorter than 2 chars should return nothing");
}

if (searchLibrary("chromatic", unlocked, concepts, knowledge, teachings).length) {
  fail("locked or absent topics should not appear");
}

if (failures) throw new Error(`${failures} library-search check(s) failed`);
console.log("ok library-search");
