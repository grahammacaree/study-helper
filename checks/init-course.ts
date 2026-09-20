import {
  looksLikeCourseUrl,
  matchExistingCourse,
  finishedCourseMeta,
  studyingCourseMeta,
  parseCourseLectures,
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
  { id: "stat-110", title: "Statistics & Probability", instructors: "", sourceUrl: "https://stat110.hsites.harvard.edu/youtube" },
  { id: "learning-from-data", title: "Learning from Data", instructors: "", sourceUrl: "https://work.caltech.edu/telecourse.html" },
  {
    id: "math-for-cs-6042",
    title: "Mathematics for Computer Science",
    instructors: "",
    sourceUrl: "https://ocw.mit.edu/courses/6-042j-mathematics-for-computer-science-fall-2010/",
    track: "later" as const,
  },
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
if (
  matchExistingCourse(
    courses,
    "https://ocw.mit.edu/courses/6-042j-mathematics-for-computer-science-fall-2010/pages/calendar/",
  )?.id !== "math-for-cs-6042"
) {
  fail("OCW listing URL should match a parked course");
}

const closed = finishedCourseMeta({
  id: "algorithms-6006",
  title: "Intro to Algorithms",
  instructors: "",
  sourceUrl: "https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/",
  track: "currently",
  latest: 19,
});
if (closed.track !== "previously") fail("finished course should be previously");
if (closed.complete !== true) fail("finished course should be complete");
if (closed.latest != null) fail("finished course should drop latest");

const opened = studyingCourseMeta({
  ...courses[2],
  track: "later",
});
if (opened.track !== "currently") fail("later course should reopen as currently");
if (opened.complete) fail("reopened later course should not be marked complete");

const gallery = parseCourseLectures(
  `<a href="/courses/18-03/resources/lecture-1-the-geometrical-view-of-y-f-x-y/">Lecture 1: The Geometrical View of y'= f(x,y)</a>
   <a href="/courses/18-03/resources/lecture-2-eulers-numerical-method/">Lecture 2: Euler's Numerical Method for y'=f(x,y)</a>
   <a href="/courses/18-03/pages/calendar/">L1 Direction fields</a>`,
  "https://ocw.mit.edu/courses/18-03/video_galleries/video-lectures/",
);
if (gallery.length !== 2) fail(`video gallery should beat a calendar row, got ${gallery.length}`);
if (!gallery[0].url.includes("/resources/lecture-1-")) {
  fail("video lecture url should be the resource page");
}
if (gallery[0].title.includes("Direction fields")) {
  fail("video title should come from the gallery, not the calendar");
}

console.log("ok course topic vs URL vs catalog match");
