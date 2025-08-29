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
import { createCourseBookSearchTool } from "./tools/coursebooksearch.js";
import { createDatabaseSearchTool } from "./tools/databasesearch.js";
import createDocumentSearchTool from "./tools/archived/createDocumentSearchTool.mjs";
import { createITULibrarySearchTool } from "./tools/ituLibrarySearch.js";
import { createLibraryWebSearchTool } from "./tools/libraryWebSearch.js";
import { createJournalSubscriptionSearchTool } from "./tools/journalSubscriptionSearch.js";
import { buildDocumentSearchTool } from "./helpers/docsRetriever.js";
import DocumentProcessor from "./helpers/documentProcessor.mjs";
import { SYSTEM_PROMPT } from "./helpers/systemPrompt.js";
import ConversationLogger from "./helpers/logger.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import createChatModel from "./helpers/modelSelector.js";
import stateGraphGenerator from "./helpers/stateGraphGenerator.js";
import {  conversationStore, MAX_CONVERSATION_LENGTH, conversationHelpers } from "./helpers/conversationHelper.js";
const logger = new ConversationLogger();
const course_book_search = createCourseBookSearchTool();
const database_search = createDatabaseSearchTool();
const itu_library_search = createITULibrarySearchTool();
const library_web_search = createLibraryWebSearchTool();
const journal_subscription_search = createJournalSubscriptionSearchTool();
// __dirname eşleniği (ESM)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let VectorStore = null;
const documentProcessor = new DocumentProcessor();
// ---------- Data Loading Function ----------
async function loadDataFiles(documentProcessor) {
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

    // Dosya yollarını processedFiles'a ekle (cache validation için)
    const filePaths = supportedFiles.map(file => path.join(dataDir, file));
    documentProcessor.processedFiles = filePaths;

    // Cache'den yüklemeyi dene
    console.log("\n🔄 Cache kontrol ediliyor...");
    const cacheLoaded = await documentProcessor.loadFromCache();
    
    if (cacheLoaded && documentProcessor.isCacheValid()) {
      console.log("✅ Cache'den başarıyla yüklendi, dosya işleme atlanıyor");
      return documentProcessor;
    }

    console.log("🔄 Cache geçersiz veya bulunamadı, dosyalar işleniyor...");

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

    console.log("\n🎉 Tüm dosyalar işlendi!");
    
    // Cache'e kaydet
    console.log("\n💾 Cache'e kaydediliyor...");
    await documentProcessor.saveToCache();
    
    return documentProcessor;
    
  } catch (error) {
    console.error("❌ Data dosyaları yüklenirken hata:", error.message);
    return null;
  }
}
await loadDataFiles(documentProcessor);

VectorStore=documentProcessor.getVectorStore();
const document_search2 = buildDocumentSearchTool({vectorStore: documentProcessor.getVectorStore()});
//const document_search = createDocumentSearchTool(VectorStore);
// Initialize tools array with basic tools
let tools = [document_search2, course_book_search, database_search, itu_library_search, library_web_search, journal_subscription_search];
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
  const graph = stateGraphGenerator(model, tools, toolsCondition, SYSTEM_PROMPT, logger);

  try {
    const { message, userId = 'default' } = req.body;
    
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ 
        error: 'Message is required and must be a string' 
      });
    }

    console.log(`💬 Chat request from user ${userId}: ${message}`);
    
    // Kullanıcının conversation history'sini al ve yeni mesajı ekle
    let userConversation = conversationHelpers.getUserConversation(userId);
    userConversation = conversationHelpers.addMessage(userId, new HumanMessage(message));
    
    console.log(`📚 Conversation history length: ${userConversation.length}`);
    
    // Invoke the graph with the conversation history
    const result = await graph.invoke({
      //messages: userConversation,
      messages: [new HumanMessage(message)],
    });

    console.log(result)
    // Tüm mesajları incele ve tool kullanımını tespit et
    const allMessages = result.messages;
    const response = allMessages[allMessages.length - 1]?.content || 'No response generated';
    const totalExecutionTime = Date.now() - startTime;

    console.log(`🤖 AI Response: ${response}`);
    
    // AI response'u conversation history'ye ekle
    const aiMessage = allMessages[allMessages.length - 1];
    if (aiMessage && aiMessage._getType() === 'ai') {
      conversationHelpers.addMessage(userId, aiMessage);
      console.log(`💾 Conversation history updated for user ${userId}`);
    }
    
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
        userId: userId,
        conversationLength: userConversation.length,
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

