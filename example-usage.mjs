// example-usage.mjs
// Example of how to use the LangGraph compatible tools

import { createAllTools } from './tools/index.mjs';
import { SYSTEM_PROMPT } from './helpers/systemPrompt.js';
import { ChatOpenAI } from '@langchain/openai';
import { StateGraph, END } from '@langchain/langgraph';

// Example setup
async function setupLibraryAgent() {
  // Initialize your chat model
  const chatModel = new ChatOpenAI({
    modelName: "gpt-4",
    temperature: 0,
    openAIApiKey: process.env.OPENAI_API_KEY,
  });

  // Initialize your document processor (if you have one)
  const documentProcessor = null; // Replace with your actual document processor

  // Create all tools
  const tools = createAllTools(chatModel, documentProcessor);
  
  // Bind tools to the model
  const modelWithTools = chatModel.bindTools(Object.values(tools));

  // Create the state graph
  const workflow = new StateGraph({
    channels: {
      messages: {
        value: (x) => x.messages,
        default: () => [],
      },
      tools: {
        value: (x) => x.tools,
        default: () => [],
      },
    },
  });

  // Add nodes
  workflow.addNode("agent", modelWithTools);
  
  // Add edges
  workflow.addEdge("agent", END);

  // Compile the workflow
  const app = workflow.compile();

  return { app, tools };
}

// Example of how to use a single tool
async function useSingleTool() {
  const { createBookSearchTool } = await import('./tools/index.mjs');
  
  const bookSearchTool = createBookSearchTool();
  
  // Use the tool
  const result = await bookSearchTool.invoke({ input: "Simyacı" });
  console.log("Book search result:", result);
}

// Example of how to run the agent
async function runAgent() {
  const { app } = await setupLibraryAgent();
  
  const result = await app.invoke({
    messages: [
      {
        role: "user",
        content: "Simyacı kitabı nerede bulunur?"
      }
    ]
  });
  
  console.log("Agent result:", result);
}

// Export for use in other files
export { setupLibraryAgent, useSingleTool, runAgent };

// Uncomment to run examples
// runAgent().catch(console.error);
// useSingleTool().catch(console.error);

