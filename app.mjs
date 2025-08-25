// app.mjs
import "dotenv/config";
import { z } from "zod";
import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { PromptTemplate } from "@langchain/core/prompts";
import { StateGraph, MessagesAnnotation } from "@langchain/langgraph";
import { ToolNode, toolsCondition } from "@langchain/langgraph/prebuilt";
import { createBookSearchTool } from "./tools/booksearch.js";
import { createCourseBookSearchTool } from "./tools/coursebooksearch.js";
import { createDatabaseSearchTool } from "./tools/databasesearch.js";
import { createDocumentSearchTool } from "./tools/createDocumentSearchTool.mjs";
import { createITULibrarySearchTool } from "./tools/ituLibrarySearch.js";
import DocumentProcessor from "./helpers/documentProcessor.mjs";
import { SYSTEM_PROMPT } from "./helpers/systemPrompt.js";
import ConversationLogger from "./helpers/logger.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import createChatModel from "./helpers/modelSelector.js";

// Logger instance'ı oluştur
const logger = new ConversationLogger();

const book_search = createBookSearchTool();
const course_book_search = createCourseBookSearchTool();
const database_search = createDatabaseSearchTool();
const itu_library_search = createITULibrarySearchTool();
// __dirname eşleniği (ESM)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let VectorStore = null;
// ---------- Data Loading Function ----------
async function loadDataFiles() {
  console.log("📁 Data klasöründeki dosyalar yükleniyor...");
  
  const dataDir = path.join(__dirname, "data");
  const supportedExtensions = ['.pdf', '.xlsx', '.xls', '.txt', '.json'];
  
  try {
    // Check if data directory exists
    if (!fs.existsSync(dataDir)) {
      console.log("⚠️ Data klasörü bulunamadı, atlanıyor...");
      return null;
    }

    const files = fs.readdirSync(dataDir);
    const supportedFiles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return supportedExtensions.includes(ext);
    });

    if (supportedFiles.length === 0) {
      console.log("ℹ️ Data klasöründe desteklenen dosya bulunamadı.");
      return null;
    }

    console.log(`📋 Bulunan dosyalar: ${supportedFiles.join(", ")}`);

    // Initialize document processor
    const documentProcessor = new DocumentProcessor();
    
    // Process each supported file
    for (const file of supportedFiles) {
      const filePath = path.join(dataDir, file);
      const fileSize = fs.statSync(filePath).size;
      
      console.log(`\n🔄 İşleniyor: ${file} (${(fileSize / 1024).toFixed(1)} KB)`);
      
      try {
        await documentProcessor.processDocument(filePath, file);
        console.log(`✅ ${file} başarıyla işlendi ve vektör deposuna eklendi.`);
      } catch (error) {
        console.error(`❌ ${file} işlenirken hata:`, error.message);
        // Continue with other files even if one fails
      }
    }

    await documentProcessor.processPersonelPage();
    VectorStore = documentProcessor.getVectorStore();
    console.log("\n🎉 Tüm dosyalar işlendi!");
    return documentProcessor;
    
  } catch (error) {
    console.error("❌ Data dosyaları yüklenirken hata:", error.message);
    return null;
  }
}

