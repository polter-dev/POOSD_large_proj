const { Anthropic } = require("@anthropic-ai/sdk");
const httpError = require("../utils/httpError");

const nullable = (type) => ({ anyOf: [{ type }, { type: "null" }] });

// The draft PhotoItem list (docs/api-contract.md). The controller re-checks every menuItemId against the DB.
const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          menuItemId: nullable("string"),
          name: { type: "string" },
          chainName: nullable("string"),
          servings: { type: "number" },
          calories: { type: "number" },
          proteinG: nullable("number"),
          carbsG: nullable("number"),
          fatG: nullable("number"),
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["menuItemId", "name", "chainName", "servings", "calories", "proteinG", "carbsG", "fatG", "confidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

const RULES = `You read a photo of a meal for a calorie tracker and list the foods and drinks in it.
- List each distinct food or drink you can see, at most 10. If there is no food, return an empty list.
- If an item is on the menu below, set menuItemId to its id and copy its name and chain. Only use ids from the menu.
- Otherwise set menuItemId to null, give it a short name, chainName null unless the packaging shows a chain, and estimate calories and grams of protein, carbs and fat.
- calories and macros are for one serving. servings is how many servings the photo shows, from 0.25 to 10.
- confidence is how sure you are of the item and portion: high, medium or low.

Menu (id | chain | name | kcal per serving):
`;

// menu: [{ _id, chainName, name, calories }] in a stable order, so the cached system prompt is reused.
// Returns the model's raw item list; never logs the image.
async function analyzeMeal({ imageBase64, mediaType, menu }) {
  // Community-submitted names can't start a new line in the prompt.
  const clean = (t) => String(t).replace(/[\x00-\x1f\x7f\u0085\u2028\u2029]+/g, " ");
  const menuText = menu.map((m) => `${m._id} | ${clean(m.chainName)} | ${clean(m.name)} | ${m.calories}`).join("\n");
  // 25 s x 2 attempts stays under the mobile client's 60 s request limit.
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 25000, maxRetries: 1 });
  let msg;
  try {
    msg = await client.messages.create({
      model: process.env.PHOTO_MODEL || "claude-haiku-5-5",
      max_tokens: 16000,
      system: [{ type: "text", text: RULES + menuText, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
            { type: "text", text: "List the food in this photo." },
          ],
        },
      ],
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
    });
  } catch (err) {
    console.error(`[photo] Claude request failed: ${err.status || ""} ${err.message}`);
    throw httpError(502, "Photo analysis failed");
  }
  // refusal or max_tokens: the text may not match the schema.
  if (msg.stop_reason !== "end_turn") {
    console.error(`[photo] stop_reason ${msg.stop_reason}`);
    throw httpError(502, "Photo analysis failed");
  }
  try {
    return JSON.parse(msg.content.find((b) => b.type === "text").text).items;
  } catch {
    throw httpError(502, "Photo analysis failed");
  }
}

module.exports = { analyzeMeal };
