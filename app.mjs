// app.mjs - Refactored with helper classes
import "dotenv/config";

import { toolsCondition } from "@langchain/langgraph/prebuilt";
import { createCourseBookSearchTool } from "./tools/coursebooksearch.js";
import { createDatabaseSearchTool } from "./tools/databasesearch.js";
import { createITULibrarySearchTool } from "./tools/ituLibrarySearch.js";
import { createLibraryWebSearchTool } from "./tools/libraryWebSearch.js";
import { createJournalSubscriptionSearchTool } from "./tools/journalSubscriptionSearch.js";
import { buildDocumentSearchTool } from "./helpers/data/docsRetriever.js";
import { SYSTEM_PROMPT } from "./helpers/data/systemPrompt.js";
import express from "express";
import cors from "cors";
import stateGraphGenerator from "./helpers/functions/stateGraphGenerator.js";

// Import helper classes
import ModelInitializer from "./helpers/model/modelInitializer.js";
import DataLoader from "./helpers/data/dataLoader.js";
import QueueManager from "./helpers/queue/queueManager.js";
import ApiHandlers from "./helpers/api/apiHandlers.js";
import ResponseProcessor from "./helpers/functions/responseProcessor.js";
import LoggingHandlers from "./helpers/logging/loggingHandlers.js";
import VectorStoreHandlers from "./helpers/vectorstore/vectorStoreHandlers.js";

// Initialize helper instances
const modelInitializer = new ModelInitializer();
const dataLoader = new DataLoader();
const queueManager = new QueueManager();
const apiHandlers = new ApiHandlers();
const responseProcessor = new ResponseProcessor();
const loggingHandlers = new LoggingHandlers();
const vectorStoreHandlers = new VectorStoreHandlers();

// Global variables
let VectorStore = null;
let documentProcessor = null;
let tools = [];
let model = null;

// Initialize tools
const course_book_search = createCourseBookSearchTool();
const database_search = createDatabaseSearchTool();
const itu_library_search = createITULibrarySearchTool();
const library_web_search = createLibraryWebSearchTool();
const journal_subscription_search = createJournalSubscriptionSearchTool();

// Initialize models and data
async function initializeApplication() {
  try {
    console.log("🚀 Uygulama başlatılıyor...");

    // Initialize models
    const { chatModel, embeddingModel } =
      await modelInitializer.initializeModels();
    model = chatModel;

    // Initialize document processor
    documentProcessor = dataLoader.initializeDocumentProcessor(embeddingModel);

    // Load data files
    await dataLoader.loadDataFiles(documentProcessor);

    // Get vector store
    VectorStore = dataLoader.getVectorStore();

    // Build document search tool
    const document_search2 = buildDocumentSearchTool({
      vectorStore: VectorStore,
    });

    // Initialize tools array
    tools = [
      document_search2,
      course_book_search,
      database_search,
      itu_library_search,
      library_web_search,
      journal_subscription_search,
    ];

    // Bind tools to model
    model = model.bindTools(tools);

    // Initialize queue manager
    queueManager.initializeQuestionQueue(model, tools, toolsCondition);

    // Set document processor for vector store handlers
    vectorStoreHandlers.setDocumentProcessor(documentProcessor);

    console.log("✅ Uygulama başarıyla başlatıldı");
  } catch (error) {
    console.error("❌ Uygulama başlatma hatası:", error);
    throw error;
  }
}

// ---------- HTTP Server Setup ----------
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// ---------- API Endpoints ----------

// Health check endpoint
app.get("/health", (req, res) => {
  apiHandlers.handleHealthCheck(req, res, tools, VectorStore);
});

// Chat endpoint - Queue based
app.post("/askchat", (req, res) => {
  apiHandlers.handleChatQueue(req, res, queueManager);
});

// Get result endpoint
app.get("/askchat/result/:processId", (req, res) => {
  apiHandlers.handleGetResult(req, res, queueManager);
});

