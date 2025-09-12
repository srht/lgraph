// LoggingHandlers.js - Logging endpoint handlers helper class
import ConversationLogger from "./logger.js";

export default class LoggingHandlers {
  constructor() {
    this.logger = new ConversationLogger();
  }

  /**
   * Get all conversations endpoint handler
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  handleGetConversations(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 100;
      const offset = parseInt(req.query.offset) || 0;
      
      const conversations = this.logger.getConversations(limit, offset);
      
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
  }

  /**
   * Get conversation by ID endpoint handler
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  handleGetConversationById(req, res) {
    try {
      const { id } = req.params;
      const conversation = this.logger.getConversationById(id);
      
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
  }

  /**
   * Search conversations endpoint handler
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  handleSearchConversations(req, res) {
    try {
      const { q: query } = req.query;
      
      if (!query) {
        return res.status(400).json({ 
          error: 'Search query is required' 
        });
      }
      
      const results = this.logger.searchConversations(query);
      
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
  }

  /**
   * Get conversation statistics endpoint handler
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  handleGetStats(req, res) {
    try {
      const stats = this.logger.getConversationStats();
      
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
  }

  /**
   * Cleanup old logs endpoint handler
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  handleCleanupLogs(req, res) {
    try {
      const daysToKeep = parseInt(req.query.days) || 30;
      const deletedCount = this.logger.cleanupOldLogs(daysToKeep);
      
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
  }

  /**
   * Text logging endpoint handler
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  handleLogText(req, res) {
    try {
      const { text, fileName, options = {} } = req.body;
      
      if (!text || !fileName) {
        return res.status(400).json({ 
          error: 'Text and fileName are required' 
        });
      }
      
      const success = this.logger.logText(text, fileName, options);
      
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
  }

  /**
   * JSON logging endpoint handler
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  handleLogJSON(req, res) {
    try {
      const { data, fileName, options = {} } = req.body;
      
      if (!data || !fileName) {
        return res.status(400).json({ 
          error: 'Data and fileName are required' 
        });
      }
      
      const success = this.logger.logJSON(data, fileName, options);
      
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
  }

  /**
   * Debug logging endpoint handler
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  handleLogDebug(req, res) {
    try {
      const { message, data = null } = req.body;
      
      if (!message) {
        return res.status(400).json({ 
          error: 'Message is required' 
        });
      }
      
      const success = this.logger.logDebug(message, data);
      
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
  }

  /**
   * Error logging endpoint handler
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  handleLogError(req, res) {
    try {
      const { error: errorMsg, context = null } = req.body;
      
      if (!errorMsg) {
        return res.status(400).json({ 
          error: 'Error message is required' 
        });
      }
      
      const success = this.logger.logError(errorMsg, context);
      
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
  }

  /**
   * Performance logging endpoint handler
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  handleLogPerformance(req, res) {
    try {
      const { operation, duration, details = {} } = req.body;
      
      if (!operation || duration === undefined) {
        return res.status(400).json({ 
          error: 'Operation and duration are required' 
        });
      }
      
      const success = this.logger.logPerformance(operation, duration, details);
      
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
  }

  /**
   * Get log files endpoint handler
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  handleGetLogFiles(req, res) {
    try {
      const { pattern } = req.query;
      const files = this.logger.getLogFiles(pattern);
      
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
  }

  /**
   * Read log file endpoint handler
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  handleReadLogFile(req, res) {
    try {
      const { fileName } = req.params;
      const { lines } = req.query;
      
      const content = this.logger.readLogFile(fileName, lines ? parseInt(lines) : null);
      
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
  }
}
