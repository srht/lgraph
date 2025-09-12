import { StateGraph, MessagesAnnotation } from "@langchain/langgraph";
import { ToolNode, toolsCondition } from "@langchain/langgraph/prebuilt";
import { SystemMessage } from "@langchain/core/messages";

function stateGraphGenerator(model, tools, toolsCondition, SYSTEM_PROMPT, logger) {
const graph = new StateGraph(MessagesAnnotation)
  // LLM düğümü
  .addNode("agent", async (state) => {
    const startTime = Date.now();
    
    // Add system prompt only if it's not already present
    const messages = state.messages;
    const hasSystemMessage = messages.some(msg => msg._getType() === "system");
    
    let messagesToSend;
    if (!hasSystemMessage && messages.length > 0) {
      // Add system message at the beginning for the first interaction
      messagesToSend = [new SystemMessage(SYSTEM_PROMPT), ...messages];
    } else {
      messagesToSend = messages;
    }
    
    try {
      const ai = await model.invoke(messagesToSend);
      const executionTime = Date.now() - startTime;
      
             // Token sayısını hesapla
       let inputTokens = 0;
       let outputTokens = 0;
       let totalTokens = 0;
       
       // LangChain response'dan token bilgisi al
       if (ai.usage_metadata) {
         // LangChain'den gelen token bilgisi
         inputTokens = ai.usage_metadata.input_tokens || 0;
         outputTokens = ai.usage_metadata.output_tokens || 0;
         totalTokens = ai.usage_metadata.total_tokens || 0;
       } else if (ai.usage) {
         // Gemini API'den token bilgisi al
         inputTokens = ai.usage.promptTokenCount || 0;
         outputTokens = ai.usage.candidatesTokenCount || 0;
         totalTokens = ai.usage.totalTokenCount || 0;
       } else {
         // Fallback: yaklaşık token hesaplama (1 token ≈ 4 karakter)
         const inputText = messagesToSend.map(msg => msg.content).join(' ');
         const outputText = ai.content || '';
         inputTokens = Math.ceil(inputText.length / 4);
         outputTokens = Math.ceil(outputText.length / 4);
         totalTokens = inputTokens + outputTokens;
       }
      
      // LLM çağrısını logla
      const llmCall = logger.logLLMCall({
        model: model.constructor.name,
        input: messagesToSend.map(msg => ({
          type: msg._getType(),
          content: msg.content
        })),
        output: {
          type: ai._getType(),
          content: ai.content
        },
        executionTime,
        temperature: model.temperature || 0,
        inputTokens,
        outputTokens,
        totalTokens
      });
      
      // Tool kullanımını kontrol et ve logla
      let toolUsageLogs = [];
      if (ai.tool_calls && ai.tool_calls.length > 0) {
        // Agent tool kullanmaya karar verdi
        for (const toolCall of ai.tool_calls) {
          const toolLog = logger.logToolUsage({
            toolName: toolCall.name,
            toolDescription: tools.find(t => t.name === toolCall.name)?.description || "Unknown tool",
            input: toolCall.args,
            output: "Tool execution pending",
            executionTime: 0,
            success: false,
            status: "requested"
          });
          toolUsageLogs.push(toolLog);
        }
      } else {
        // Agent tool kullanmadan direkt cevap verdi
        const noToolLog = logger.logToolUsage({
          toolName: "no_tool_used",
          toolDescription: "Agent decided not to use any tools",
          input: "Direct response without tool usage",
          output: ai.content,
          executionTime: executionTime,
          success: true,
          status: "direct_response"
        });
        toolUsageLogs.push(noToolLog);
      }
      
      // State'e log bilgilerini ekle
      if (!state.logs) state.logs = {};
      if (!state.logs.llmCalls) state.logs.llmCalls = [];
      if (!state.logs.toolsUsed) state.logs.toolsUsed = [];
      
      state.logs.llmCalls.push(llmCall);
      state.logs.toolsUsed.push(...toolUsageLogs);
      
      return { messages: [ai], logs: state.logs };
    } catch (error) {
      // Hata logla
      const errorLog = logger.logError({
        error,
        context: "LLM agent node",
        stack: error.stack
      });
      
      if (!state.logs) state.logs = {};
      if (!state.logs.errors) state.logs.errors = [];
      state.logs.errors.push(errorLog);
      
      throw error;
    }
  })
  // Tool düğümü (adı 'tools' OLMALI ki haritadaki 'tools' hedefine uysun)
  .addNode("tools", async (state) => {
    const startTime = Date.now();
    
    try {
      // ToolNode'u çalıştır
      const toolNode = new ToolNode(tools);
      const result = await toolNode.invoke(state);
      
      const executionTime = Date.now() - startTime;
      
      // Tool execution'ı logla
      if (result.messages && result.messages.length > 0) {
        const lastMessage = result.messages[result.messages.length - 1];
        if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
          for (const toolCall of lastMessage.tool_calls) {
            const toolLog = logger.logToolUsage({
              toolName: toolCall.name,
              toolDescription: tools.find(t => t.name === toolCall.name)?.description || "Unknown tool",
              input: toolCall.args,
              output: lastMessage.content,
              executionTime,
              success: true,
              status: "executed"
            });
            
            if (!result.logs) result.logs = {};
            if (!result.logs.toolsUsed) result.logs.toolsUsed = [];
            result.logs.toolsUsed.push(toolLog);
          }
        }
      }
      
      // State'e log bilgilerini ekle
      if (!result.logs) result.logs = {};
      if (state.logs) {
        result.logs = { ...state.logs, ...result.logs };
      }
      
      return result;
    } catch (error) {
      // Hata logla
      const errorLog = logger.logError({
        error,
        context: "Tools node",
        stack: error.stack
      });
      
      if (!state.logs) state.logs = {};
      if (!state.logs.errors) state.logs.errors = [];
      state.logs.errors.push(errorLog);
      
      throw error;
    }
  })
  // Başlangıç
  .addEdge("__start__", "agent")
  // Koşullu dallanma
  .addConditionalEdges(
    "agent",
    (state) => {
      // toolsCondition bazen null/undefined dönebilir; normalize ediyoruz
      const d = toolsCondition(state);
      // Debug etmek istersen:
      // console.log('[branch decision]', d);
      return d === "tools" ? "tools" : "end";
    },
    {
      tools: "tools", // tool çağrısı varsa 'tools' düğümüne
      end: "__end__", // yoksa bitir
      default: "__end__", // beklenmedik/null durumlarda da bitir
    }
  )
  // Araçlar çalıştıktan sonra cevabı finalize etmek için tekrar modele dön
  .addEdge("tools", "agent")
  .compile();

  return graph;
}

export default stateGraphGenerator;