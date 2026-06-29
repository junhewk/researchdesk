import { test } from "node:test";
import assert from "node:assert/strict";
import { toFtsMatchQuery } from "./search";

test("FTS sanitizer quotes each token (neutralizes the colon column-filter)", () => {
  // raw "management:" used to throw "no such column: management"
  assert.equal(toFtsMatchQuery("self-management: digital health"), '"self" "management" "digital" "health"');
});

test("FTS sanitizer neutralizes operators and quotes", () => {
  assert.equal(toFtsMatchQuery('foo AND -bar* "baz"'), '"foo" "AND" "bar" "baz"');
  assert.equal(toFtsMatchQuery("a OR b NEAR(c)"), '"a" "OR" "b" "NEAR" "c"');
});

test("FTS sanitizer returns empty for punctuation-only input", () => {
  assert.equal(toFtsMatchQuery("  :::  "), "");
  assert.equal(toFtsMatchQuery(""), "");
});

test("FTS sanitizer keeps unicode word characters", () => {
  assert.equal(toFtsMatchQuery("café 数据"), '"café" "数据"');
});
