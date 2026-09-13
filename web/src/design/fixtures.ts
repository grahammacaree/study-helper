import { seedConceptOutline } from "../conceptOutline";
import type {
  AuthStatus,
  CatalogPayload,
  InspectPayload,
  SessionSnapshot,
} from "../types";

export const AUTH_OK: AuthStatus = {
  hasKey: true,
  configured: true,
  models: ["composer-2.5"],
};

export const AUTH_MISSING: AuthStatus = {
  hasKey: false,
  configured: false,
};

const inspect: InspectPayload = {
  courseId: "algorithms-6006",
  courseTitle: "Intro to Algorithms",
  lecture: {
    n: 4,
    title: "Hashing",
    url: "https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/pages/calendar/",
    conceptIds: ["hashing"],
  },
  courseBlurb:
    "MIT 6.006, Spring 2020 — Demaine, Ku, Solomon.\n\nStructural aim: modelling computational problems.",
  knowledgeSlice: "- `hashing` — shaky: collisions still fuzzy",
  lectureSummary: "## Summary\nSimple uniform hashing; chaining vs open addressing.",
  sideQuests: [
    {
      id: "q-demo",
      title: "Universal hashing",
      status: "open",
      source: "model",
      courseId: "algorithms-6006",
      lectureN: 4,
      notes: "Why a family beats a fixed hash.",
    },
  ],
};

export const FIX_CATALOG: CatalogPayload = {
  openQuests: inspect.sideQuests,
  questConceptIds: [],
  knowledge: [
    { id: "sorting", status: "known", note: "comparison lower bound" },
  ],
  concepts: {
    algorithms: { name: "Algorithms" },
    sorting: { name: "Comparison sorting", parentId: "algorithms" },
    hashing: {
      name: "Hashing",
      parentId: "algorithms",
      seeAlso: ["sorting"],
    },
    "linear-sorting": { name: "Linear-time sorting", parentId: "sorting" },
  },
  decay: {
    sorting: { freshness: 0.8, directAt: 1 },
  },
  courses: [
    {
      id: "algorithms-6006",
      title: "Intro to Algorithms",
      instructors: "Demaine, Ku and Solomon (2020)",
      sourceUrl: "https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/",
      blurb: inspect.courseBlurb,
      lectures: [
        {
          n: 3,
          title: "Sets and Sorting",
          url: inspect.lecture!.url,
          conceptIds: ["sorting"],
          status: "complete",
        },
        {
          n: 4,
          title: "Hashing",
          url: inspect.lecture!.url,
          conceptIds: ["hashing"],
          status: "incomplete",
        },
        {
          n: 5,
          title: "Linear Sorting",
          url: inspect.lecture!.url,
          conceptIds: ["linear-sorting"],
          status: "incomplete",
        },
      ],
    },
  ],
};

function session(
  partial: Partial<SessionSnapshot> & Pick<SessionSnapshot, "phase" | "kind">,
): SessionSnapshot {
  return {
    id: "fix",
    courseId: "algorithms-6006",
    lectureN: 4,
    quizQueue: [],
    coveredConcepts: [],
    inspect,
    messages: [],
    offeredQuests: [],
    busy: false,
    ...partial,
  };
}

