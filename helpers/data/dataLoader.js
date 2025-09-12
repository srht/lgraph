// DataLoader.js - Data loading and file processing helper class
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import DocumentProcessor from "./documentProcessor.mjs";

export default class DataLoader {
  constructor() {
    this.__filename = fileURLToPath(import.meta.url);
    this.__dirname = path.dirname(this.__filename);
    this.documentProcessor = null;
    this.vectorStore = null;
  }

  /**
   * Initialize document processor with embedding model
   * @param {Object} embeddingModel - The embedding model to use
   * @returns {DocumentProcessor}
   */
  initializeDocumentProcessor(embeddingModel) {
    this.documentProcessor = new DocumentProcessor(embeddingModel);
    return this.documentProcessor;
  }

  /**
   * Load data files from the data directory
   * @param {DocumentProcessor} documentProcessor - The document processor instance
   * @returns {Promise<DocumentProcessor|null>}
   */
  async loadDataFiles(documentProcessor) {
    console.log("📁 Data klasöründeki dosyalar yükleniyor...");
    
    const dataDir = path.join(this.__dirname, "..", "..", "data");
    const supportedExtensions = ['.pdf', '.xlsx', '.xls', '.txt', '.json', '.xml'];
    
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

  /**
   * Get the vector store from document processor
   * @returns {Object|null}
   */
  getVectorStore() {
    if (this.documentProcessor) {
      this.vectorStore = this.documentProcessor.getVectorStore();
      return this.vectorStore;
    }
    return null;
  }

  /**
   * Get the document processor instance
   * @returns {DocumentProcessor|null}
   */
  getDocumentProcessor() {
    return this.documentProcessor;
  }

  /**
   * Set the document processor instance
   * @param {DocumentProcessor} processor
   */
  setDocumentProcessor(processor) {
    this.documentProcessor = processor;
  }

  /**
   * Get cache information
   * @returns {Object}
   */
  getCacheInfo() {
    if (this.documentProcessor) {
      return this.documentProcessor.getCacheInfo();
    }
    return { status: 'No document processor initialized' };
  }

  /**
   * Clear cache
   * @returns {boolean}
   */
  clearCache() {
    if (this.documentProcessor) {
      return this.documentProcessor.clearCache();
    }
    return false;
  }

  /**
   * Load from cache
   * @returns {Promise<boolean>}
   */
  async loadFromCache() {
    if (this.documentProcessor) {
      return await this.documentProcessor.loadFromCache();
    }
    return false;
  }

  /**
   * Save to cache
   * @returns {Promise<boolean>}
   */
  async saveToCache() {
    if (this.documentProcessor) {
      return await this.documentProcessor.saveToCache();
    }
    return false;
  }

  /**
   * Rebuild cache by reprocessing files
   * @returns {Promise<boolean>}
   */
  async rebuildCache() {
    try {
      console.log('🔄 Dosyalar yeniden işleniyor (cache bypass)...');
      
      // Cache'i temizle
      this.clearCache();
      
      // Yeni document processor oluştur (cache devre dışı)
      const newProcessor = new DocumentProcessor(this.documentProcessor.embeddingModel, 1000, 300, false);
      
      // Dosyaları yeniden işle
      const result = await this.loadDataFiles(newProcessor);
      
      if (result) {
        // Global değişkenleri güncelle
        this.documentProcessor = newProcessor;
        this.vectorStore = newProcessor.getVectorStore();
        
        // Yeni cache'e kaydet
        newProcessor.useCache = true;
        await newProcessor.saveToCache();
        
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ Cache rebuild error:', error);
      return false;
    }
  }
}
