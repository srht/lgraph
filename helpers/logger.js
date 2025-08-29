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

  // ===========================================
  // GENEL AMAÇLI TEXT LOGLAMA FONKSİYONLARI
  // ===========================================

  /**
   * Herhangi bir text'i belirtilen dosyaya loglar
   * @param {string} text - Loglanacak metin
   * @param {string} fileName - Dosya adı (uzantı olmadan)
   * @param {Object} options - Opsiyonlar
   * @param {boolean} options.append - Dosyaya ekle (true) veya üzerine yaz (false)
   * @param {boolean} options.timestamp - Timestamp ekle
   * @param {string} options.level - Log seviyesi (INFO, ERROR, DEBUG, WARNING)
   */
  logText(text, fileName, options = {}) {
    const {
      append = true,
      timestamp = true,
      level = 'INFO',
      extension = 'log'
    } = options;

    try {
      const logFileName = `${fileName}.${extension}`;
      const logFilePath = path.join(this.logsDir, logFileName);
      
      let logEntry = '';
      
      if (timestamp) {
        const now = new Date().toISOString();
        logEntry = `[${now}] [${level}] ${text}\n`;
      } else {
        logEntry = `${text}\n`;
      }

      if (append) {
        fs.appendFileSync(logFilePath, logEntry, 'utf8');
      } else {
        fs.writeFileSync(logFilePath, logEntry, 'utf8');
      }

      console.log(`📝 Text logged to: ${logFileName}`);
      return true;
    } catch (error) {
      console.error('❌ Text loglama hatası:', error);
      return false;
    }
  }

  /**
   * JSON formatında veri loglar
   * @param {Object} data - Loglanacak veri
   * @param {string} fileName - Dosya adı (uzantı olmadan)
   * @param {Object} options - Opsiyonlar
   */
  logJSON(data, fileName, options = {}) {
    const {
      append = true,
      timestamp = true,
      pretty = true
    } = options;

    try {
      const logFileName = `${fileName}.json`;
      const logFilePath = path.join(this.logsDir, logFileName);
      
      let logEntry = {
        timestamp: timestamp ? new Date().toISOString() : undefined,
        data: data
      };

      // Timestamp istemiyorsa direkt data'yı kullan
      if (!timestamp) {
        logEntry = data;
      }

      const jsonString = pretty ? 
        JSON.stringify(logEntry, null, 2) + '\n' : 
        JSON.stringify(logEntry) + '\n';

      if (append) {
        // JSON array formatında append etmek için özel işlem
        if (fs.existsSync(logFilePath)) {
          const existingContent = fs.readFileSync(logFilePath, 'utf8').trim();
          if (existingContent) {
            // Mevcut içeriği array olarak parse et
            let existingData;
            try {
              existingData = JSON.parse(existingContent);
              if (!Array.isArray(existingData)) {
                existingData = [existingData];
              }
            } catch (e) {
              existingData = [];
            }
            
            existingData.push(logEntry);
            const finalContent = pretty ? 
              JSON.stringify(existingData, null, 2) : 
              JSON.stringify(existingData);
            
            fs.writeFileSync(logFilePath, finalContent, 'utf8');
          } else {
            fs.writeFileSync(logFilePath, `[${jsonString.trim()}]`, 'utf8');
          }
        } else {
          fs.writeFileSync(logFilePath, `[${jsonString.trim()}]`, 'utf8');
        }
      } else {
        fs.writeFileSync(logFilePath, jsonString, 'utf8');
      }

      console.log(`📝 JSON logged to: ${logFileName}`);
      return true;
    } catch (error) {
      console.error('❌ JSON loglama hatası:', error);
      return false;
    }
  }

  /**
   * Debug bilgileri için özel log fonksiyonu
   * @param {string} message - Debug mesajı
   * @param {Object} data - Ek veri (opsiyonel)
   */
  logDebug(message, data = null) {
    const debugEntry = {
      message: message,
      data: data,
      stack: new Error().stack
    };
    
    return this.logJSON(debugEntry, 'debug', {
      timestamp: true,
      pretty: true
    });
  }

  /**
   * Hata logları için özel fonksiyon
   * @param {Error|string} error - Hata objesi veya mesajı
   * @param {Object} context - Ek context bilgisi
   */
  logError(error, context = null) {
    const errorEntry = {
      message: error.message || error.toString(),
      stack: error.stack || new Error().stack,
      context: context,
      type: error.constructor?.name || 'Error'
    };
    
    return this.logJSON(errorEntry, 'errors', {
      timestamp: true,
      pretty: true
    });
  }

  /**
   * Retrieval sonuçları için özel log fonksiyonu
   * @param {string} query - Arama sorgusu
   * @param {Array} results - Arama sonuçları
   * @param {Object} metadata - Ek bilgiler
   */
  logRetrieval(query, results, metadata = {}) {
    const retrievalEntry = {
      query: query,
      resultsCount: results?.length || 0,
      results: results?.map(r => ({
        source: r.metadata?.source,
        page: r.metadata?.page,
        contentLength: r.pageContent?.length || 0,
        content: r.pageContent?.substring(0, 200) + '...' // İlk 200 karakter
      })) || [],
      metadata: metadata
    };
    
    return this.logJSON(retrievalEntry, 'retrieval', {
      timestamp: true,
      pretty: true
    });
  }

  /**
   * Performance metrikleri için log fonksiyonu
   * @param {string} operation - İşlem adı
   * @param {number} duration - Süre (ms)
   * @param {Object} details - Detay bilgiler
   */
  logPerformance(operation, duration, details = {}) {
    const perfEntry = {
      operation: operation,
      duration: duration,
      details: details
    };
    
    return this.logJSON(perfEntry, 'performance', {
      timestamp: true,
      pretty: true
    });
  }

  /**
   * Dosya listesi al
   * @param {string} pattern - Dosya adı pattern'i (opsiyonel)
   */
  getLogFiles(pattern = null) {
    try {
      const files = fs.readdirSync(this.logsDir);
      if (pattern) {
        return files.filter(file => file.includes(pattern));
      }
      return files;
    } catch (error) {
      console.error('❌ Log dosyaları okunamadı:', error);
      return [];
    }
  }

  /**
   * Belirli bir log dosyasını oku
   * @param {string} fileName - Dosya adı
   * @param {number} lines - Okunacak satır sayısı (son N satır)
   */
  readLogFile(fileName, lines = null) {
    try {
      const filePath = path.join(this.logsDir, fileName);
      if (!fs.existsSync(filePath)) {
        return null;
      }

      const content = fs.readFileSync(filePath, 'utf8');
      
      if (lines) {
        const allLines = content.split('\n');
        return allLines.slice(-lines).join('\n');
      }
      
      return content;
    } catch (error) {
      console.error('❌ Log dosyası okunamadı:', error);
      return null;
    }
  }
}

export default ConversationLogger;
