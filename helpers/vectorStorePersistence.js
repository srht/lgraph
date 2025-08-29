// vectorStorePersistence.js
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { OpenAIEmbeddings } from "@langchain/openai";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class VectorStorePersistence {
  constructor(cacheDir = null) {
    this.cacheDir = cacheDir || path.join(__dirname, '..', 'vector_cache');
    this.metadataFile = path.join(this.cacheDir, 'metadata.json');
    this.vectorsFile = path.join(this.cacheDir, 'vectors.json');
    this.documentsFile = path.join(this.cacheDir, 'documents.json');
    
    this.ensureCacheDirectory();
  }

  ensureCacheDirectory() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
      console.log(`📁 Cache klasörü oluşturuldu: ${this.cacheDir}`);
    }
  }

  /**
   * Dosya hash'i hesapla (değişiklik tespiti için)
   */
  calculateFileHash(filePath) {
    try {
      const content = fs.readFileSync(filePath);
      return crypto.createHash('md5').update(content).digest('hex');
    } catch (error) {
      console.warn(`⚠️ Hash hesaplanamadı: ${filePath}`, error.message);
      return null;
    }
  }

  /**
   * Metadata'yı kaydet
   */
  saveMetadata(metadata) {
    try {
      fs.writeFileSync(this.metadataFile, JSON.stringify(metadata, null, 2));
      console.log('💾 Metadata kaydedildi');
      return true;
    } catch (error) {
      console.error('❌ Metadata kaydetme hatası:', error);
      return false;
    }
  }

  /**
   * Metadata'yı yükle
   */
  loadMetadata() {
    try {
      if (fs.existsSync(this.metadataFile)) {
        const content = fs.readFileSync(this.metadataFile, 'utf8');
        return JSON.parse(content);
      }
      return null;
    } catch (error) {
      console.error('❌ Metadata yükleme hatası:', error);
      return null;
    }
  }

  /**
   * Vector store'u dosyaya kaydet
   */
  async saveVectorStore(vectorStore, sourceFiles = []) {
    try {
      console.log('💾 Vector store kaydediliyor...');
      
      // Vector store'dan vektörleri ve dokümanları çıkar
      const vectors = [];
      const documents = [];
      
      // MemoryVectorStore'dan verileri çıkar
      if (vectorStore.memoryVectors) {
        for (let i = 0; i < vectorStore.memoryVectors.length; i++) {
          const vector = vectorStore.memoryVectors[i];
          vectors.push({
            content: vector.content,
            embedding: vector.embedding,
            metadata: vector.metadata
          });
          
          documents.push({
            pageContent: vector.content,
            metadata: vector.metadata
          });
        }
      }

      // Metadata oluştur
      const metadata = {
        version: '1.0',
        createdAt: new Date().toISOString(),
        embeddingProvider: vectorStore.embeddings?.constructor?.name || 'unknown',
        embeddingModel: vectorStore.embeddings?.modelName || 'unknown',
        totalVectors: vectors.length,
        totalDocuments: documents.length,
        sourceFiles: sourceFiles.map(filePath => ({
          path: filePath,
          hash: this.calculateFileHash(filePath),
          size: fs.existsSync(filePath) ? fs.statSync(filePath).size : 0,
          lastModified: fs.existsSync(filePath) ? fs.statSync(filePath).mtime.toISOString() : null
        }))
      };

      // Dosyaları kaydet
      fs.writeFileSync(this.vectorsFile, JSON.stringify(vectors, null, 2));
      fs.writeFileSync(this.documentsFile, JSON.stringify(documents, null, 2));
      this.saveMetadata(metadata);

      console.log(`✅ Vector store kaydedildi: ${vectors.length} vektör, ${documents.length} doküman`);
      return true;

    } catch (error) {
      console.error('❌ Vector store kaydetme hatası:', error);
      return false;
    }
  }

  /**
   * Vector store'u dosyadan yükle
   */
  async loadVectorStore(embeddingProvider = 'gemini', embeddingApiKey = null) {
    try {
      console.log('📂 Vector store yükleniyor...');

      // Dosyaların varlığını kontrol et
      if (!fs.existsSync(this.vectorsFile) || !fs.existsSync(this.documentsFile)) {
        console.log('ℹ️ Cache dosyaları bulunamadı');
        return null;
      }

      // Metadata'yı yükle
      const metadata = this.loadMetadata();
      if (!metadata) {
        console.log('⚠️ Metadata bulunamadı');
        return null;
      }

      console.log(`📊 Cache bilgileri: ${metadata.totalVectors} vektör, ${metadata.embeddingProvider} provider`);

      // Embedding modelini oluştur
      let embeddings;
      if (embeddingProvider === 'openai') {
        embeddings = new OpenAIEmbeddings({
          apiKey: embeddingApiKey
        });
      } else {
        // default gemini
        embeddings = new GoogleGenerativeAIEmbeddings({
          apiKey: embeddingApiKey || process.env.GEMINI_API_KEY
        });
      }

      // Dokümanları yükle
      const documentsContent = fs.readFileSync(this.documentsFile, 'utf8');
      const documents = JSON.parse(documentsContent);

      // Vector store oluştur
      const vectorStore = await MemoryVectorStore.fromDocuments(documents, embeddings);

      console.log(`✅ Vector store yüklendi: ${documents.length} doküman`);
      return { vectorStore, metadata };

    } catch (error) {
      console.error('❌ Vector store yükleme hatası:', error);
      return null;
    }
  }

  /**
   * Cache'in güncel olup olmadığını kontrol et
   */
  isCacheValid(sourceFiles = []) {
    try {
      const metadata = this.loadMetadata();
      if (!metadata) {
        console.log('🔍 Metadata yok, cache geçersiz');
        return false;
      }

      // Dosya sayısı kontrolü
      if (metadata.sourceFiles.length !== sourceFiles.length) {
        console.log('🔍 Dosya sayısı değişmiş, cache geçersiz');
        return false;
      }

      // Her dosya için hash kontrolü
      for (const filePath of sourceFiles) {
        const cachedFile = metadata.sourceFiles.find(f => f.path === filePath);
        if (!cachedFile) {
          console.log(`🔍 Yeni dosya: ${filePath}, cache geçersiz`);
          return false;
        }

        const currentHash = this.calculateFileHash(filePath);
        if (currentHash !== cachedFile.hash) {
          console.log(`🔍 Dosya değişmiş: ${filePath}, cache geçersiz`);
          return false;
        }
      }

      console.log('✅ Cache güncel');
      return true;

    } catch (error) {
      console.error('❌ Cache validasyon hatası:', error);
      return false;
    }
  }

  /**
   * Cache'i temizle
   */
  clearCache() {
    try {
      const files = [this.metadataFile, this.vectorsFile, this.documentsFile];
      let deletedCount = 0;

      files.forEach(file => {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
          deletedCount++;
        }
      });

      console.log(`🗑️ Cache temizlendi: ${deletedCount} dosya silindi`);
      return true;
    } catch (error) {
      console.error('❌ Cache temizleme hatası:', error);
      return false;
    }
  }

  /**
   * Cache bilgilerini göster
   */
  getCacheInfo() {
    try {
      const metadata = this.loadMetadata();
      if (!metadata) {
        return { exists: false };
      }

      const vectorsExists = fs.existsSync(this.vectorsFile);
      const documentsExists = fs.existsSync(this.documentsFile);

      return {
        exists: true,
        valid: vectorsExists && documentsExists,
        metadata: metadata,
        files: {
          metadata: fs.existsSync(this.metadataFile),
          vectors: vectorsExists,
          documents: documentsExists
        },
        sizes: {
          metadata: fs.existsSync(this.metadataFile) ? fs.statSync(this.metadataFile).size : 0,
          vectors: vectorsExists ? fs.statSync(this.vectorsFile).size : 0,
          documents: documentsExists ? fs.statSync(this.documentsFile).size : 0
        }
      };
    } catch (error) {
      console.error('❌ Cache bilgi alma hatası:', error);
      return { exists: false, error: error.message };
    }
  }
}

export default VectorStorePersistence;