// Original chat endpoint (for immediate processing)
app.post("/askchat/immediate", (req, res) => {
  apiHandlers.handleImmediateChat(req, res, {
    model,
    tools,
    toolsCondition,
    SYSTEM_PROMPT,
    stateGraphGenerator,
    responseProcessor,
  });
});

// Get available tools endpoint
app.get("/tools", (req, res) => {
  apiHandlers.handleGetTools(req, res, tools);
});

// Queue management endpoints
app.get("/queue/stats", (req, res) => {
  apiHandlers.handleQueueStats(req, res, queueManager);
});

app.get("/queue/status/:processId", (req, res) => {
  apiHandlers.handleQueueStatus(req, res, queueManager);
});

app.post("/queue/clear", (req, res) => {
  apiHandlers.handleClearQueue(req, res, queueManager);
});

app.post("/queue/cleanup", (req, res) => {
  apiHandlers.handleCleanupQueue(req, res, queueManager);
});

// Conversation management endpoints
app.get("/conversations/:userId", (req, res) => {
  apiHandlers.handleGetConversation(req, res);
});

app.delete("/conversations/:userId", (req, res) => {
  apiHandlers.handleDeleteConversation(req, res);
});

app.get("/conversations", (req, res) => {
  apiHandlers.handleGetAllConversations(req, res);
});

app.get("/conversations/:userId/summary", (req, res) => {
  apiHandlers.handleGetConversationSummary(req, res);
});

app.post("/conversations/:userId/test", (req, res) => {
  apiHandlers.handleTestConversation(req, res);
});

// Vector store endpoints
app.get("/vectorstore", (req, res) => {
  vectorStoreHandlers.handleGetVectorStore(req, res, VectorStore);
});

// ---------- Logging Endpoints ----------

// Get all conversations
app.get("/logs/conversations", (req, res) => {
  loggingHandlers.handleGetConversations(req, res);
});

// Get conversation by ID
app.get("/logs/conversations/:id", (req, res) => {
  loggingHandlers.handleGetConversationById(req, res);
});

// Search conversations
app.get("/logs/search", (req, res) => {
  loggingHandlers.handleSearchConversations(req, res);
});

// Get conversation statistics
app.get("/logs/stats", (req, res) => {
  loggingHandlers.handleGetStats(req, res);
});

// Cleanup old logs
app.delete("/logs/cleanup", (req, res) => {
  loggingHandlers.handleCleanupLogs(req, res);
});

// ---------- Genel Amaçlı Loglama Endpoints ----------

// Text loglama endpoint
app.post("/logs/text", (req, res) => {
  loggingHandlers.handleLogText(req, res);
});

// JSON loglama endpoint
app.post("/logs/json", (req, res) => {
  loggingHandlers.handleLogJSON(req, res);
});

// Debug loglama endpoint
app.post("/logs/debug", (req, res) => {
  loggingHandlers.handleLogDebug(req, res);
});

// Error loglama endpoint
app.post("/logs/error", (req, res) => {
  loggingHandlers.handleLogError(req, res);
});

// Performance loglama endpoint
app.post("/logs/performance", (req, res) => {
  loggingHandlers.handleLogPerformance(req, res);
});

// Log dosyalarını listele
app.get("/logs/files", (req, res) => {
  loggingHandlers.handleGetLogFiles(req, res);
});

// Log dosyası oku
app.get("/logs/files/:fileName", (req, res) => {
  loggingHandlers.handleReadLogFile(req, res);
});

// ---------- Vector Store Cache Yönetimi Endpoints ----------

// Cache durumunu al
app.get("/cache/status", (req, res) => {
  vectorStoreHandlers.handleGetCacheStatus(req, res);
});

// Cache'i temizle
app.get("/cache/clear", (req, res) => {
  vectorStoreHandlers.handleClearCache(req, res);
});

// Cache'den yeniden yükle
app.get("/cache/reload", (req, res) => {
  vectorStoreHandlers.handleReloadCache(req, res, (newVectorStore) => {
    VectorStore = newVectorStore;
  });
});

