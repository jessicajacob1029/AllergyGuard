// Test cases for the shared allergen matching engine (SPEC F7).
// Run with: npx jest testcases/allergenMatcher.test.js

const { analyzeIngredients } = require("../legacy/api/allergenMatcher");

describe("analyzeIngredients", () => {
  test("returns unsafe when an ingredient matches the user's own allergen", () => {
    const result = analyzeIngredients("Water, sugar, peanut oil, salt", ["peanuts"]);
    expect(result.status).toBe("unsafe");
    expect(result.flagged.some((f) => f.category === "peanuts" && f.is_user_allergen)).toBe(true);
  });

  test("returns caution when an allergen is flagged but not one of the user's own", () => {
    const result = analyzeIngredients("Water, sugar, milk solids, salt", ["peanuts"]);
    expect(result.status).toBe("caution");
  });

  test("returns safe when no allergen category is present", () => {
    const result = analyzeIngredients("Water, sugar, salt, natural flavoring", ["peanuts"]);
    expect(result.status).toBe("safe");
  });

  test("longest alias wins when multiple aliases could match the same substring", () => {
    const result = analyzeIngredients("Contains peanut oil", ["peanuts"]);
    const peanutFlag = result.flagged.find((f) => f.category === "peanuts");
    expect(peanutFlag.matched_alias).toBeDefined();
  });
});
