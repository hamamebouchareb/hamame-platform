export interface SessionQuestionSortKey {
  id: string;
  examYear: number | null;
  unit: {
    module: {
      orderIndex: number;
      year: {
        orderIndex: number;
      };
    };
  };
}

/**
 * Group-sorts selected questions by curriculum/exam-year key; ties preserve
 * their original (shuffled) order.
 */
export function sortQuestionIdsByKey<T extends { id: string }>(
  selected: T[],
  keyRows: SessionQuestionSortKey[],
  sort: "by_year" | "by_course" | "random"
): T[] {
  if (sort === "random" || selected.length <= 1) {
    return selected;
  }
  const shuffledIndexById = new Map(selected.map((question, index) => [question.id, index]));
  const keyById = new Map(keyRows.map((row) => [row.id, row]));

  return [...selected].sort((a, b) => {
    const keyA = keyById.get(a.id)!;
    const keyB = keyById.get(b.id)!;

    if (sort === "by_year") {
      if (keyA.examYear !== null && keyB.examYear !== null) {
        if (keyA.examYear !== keyB.examYear) {
          return keyB.examYear - keyA.examYear;
        }
      } else if (keyA.examYear !== null) {
        return -1;
      } else if (keyB.examYear !== null) {
        return 1;
      }
    }

    const yearDiff = keyA.unit.module.year.orderIndex - keyB.unit.module.year.orderIndex;
    if (yearDiff !== 0) return yearDiff;

    if (sort === "by_course") {
      const moduleDiff = keyA.unit.module.orderIndex - keyB.unit.module.orderIndex;
      if (moduleDiff !== 0) return moduleDiff;
    }

    return shuffledIndexById.get(a.id)! - shuffledIndexById.get(b.id)!;
  });
}
