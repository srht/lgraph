const fs = require('fs');
const path = require('path');

class ChatLogger {
  constructor() {
    this.logDir = path.join(__dirname, '..', 'logs');
    this.logFile = path.join(this.logDir, 'chat_logs.txt');
    this.jsonLogFile = path.join(this.logDir, 'chat_logs.json');
    this.ensureLogDirectory();
  }

  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
    
    // JSON log dosyasını başlat
    this.initializeJsonLogFile();
  }

  initializeJsonLogFile() {
    if (!fs.existsSync(this.jsonLogFile)) {
      fs.writeFileSync(this.jsonLogFile, JSON.stringify([], null, 2));
    }
  }

  formatTimestamp() {
    const now = new Date();
    return now.toISOString().replace('T', ' ').replace('Z', '');
  }

  logChat(userQuery, agentResponse, toolsUsed = [], executionTime = null, error = null, additionalInfo = {}) {
    const timestamp = this.formatTimestamp();
    
    // JSON formatında detaylı log entry oluştur
    const jsonLogEntry = {
      type: 'chat',
      timestamp: timestamp,
      userQuery: userQuery,
      toolsUsed: toolsUsed,
      executionTime: executionTime,
      error: error,
      agentResponse: agentResponse,
      chainExecution: additionalInfo.intermediateSteps > 0 ? {
        totalSteps: additionalInfo.intermediateSteps,
        toolDetails: additionalInfo.toolDetails || [],
        model: additionalInfo.model,
        timestamp: additionalInfo.timestamp,
        log: additionalInfo.log || null,
        chainLogs: additionalInfo.chainLogs || []
      } : null,
      additionalInfo: additionalInfo
    };

    // TXT formatında da kaydet (backward compatibility)
    let logEntry = `\n=== CHAT LOG ENTRY ===\n`;
    logEntry += `Timestamp: ${timestamp}\n`;
    logEntry += `User Query: ${userQuery}\n`;
    
    if (toolsUsed.length > 0) {
      logEntry += `Tools Used: ${toolsUsed.join(', ')}\n`;
    }
    
    if (executionTime !== null) {
      logEntry += `Execution Time: ${executionTime}ms\n`;
    }
    
    if (error) {
      logEntry += `Error: ${error}\n`;
    }
    
    // Chain Execution Details
    if (additionalInfo.intermediateSteps > 0) {
      logEntry += `Chain Execution:\n`;
      logEntry += `  Total Steps: ${additionalInfo.intermediateSteps}\n`;
      
      if (additionalInfo.toolDetails && additionalInfo.toolDetails.length > 0) {
        logEntry += `  Tool Execution Details:\n`;
        additionalInfo.toolDetails.forEach((toolDetail, index) => {
          logEntry += `    Step ${toolDetail.step}:\n`;
          logEntry += `      Tool: ${toolDetail.tool}\n`;
          logEntry += `      Input: ${toolDetail.input}\n`;
          logEntry += `      Observation: ${this.formatObservation(toolDetail.observation)}\n`;
          if (toolDetail.log) {
            logEntry += `      Log: ${this.formatObservation(toolDetail.log)}\n`;
          }
        });
      }
      
      // Log field'ını da ekle
      if (additionalInfo.log) {
        logEntry += `  Log: ${this.formatObservation(additionalInfo.log)}\n`;
      }
      
      // Chain Logları ekle
      if (additionalInfo.chainLogs && additionalInfo.chainLogs.length > 0) {
        logEntry += `  Chain Logs:\n`;
        additionalInfo.chainLogs.forEach((chainLog, index) => {
          logEntry += `    ${index + 1}. ${chainLog.type} (${chainLog.timestamp}):\n`;
          logEntry += `       Run ID: ${chainLog.runId}\n`;
          if (chainLog.parentRunId) {
            logEntry += `       Parent Run ID: ${chainLog.parentRunId}\n`;
          }
          if (chainLog.chainName) {
            logEntry += `       Chain: ${chainLog.chainName}\n`;
          }
          if (chainLog.llmName) {
            logEntry += `       LLM: ${chainLog.llmName}\n`;
          }
          if (chainLog.toolName) {
            logEntry += `       Tool: ${chainLog.toolName}\n`;
          }
          if (chainLog.inputs) {
            logEntry += `       Inputs: ${JSON.stringify(chainLog.inputs)}\n`;
          }
          if (chainLog.outputs) {
            logEntry += `       Outputs: ${JSON.stringify(chainLog.outputs)}\n`;
          }
          if (chainLog.action) {
            logEntry += `       Action: ${JSON.stringify(chainLog.action)}\n`;
          }
          if (chainLog.text) {
            logEntry += `       Text: ${JSON.stringify(chainLog.text)}\n`;
          }
          logEntry += `\n`;
        });
      }
    }
    
    // Model Information
    if (additionalInfo.model) {
      logEntry += `Model: ${additionalInfo.model}\n`;
    }
    
    // Additional Info
    if (Object.keys(additionalInfo).length > 0) {
      logEntry += `Additional Info:\n`;
      Object.entries(additionalInfo).forEach(([key, value]) => {
        // Skip already processed fields
        if (!['intermediateSteps', 'toolDetails', 'model'].includes(key)) {
          logEntry += `  ${key}: ${JSON.stringify(value)}\n`;
        }
      });
    }
    
    logEntry += `Agent Response: ${agentResponse}\n`;
    logEntry += `=== END LOG ENTRY ===\n`;

    // TXT dosyasına yazma işlemi
    fs.appendFile(this.logFile, logEntry, (err) => {
      if (err) {
        console.error('Log yazma hatası:', err);
      }
    });

    // JSON dosyasına yazma işlemi
    this.appendToJsonLog(jsonLogEntry);

    // Konsola da yazdır
    console.log(logEntry);
  }

  formatObservation(observation) {
    if (!observation) return 'No observation';
    
    // Observation çok uzunsa kısalt
    const obsStr = typeof observation === 'string' ? observation : JSON.stringify(observation);
    if (obsStr.length > 500) {
      return obsStr.substring(0, 500) + '... [truncated]';
    }
    return obsStr;
  }

  logError(error, context = '') {
    const timestamp = this.formatTimestamp();
    
    // JSON formatında detaylı error entry oluştur
    const jsonErrorEntry = {
      type: 'error',
      timestamp: timestamp,
      context: context,
      error: error instanceof Error ? {
        type: error.constructor.name,
        name: error.name,
        message: error.message,
        code: error.code,
        cause: error.cause,
        stack: error.stack,
        additionalProperties: Object.getOwnPropertyNames(error).filter(prop => 
          !['name', 'message', 'stack', 'code', 'cause'].includes(prop)
        ).reduce((acc, prop) => {
          try {
            const value = error[prop];
            if (value !== undefined) {
              acc[prop] = value;
            }
          } catch (e) {
            acc[prop] = '[Circular or non-serializable]';
          }
          return acc;
        }, {})
      } : {
        type: typeof error,
        value: error
      }
    };

    // TXT formatında da kaydet (backward compatibility)
    let errorLog = `\n=== ERROR LOG ===\n`;
    errorLog += `Timestamp: ${timestamp}\n`;
    errorLog += `Context: ${context}\n`;
    
    // Error details
    if (error instanceof Error) {
      errorLog += `Error Type: ${error.constructor.name}\n`;
      errorLog += `Error Name: ${error.name}\n`;
      errorLog += `Error Message: ${error.message}\n`;
      
      // Error code if available
      if (error.code) {
        errorLog += `Error Code: ${error.code}\n`;
      }
      
      // Error cause if available (Node.js 16+)
      if (error.cause) {
        errorLog += `Error Cause: ${JSON.stringify(error.cause)}\n`;
      }
      
      // Stack trace
      if (error.stack) {
        errorLog += `Stack Trace:\n${error.stack}\n`;
      }
      
      // Additional properties
      const additionalProps = Object.getOwnPropertyNames(error).filter(prop => 
        !['name', 'message', 'stack', 'code', 'cause'].includes(prop)
      );
      
      if (additionalProps.length > 0) {
        errorLog += `Additional Properties:\n`;
        additionalProps.forEach(prop => {
          try {
            const value = error[prop];
            if (value !== undefined) {
              errorLog += `  ${prop}: ${JSON.stringify(value)}\n`;
            }
          } catch (e) {
            errorLog += `  ${prop}: [Circular or non-serializable]\n`;
          }
        });
      }
    } else {
      // Non-Error objects
      errorLog += `Error Type: ${typeof error}\n`;
      errorLog += `Error Value: ${JSON.stringify(error)}\n`;
    }
    
    errorLog += `=== END ERROR LOG ===\n`;

    // TXT dosyasına yazma işlemi
    fs.appendFile(this.logFile, errorLog, (err) => {
      if (err) {
        console.error('Error log yazma hatası:', err);
      }
    });

    // JSON dosyasına yazma işlemi
    this.appendToJsonLog(jsonErrorEntry);

    console.error(errorLog);
  }

  getLogs(limit = 100) {
    try {
      // JSON dosyasından oku (ana kaynak)
      if (fs.existsSync(this.jsonLogFile)) {
        const jsonData = JSON.parse(fs.readFileSync(this.jsonLogFile, 'utf8'));
        return jsonData.slice(-limit);
      }
      
      // JSON dosyası yoksa boş array döndür
      return [];
    } catch (error) {
      console.error('JSON log okuma hatası:', error);
      return [];
    }
  }

  clearLogs() {
    try {
      // TXT dosyasını temizle
      if (fs.existsSync(this.logFile)) {
        fs.writeFileSync(this.logFile, '');
        console.log('TXT log dosyası temizlendi.');
      }
      
      // JSON dosyasını temizle
      if (fs.existsSync(this.jsonLogFile)) {
        fs.writeFileSync(this.jsonLogFile, JSON.stringify([], null, 2));
        console.log('JSON log dosyası temizlendi.');
      }
    } catch (error) {
      console.error('Log temizleme hatası:', error);
    }
  }

  appendToJsonLog(entry) {
    try {
      const existingData = JSON.parse(fs.readFileSync(this.jsonLogFile, 'utf8'));
      existingData.push(entry);
      fs.writeFileSync(this.jsonLogFile, JSON.stringify(existingData, null, 2));
    } catch (error) {
      if (error.code === 'ENOENT') {
        // If file doesn't exist, create it with the first entry
        fs.writeFileSync(this.jsonLogFile, JSON.stringify([entry], null, 2));
      } else {
        console.error('JSON log dosyasına yazma hatası:', error);
      }
    }
  }
}

module.exports = ChatLogger;
