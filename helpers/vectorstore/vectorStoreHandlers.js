// VectorStoreHandlers.js - Vector store and cache management endpoint handlers helper class
import DocumentProcessor from "../data/documentProcessor.mjs";

export default class VectorStoreHandlers {
  constructor() {
    this.documentProcessor = null;
  }

  /**
   * Set document processor instance
   * @param {DocumentProcessor} processor
   */
  setDocumentProcessor(processor) {
    this.documentProcessor = processor;
  }

  /**
   * Get vector store status and content endpoint handler
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Object} vectorStore - Vector store instance
   */
  async handleGetVectorStore(req, res, vectorStore) {
    if (!vectorStore) {
      return res.status(404).json({
        error: "Vector store not loaded",
      });
    }

    try {
      const { search, showAll } = req.query;

      let allDocs;
      if (search && search.trim()) {
        // Arama sorgusu varsa sadece ilgili dokümanları al
        console.log(`🔍 Vector store'da arama: "${search}"`);
        const retriever = vectorStore.asRetriever({ k: 10000 });
        allDocs = await retriever.getRelevantDocuments(search);
      } else {
        // Arama yoksa tüm dokümanları al
        const retriever = vectorStore.asRetriever({ k: 10000 });
        allDocs = await retriever.getRelevantDocuments(""); // Boş sorgu ile tüm dokümanları al
      }

      // Dokümanları kategorilere ayır
      const categorizedDocs = {
        excel: [],
        pdf: [],
        docx: [],
        txt: [],
        json: [],
        other: [],
      };

      let totalDocs = 0;
      let totalContentLength = 0;

      allDocs.forEach((doc, index) => {
        totalDocs++;
        totalContentLength += doc.pageContent?.length || 0;

        const metadata = doc.metadata || {};
        const source = metadata.source || "unknown";
        const docType = metadata.documentType || "unknown";

        // Doküman bilgilerini hazırla
        const docInfo = {
          id: index,
          source: source,
          documentType: docType,
          content:
            doc.pageContent?.substring(0, 200) +
            (doc.pageContent?.length > 200 ? "..." : ""),
          fullContent: doc.pageContent,
          metadata: metadata,
          contentLength: doc.pageContent?.length || 0,
        };

        // Excel satır dokümanları için özel işleme
        if (docType === "excel_row") {
          categorizedDocs.excel.push(docInfo);
        } else if (source.endsWith(".pdf")) {
          categorizedDocs.pdf.push(docInfo);
        } else if (source.endsWith(".docx")) {
          categorizedDocs.docx.push(docInfo);
        } else if (source.endsWith(".txt")) {
          categorizedDocs.txt.push(docInfo);
        } else if (source.endsWith(".json")) {
          categorizedDocs.json.push(docInfo);
        } else {
          categorizedDocs.other.push(docInfo);
        }
      });

      // Her kategori için istatistikler
      const stats = {
        total: totalDocs,
        totalContentLength: totalContentLength,
        excel: {
          count: categorizedDocs.excel.length,
          totalRows: categorizedDocs.excel.length,
          sheets: [
            ...new Set(
              categorizedDocs.excel
                .map((doc) => doc.metadata?.sheetName)
                .filter(Boolean)
            ),
          ],
        },
        pdf: { count: categorizedDocs.pdf.length },
        docx: { count: categorizedDocs.docx.length },
        txt: { count: categorizedDocs.txt.length },
        json: { count: categorizedDocs.json.length },
        other: { count: categorizedDocs.other.length },
      };

      res.json({
        status: "Loaded",
        timestamp: new Date().toISOString(),
        search: search || null,
        stats: stats,
        documents: {
          excel: categorizedDocs.excel.slice(0, 50), // İlk 50 Excel satırı
          pdf: categorizedDocs.pdf.slice(0, 20), // İlk 20 PDF parçası
          docx: categorizedDocs.docx.slice(0, 20), // İlk 20 DOCX parçası
          txt: categorizedDocs.txt.slice(0, 20), // İlk 20 TXT parçası
          json: categorizedDocs.json.slice(0, 20), // İlk 20 JSON parçası
          other: categorizedDocs.other.slice(0, 20), // İlk 20 diğer parça
        },
        // Tüm dokümanları görmek için query parametresi
        showAll: showAll === "true",
        allDocuments:
          showAll === "true"
            ? allDocs.map((doc, index) => ({
                id: index,
                source: doc.metadata?.source || "unknown",
                documentType: doc.metadata?.documentType || "unknown",
                content:
                  doc.pageContent?.substring(0, 300) +
                  (doc.pageContent?.length > 300 ? "..." : ""),
                metadata: doc.metadata,
                contentLength: doc.pageContent?.length || 0,
              }))
            : null,
      });
    } catch (error) {
      console.error("❌ Vector store content retrieval error:", error);
      res.status(500).json({
        error: "Failed to retrieve vector store content",
        message: error.message,
      });
    }
  }