// Cache'e kaydet
app.get("/cache/save", (req, res) => {
  vectorStoreHandlers.handleSaveCache(req, res);
});

// Dosyaları yeniden işle (cache'i bypass et)
app.get("/cache/rebuild", (req, res) => {
  vectorStoreHandlers.handleRebuildCache(
    req,
    res,
    (processor) => dataLoader.loadDataFiles(processor),
    (newVectorStore) => {
      VectorStore = newVectorStore;
      documentProcessor = dataLoader.getDocumentProcessor();
    }
  );
});

// ---------- Main Function ----------
const run = async () => {
  try {
    // Initialize application
    await initializeApplication();

    console.log(`🎯 Toplam ${tools.length} araç yüklendi:`);
    tools.forEach((tool, index) => {
      console.log(`   ${index + 1}. ${tool.name} - ${tool.description}`);
    });

    // Start HTTP server
    app.listen(PORT, () => {
      console.log(`🚀 HTTP Server başlatıldı: http://localhost:${PORT}`);
      console.log(`📡 Endpoints:`);
      console.log(`   GET  /health - Server durumu`);
      console.log(`   POST /askchat - Kuyruğa soru gönder (dakikada 15 limit)`);
      console.log(`   GET  /askchat/result/:processId - Soru sonucunu al`);
      console.log(`   POST /askchat/immediate - Anlık soru (kuyruk bypass)`);
      console.log(`   GET  /tools - Mevcut araçlar`);
      console.log(`🔄 Queue Management:`);
      console.log(`   GET  /queue/stats - Kuyruk istatistikleri`);
      console.log(`   GET  /queue/status/:processId - İşlem durumu`);
      console.log(`   POST /queue/clear - Kuyruğu temizle`);
      console.log(`   POST /queue/cleanup - Eski sonuçları temizle`);
      console.log(`   GET  /vectorstore - Vector store durumu ve içerik`);
      console.log(`   GET  /vectorstore?search=query - Vector store'da arama`);
      console.log(`   GET  /vectorstore?showAll=true - Tüm dokümanları göster`);
      console.log(`💬 Conversation Endpoints:`);
      console.log(`   GET  /conversations - Tüm conversation'ları listele`);
      console.log(
        `   GET  /conversations/:userId - Belirli kullanıcının conversation'ı`
      );
      console.log(
        `   GET  /conversations/:userId/summary - Conversation özeti`
      );
      console.log(`   DELETE /conversations/:userId - Conversation'ı temizle`);
      console.log(`📝 Logging Endpoints:`);
      console.log(`   GET  /logs/conversations - Tüm konuşmalar`);
      console.log(`   GET  /logs/conversations/:id - Konuşma detayı`);
      console.log(`   GET  /logs/search?q=query - Konuşma arama`);
      console.log(`   GET  /logs/stats - İstatistikler`);
      console.log(`   DELETE /logs/cleanup?days=30 - Eski logları temizle`);
      console.log(`🔧 Genel Loglama Endpoints:`);
      console.log(`   POST /logs/text - Text loglama`);
      console.log(`   POST /logs/json - JSON loglama`);
      console.log(`   POST /logs/debug - Debug loglama`);
      console.log(`   POST /logs/error - Error loglama`);
      console.log(`   POST /logs/performance - Performance loglama`);
      console.log(
        `   GET  /logs/files?pattern=query - Log dosyalarını listele`
      );
      console.log(`   GET  /logs/files/:fileName?lines=N - Log dosyası oku`);
      console.log(`💾 Vector Store Cache Endpoints:`);
      console.log(`   GET  /cache/status - Cache durumu`);
      console.log(`   DELETE /cache/clear - Cache temizle`);
      console.log(`   POST /cache/reload - Cache'den yeniden yükle`);
      console.log(`   POST /cache/save - Cache'e kaydet`);
      console.log(`   POST /cache/rebuild - Dosyaları yeniden işle`);
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