const document_search = tool(
  async (args) => 
  {
    // Handle different input formats for compatibility: { input } or { query } or direct string
    const userInput =
      (typeof args === "string" ? args : undefined) ??
      args?.input ??
      args?.query ??
      "";

    console.log("🔍 DOCUMENT SEARCH TOOL ÇAĞRILDI");
    console.log(`[TOOL ÇAĞRISI] Sorgu: ${userInput}`);

    if (!userInput.trim()) {
      return "Lütfen arama yapmak için bir kelime girin.";
    }

    if (!VectorStore) {
      return "Vektör deposu boş. Lütfen önce bir belge yükleyin.";
    }

    try {
      // Simple approach: use retriever directly
      const retriever = VectorStore.asRetriever({ k: 5 });
      const docs = await retriever.getRelevantDocuments(userInput);

      if (!docs || docs.length === 0) {
        return "Üzgünüm, bu konu hakkında belgemde yeterli bilgi bulunmuyor.";
      }

      // Combine all relevant documents
      const context = docs.map((doc) => doc.pageContent || "").join("\n\n");
      
      // Create a simple prompt for the chat model
      const prompt = PromptTemplate.fromTemplate(
        `Sen yardımcı bir kütüphane asistanısın. Görevin, SADECE BAĞLAM'da (context) verilen bilgilere dayanarak yanıt vermektir.

KURALLAR:
- BAĞLAM dışında bilgi ekleme, tahmin yürütme veya genelleme yapma.
- BAĞLAM soruyu yanıtlamak için yeterli değilse şu cümleyi aynen döndür: 
  "Üzgünüm, bu konu hakkında belgemde yeterli bilgi bulunmuyor."
- Yanıtı kullanıcının dilinde ver.
- BAĞLAM'da telefon numarası veya web sitesi varsa, bunları HTML <a> etiketiyle ver:
  Örn. Tel: <a href="tel:0000">0000</a>  |  Web: <a href="https://site">site</a>
- BAĞLAM'da görsel dosya bilgisi (ör. resim URL'si) varsa, <img src="..."/> etiketiyle ekleyebilirsin.

BAĞLAM:
{context}

SORU: {input}

YANIT:`
      );

      // Use the chat model to generate a response
      const formattedPrompt = await prompt.format({
        context: context,
        input: userInput
      });

      /*
      const chatModel = new ChatOpenAI({
        model: "gpt-4o-mini", // veya 'gpt-4o', 'gpt-4o-mini-tts' değil!
        temperature: 0,
      })
      */
      const chatModel = new ChatGoogleGenerativeAI({
        model: "gemini-2.5-flash",
        temperature: 0,
        apiKey: process.env.GEMINI_API_KEY,
      })

      const response = await chatModel.invoke([{ role: "user", content: formattedPrompt }]);
      const answer = response.content || "";

      // Log chat if logger is available
      if (logger?.logChat) {
        try {
          logger.logChat({ answer, context: docs });
        } catch (e) {
          console.warn("⚠️ logger.logChat hata:", e?.message);
        }
      }
      
      return answer || "Üzgünüm, bu konu hakkında belgemde yeterli bilgi bulunmuyor.";
      
    } catch (error) {
      console.error("❌ Document search hatası:", error?.message);

      // Fallback: just return first few documents
      try {
        const retriever = VectorStore.asRetriever({ k: 3 });
        const docs = await retriever.getRelevantDocuments(userInput);

        if (docs && docs.length > 0) {
          const context = docs.map((d) => d.pageContent || "").join("\n\n");
          const snippet = context.slice(0, 800);
          return `📚 Bulunan belgelerden alıntı:\n\n${snippet}...`;
        }
        return "İlgili belge bulunamadı.";
      } catch (fallbackError) {
        console.error("❌ Fallback hatası:", fallbackError?.message);
        return `Belge sorgulanırken hata oluştu: ${error?.message}`;
      }
    }
  },
  {
    name: "document_search",
    description: "Kütüphane hakkında bilgileri yüklenen dokümanlardan arama yapar ve sorulara cevap verir.",
    schema: z.object({ input: z.string() }),
  }
);

// Initialize tools array with basic tools
let tools = [document_search, book_search, course_book_search, database_search, itu_library_search];
let docTool = null;

// Model oluştur
//const { chatModel, embeddingModel } = createChatModel("openai");
//const model = chatModel;
// ---------- Model ----------
/*
const model = new ChatOpenAI({
  model: "gpt-4o-mini", // veya 'gpt-4o', 'gpt-4o-mini-tts' değil!
  temperature: 0,
}).bindTools(tools);
*/

const model = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
  temperature: 0,
  apiKey: process.env.GEMINI_API_KEY,
}).bindTools(tools);

// ---------- Graph ----------
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

// ---------- HTTP Server Setup ----------
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    tools: tools.length,
    vectorStore: VectorStore ? 'Loaded' : 'Not loaded'
  });
});

