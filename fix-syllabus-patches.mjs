// Wires the new syllabus / lesson plan / topic objectives / table features into three files
// you already had:
//   1. app/admin/applications/page.js : shows the new structure, and copies the syllabus to the course on approval
//   2. app/courses/[id]/page.js        : shows learning objectives and subtopics above the notes
//   3. app/globals.css                 : styles for tables and the objectives box
// Safe to run more than once. If a spot can't be found it says so and changes nothing in that file.
// Usage (from your project root):  node fix-syllabus-patches.mjs
import fs from "node:fs";

function patch(file, label, marker, apply) {
  if (!fs.existsSync(file)) {
    console.log(`SKIP    ${label}: ${file} not found`);
    return;
  }
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  const src = raw.replace(/\r\n/g, "\n");
  if (src.includes(marker)) {
    console.log(`OK      ${label}: already applied`);
    return;
  }
  const problems = [];
  const out = apply(src, problems);
  if (problems.length) {
    console.log(`MANUAL  ${label}: couldn't find ${problems.join("; ")}. Nothing was changed in ${file}.`);
    return;
  }
  fs.writeFileSync(file, crlf ? out.replace(/\n/g, "\r\n") : out);
  console.log(`PATCHED ${label}`);
}

function replaceOnce(s, problems, what, find, replacement) {
  const i = s.indexOf(find);
  if (i === -1) {
    problems.push(what);
    return s;
  }
  return s.slice(0, i) + replacement + s.slice(i + find.length);
}

patch("app/admin/applications/page.js", "admin review page", "PlanView", (s, problems) => {
  s = replaceOnce(s, problems, "the AppHeader import", 'import AppHeader from "@/components/app-header";',
    'import AppHeader from "@/components/app-header";\nimport PlanView from "@/components/plan-view";');
  s = replaceOnce(s, problems, "the lesson_plan line in the approval", "        lesson_plan: app.lesson_plan,\n",
    "        lesson_plan: app.lesson_plan,\n        scheme_of_work: app.scheme_of_work,\n");

  const re = /( *)<p style=\{\{ fontWeight: 600, marginTop: 12 \}\}>Scheme of work[\s\S]*?\(app\.lesson_plan \|\| \[\]\)\.map\(\(w, i\) => <li key=\{i\}>\{w\}<\/li>\)\}\n *<\/ol>\n/;
  const m = s.match(re);
  if (!m) problems.push("the scheme of work / lesson plan lists");
  else s = s.replace(re, `${m[1]}<PlanView syllabus={app.scheme_of_work} lessonPlan={app.lesson_plan} />\n`);
  return s;
});

patch("app/courses/[id]/page.js", "student topic page", "TopicOutline", (s, problems) => {
  s = replaceOnce(s, problems, "the sanitize import", 'import { sanitizeHtml } from "@/lib/sanitize";',
    'import { sanitizeHtml } from "@/lib/sanitize";\nimport TopicOutline from "@/components/topic-outline";');
  s = replaceOnce(s, problems, "the topics select list",
    "avg_rating, rating_count, youtube_video_id\"", "avg_rating, rating_count, youtube_video_id, learning_objectives, subtopics\"");
  const re = /^( *)<div className="prose" dangerouslySetInnerHTML=\{\{ __html: sanitizeHtml\(topic\.content\) \}\} \/>$/m;
  const m = s.match(re);
  if (!m) problems.push("the topic notes block");
  else s = s.replace(re, `${m[1]}<TopicOutline objectives={topic.learning_objectives} subtopics={topic.subtopics} />\n${m[0]}`);
  return s;
});

const CSS = `
/* tables and topic outline */
.prose table,
.rte__content table {
  border-collapse: collapse;
  margin: 12px 0;
  max-width: 100%;
}
.prose table {
  display: block;
  overflow-x: auto;
}
.prose th,
.prose td,
.rte__content th,
.rte__content td {
  border: 1px solid var(--rule);
  padding: 6px 10px;
  text-align: left;
  vertical-align: top;
  min-width: 70px;
}
.prose th,
.rte__content th {
  background: var(--moss-light);
  font-weight: 600;
}
.prose td p,
.prose th p,
.rte__content td p,
.rte__content th p {
  margin: 0;
}
.rte__content .selectedCell {
  background: #dfe9e3;
}
.rte__toolbar--table {
  border-top: 1px dashed var(--rule);
}
.rte__toolbar-label {
  align-self: center;
  color: var(--ink-600);
  font-size: 12px;
  margin-right: 4px;
}
.topic-outline {
  background: var(--moss-light);
  border-left: 3px solid var(--moss);
  border-radius: 6px;
  margin: 8px 0 14px;
  padding: 10px 14px;
}
.topic-outline__title {
  color: var(--moss);
  font-weight: 600;
  margin: 8px 0 2px;
}
.topic-outline__title:first-child {
  margin-top: 0;
}
.topic-outline__lede {
  color: var(--ink-600);
  font-size: 13px;
  margin: 0 0 4px;
}
.topic-outline ul {
  margin: 0 0 4px;
  padding-left: 20px;
}
`;

patch("app/globals.css", "styles", "/* tables and topic outline */", (s) => s.replace(/\n*$/, "\n") + CSS);
