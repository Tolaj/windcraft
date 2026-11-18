import { test } from "node:test";
import assert from "node:assert/strict";
import { takeBudget } from "../src/services/render.service.js";

test("a user gets a limited number of screenshots per window, and others are not affected", () => {
    const user = "budget-user-" + Math.random();
    for (let i = 0; i < 20; i++) assert.equal(takeBudget(user).ok, true, `screenshot ${i + 1}`);
    const blocked = takeBudget(user);
    assert.equal(blocked.ok, false);
    assert.ok(blocked.retryInMin >= 1 && blocked.retryInMin <= 10);
    assert.equal(takeBudget("someone-else-" + Math.random()).ok, true);
});
