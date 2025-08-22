// test-simple.mjs
import "dotenv/config";
import { ChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";

console.log("Testing basic imports...");

try {
  const model = new ChatOpenAI({
    model: "gpt-4o-mini",
    temperature: 0,
    openAIApiKey: process.env.OPENAI_API_KEY || "dummy-key",
  });
  
  console.log("✅ ChatOpenAI imported successfully");
  console.log("✅ Tool imported successfully");
  
  console.log("🎉 All basic imports working!");
  
} catch (error) {
  console.error("❌ Error:", error.message);
}