// Chat endpoint
app.post('/chat', async (req, res) => {
  const startTime = Date.now();
  let conversationId = null;
  
  try {
    const { message } = req.body;
    
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ 
        error: 'Message is required and must be a string' 
      });
    }

    console.log(`💬 Chat request: ${message}`);
    
    // Invoke the graph with the user message
    const result = await graph.invoke({
      messages: [new HumanMessage(message)],
    });

    console.log(result)
    // Tüm mesajları incele ve tool kullanımını tespit et
    const allMessages = result.messages;
    const response = allMessages[allMessages.length - 1]?.content || 'No response generated';
    const totalExecutionTime = Date.now() - startTime;

    console.log(`🤖 AI Response: ${response}`);
    
    // Tool kullanımını tüm mesajlardan tespit et
    let actualToolsUsed = [];
    let actualLLMCalls = [];
    
    for (let i = 0; i < allMessages.length; i++) {
      const msg = allMessages[i];
      const msgType = msg._getType();
      
      if (msgType === 'tool') {
        // Tool mesajı - tool kullanımı ve cevabı
        const toolName = msg.name || 'unknown_tool';
        const toolDescription = tools.find(t => t.name === toolName)?.description || 'Unknown tool';
        
        const toolLog = logger.logToolUsage({
          toolName: toolName,
          toolDescription: toolDescription,
          input: msg.content || 'No input',
          output: msg.content || 'No output',
          executionTime: 0, // Tool mesajında execution time yok
          success: true,
          status: 'completed',
          messageIndex: i,
          messageType: msgType
        });
        
        actualToolsUsed.push(toolLog);
      } else if (msgType === 'ai' && msg.tool_calls && msg.tool_calls.length > 0) {
        // AI mesajı ama tool çağrısı var - tool isteği
        for (const toolCall of msg.tool_calls) {
          const toolLog = logger.logToolUsage({
            toolName: toolCall.name,
            toolDescription: tools.find(t => t.name === toolCall.name)?.description || 'Unknown tool',
            input: toolCall.args,
            output: 'Tool execution pending',
            executionTime: 0,
            success: false,
            status: 'requested',
            messageIndex: i,
            messageType: msgType
          });
          
          actualToolsUsed.push(toolLog);
        }
      } else if (msgType === 'ai' && !msg.tool_calls) {
        // AI mesajı ama tool çağrısı yok - direkt cevap
        const noToolLog = logger.logToolUsage({
          toolName: 'no_tool_used',
          toolDescription: 'Agent decided not to use any tools',
          input: 'Direct response without tool usage',
          output: msg.content,
          executionTime: 0,
          success: true,
          status: 'direct_response',
          messageIndex: i,
          messageType: msgType
        });
        
        actualToolsUsed.push(noToolLog);
      }
    }
    
    // LLM çağrılarını da tüm mesajlardan tespit et
    if (result.logs && result.logs.llmCalls) {
      actualLLMCalls = result.logs.llmCalls;
    }
    
    // Konuşmayı logla
    try {
      conversationId = logger.logAgentInteraction({
        userMessage: message,
        agentResponse: response,
        steps: [
          ...actualLLMCalls,
          ...actualToolsUsed
        ],
        toolsUsed: actualToolsUsed,
        llmCalls: actualLLMCalls,
        errors: result.logs?.errors || [],
        metadata: {
          totalExecutionTime,
          totalMessages: allMessages.length,
          model: model.constructor.name,
          temperature: model.temperature || 0,
          messageTypes: allMessages.map(msg => msg._getType())
        }
      });
      
      console.log(`📝 Conversation logged with ID: ${conversationId}`);
    } catch (logError) {
      console.warn('⚠️ Loglama hatası:', logError.message);
    }
    
         // Token kullanım bilgilerini hesapla
     let totalInputTokens = 0;
     let totalOutputTokens = 0;
     let totalTokens = 0;
     
     if (actualLLMCalls && actualLLMCalls.length > 0) {
       actualLLMCalls.forEach(llmCall => {
         totalInputTokens += llmCall.inputTokens || 0;
         totalOutputTokens += llmCall.outputTokens || 0;
         totalTokens += llmCall.totalTokens || 0;
       });
     }
     
     res.json({
       success: true,
       response: response,
       timestamp: new Date().toISOString(),
       conversationId: conversationId,
       executionTime: totalExecutionTime,
       toolsUsed: result.logs?.toolsUsed?.length || 0,
       llmCalls: result.logs?.llmCalls?.length || 0,
       toolDetails: actualToolsUsed.map(tool => ({
         name: tool.toolName,
         status: tool.status,
         executionTime: tool.executionTime,
         messageIndex: tool.messageIndex,
         messageType: tool.messageType,
         input: tool.input,
         output: tool.output
       })) || [],
       tokenUsage: {
         input: totalInputTokens,
         output: totalOutputTokens,
         total: totalTokens
       }
     });

  } catch (error) {
    const totalExecutionTime = Date.now() - startTime;
    console.error('❌ Chat error:', error);
    
    // Hata durumunda da logla
    try {
      conversationId = logger.logAgentInteraction({
        userMessage: req.body?.message || 'Unknown message',
        agentResponse: 'Error occurred during processing',
        steps: [],
        toolsUsed: [],
        llmCalls: [],
        errors: [logger.logError({
          error,
          context: 'Chat endpoint',
          stack: error.stack
        })],
        metadata: {
          totalExecutionTime,
          totalMessages: 0,
          model: model.constructor.name,
          temperature: model.temperature || 0,
          error: true
        }
      });
    } catch (logError) {
      console.warn('⚠️ Error logging failed:', logError.message);
    }
    
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message,
      conversationId: conversationId,
      executionTime: totalExecutionTime
    });
  }
});

