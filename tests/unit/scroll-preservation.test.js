import test from "node:test";
import assert from "node:assert/strict";
import { renderPreservingScroll } from "../../src/ui/scroll-preservation.js";

test("restores the viewport after rendering a navigation action", () => {
  const callbacks = [];
  const viewport = {
    scrollX: 18,
    scrollY: 742,
    requestAnimationFrame(callback) {
      callbacks.push(callback);
    },
    scrollTo(x, y) {
      this.restored = [x, y];
    }
  };
  let rendered = false;

  renderPreservingScroll(() => {
    rendered = true;
    viewport.scrollX = 0;
    viewport.scrollY = 0;
  }, viewport);

  assert.equal(rendered, true);
  assert.deepEqual(viewport.restored, undefined);
  callbacks[0]();
  assert.deepEqual(viewport.restored, [18, 742]);
});
