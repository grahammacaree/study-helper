import { keepUnlockedConceptLinks } from "../server/catalog.js";
import {
  mergeLectureConceptIds,
  suggestedConceptIds,
} from "../server/lectureMap.js";
import type { ConceptDef } from "../server/types.js";

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
  "second-order-ode": {
    name: "Second-order linear ODEs",
    parentId: "differential-equations",
  },
  "complex-exp": {
    name: "Complex exponentials and sinusoids",
    parentId: "differential-equations",
  },
  "exponential": {
    name: "Exponential and memorylessness",
    parentId: "continuous",
  },
  continuous: { name: "Continuous distributions" },
  "discrete-named": { name: "Named discrete distributions" },
  geometric: { name: "Geometric", parentId: "discrete-named" },
  hypergeometric: { name: "Hypergeometric", parentId: "discrete-named" },
};

if (
  suggestedConceptIds("First-order Linear ODEs with Constant Coefficients", concepts).join() !==
  "first-order-ode"
) {
  fail("a first-order title should tag first-order-ode, not its siblings");
}
if (
  suggestedConceptIds("Second-order Linear ODEs", concepts).join() !== "second-order-ode"
) {
  fail("a second-order title should tag second-order-ode");
}
if (suggestedConceptIds("13 Quiz 1 review", concepts).join()) {
  fail("a review lecture should not pick up tags from its title");
}
if (
  suggestedConceptIds("Continuation", concepts, ["first-order-ode"]).join() !==
  "first-order-ode"
) {
  fail("a bare Continuation should inherit the previous lecture's tags");
}
if (
  !suggestedConceptIds(
    "Continuation: Complex Characteristic Roots",
    concepts,
    ["second-order-ode"],
  ).includes("second-order-ode")
) {
  fail("a named Continuation should keep the prior leaf when the title is opaque");
}

if (
  suggestedConceptIds("Complex Numbers and Complex Exponentials", concepts).join() !==
  "complex-exp"
) {
  fail("complex numbers / exponentials should tag complex-exp despite trailing sinusoids in the name");
}
if (
  suggestedConceptIds("Complex Numbers and Complex Exponentials", concepts).includes(
    "exponential",
  )
) {
  fail("complex exponentials should not tag the memoryless exponential");
}
if (
  suggestedConceptIds("The Geometrical View of y'= f(x,y)", concepts).includes(
    "geometric",
  )
) {
  fail("geometrical slope fields should not tag the geometric distribution");
}
if (
  suggestedConceptIds("Random variables, CDFs, PMFs, Hypergeometric", concepts).includes(
    "geometric",
  )
) {
  fail("a hypergeometric title should not tag geometric");
}
if (
  !suggestedConceptIds(
    "Independence, Geometric, expected values",
    concepts,
  ).includes("geometric")
) {
  fail("a lecture that names Geometric should still tag it");
}
if (
  mergeLectureConceptIds(
    ["geometric"],
    [],
    concepts,
    "The Geometrical View of y'= f(x,y)",
  ).includes("geometric")
) {
  fail("an embedded geometric tag should drop even when the title names nothing else");
}
if (
  !mergeLectureConceptIds(
    ["first-order-ode"],
    [],
    concepts,
    "Euler's Numerical Method for y'=f(x,y)",
  ).includes("first-order-ode")
) {
  fail("a tag the title does not name should stay when it is not an embedded substring");
}

const merged = mergeLectureConceptIds(
  ["complex-exp"],
  ["first-order-ode"],
  concepts,
  "First-order Linear with Constant Coefficients",
);
if (!merged.includes("first-order-ode")) {
  fail("a first-order title should pick up first-order-ode");
}
if (merged.includes("complex-exp")) {
  fail("stale tags that the title does not name should drop when retagging");
}

const stripped = keepUnlockedConceptLinks(
  "See [Second-order linear ODEs](concept:second-order-ode) after first-order.",
  new Set(["first-order-ode", "differential-equations"]),
);
if (stripped.includes("concept:second-order-ode")) {
  fail("unmet catalog links should not stay clickable");
}
if (!stripped.includes("Second-order linear ODEs")) {
  fail("unmet links should keep their label as plain text");
}
if (
  !keepUnlockedConceptLinks(
    "[First-order ODEs](concept:first-order-ode)",
    new Set(["first-order-ode"]),
  ).includes("concept:first-order-ode")
) {
  fail("unlocked catalog links should stay");
}

if (failures) throw new Error(`${failures} lecture-map check(s) failed`);
console.log("ok lecture-map");
