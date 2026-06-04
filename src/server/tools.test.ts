import assert from "node:assert/strict";
import test from "node:test";
import { buildSystemPrompt } from "./tools";

test("revision prompt includes adequacy-check instructions", () => {
  const prompt = buildSystemPrompt(
    "revision",
    {
      manuscriptId: "ms",
      manuscriptTitle: "Revision 2",
      manuscriptContent: "Manuscript body",
      commentaries: "Editor: minor revision needed",
      projectRoot: "/tmp/project",
      primaryFile: "manuscript.md",
      projectFiles: [
        "manuscript.md",
        "Revision 2 letter_BMC_Gerodontology Edu.md",
        "Figure 2_300dpi.jpg",
      ],
    },
    { runtime: "overlay", apiBaseUrl: "http://localhost:3871" },
  );

  assert.match(prompt, /revision adequacy check/i);
  assert.match(prompt, /map each editor\/reviewer point/i);
  assert.match(prompt, /figures\/schematics are cited/i);
  assert.match(prompt, /JPG without an editable source/i);
});
