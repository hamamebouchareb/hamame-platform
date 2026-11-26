import test from "node:test";
import assert from "node:assert/strict";
import { sortQuestionIdsByKey, type SessionQuestionSortKey } from "./session-sort";

test("sortQuestionIdsByKey sorts by_year descending by examYear (nulls last) under the same Résidanat year", () => {
  const selected = [
    { id: "q-null" },
    { id: "q-2023" },
    { id: "q-2026" },
    { id: "q-2025-a" },
    { id: "q-2025-b" },
  ];

  const keyRows: SessionQuestionSortKey[] = [
    { id: "q-null", examYear: null, unit: { module: { orderIndex: 1, year: { orderIndex: 7 } } } },
    { id: "q-2023", examYear: 2023, unit: { module: { orderIndex: 1, year: { orderIndex: 7 } } } },
    { id: "q-2026", examYear: 2026, unit: { module: { orderIndex: 1, year: { orderIndex: 7 } } } },
    { id: "q-2025-a", examYear: 2025, unit: { module: { orderIndex: 1, year: { orderIndex: 7 } } } },
    { id: "q-2025-b", examYear: 2025, unit: { module: { orderIndex: 2, year: { orderIndex: 7 } } } },
  ];

  const sorted = sortQuestionIdsByKey(selected, keyRows, "by_year");
  assert.deepEqual(
    sorted.map((q) => q.id),
    ["q-2026", "q-2025-a", "q-2025-b", "q-2023", "q-null"]
  );
});
