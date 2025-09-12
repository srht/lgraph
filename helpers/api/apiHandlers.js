// ApiHandlers.js - HTTP endpoint handlers helper class
import { HumanMessage } from "@langchain/core/messages";
import {
  conversationStore,
  conversationHelpers,
} from "../functions/conversationHelper.js";
import ConversationLogger from "../logging/logger.js";

export default class ApiHandlers {
  constructor() {
    this.logger = new ConversationLogger();
  }

  /**
   * Health check endpoint handler
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Array} tools - Available tools
   * @param {Object} vectorStore - Vector store instance
   */
  handleHealthCheck(req, res, tools, vectorStore) {
    res.json({
      status: "OK",
      timestamp: new Date().toISOString(),
      tools: tools.length,
      vectorStore: vectorStore ? "Loaded" : "Not loaded",
    });
  }

  /**
   * Chat endpoint handler (queue based)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Object} queueManager - Queue manager instance
   */
  handleChatQueue(req, res, queueManager) {
    try {
      const { message, userId = "default", priority = 0 } = req.body;

      if (!message || typeof message !== "string") {
        return res.status(400).json({
          error: "Message is required and must be a string",
        });
      }

      console.log(`💬 Chat request queued from user ${userId}: ${message}`);

      // Soruyu kuyruğa ekle
      const processId = queueManager.enqueueQuestion({
        message,
        userId,
        priority,
      });

      res.json({
        success: true,
        message: "Sorunuz kuyruğa eklendi",
        processId: processId,
        status: queueManager.getProcessStatus(processId),
        queueStats: {
          queueSize: queueManager.getQueueStats().currentQueueSize,
          position: queueManager.getProcessStatus(processId).position,
          estimatedWaitTime:
            queueManager.getProcessStatus(processId).estimatedWaitTime,
        },
      });
    } catch (error) {
      console.error("❌ Queue error:", error);
      res.status(500).json({
        error: "Kuyruk hatası: " + error.message,
      });
    }
  }

  /**
   * Get result endpoint handler
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Object} queueManager - Queue manager instance
   */
  handleGetResult(req, res, queueManager) {
    try {
      const { processId } = req.params;
      const status = queueManager.getProcessStatus(processId);

      res.json({
        success: true,
        processId: processId,
        ...status,
      });
    } catch (error) {
      console.error("❌ Result fetch error:", error);
      res.status(500).json({
        error: "Sonuç alma hatası: " + error.message,
      });
    }
  }

  /**
   * Immediate chat endpoint handler
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Object} params - Handler parameters
   */
  async handleImmediateChat(req, res, params) {
    const {
      model,
      tools,
      toolsCondition,
      SYSTEM_PROMPT,
      stateGraphGenerator,
      responseProcessor,
    } = params;

    const startTime = Date.now();
    let conversationId = null;
    const graph = stateGraphGenerator(
      model,
      tools,
      toolsCondition,
      SYSTEM_PROMPT,
      this.logger
    );

    try {
      const { message, userId = "default" } = req.body;

      if (!message || typeof message !== "string") {
        return res.status(400).json({
          error: "Message is required and must be a string",
        });
      }

      console.log(`💬 Immediate chat request from user ${userId}: ${message}`);

      // Kullanıcının conversation history'sini al ve yeni mesajı ekle
      let userConversation = responseProcessor.getUserConversation(userId);
      userConversation = responseProcessor.addUserMessage(userId, message);

      console.log(`📚 Conversation history length: ${userConversation.length}`);

      // Invoke the graph with the conversation history
      const result = await graph.invoke({
        messages: [new HumanMessage(message)],
      });

      console.log("--------------------------------");
      console.log(result);

      // Tüm mesajları incele ve tool kullanımını tespit et
      const allMessages = result.messages;
      const response =
        allMessages[allMessages.length - 1]?.content || "No response generated";
      const totalExecutionTime = Date.now() - startTime;

      console.log(`🤖 AI Response: ${response}`);

      // AI response'u conversation history'ye ekle
      const aiMessage = allMessages[allMessages.length - 1];
      responseProcessor.updateConversationHistory(userId, aiMessage);

      // Tool kullanımını analiz et
      const { toolsUsed: actualToolsUsed, llmCalls: actualLLMCalls } =
        responseProcessor.analyzeToolUsage(allMessages, tools);

      // LLM çağrılarını da tüm mesajlardan tespit et
      if (result.logs && result.logs.llmCalls) {
        actualLLMCalls = result.logs.llmCalls;
      }

      // Konuşmayı logla
      conversationId = responseProcessor.logConversationInteraction({
        userMessage: message,
        agentResponse: response,
        allMessages,
        actualToolsUsed,
        actualLLMCalls,
        result,
        totalExecutionTime,
        model,
      });

      console.log(`📝 Conversation logged with ID: ${conversationId}`);

      // Token kullanım bilgilerini hesapla
      const tokenUsage = responseProcessor.calculateTokenUsage(actualLLMCalls);

      console.log(
        responseProcessor.createSuccessResponse({
          response,
          conversationId,
          userId,
          userConversation,
          totalExecutionTime,
          actualToolsUsed,
          actualLLMCalls,
          tokenUsage,
        })
      );

      const parsedResponse = responseProcessor.processResponse(response);

      res.json({
        success: true,
        response: parsedResponse,
      });
    } catch (error) {
      const totalExecutionTime = Date.now() - startTime;
      console.error("❌ Chat error:", error);

      // Hata durumunda da logla
      conversationId = responseProcessor.logErrorInteraction({
        userMessage: req.body?.message,
        error,
        totalExecutionTime,
        model,
      });

      res.status(500).json(
        responseProcessor.createErrorResponse({
          error,
          conversationId,
          totalExecutionTime,
        })
      );
    }
  }