// Get available tools endpoint
app.get('/tools', (req, res) => {
  const toolsInfo = tools.map(tool => ({
    name: tool.name,
    description: tool.description
  }));
  
  res.json({
    tools: toolsInfo,
    count: tools.length
  });
});

// Get vector store status
app.get('/vectorstore', (req, res) => {
  if (!VectorStore) {
    return res.status(404).json({ 
      error: 'Vector store not loaded' 
    });
  }
  
  res.json({
    status: 'Loaded',
    timestamp: new Date().toISOString()
  });
});

// ---------- Logging Endpoints ----------

// Get all conversations
app.get('/logs/conversations', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    
    const conversations = logger.getConversations(limit, offset);
    
    res.json({
      success: true,
      conversations,
      pagination: {
        limit,
        offset,
        total: conversations.length
      }
    });
  } catch (error) {
    console.error('❌ Get conversations error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

// Get conversation by ID
app.get('/logs/conversations/:id', (req, res) => {
  try {
    const { id } = req.params;
    const conversation = logger.getConversationById(id);
    
    if (!conversation) {
      return res.status(404).json({ 
        error: 'Conversation not found' 
      });
    }
    
    res.json({
      success: true,
      conversation
    });
  } catch (error) {
    console.error('❌ Get conversation error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

// Search conversations
app.get('/logs/search', (req, res) => {
  try {
    const { q: query } = req.query;
    
    if (!query) {
      return res.status(400).json({ 
        error: 'Search query is required' 
      });
    }
    
    const results = logger.searchConversations(query);
    
    res.json({
      success: true,
      results,
      query,
      count: results.length
    });
  } catch (error) {
    console.error('❌ Search conversations error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

// Get conversation statistics
app.get('/logs/stats', (req, res) => {
  try {
    const stats = logger.getConversationStats();
    
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('❌ Get stats error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

// Cleanup old logs
app.delete('/logs/cleanup', (req, res) => {
  try {
    const daysToKeep = parseInt(req.query.days) || 30;
    const deletedCount = logger.cleanupOldLogs(daysToKeep);
    
    res.json({
      success: true,
      message: `${deletedCount} old log entries cleaned up`,
      daysKept: daysToKeep
    });
  } catch (error) {
    console.error('❌ Cleanup logs error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

// ---------- Main Function ----------
const run = async () => {
  try {
    await loadDataFiles();
    // Rebind tools to model
    //model.bindTools(tools); (openai için)
    console.log(`🎯 Toplam ${tools.length} araç yüklendi:`);
    tools.forEach((tool, index) => {
      console.log(`   ${index + 1}. ${tool.name} - ${tool.description}`);
    });

    // Start HTTP server
    app.listen(PORT, () => {
      console.log(`🚀 HTTP Server başlatıldı: http://localhost:${PORT}`);
      console.log(`📡 Endpoints:`);
      console.log(`   GET  /health - Server durumu`);
      console.log(`   POST /chat - Chat endpoint`);
      console.log(`   GET  /tools - Mevcut araçlar`);
      console.log(`   GET  /vectorstore - Vector store durumu`);
      console.log(`📝 Logging Endpoints:`);
      console.log(`   GET  /logs/conversations - Tüm konuşmalar`);
      console.log(`   GET  /logs/conversations/:id - Konuşma detayı`);
      console.log(`   GET  /logs/search?q=query - Konuşma arama`);
      console.log(`   GET  /logs/stats - İstatistikler`);
      console.log(`   DELETE /logs/cleanup?days=30 - Eski logları temizle`);
    });
    
  } catch (error) {
    console.error("❌ Uygulama çalıştırılırken hata:", error);
    process.exit(1);
  }
};

// Run the application
run().catch((e) => {
  console.error(e);
  process.exit(1);
});
