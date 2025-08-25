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
import DocumentProcessor from "./helpers/documentProcessor.mjs";
import { SYSTEM_PROMPT } from "./helpers/systemPrompt.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import createChatModel from "./helpers/modelSelector.js";

const book_search = createBookSearchTool();
const course_book_search = createCourseBookSearchTool();
const database_search = createDatabaseSearchTool();
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
      if (chatLogger?.logChat) {
        try {
          chatLogger.logChat({ answer, context: docs });
        } catch (e) {
          console.warn("⚠️ chatLogger.logChat hata:", e?.message);
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
let tools = [document_search, book_search, course_book_search, database_search];
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
    
    const ai = await model.invoke(messagesToSend);
    return { messages: [ai] };
  })
  // Tool düğümü (adı 'tools' OLMALI ki haritadaki 'tools' hedefine uysun)
  .addNode("tools", new ToolNode(tools))
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

    // Extract the last AI message
    const lastMessage = result.messages[result.messages.length - 1];
    const response = lastMessage.content || 'No response generated';

    console.log(`🤖 AI Response: ${response}`);
    
    res.json({
      success: true,
      response: response,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Chat error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
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
