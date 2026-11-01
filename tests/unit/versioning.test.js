import test from "node:test";
import assert from "node:assert/strict";
import { bumpVersion, classifyVersionLevel } from "../../scripts/versioning.mjs";

test("increments patch versions", () => {
  assert.equal(bumpVersion("0.1.2", "patch"), "0.1.3");
});

test("increments minor and resets patch", () => {
  assert.equal(bumpVersion("0.1.9", "minor"), "0.2.0");
});

test("increments major and resets minor and patch", () => {
  assert.equal(bumpVersion("0.9.9", "major"), "1.0.0");
});

test("rejects invalid version levels", () => {
  assert.throws(() => bumpVersion("0.1.2", "release"), /Nível de versão inválido/);
});

test("classifies documentation-only changes without increment", () => {
  assert.equal(classifyVersionLevel({ paths: ["docs/DEVELOPMENT.md"], diff: "+texto" }), null);
});

test("classifies a compatible fix as patch", () => {
  assert.equal(classifyVersionLevel({ paths: ["src/catalog/customer-screen.js"], diff: "-old\n+new" }), "patch");
});

test("classifies a new capability as minor", () => {
  assert.equal(classifyVersionLevel({
    paths: ["src/ui/feedback.js"],
    diff: "+export const clearRenderedFeedback = (root) => root.remove();"
  }), "minor");
});

test("classifies a newly added source file as minor", () => {
  assert.equal(classifyVersionLevel({
    paths: ["src/ui/new-control.js"],
    addedPaths: ["src/ui/new-control.js"],
    diff: ""
  }), "minor");
});

test("requires an explicit breaking marker for major", () => {
  assert.equal(classifyVersionLevel({
    paths: ["src/server/server.js"],
    diff: "+// BREAKING CHANGE: remove legacy route"
  }), "major");
});
