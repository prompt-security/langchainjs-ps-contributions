import { test } from "@jest/globals";
import { Bedrock } from "../bedrock.js";

test("Test Bedrock", async () => {
  const model = new Bedrock({ maxTokens: 20 });
  const res = await model.call("1 + 1 =");
  console.log(res);
}, 50000);
