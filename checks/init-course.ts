import {
  looksLikeCourseUrl,
  matchExistingCourse,
} from "../server/initCourse.js";

function fail(why: string): never {
  throw new Error(why);
}

if (!looksLikeCourseUrl("https://oyc.yale.edu/economics/econ-159")) {
  fail("https listing should count as a URL");
}
if (!looksLikeCourseUrl("stat110.hsites.harvard.edu/youtube")) {
  fail("host/path without scheme should count as a URL");
}
if (looksLikeCourseUrl("game theory")) {
  fail("a topic with spaces is not a URL");
}
if (looksLikeCourseUrl("Stat 110")) {
  fail("a course nickname is not a URL");
}

const courses = [
  { id: "stat-110", title: "Statistics & Probability", instructors: "", sourceUrl: "" },
  { id: "learning-from-data", title: "Learning from Data", instructors: "", sourceUrl: "" },
];
if (matchExistingCourse(courses, "Stat 110")?.id !== "stat-110") {
  fail("slug nickname should match");
}
if (matchExistingCourse(courses, "Learning from Data")?.id !== "learning-from-data") {
  fail("exact title should match");
}
if (matchExistingCourse(courses, "game theory")) {
  fail("unknown topic should not match");
}

console.log("ok course topic vs URL vs catalog match");