  /**
   * Get available tools endpoint handler
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Array} tools - Available tools
   */
  handleGetTools(req, res, tools) {
    const toolsInfo = tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
    }));

    res.json({
      tools: toolsInfo,
      count: tools.length,
    });
  }

  /**
   * Queue stats endpoint handler
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Object} queueManager - Queue manager instance
   */
  handleQueueStats(req, res, queueManager) {
    try {
      const stats = queueManager.getQueueStats();
      res.json({
        success: true,
        stats: stats,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Queue status endpoint handler
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Object} queueManager - Queue manager instance
   */
  handleQueueStatus(req, res, queueManager) {
    try {
      const { processId } = req.params;
      const status = queueManager.getProcessStatus(processId);

      res.json({
        success: true,
        processId: processId,
        ...status,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Clear queue endpoint handler
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Object} queueManager - Queue manager instance
   */
  handleClearQueue(req, res, queueManager) {
    try {
      const clearedCount = queueManager.clearQueue();
      res.json({
        success: true,
        message: `${clearedCount} soru kuyruktan temizlendi`,
        clearedCount: clearedCount,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Cleanup queue endpoint handler
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Object} queueManager - Queue manager instance
   */
  handleCleanupQueue(req, res, queueManager) {
    try {
      const { olderThanMinutes = 60 } = req.body;
      const cleanedCount = queueManager.cleanupCompleted(olderThanMinutes);
      res.json({
        success: true,
        message: `${cleanedCount} eski sonuç temizlendi`,
        cleanedCount: cleanedCount,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get conversation endpoint handler
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  handleGetConversation(req, res) {
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
          timestamp: new Date().toISOString(),
        })),
      });
    } catch (error) {
      console.error("❌ Get conversation error:", error);
      res.status(500).json({
        error: "Internal server error",
        message: error.message,
      });
    }
  }

  /**
   * Delete conversation endpoint handler
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  handleDeleteConversation(req, res) {
    try {
      const { userId } = req.params;
      const deleted = conversationStore.delete(userId);

      res.json({
        success: true,
        userId: userId,
        deleted: deleted,
        message: deleted ? "Conversation cleared" : "No conversation found",
      });
    } catch (error) {
      console.error("❌ Clear conversation error:", error);
      res.status(500).json({
        error: "Internal server error",
        message: error.message,
      });
    }
  }

  /**
   * Get all conversations endpoint handler
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  handleGetAllConversations(req, res) {
    try {
      const conversations = Array.from(conversationStore.entries()).map(
        ([userId, conversation]) => ({
          userId: userId,
          conversationLength: conversation.length,
          lastMessage:
            conversation[conversation.length - 1]?.content?.substring(0, 100) ||
            "No messages",
          lastActivity: new Date().toISOString(),
        })
      );

      res.json({
        success: true,
        totalConversations: conversations.length,
        conversations: conversations,
      });
    } catch (error) {
      console.error("❌ Get conversations list error:", error);
      res.status(500).json({
        error: "Internal server error",
        message: error.message,
      });
    }
  }

  /**
   * Get conversation summary endpoint handler
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  handleGetConversationSummary(req, res) {
    try {
      const { userId } = req.params;
      const summary = conversationHelpers.getConversationSummary(userId);

      res.json({
        success: true,
        userId: userId,
        summary: summary,
      });
    } catch (error) {
      console.error("❌ Get conversation summary error:", error);
      res.status(500).json({
        error: "Internal server error",
        message: error.message,
      });
    }
  }

  /**
   * Test conversation endpoint handler
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  handleTestConversation(req, res) {
    try {
      const { userId } = req.params;
      const { message } = req.body;

      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      // Test message ekle
      const testMessage = new HumanMessage(message);
      conversationHelpers.addMessage(userId, testMessage);

      const conversation = conversationHelpers.getUserConversation(userId);
      const summary = conversationHelpers.getConversationSummary(userId);

      res.json({
        success: true,
        message: "Test message added",
        userId: userId,
        conversationLength: conversation.length,
        summary: summary,
      });
    } catch (error) {
      console.error("❌ Test conversation error:", error);
      res.status(500).json({
        error: "Internal server error",
        message: error.message,
      });
    }
  }
}
