import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ConversationLogger {
  constructor() {
    this.logsDir = path.join(__dirname, '..', 'logs');
    this.ensureLogsDirectory();
  }

  ensureLogsDirectory() {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  getLogFileName() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `conversations_${year}-${month}-${day}.json`;
  }

  getLogFilePath() {
    return path.join(this.logsDir, this.getLogFileName());
  }

  loadExistingLogs() {
    const logFilePath = this.getLogFilePath();
    if (fs.existsSync(logFilePath)) {
      try {
        const content = fs.readFileSync(logFilePath, 'utf8');
        return JSON.parse(content);
      } catch (error) {
        console.error('Log dosyası okunamadı:', error);
        return [];
      }
    }
    return [];
  }

  saveLogs(logs) {
    const logFilePath = this.getLogFilePath();
    try {
      fs.writeFileSync(logFilePath, JSON.stringify(logs, null, 2), 'utf8');
    } catch (error) {
      console.error('Log dosyası yazılamadı:', error);
    }
  }

  logConversation(conversationData) {
    const logs = this.loadExistingLogs();
    
    const logEntry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      ...conversationData
    };

    logs.push(logEntry);
    this.saveLogs(logs);
    
    return logEntry.id;
  }

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // Ana loglama fonksiyonu
  logAgentInteraction(data) {
    const {
      userMessage,
      agentResponse,
      steps = [],
      toolsUsed = [],
      llmCalls = [],
      errors = [],
      metadata = {}
    } = data;

    const conversationData = {
      userMessage: {
        content: userMessage,
        timestamp: new Date().toISOString()
      },
      agentResponse: {
        content: agentResponse,
        timestamp: new Date().toISOString()
      },
      executionSteps: steps,
      toolsUsed: toolsUsed,
      llmCalls: llmCalls,
      errors: errors,
      metadata: {
        ...metadata,
        totalSteps: steps.length,
        totalToolsUsed: toolsUsed.length,
        totalLLMCalls: llmCalls.length,
        hasErrors: errors.length > 0
      }
    };

    return this.logConversation(conversationData);
  }

  // LangGraph step loglama
  logStep(stepData) {
    const {
      nodeName,
      input,
      output,
      timestamp = new Date().toISOString(),
      metadata = {}
    } = stepData;

    return {
      nodeName,
      input,
      output,
      timestamp,
      metadata
    };
  }

  // Tool kullanım loglama
  logToolUsage(toolData) {
    const {
      toolName,
      toolDescription,
      input,
      output,
      executionTime,
      success,
      error,
      status,
      messageIndex,
      messageType,
      timestamp = new Date().toISOString()
    } = toolData;

    return {
      toolName,
      toolDescription,
      input,
      output,
      executionTime,
      success,
      error,
      status,
      messageIndex,
      messageType,
      timestamp
    };
  }

  // LLM çağrısı loglama
  logLLMCall(llmData) {
    const {
      model,
      input,
      output,
      tokens,
      executionTime,
      temperature,
      inputTokens,
      outputTokens,
      totalTokens,
      timestamp = new Date().toISOString()
    } = llmData;

    return {
      model,
      input,
      output,
      tokens,
      executionTime,
      temperature,
      inputTokens,
      outputTokens,
      totalTokens,
      timestamp
    };
  }

  // Hata loglama
  logError(errorData) {
    const {
      error,
      context,
      stack,
      timestamp = new Date().toISOString()
    } = errorData;

    return {
      error: error.message || error,
      context,
      stack: error.stack,
      timestamp
    };
  }

  // Logları okuma
  getConversations(limit = 100, offset = 0) {
    const logs = this.loadExistingLogs();
    return logs.slice(offset, offset + limit);
  }

  getConversationById(id) {
    const logs = this.loadExistingLogs();
    return logs.find(log => log.id === id);
  }

  searchConversations(query) {
    const logs = this.loadExistingLogs();
    const searchTerm = query.toLowerCase();
    
    return logs.filter(log => 
      log.userMessage.content.toLowerCase().includes(searchTerm) ||
      log.agentResponse.content.toLowerCase().includes(searchTerm) ||
      log.toolsUsed.some(tool => 
        tool.toolName.toLowerCase().includes(searchTerm)
      )
    );
  }

  getConversationStats() {
    const logs = this.loadExistingLogs();
    
    if (logs.length === 0) {
      return {
        totalConversations: 0,
        totalMessages: 0,
        totalToolsUsed: 0,
        totalLLMCalls: 0,
        averageResponseTime: 0,
        mostUsedTools: [],
        errorRate: 0
      };
    }

    const totalConversations = logs.length;
    const totalMessages = logs.length * 2; // user + agent
    const totalToolsUsed = logs.reduce((sum, log) => sum + log.toolsUsed.length, 0);
    const totalLLMCalls = logs.reduce((sum, log) => sum + log.llmCalls.length, 0);
    
    // Tool kullanım istatistikleri
    const toolUsage = {};
    const toolStatusStats = { requested: 0, executed: 0, direct_response: 0 };
    
    logs.forEach(log => {
      log.toolsUsed.forEach(tool => {
        // Tool adına göre sayım
        toolUsage[tool.toolName] = (toolUsage[tool.toolName] || 0) + 1;
        
        // Status'a göre sayım
        if (tool.status) {
          toolStatusStats[tool.status] = (toolStatusStats[tool.status] || 0) + 1;
        }
      });
    });

    const mostUsedTools = Object.entries(toolUsage)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    // Hata oranı
    const totalErrors = logs.reduce((sum, log) => sum + log.errors.length, 0);
    const errorRate = (totalErrors / totalConversations) * 100;
    
    // Token istatistikleri
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalTokens = 0;
    
    logs.forEach(log => {
      log.llmCalls?.forEach(llmCall => {
        totalInputTokens += llmCall.inputTokens || 0;
        totalOutputTokens += llmCall.outputTokens || 0;
        totalTokens += llmCall.totalTokens || 0;
      });
    });

    return {
      totalConversations,
      totalMessages,
      totalToolsUsed,
      totalLLMCalls,
      averageResponseTime: 0, // TODO: Implement response time calculation
      mostUsedTools,
      toolStatusStats,
      totalInputTokens,
      totalOutputTokens,
      totalTokens,
      errorRate: Math.round(errorRate * 100) / 100
    };
  }

  // Log dosyalarını temizleme
  cleanupOldLogs(daysToKeep = 30) {
    const logs = this.loadExistingLogs();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const filteredLogs = logs.filter(log => {
      const logDate = new Date(log.timestamp);
      return logDate > cutoffDate;
    });

    this.saveLogs(filteredLogs);
    return logs.length - filteredLogs.length;
  }
}

export default ConversationLogger;
