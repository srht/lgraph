// ResponseProcessor.js - Response processing and logging helper class
import { HumanMessage } from "@langchain/core/messages";
import { conversationHelpers } from "./conversationHelper.js";
import ConversationLogger from "../logging/logger.js";

export default class ResponseProcessor {
  constructor() {
    this.logger = new ConversationLogger();
  }

  /**
   * Process AI response and extract final answer
   * @param {string} response - Raw AI response
   * @returns {string} Processed response
   */
  processResponse(response) {
    const match = response.match(/Final Answer:\s*([\s\S]*)/i);
    return match ? match[1].trim() : response;
  }

  /**
   * Analyze tool usage from messages
   * @param {Array} allMessages - All messages from the conversation
   * @param {Array} tools - Available tools array
   * @returns {Object} Tool usage analysis
   */
  analyzeToolUsage(allMessages, tools) {
    let actualToolsUsed = [];
    let actualLLMCalls = [];

    for (let i = 0; i < allMessages.length; i++) {
      const msg = allMessages[i];
      const msgType = msg._getType();

      if (msgType === "tool") {
        // Tool mesajı - tool kullanımı ve cevabı
        const toolName = msg.name || "unknown_tool";
        const toolDescription =
          tools.find((t) => t.name === toolName)?.description || "Unknown tool";

        const toolLog = this.logger.logToolUsage({
          toolName: toolName,
          toolDescription: toolDescription,
          input: msg.content || "No input",
          output: msg.content || "No output",
          executionTime: 0, // Tool mesajında execution time yok
          success: true,
          status: "completed",
          messageIndex: i,
          messageType: msgType,
        });

        actualToolsUsed.push(toolLog);
      } else if (
        msgType === "ai" &&
        msg.tool_calls &&
        msg.tool_calls.length > 0
      ) {
        // AI mesajı ama tool çağrısı var - tool isteği
        for (const toolCall of msg.tool_calls) {
          const toolLog = this.logger.logToolUsage({
            toolName: toolCall.name,
            toolDescription:
              tools.find((t) => t.name === toolCall.name)?.description ||
              "Unknown tool",
            input: toolCall.args,
            output: "Tool execution pending",
            executionTime: 0,
            success: false,
            status: "requested",
            messageIndex: i,
            messageType: msgType,
          });

          actualToolsUsed.push(toolLog);
        }
      } else if (msgType === "ai" && !msg.tool_calls) {
        // AI mesajı ama tool çağrısı yok - direkt cevap
        const noToolLog = this.logger.logToolUsage({
          toolName: "no_tool_used",
          toolDescription: "Agent decided not to use any tools",
          input: "Direct response without tool usage",
          output: msg.content,
          executionTime: 0,
          success: true,
          status: "direct_response",
          messageIndex: i,
          messageType: msgType,
        });

        actualToolsUsed.push(noToolLog);
      }
    }

    return {
      toolsUsed: actualToolsUsed,
      llmCalls: actualLLMCalls,
    };
  }

  /**
   * Calculate token usage from LLM calls
   * @param {Array} llmCalls - LLM calls array
   * @returns {Object} Token usage statistics
   */
  calculateTokenUsage(llmCalls) {
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalTokens = 0;

    if (llmCalls && llmCalls.length > 0) {
      llmCalls.forEach((llmCall) => {
        totalInputTokens += llmCall.inputTokens || 0;
        totalOutputTokens += llmCall.outputTokens || 0;
        totalTokens += llmCall.totalTokens || 0;
      });
    }

    return {
      input: totalInputTokens,
      output: totalOutputTokens,
      total: totalTokens,
    };
  }

