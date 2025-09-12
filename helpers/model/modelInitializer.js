// ModelInitializer.js - Model initialization and management helper class
import createChatModel from "./modelSelector.js";

export default class ModelInitializer {
  constructor() {
    this.chatModel = null;
    this.embeddingModel = null;
  }

  /**
   * Initialize models based on environment configuration
   * @returns {Promise<{chatModel: Object, embeddingModel: Object}>}
   */
  async initializeModels() {
    try {
      // Model seçimi - environment variable'dan al veya varsayılan olarak 'gemini' kullan
      const modelName = process.env.CHAT_MODEL || 'gemini';
      console.log(`🤖 Model seçiliyor: ${modelName}`);
      
      const { chatModel, embeddingModel } = await createChatModel(modelName);
      
      this.chatModel = chatModel;
      this.embeddingModel = embeddingModel;
      
      console.log(`✅ Modeller başarıyla yüklendi`);
      console.log(`   Chat Model: ${chatModel.constructor.name}`);
      console.log(`   Embedding Model: ${embeddingModel.constructor.name}`);
      
      return { chatModel, embeddingModel };
    } catch (error) {
      console.error('❌ Model yükleme hatası:', error);
      throw error;
    }
  }

  /**
   * Get the initialized chat model
   * @returns {Object|null}
   */
  getChatModel() {
    return this.chatModel;
  }

  /**
   * Get the initialized embedding model
   * @returns {Object|null}
   */
  getEmbeddingModel() {
    return this.embeddingModel;
  }

  /**
   * Check if models are initialized
   * @returns {boolean}
   */
  isInitialized() {
    return this.chatModel !== null && this.embeddingModel !== null;
  }

  /**
   * Reset models (for reinitialization)
   */
  reset() {
    this.chatModel = null;
    this.embeddingModel = null;
  }
}