export const SCENARIOS: {
  id: string;
  label: string;
  note: string;
  session: SessionSnapshot | null;
  error?: string;
  busy?: boolean;
  catalog?: CatalogPayload;
}[] = [
  {
    id: "no-key",
    label: "Home, no API key",
    note: "Course map, key warning, no tabs in chat compose",
    session: null,
    catalog: FIX_CATALOG,
  },
  {
    id: "home",
    label: "Home with progress",
    note: "Check on complete lectures; only the next incomplete is open",
    session: null,
    catalog: FIX_CATALOG,
  },
  {
    id: "home-review",
    label: "Finished course",
    note: "Review button on a complete course; still no Quiz",
    session: null,
    catalog: {
      ...FIX_CATALOG,
      questConceptIds: ["universal-hashing"],
      knowledge: [
        ...FIX_CATALOG.knowledge,
        { id: "universal-hashing", status: "known", note: "Side quest." },
      ],
      concepts: {
        ...FIX_CATALOG.concepts,
        "universal-hashing": {
          name: "Universal hashing",
          parentId: "hashing",
        },
      },
      conceptTeachings: {
        "universal-hashing":
          "## What universal means\n\nThe guarantee is about the draw of the family.",
      },
      courses: [
        {
          ...FIX_CATALOG.courses[0],
          complete: true,
          lectures: FIX_CATALOG.courses[0].lectures.map((lec) => ({
            ...lec,
            status: "complete" as const,
          })),
        },
      ],
    },
  },
  {
    id: "debrief-wait",
    label: "Debrief awaiting summary",
    note: "Summary tab on composer; inspect outline",
    session: session({
      kind: "debrief",
      phase: "awaiting_summary",
      messages: [
        {
          id: "m1",
          role: "assistant",
          kind: "status",
          text: "Lecture 4: Hashing. Paste the summary you wrote.",
          at: 1,
        },
      ],
    }),
  },
  {
    id: "debrief-card",
    label: "Debrief with corrections",
    note: "Correction gate; Side quest chip if you want a detour",
    session: session({
      kind: "debrief",
      phase: "correction_gate",
      debrief: {
        corrections: ["Load factor is n/m, not m/n."],
        gaps: ["Did not mention chaining vs probing."],
        summaryNote: "The picture of expected chain length is there; the load-factor definition slipped.",
        offeredQuests: [
          { title: "Universal hashing", why: "Why a family beats a fixed function." },
        ],
      },
      offeredQuests: [
        { title: "Universal hashing", why: "Why a family beats a fixed function." },
      ],
      messages: [
        {
          id: "m1",
          role: "user",
          kind: "text",
          text: "Hashing gives expected O(1) if the table is big.",
          at: 1,
        },
        {
          id: "m2",
          role: "assistant",
          kind: "debrief",
          text: "The picture of expected chain length is there; the load-factor definition slipped.",
          at: 2,
          debrief: {
            corrections: ["Load factor is n/m, not m/n."],
            gaps: ["Did not mention chaining vs probing."],
            summaryNote: "The picture of expected chain length is there; the load-factor definition slipped.",
            offeredQuests: [
              { title: "Universal hashing", why: "Why a family beats a fixed function." },
            ],
          },
        },
      ],
    }),
  },
  {
    id: "quiz",
    label: "Quiz item",
    note: "After-debrief mix: must pick an answer, no skip",
    session: session({
      kind: "quiz",
      phase: "quiz_item",
      quizMode: "after_debrief",
      quizQueue: ["hashing", "sorting"],
      quiz: {
        conceptId: "hashing",
        prompt: "Why does simple uniform hashing give expected $O(1)$ search with chaining?",
        choices: [
          { id: "a", text: "The load factor $\\alpha = n/m$ is the expected chain length." },
          { id: "b", text: "Every key hashes to a unique slot." },
          { id: "c", text: "The table is always rebuilt after two inserts." },
          { id: "d", text: "Open addressing guarantees constant worst-case time." },
        ],
        correctId: "a",
        noteHint: "your L4 write-up, chaining vs probing",
        why: "Under simple uniform hashing, a search looks at about $\\alpha = n/m$ keys.",
        index: 1,
        total: 2,
      },
      messages: [
        {
          id: "m1",
          role: "assistant",
          kind: "quiz",
          text: "Why does simple uniform hashing give expected O(1) search with chaining?",
          at: 1,
          quiz: {
            conceptId: "hashing",
            prompt: "Why does simple uniform hashing give expected $O(1)$ search with chaining?",
            choices: [
              { id: "a", text: "The load factor $\\alpha = n/m$ is the expected chain length." },
              { id: "b", text: "Every key hashes to a unique slot." },
              { id: "c", text: "The table is always rebuilt after two inserts." },
              { id: "d", text: "Open addressing guarantees constant worst-case time." },
            ],
            correctId: "a",
            noteHint: "your L4 write-up, chaining vs probing",
            why: "Under simple uniform hashing, a search looks at about $\\alpha = n/m$ keys.",
            index: 1,
            total: 2,
          },
        },
      ],
    }),
  },
  {
    id: "quiz-thin",
    label: "Quiz wrong choice",
    note: "Stays on the item; notes hint; Skip chip present on Review",
    session: session({
      kind: "quiz",
      phase: "quiz_item",
      quizMode: "review",
      quizQueue: ["hashing"],
      quiz: {
        conceptId: "hashing",
        prompt: "Why expected $O(1)$?",
        choices: [
          { id: "a", text: "$\\alpha = n/m$" },
          { id: "b", text: "Because hashing is magic" },
        ],
        correctId: "a",
        pickedId: "b",
        noteHint: "your hashing notes",
        why: "Name the load factor.",
        index: 1,
        total: 1,
      },
      messages: [
        {
          id: "m1",
          role: "assistant",
          kind: "quiz",
          text: "Why expected $O(1)$?",
          at: 1,
          quiz: {
            conceptId: "hashing",
            prompt: "Why expected $O(1)$?",
            choices: [
              { id: "a", text: "$\\alpha = n/m$" },
              { id: "b", text: "Because hashing is magic" },
            ],
            correctId: "a",
            pickedId: "b",
            noteHint: "your hashing notes",
            why: "Name the load factor.",
            index: 1,
            total: 1,
          },
        },
        {
          id: "m2",
          role: "user",
          kind: "text",
          text: "Because hashing is magic",
          at: 2,
        },
        {
          id: "m3",
          role: "assistant",
          kind: "status",
          text: "Name the load factor. Peek at your hashing notes if you want a reminder.",
          at: 3,
        },
      ],
    }),
  },
  {
    id: "find",
    label: "New course",
    note: "Topic chat; pick a public lecture series; Ask only",
    session: session({
      kind: "find",
      phase: "find",
      courseId: "",
      questTitle: "Game theory",
      offeredCourses: [
        {
          title: "Yale ECON 159 — Game Theory",
          url: "https://oyc.yale.edu/economics/econ-159",
          why: "Full video lecture series with a public listing.",
        },
      ],
      messages: [
        {
          id: "m1",
          role: "assistant",
          kind: "text",
          text: "Yale's ECON 159 is the usual freely available video series. MIT OCW has notes-heavy options if you want more problem sets skipped.",
          at: 1,
        },
      ],
    }),
  },
  {
    id: "quest",
    label: "Side quest",
    note: "Own chat pane; Done stays off until teach-back and quiz",
    session: session({
      kind: "quest",
      phase: "quest",
      questId: "q-demo",
      questTitle: "Universal hashing",
      messages: [
        {
          id: "m2",
          role: "assistant",
          kind: "text",
          text: "## What universal means\n\nThe guarantee is **probabilistic and about the draw of $h$**, not a single lucky function.\n\n- [Universal hashing (Wikipedia)](https://en.wikipedia.org/wiki/Universal_hashing)",
          at: 2,
        },
      ],
    }),
  },
  {
    id: "concept",
    label: "Concept",
    note: "Stored teaching in the chat pane; Ask only; Quiz for non-roots",
    session: session({
      kind: "concept",
      phase: "concept",
      conceptId: "hashing",
      questTitle: "Hashing",
      offersConceptQuiz: true,
      messages: [
        {
          id: "m1",
          role: "assistant",
          kind: "text",
          text: "A hash family maps keys into $\\{0,\\ldots,m-1\\}$. Reach for it when you want expected $O(1)$ under a load factor $\\alpha = n/m$.\n\n## From lectures\n- Intro to Algorithms L4: Hashing\n\n## See also\n- [Algorithms](concept:algorithms)\n- [Comparison sorting](concept:sorting)",
          at: 1,
        },
      ],
    }),
  },
  {
    id: "concept-quiz",
    label: "Concept quiz",
    note: "Teaching hidden during the check; item in the chat pane",
    session: session({
      kind: "concept",
      phase: "quiz_item",
      quizMode: "concept",
      conceptId: "hashing",
      questTitle: "Hashing",
      offersConceptQuiz: true,
      quizQueue: ["hashing"],
      quiz: {
        conceptId: "hashing",
        prompt: "What does the load factor $\\alpha = n/m$ measure?",
        choices: [
          { id: "a", text: "How full the table is." },
          { id: "b", text: "The bit width of $h$." },
        ],
        correctId: "a",
        why: "Items over slots.",
        index: 1,
        total: 1,
      },
      messages: [
        {
          id: "m1",
          role: "assistant",
          kind: "text",
          text: "A hash family maps keys into $\\{0,\\ldots,m-1\\}$. Reach for it when you want expected $O(1)$ under a load factor $\\alpha = n/m$.\n\n## From lectures\n- Intro to Algorithms L4: Hashing",
          at: 1,
        },
        {
          id: "m2",
          role: "assistant",
          kind: "quiz",
          text: "What does the load factor $\\alpha = n/m$ measure?",
          at: 2,
          quiz: {
            conceptId: "hashing",
            prompt: "What does the load factor $\\alpha = n/m$ measure?",
            choices: [
              { id: "a", text: "How full the table is." },
              { id: "b", text: "The bit width of $h$." },
            ],
            correctId: "a",
            why: "Items over slots.",
            index: 1,
            total: 1,
          },
        },
      ],
    }),
  },
  {
    id: "concept-gen",
    label: "Concept generating",
    note: "New concept clears the old teaching; Quiz off; one Working row",
    busy: true,
    session: session({
      kind: "concept",
      phase: "concept",
      conceptId: "hashing",
      questTitle: "Hashing",
      offersConceptQuiz: true,
      busy: true,
      workingOn: "Generating text…",
      generatingOutline: seedConceptOutline("Hashing", "Algorithms"),
      messages: [
        {
          id: "m1",
          role: "assistant",
          kind: "status",
          text: "Generating text…",
          at: 1,
        },
      ],
    }),
  },
  {
    id: "done",
    label: "Done",
    note: "New session chip; no composer",
    session: session({
      kind: "debrief",
      phase: "done",
      messages: [
        {
          id: "m1",
          role: "assistant",
          kind: "status",
          text: "Stored as debriefed. Next session will read the files, not this chat.",
          at: 1,
        },
      ],
    }),
  },
  {
    id: "busy",
    label: "Working",
    note: "Interrupt row instead of composer",
    busy: true,
    session: session({
      kind: "debrief",
      phase: "awaiting_summary",
      busy: true,
      workingOn: "Reading summary…",
      messages: [
        {
          id: "m1",
          role: "assistant",
          kind: "status",
          text: "Lecture 4: Hashing. Paste the summary you wrote.",
          at: 1,
        },
      ],
    }),
  },
];