  /**
   * Log conversation interaction
   * @param {Object} params - Logging parameters
   * @returns {string|null} Conversation ID
   */
  logConversationInteraction(params) {
    const {
      userMessage,
      agentResponse,
      allMessages,
      actualToolsUsed,
      actualLLMCalls,
      result,
      totalExecutionTime,
      model,
    } = params;

    try {
      return this.logger.logAgentInteraction({
        userMessage: userMessage,
        agentResponse: agentResponse,
        steps: [...actualLLMCalls, ...actualToolsUsed],
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
      return null;
    }
  }

  /**
   * Log error interaction
   * @param {Object} params - Error logging parameters
   * @returns {string|null} Conversation ID
   */
  logErrorInteraction(params) {
    const { userMessage, error, totalExecutionTime, model } = params;

    try {
      return this.logger.logAgentInteraction({
        userMessage: userMessage || "Unknown message",
        agentResponse: "Error occurred during processing",
        steps: [],
        toolsUsed: [],
        llmCalls: [],
        errors: [
          this.logger.logError({
            error,
            context: "Chat endpoint",
            stack: error.stack,
          }),
        ],
        metadata: {
          totalExecutionTime,
          totalMessages: 0,
          model: model.constructor.name,
          temperature: model.temperature || 0,
          error: true,
        },
      });
    } catch (logError) {
      console.warn("⚠️ Error logging failed:", logError.message);
      return null;
    }
  }

  /**
   * Update conversation history with AI message
   * @param {string} userId - User ID
   * @param {Object} aiMessage - AI message object
   */
  updateConversationHistory(userId, aiMessage) {
    if (aiMessage && aiMessage._getType() === "ai") {
      conversationHelpers.addMessage(userId, aiMessage);
      console.log(`💾 Conversation history updated for user ${userId}`);
    }
  }

  /**
   * Add user message to conversation history
   * @param {string} userId - User ID
   * @param {string} message - User message
   * @returns {Array} Updated conversation
   */
  addUserMessage(userId, message) {
    const userConversation = conversationHelpers.getUserConversation(userId);
    return conversationHelpers.addMessage(userId, new HumanMessage(message));
  }

  /**
   * Get conversation summary
   * @param {string} userId - User ID
   * @returns {Object} Conversation summary
   */
  getConversationSummary(userId) {
    return conversationHelpers.getConversationSummary(userId);
  }

  /**
   * Get user conversation
   * @param {string} userId - User ID
   * @returns {Array} User conversation
   */
  getUserConversation(userId) {
    return conversationHelpers.getUserConversation(userId);
  }

  /**
   * Format tool details for response
   * @param {Array} actualToolsUsed - Tools used array
   * @returns {Array} Formatted tool details
   */
  formatToolDetails(actualToolsUsed) {
    return actualToolsUsed.map((tool) => ({
      name: tool.toolName,
      status: tool.status,
      executionTime: tool.executionTime,
      messageIndex: tool.messageIndex,
      messageType: tool.messageType,
      input: tool.input,
      output: tool.output,
    }));
  }

  /**
   * Create success response object
   * @param {Object} params - Response parameters
   * @returns {Object} Formatted success response
   */
  createSuccessResponse(params) {
    const {
      response,
      conversationId,
      userId,
      userConversation,
      totalExecutionTime,
      actualToolsUsed,
      actualLLMCalls,
      tokenUsage,
    } = params;

    return {
      success: true,
      response: this.processResponse(response),
      timestamp: new Date().toISOString(),
      conversationId: conversationId,
      userId: userId,
      conversationLength: userConversation ? userConversation.length : 0,
      executionTime: totalExecutionTime,
      toolsUsed: actualToolsUsed.length,
      llmCalls: actualLLMCalls.length,
      toolDetails: this.formatToolDetails(actualToolsUsed),
      tokenUsage: tokenUsage,
    };
  }

  /**
   * Create error response object
   * @param {Object} params - Error response parameters
   * @returns {Object} Formatted error response
   */
  createErrorResponse(params) {
    const { error, conversationId, totalExecutionTime } = params;

    return {
      error: "Internal server error",
      message: error.message,
      conversationId: conversationId,
      executionTime: totalExecutionTime,
    };
  }
}
