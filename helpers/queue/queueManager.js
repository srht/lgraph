// QueueManager.js - Question queue management helper class
import QuestionQueue from "./questionQueue.js";
import { HumanMessage } from "@langchain/core/messages";
import { conversationHelpers } from "../functions/conversationHelper.js";
import stateGraphGenerator from "../functions/stateGraphGenerator.js";
import { SYSTEM_PROMPT } from "../data/systemPrompt.js";
import ConversationLogger from "../logging/logger.js";

export default class QueueManager {
  constructor() {
    this.questionQueue = null;
    this.logger = new ConversationLogger();
  }

  /**
   * Initialize the question queue system
   * @param {Object} model - The chat model
   * @param {Array} tools - Array of available tools
   * @param {Function} toolsCondition - Tools condition function
   */
  initializeQuestionQueue(model, tools, toolsCondition) {
    this.questionQueue = new QuestionQueue({
      maxQuestionsPerMinute: 15,
      processInterval: 60000, // 1 dakika
    });

    // processQuestion metodunu override et
    this.questionQueue.processQuestion = async (questionData) => {
      const { message, userId, priority = 0 } = questionData;
      const startTime = Date.now();

      console.log(
        `🤖 Soru işleniyor: ${userId} - ${message.substring(0, 50)}...`
      );

      const graph = stateGraphGenerator(
        model,
        tools,
        toolsCondition,
        SYSTEM_PROMPT,
        this.logger
      );

      // Kullanıcının conversation history'sini al ve yeni mesajı ekle
      let userConversation = conversationHelpers.getUserConversation(userId);
      userConversation = conversationHelpers.addMessage(
        userId,
        new HumanMessage(message)
      );

      // Graph'ı çalıştır
      const result = await graph.invoke({
        messages: [new HumanMessage(message)],
      });

      const allMessages = result.messages;
      const response =
        allMessages[allMessages.length - 1]?.content || "No response generated";
      const match = response.match(/Final Answer:\s*([\s\S]*)/i);
      let parsedResponse = match ? match[1].trim() : response;
      const totalExecutionTime = Date.now() - startTime;

      // AI response'u conversation history'ye ekle
      const aiMessage = allMessages[allMessages.length - 1];
      if (aiMessage && aiMessage._getType() === "ai") {
        conversationHelpers.addMessage(userId, aiMessage);
      }

      // Tool kullanımını tespit et
      let actualToolsUsed = [];
      let actualLLMCalls = [];

      for (let i = 0; i < allMessages.length; i++) {
        const msg = allMessages[i];

        if (msg._getType() === "tool") {
          actualToolsUsed.push({
            toolName: msg.name || "unknown",
            toolInput: msg.tool_calls?.[0]?.args || "unknown",
            toolOutput: msg.content || "unknown",
            messageIndex: i,
            messageType: msg._getType(),
            status: "completed",
            executionTime: 0,
          });
        }

        if (msg._getType() === "ai") {
          actualLLMCalls.push({
            model: model.constructor.name,
            input: allMessages.slice(0, i).map((m) => ({
              type: m._getType(),
              content: m.content,
            })),
            output: {
              type: msg._getType(),
              content: msg.content,
            },
            executionTime: 0,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
          });
        }
      }

      // Conversation logger
      let conversationId = null;
      try {
        conversationId = this.logger.logConversation({
          userId,
          userMessage: message,
          aiResponse: response,
          toolsUsed: actualToolsUsed,
          llmCalls: actualLLMCalls,
          errors: result.logs?.errors || [],
          metadata: {
            totalExecutionTime,
            totalMessages: allMessages.length,
            model: model.constructor.name,
            temperature: model.temperature || 0,
            messageTypes: allMessages.map((msg) => msg._getType()),
          },
        });
      } catch (logError) {
        console.warn("⚠️ Loglama hatası:", logError.message);
      }

      return {
        success: true,
        response: parsedResponse,
        timestamp: new Date().toISOString(),
        conversationId: conversationId,
        userId: userId,
        executionTime: totalExecutionTime,
        toolsUsed: actualToolsUsed.length,
        llmCalls: actualLLMCalls.length,
        toolDetails: actualToolsUsed,
        queueProcessed: true,
      };
    };

    console.log("✅ Soru kuyruğu sistemi başlatıldı");
  }

  /**
   * Enqueue a question
   * @param {Object} questionData - Question data with message, userId, priority
   * @returns {string} Process ID
   */
  enqueueQuestion(questionData) {
    if (!this.questionQueue) {
      throw new Error("Question queue not initialized");
    }
    return this.questionQueue.enqueue(questionData);
  }

  /**
   * Get status of a process
   * @param {string} processId - Process ID
   * @returns {Object} Status information
   */
  getProcessStatus(processId) {
    if (!this.questionQueue) {
      throw new Error("Question queue not initialized");
    }
    return this.questionQueue.getStatus(processId);
  }

  /**
   * Get queue statistics
   * @returns {Object} Queue statistics
   */
  getQueueStats() {
    if (!this.questionQueue) {
      throw new Error("Question queue not initialized");
    }
    return this.questionQueue.getStats();
  }

  /**
   * Clear the queue
   * @returns {number} Number of cleared items
   */
  clearQueue() {
    if (!this.questionQueue) {
      throw new Error("Question queue not initialized");
    }
    return this.questionQueue.clearQueue();
  }

  /**
   * Cleanup completed items older than specified minutes
   * @param {number} olderThanMinutes - Minutes threshold
   * @returns {number} Number of cleaned items
   */
  cleanupCompleted(olderThanMinutes = 60) {
    if (!this.questionQueue) {
      throw new Error("Question queue not initialized");
    }
    return this.questionQueue.cleanupCompleted(olderThanMinutes);
  }

  /**
   * Check if queue is initialized
   * @returns {boolean}
   */
  isInitialized() {
    return this.questionQueue !== null;
  }

  /**
   * Get the question queue instance
   * @returns {QuestionQueue|null}
   */
  getQuestionQueue() {
    return this.questionQueue;
  }
}
