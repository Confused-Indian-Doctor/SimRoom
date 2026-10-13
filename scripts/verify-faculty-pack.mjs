// Validates a manually mapped, reviewed pack; does not invent missing content.
import fs from "node:fs";
import { validateScenario } from "../functions/engine.js";
const required = [
  "openingHandover",
  "historyAnswers",
  "actorInstructions",
  "nurseInstructions",
  "equipment",
  "debriefQuestions",
  "teachingPoints",
  "exampleSBAR",
  "references",
  "revisionNotes",
  "pilotChecklist",
  "originalText",
];
if (!process.argv[2]) throw Error("Supply the reviewed scenario JSON path.");
for (const path of process.argv.slice(2)) {
  const s = validateScenario(JSON.parse(fs.readFileSync(path, "utf8")));
  for (const field of required)
    if (!s.facultyPack?.[field]?.trim())
      throw Error(`${path}: missing pack section ${field}`);
  const checklist = s.stages.flatMap((st) => st.actions);
  if (checklist.length !== 20)
    throw Error(
      `${path}: expected the pack’s twenty-item checklist, found ${checklist.length}`,
    );
  for (const st of s.stages)
    if (!st.sourceTrigger.trim())
      throw Error(`${path}: missing original stage qualifications`);
  console.log(
    `PASS structured pack completeness: ${path}. Exact source comparison and faculty pilot remain required.`,
  );
}