// Conversation management endpoints
app.get('/conversations/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const conversation = conversationStore.get(userId) || [];
    
    res.json({
      success: true,
      userId: userId,
      conversationLength: conversation.length,
      messages: conversation.map((msg, index) => ({
        index: index,
        type: msg._getType(),
        content: msg.content,
        timestamp: new Date().toISOString()
      }))
    });
  } catch (error) {
    console.error('❌ Get conversation error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

app.delete('/conversations/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const deleted = conversationStore.delete(userId);
    
    res.json({
      success: true,
      userId: userId,
      deleted: deleted,
      message: deleted ? 'Conversation cleared' : 'No conversation found'
    });
  } catch (error) {
    console.error('❌ Clear conversation error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

app.get('/conversations', (req, res) => {
  try {
    const conversations = Array.from(conversationStore.entries()).map(([userId, conversation]) => ({
      userId: userId,
      conversationLength: conversation.length,
      lastMessage: conversation[conversation.length - 1]?.content?.substring(0, 100) || 'No messages',
      lastActivity: new Date().toISOString()
    }));
    
    res.json({
      success: true,
      totalConversations: conversations.length,
      conversations: conversations
    });
  } catch (error) {
    console.error('❌ Get conversations list error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

app.get('/conversations/:userId/summary', (req, res) => {
  try {
    const { userId } = req.params;
    const summary = conversationHelpers.getConversationSummary(userId);
    
    res.json({
      success: true,
      userId: userId,
      summary: summary
    });
  } catch (error) {
    console.error('❌ Get conversation summary error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

// Test endpoint for conversation memory
app.post('/conversations/:userId/test', (req, res) => {
  try {
    const { userId } = req.params;
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    // Test message ekle
    const testMessage = new HumanMessage(message);
    conversationHelpers.addMessage(userId, testMessage);
    
    const conversation = conversationHelpers.getUserConversation(userId);
    const summary = conversationHelpers.getConversationSummary(userId);
    
    res.json({
      success: true,
      message: 'Test message added',
      userId: userId,
      conversationLength: conversation.length,
      summary: summary
    });
  } catch (error) {
    console.error('❌ Test conversation error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

// Get vector store status and content
app.get('/vectorstore', async (req, res) => {
  if (!VectorStore) {
    return res.status(404).json({ 
      error: 'Vector store not loaded' 
    });
  }
  
  try {
    const { search, showAll } = req.query;
    
    let allDocs;
    if (search && search.trim()) {
      // Arama sorgusu varsa sadece ilgili dokümanları al
      console.log(`🔍 Vector store'da arama: "${search}"`);
      const retriever = VectorStore.asRetriever({ k: 10000 });
      allDocs = await retriever.getRelevantDocuments(search);
    } else {
      // Arama yoksa tüm dokümanları al
      const retriever = VectorStore.asRetriever({ k: 10000 });
      allDocs = await retriever.getRelevantDocuments(""); // Boş sorgu ile tüm dokümanları al
    }
    
    // Dokümanları kategorilere ayır
    const categorizedDocs = {
      excel: [],
      pdf: [],
      docx: [],
      txt: [],
      json: [],
      other: []
    };
    
    let totalDocs = 0;
    let totalContentLength = 0;
    
    allDocs.forEach((doc, index) => {
      totalDocs++;
      totalContentLength += doc.pageContent?.length || 0;
      
      const metadata = doc.metadata || {};
      const source = metadata.source || 'unknown';
      const docType = metadata.documentType || 'unknown';
      
      // Doküman bilgilerini hazırla
      const docInfo = {
        id: index,
        source: source,
        documentType: docType,
        content: doc.pageContent?.substring(0, 200) + (doc.pageContent?.length > 200 ? '...' : ''),
        fullContent: doc.pageContent,
        metadata: metadata,
        contentLength: doc.pageContent?.length || 0
      };
      
      // Excel satır dokümanları için özel işleme
      if (docType === 'excel_row') {
        categorizedDocs.excel.push(docInfo);
      } else if (source.endsWith('.pdf')) {
        categorizedDocs.pdf.push(docInfo);
      } else if (source.endsWith('.docx')) {
        categorizedDocs.docx.push(docInfo);
      } else if (source.endsWith('.txt')) {
        categorizedDocs.txt.push(docInfo);
      } else if (source.endsWith('.json')) {
        categorizedDocs.json.push(docInfo);
      } else {
        categorizedDocs.other.push(docInfo);
      }
    });
    
    // Her kategori için istatistikler
    const stats = {
      total: totalDocs,
      totalContentLength: totalContentLength,
      excel: {
        count: categorizedDocs.excel.length,
        totalRows: categorizedDocs.excel.length,
        sheets: [...new Set(categorizedDocs.excel.map(doc => doc.metadata?.sheetName).filter(Boolean))]
      },
      pdf: { count: categorizedDocs.pdf.length },
      docx: { count: categorizedDocs.docx.length },
      txt: { count: categorizedDocs.txt.length },
      json: { count: categorizedDocs.json.length },
      other: { count: categorizedDocs.other.length }
    };
    
    res.json({
      status: 'Loaded',
      timestamp: new Date().toISOString(),
      search: search || null,
      stats: stats,
      documents: {
        excel: categorizedDocs.excel.slice(0, 50), // İlk 50 Excel satırı
        pdf: categorizedDocs.pdf.slice(0, 20),     // İlk 20 PDF parçası
        docx: categorizedDocs.docx.slice(0, 20),   // İlk 20 DOCX parçası
        txt: categorizedDocs.txt.slice(0, 20),     // İlk 20 TXT parçası
        json: categorizedDocs.json.slice(0, 20),   // İlk 20 JSON parçası
        other: categorizedDocs.other.slice(0, 20)  // İlk 20 diğer parça
      },
      // Tüm dokümanları görmek için query parametresi
      showAll: showAll === 'true',
      allDocuments: showAll === 'true' ? allDocs.map((doc, index) => ({
        id: index,
        source: doc.metadata?.source || 'unknown',
        documentType: doc.metadata?.documentType || 'unknown',
        content: doc.pageContent?.substring(0, 300) + (doc.pageContent?.length > 300 ? '...' : ''),
        metadata: doc.metadata,
        contentLength: doc.pageContent?.length || 0
      })) : null
    });
    
  } catch (error) {
    console.error('❌ Vector store content retrieval error:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve vector store content', 
      message: error.message 
    });
  }
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

// ---------- Genel Amaçlı Loglama Endpoints ----------

// Text loglama endpoint
app.post('/logs/text', (req, res) => {
  try {
    const { text, fileName, options = {} } = req.body;
    
    if (!text || !fileName) {
      return res.status(400).json({ 
        error: 'Text and fileName are required' 
      });
    }
    
    const success = logger.logText(text, fileName, options);
    
    res.json({
      success: success,
      message: success ? 'Text logged successfully' : 'Failed to log text',
      fileName: `${fileName}.${options.extension || 'log'}`
    });
  } catch (error) {
    console.error('❌ Text logging error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

// JSON loglama endpoint
app.post('/logs/json', (req, res) => {
  try {
    const { data, fileName, options = {} } = req.body;
    
    if (!data || !fileName) {
      return res.status(400).json({ 
        error: 'Data and fileName are required' 
      });
    }
    
    const success = logger.logJSON(data, fileName, options);
    
    res.json({
      success: success,
      message: success ? 'JSON logged successfully' : 'Failed to log JSON',
      fileName: `${fileName}.json`
    });
  } catch (error) {
    console.error('❌ JSON logging error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

// Debug loglama endpoint
app.post('/logs/debug', (req, res) => {
  try {
    const { message, data = null } = req.body;
    
    if (!message) {
      return res.status(400).json({ 
        error: 'Message is required' 
      });
    }
    
    const success = logger.logDebug(message, data);
    
    res.json({
      success: success,
      message: success ? 'Debug logged successfully' : 'Failed to log debug',
      fileName: 'debug.json'
    });
  } catch (error) {
    console.error('❌ Debug logging error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

// Error loglama endpoint
app.post('/logs/error', (req, res) => {
  try {
    const { error: errorMsg, context = null } = req.body;
    
    if (!errorMsg) {
      return res.status(400).json({ 
        error: 'Error message is required' 
      });
    }
    
    const success = logger.logError(errorMsg, context);
    
    res.json({
      success: success,
      message: success ? 'Error logged successfully' : 'Failed to log error',
      fileName: 'errors.json'
    });
  } catch (error) {
    console.error('❌ Error logging error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

// Performance loglama endpoint
app.post('/logs/performance', (req, res) => {
  try {
    const { operation, duration, details = {} } = req.body;
    
    if (!operation || duration === undefined) {
      return res.status(400).json({ 
        error: 'Operation and duration are required' 
      });
    }
    
    const success = logger.logPerformance(operation, duration, details);
    
    res.json({
      success: success,
      message: success ? 'Performance logged successfully' : 'Failed to log performance',
      fileName: 'performance.json'
    });
  } catch (error) {
    console.error('❌ Performance logging error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

// Log dosyalarını listele
app.get('/logs/files', (req, res) => {
  try {
    const { pattern } = req.query;
    const files = logger.getLogFiles(pattern);
    
    res.json({
      success: true,
      files: files,
      count: files.length,
      pattern: pattern || null
    });
  } catch (error) {
    console.error('❌ List log files error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

// Log dosyası oku
app.get('/logs/files/:fileName', (req, res) => {
  try {
    const { fileName } = req.params;
    const { lines } = req.query;
    
    const content = logger.readLogFile(fileName, lines ? parseInt(lines) : null);
    
    if (content === null) {
      return res.status(404).json({ 
        error: 'Log file not found' 
      });
    }
    
    res.json({
      success: true,
      fileName: fileName,
      content: content,
      lines: lines ? parseInt(lines) : null
    });
  } catch (error) {
    console.error('❌ Read log file error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

// ---------- Vector Store Cache Yönetimi Endpoints ----------

// Cache durumunu al
app.get('/cache/status', (req, res) => {
  try {
    const cacheInfo = documentProcessor.getCacheInfo();
    
    res.json({
      success: true,
      cache: cacheInfo,
      useCache: documentProcessor.useCache,
      processedFiles: documentProcessor.processedFiles?.length || 0
    });
  } catch (error) {
    console.error('❌ Cache status error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

// Cache'i temizle
app.get('/cache/clear', (req, res) => {
  try {
    const success = documentProcessor.clearCache();
    
    res.json({
      success: success,
      message: success ? 'Cache cleared successfully' : 'Failed to clear cache'
    });
  } catch (error) {
    console.error('❌ Cache clear error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

// Cache'den yeniden yükle
app.get('/cache/reload', async (req, res) => {
  try {
    console.log('🔄 Cache\'den yeniden yükleme başlatılıyor...');
    
    const success = await documentProcessor.loadFromCache();
    
    if (success) {
      // Vector store'u güncelle
      VectorStore = documentProcessor.getVectorStore();
      
      res.json({
        success: true,
        message: 'Cache reloaded successfully',
        vectorStore: VectorStore ? 'Loaded' : 'Not loaded'
      });
    } else {
      res.json({
        success: false,
        message: 'Failed to reload from cache'
      });
    }
  } catch (error) {
    console.error('❌ Cache reload error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

// Cache'e kaydet
app.get('/cache/save', async (req, res) => {
  try {
    console.log('💾 Cache\'e kaydetme başlatılıyor...');
    
    const success = await documentProcessor.saveToCache();
    
    res.json({
      success: success,
      message: success ? 'Cache saved successfully' : 'Failed to save cache'
    });
  } catch (error) {
    console.error('❌ Cache save error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

// Dosyaları yeniden işle (cache'i bypass et)
app.get('/cache/rebuild', async (req, res) => {
  try {
    console.log('🔄 Dosyalar yeniden işleniyor (cache bypass)...');
    
    // Cache'i temizle
    documentProcessor.clearCache();
    
    // Yeni document processor oluştur (cache devre dışı)
    const newProcessor = new DocumentProcessor(1000, 300, false);
    
    // Dosyaları yeniden işle
    const result = await loadDataFiles(newProcessor);
    
    if (result) {
      // Global değişkenleri güncelle
      VectorStore = newProcessor.getVectorStore();
      
      // Yeni cache'e kaydet
      newProcessor.useCache = true;
      await newProcessor.saveToCache();
      
      res.json({
        success: true,
        message: 'Files reprocessed and cache rebuilt successfully',
        vectorStore: VectorStore ? 'Loaded' : 'Not loaded'
      });
    } else {
      res.json({
        success: false,
        message: 'Failed to reprocess files'
      });
    }
  } catch (error) {
    console.error('❌ Cache rebuild error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

// ---------- Main Function ----------
const run = async () => {
  try {
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
      console.log(`   GET  /vectorstore - Vector store durumu ve içerik`);
      console.log(`   GET  /vectorstore?search=query - Vector store'da arama`);
      console.log(`   GET  /vectorstore?showAll=true - Tüm dokümanları göster`);
      console.log(`💬 Conversation Endpoints:`);
      console.log(`   GET  /conversations - Tüm conversation'ları listele`);
      console.log(`   GET  /conversations/:userId - Belirli kullanıcının conversation'ı`);
      console.log(`   GET  /conversations/:userId/summary - Conversation özeti`);
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
      console.log(`   GET  /logs/files?pattern=query - Log dosyalarını listele`);
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