  /**
   * Get cache status endpoint handler
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  handleGetCacheStatus(req, res) {
    try {
      if (!this.documentProcessor) {
        return res.status(404).json({
          error: "Document processor not initialized",
        });
      }

      const cacheInfo = this.documentProcessor.getCacheInfo();

      res.json({
        success: true,
        cache: cacheInfo,
        useCache: this.documentProcessor.useCache,
        processedFiles: this.documentProcessor.processedFiles?.length || 0,
      });
    } catch (error) {
      console.error("❌ Cache status error:", error);
      res.status(500).json({
        error: "Internal server error",
        message: error.message,
      });
    }
  }

  /**
   * Clear cache endpoint handler
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  handleClearCache(req, res) {
    try {
      if (!this.documentProcessor) {
        return res.status(404).json({
          error: "Document processor not initialized",
        });
      }

      const success = this.documentProcessor.clearCache();

      res.json({
        success: success,
        message: success
          ? "Cache cleared successfully"
          : "Failed to clear cache",
      });
    } catch (error) {
      console.error("❌ Cache clear error:", error);
      res.status(500).json({
        error: "Internal server error",
        message: error.message,
      });
    }
  }

  /**
   * Reload from cache endpoint handler
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} updateVectorStore - Function to update vector store
   */
  async handleReloadCache(req, res, updateVectorStore) {
    try {
      if (!this.documentProcessor) {
        return res.status(404).json({
          error: "Document processor not initialized",
        });
      }

      console.log("🔄 Cache'den yeniden yükleme başlatılıyor...");

      const success = await this.documentProcessor.loadFromCache();

      if (success) {
        // Vector store'u güncelle
        updateVectorStore(this.documentProcessor.getVectorStore());

        res.json({
          success: true,
          message: "Cache reloaded successfully",
          vectorStore: "Loaded",
        });
      } else {
        res.json({
          success: false,
          message: "Failed to reload from cache",
        });
      }
    } catch (error) {
      console.error("❌ Cache reload error:", error);
      res.status(500).json({
        error: "Internal server error",
        message: error.message,
      });
    }
  }

  /**
   * Save to cache endpoint handler
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async handleSaveCache(req, res) {
    try {
      if (!this.documentProcessor) {
        return res.status(404).json({
          error: "Document processor not initialized",
        });
      }

      console.log("💾 Cache'e kaydetme başlatılıyor...");

      const success = await this.documentProcessor.saveToCache();

      res.json({
        success: success,
        message: success ? "Cache saved successfully" : "Failed to save cache",
      });
    } catch (error) {
      console.error("❌ Cache save error:", error);
      res.status(500).json({
        error: "Internal server error",
        message: error.message,
      });
    }
  }

  /**
   * Rebuild cache endpoint handler
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} loadDataFiles - Function to load data files
   * @param {Function} updateVectorStore - Function to update vector store
   */
  async handleRebuildCache(req, res, loadDataFiles, updateVectorStore) {
    try {
      if (!this.documentProcessor) {
        return res.status(404).json({
          error: "Document processor not initialized",
        });
      }

      console.log("🔄 Dosyalar yeniden işleniyor (cache bypass)...");

      // Cache'i temizle
      this.documentProcessor.clearCache();

      // Yeni document processor oluştur (cache devre dışı)
      const newProcessor = new DocumentProcessor(
        this.documentProcessor.embeddingModel,
        1000,
        300,
        false
      );

      // Dosyaları yeniden işle
      const result = loadDataFiles(newProcessor);

      if (result) {
        // Global değişkenleri güncelle
        this.documentProcessor = newProcessor;
        updateVectorStore(newProcessor.getVectorStore());

        // Yeni cache'e kaydet
        newProcessor.useCache = true;
        await newProcessor.saveToCache();

        res.json({
          success: true,
          message: "Files reprocessed and cache rebuilt successfully",
          vectorStore: "Loaded",
        });
      } else {
        res.json({
          success: false,
          message: "Failed to reprocess files",
        });
      }
    } catch (error) {
      console.error("❌ Cache rebuild error:", error);
      res.status(500).json({
        error: "Internal server error",
        message: error.message,
      });
    }
  }
}
