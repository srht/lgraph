// documentProcessor.mjs

import fs from "fs";
import path from "path";
import mammoth from "mammoth"; // DOCX
import xlsx from "xlsx"; // Excel
import { fileURLToPath } from "url";
import pdfParse from "pdf-parse";

import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { Document } from "@langchain/core/documents";
import { OpenAIEmbeddings } from "@langchain/openai";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import createChatModel from "./modelSelector.js";
import { getPageContent, getPersonelPage, getPlainPage } from "./functions/readPage.js";
import VectorStorePersistence from "./vectorStorePersistence.js";
// __dirname eşleniği (ESM)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// (İsteğe bağlı) metin normalize edici – PDF/DOCX çıkışlarını biraz temizler
const normalizeText = (txt) =>
  txt
    .replace(/\r/g, "\n")
    .replace(/\u0000/g, "") // null char
    .replace(/[ \t]+\n/g, "\n") // satır sonu boşluk
    .replace(/\n{3,}/g, "\n\n") // fazla boş satır
    .trim();

export default class DocumentProcessor {
  /**
   * @param {string} apiKey  - OpenAI API key for embeddings
   * @param {number} chunkSize
   * @param {number} chunkOverlap
   * @param {boolean} useCache - Cache kullanılsın mı
   * @param {string} cacheDir - Cache klasörü
   */
  constructor(chunkSize = 1000, chunkOverlap = 300, useCache = true, cacheDir = null) {

    /*
    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENAI_API_KEY,
    });
*/
    
    this.embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: process.env.GEMINI_API_KEY,
    })
    
    // Persistence sistemi
    this.useCache = useCache;
    this.persistence = new VectorStorePersistence(cacheDir);
    this.processedFiles = []; // İşlenen dosyaları takip et

    // Normal dosyalar için text splitter
    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize,
      chunkOverlap,
    });

    // Excel dosyaları için daha küçük chunk size (her satır zaten ayrı doküman)
    this.excelTextSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 200, // Excel satırları için daha küçük
      chunkOverlap: 50,
    });

    /** @type {MemoryVectorStore | null} */
    this.vectorStore = null;
  }

  /**
   * Excel verilerini eski metin formatına dönüştürür (geriye uyumluluk için)
   * @private
   */
  #convertExcelToLegacyText(excelData) {
    let extractedText = "";
    
    excelData.sheets.forEach((sheet) => {
      extractedText += `\n=== ${sheet.sheetName} ===\n`;
      sheet.rows.forEach((row) => {
        extractedText += `Satır ${row.rowIndex}: ${row.content}\n`;
      });
    });

    extractedText = normalizeText(extractedText);
    if (!extractedText) {
      throw new Error("Excel dosyasından metin çıkarılamadı.");
    }

    return extractedText;
  }

  /**
   * Excel dosyasını her satırı ayrı doküman olarak işler
   * @private
   */
  async #processExcelFile(excelData, fileName) {
    try {
      console.log(`📊 Excel dosyası işleniyor: ${fileName}`);
      console.log(`   📋 Sayfa sayısı: ${excelData.sheets.length}`);
      
      if (!excelData.sheets || excelData.sheets.length === 0) {
        throw new Error("Excel dosyasında sayfa bulunamadı");
      }
      
      const allDocuments = [];
      let totalRows = 0;
      let processedRows = 0;
      
      excelData.sheets.forEach((sheet) => {
        console.log(`   📄 Sayfa: ${sheet.sheetName} (${sheet.rows.length} satır)`);
        totalRows += sheet.rows.length;
        
        if (!sheet.rows || sheet.rows.length === 0) {
          console.log(`   ⚠️ Sayfa ${sheet.sheetName} boş, atlanıyor`);
          return;
        }
        
        sheet.rows.forEach((row) => {
          // Boş satırları atla
          if (!row.content || row.content.trim().length === 0) {
            return;
          }
          
          try {
            // Her satır için ayrı doküman oluştur
            const document = new Document({
              pageContent: row.fullText,
              metadata: {
                source: fileName,
                sheetName: sheet.sheetName,
                rowIndex: row.rowIndex,
                rowContent: row.content,
                documentType: 'excel_row',
                // Arama için ek anahtar kelimeler
                searchableContent: `${row.content}`,
                // Excel satır bilgileri
                excelInfo: {
                  fileName: fileName,
                  sheetName: sheet.sheetName,
                  rowIndex: row.rowIndex,
                  cellCount: row.content.split(' ').length,
                  hasData: row.content.trim().length > 0
                }
              }
            });
            
            allDocuments.push(document);
            processedRows++;
          } catch (rowError) {
            console.warn(`   ⚠️ Satır ${row.rowIndex} işlenirken hata:`, rowError.message);
          }
        });
      });
      
      console.log(`   📚 Toplam ${allDocuments.length} satır dokümanı oluşturuldu (${processedRows}/${totalRows} satır işlendi)`);
      console.log(`   🔍 Her satır ayrı doküman olarak kaydedildi - daha granüler arama imkanı`);
      
      if (allDocuments.length === 0) {
        throw new Error("İşlenebilir satır bulunamadı");
      }
      
      // Excel dokümanlarını batch halinde ekle
      await this.addDocumentsInBatches(allDocuments);
      
    } catch (error) {
      console.error(`❌ Excel dosyası işlenirken hata: ${error.message}`);
      throw error;
    }
  }

  /**
   * Dosya tipine göre metni çıkarır.
   * @private
   */
  async #extractTextFromFile(filePath, mimeType) {
    if (mimeType === "application/pdf") {
      try {
        // For now, skip PDF processing due to library compatibility issues
        const dataBuffer = fs.readFileSync(filePath);
        if (!dataBuffer?.length)
          throw new Error("PDF dosyası boş veya okunamadı.");
        
        // Parse the PDF
        const data = await pdfParse(dataBuffer);
        if (!data?.text) throw new Error("PDF'ten metin çıkarılamadı.");
        let normalizedText = normalizeText(data.text);
        console.log("normalizedText:", normalizedText);
        return normalizedText;
        console.warn("⚠️ PDF işleme geçici olarak devre dışı. PDF dosyası atlanıyor.");
        return "PDF dosyası yüklendi ancak metin çıkarılamadı. PDF işleme geçici olarak devre dışı.";
      } catch (err) {
        console.error(`PDF okuma hatası '${filePath}':`, err.message);
        throw new Error(`PDF işlenirken bir sorun oluştu: ${err.message}`);
      }
    }

    if (
      mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const { value } = await mammoth.extractRawText({ path: filePath });
      return normalizeText(value || "");
    }

    if (mimeType === "text/plain") {
      const text = fs.readFileSync(filePath, "utf8");
      return normalizeText(text);
    }

    if (mimeType === "application/json") {
      try {
        const jsonData = fs.readFileSync(filePath, "utf8");
        const parsed = JSON.parse(jsonData);
        // Convert JSON to readable text format
        return JSON.stringify(parsed, null, 2);
      } catch (err) {
        console.error(`JSON okuma hatası '${filePath}':`, err.message);
        throw new Error(`JSON işlenirken bir sorun oluştu: ${err.message}`);
      }
    }

    if (
      mimeType ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      mimeType === "application/vnd.ms-excel"
    ) {
      try {
        const workbook = xlsx.readFile(filePath, {
          cellDates: true,
          raw: false,
        });
        
        // Excel dosyası için özel işleme - her satırı ayrı doküman olarak kaydet
        const excelData = {
          type: 'excel',
          fileName: path.basename(filePath),
          sheets: []
        };

        workbook.SheetNames.forEach((sheetName) => {
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
          
          const sheetData = {
            sheetName,
            rows: []
          };

          jsonData.forEach((row, rowIndex) => {
            if (row && row.length > 0) {
              const rowText = row
                .filter(
                  (cell) =>
                    cell !== null &&
                    cell !== undefined &&
                    String(cell).trim() !== ""
                )
                .map((cell) => String(cell))
                .join(" ");
              
              if (rowText.trim()) {
                sheetData.rows.push({
                  rowIndex: rowIndex + 1,
                  content: rowText,
                  fullText: `Dosya: ${path.basename(filePath)} | Sayfa: ${sheetName} | Satır ${rowIndex + 1}: ${rowText}`
                });
              }
            }
          });

          excelData.sheets.push(sheetData);
        });

        // Excel verilerini özel formatta döndür
        return {
          type: 'excel',
          data: excelData,
          // Geriye uyumluluk için eski format da ekle
          legacyText: this.#convertExcelToLegacyText(excelData)
        };
      } catch (excelError) {
        console.error(`Excel okuma hatası '${filePath}':`, excelError.message);
        throw new Error(
          `Excel işlenirken bir sorun oluştu: ${excelError.message}`
        );
      }
    }

    throw new Error(`Desteklenmeyen dosya tipi: ${mimeType}`);
  }

  /**
   * Dosyayı işler ve vektör deposuna ekler.
   */
  async processDocument(filePath, fileName) {
    // Dosyayı işlenen dosyalar listesine ekle
    if (!this.processedFiles.includes(filePath)) {
      this.processedFiles.push(filePath);
    }
    
    const fileExtension = path.extname(fileName).toLowerCase();
    let mimeType;
    switch (fileExtension) {
      case ".txt":
        mimeType = "text/plain";
        break;
      case ".pdf":
        mimeType = "application/pdf";
        break;
      case ".docx":
        mimeType =
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        break;
      case ".xlsx":
        mimeType =
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        break;
      case ".xls":
        mimeType = "application/vnd.ms-excel";
        break;
      case ".json":
        mimeType = "application/json";
        break;
      default:
        throw new Error(`Desteklenmeyen dosya uzantısı: ${fileExtension}`);
    }

    let text;
    let isExcelFile = false;
    
    try {
      text = await this.#extractTextFromFile(filePath, mimeType);
      if (!text) throw new Error("Çıkarılan metin boş.");
      
      // Excel dosyası mı kontrol et
      isExcelFile = text.type === 'excel';
      
    } catch (error) {
      console.error(`'${fileName}' metin çıkarılırken hata:`, error.message);
      throw error;
    }

    if (isExcelFile) {
      // Excel dosyası için özel işleme - her satırı ayrı doküman olarak kaydet
      await this.#processExcelFile(text.data, fileName);
    } else {
      // Normal dosyalar için standart işleme
      const docs = await this.textSplitter.createDocuments([text], {
        source: fileName,
      });
      const documents = docs.map(
        (d) => new Document({ pageContent: d.pageContent, metadata: d.metadata })
      );

      await this.addDocumentsInBatches(documents);
    }
  }

  /**
   * Belgeleri batch halinde vektör deposuna ekler.
   */
  async addDocumentsInBatches(documents, batchSize = 25) {
    console.log(`Toplam ${documents.length} belge parçası işleniyor.`);
    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      const batchNo = Math.floor(i / batchSize) + 1;
      console.log(`Batch ${batchNo} (${batch.length} belge) ekleniyor...`);

      if (this.vectorStore) {
        await this.vectorStore.addDocuments(batch);
      } else {
        this.vectorStore = await MemoryVectorStore.fromDocuments(
          batch,
          this.embeddings
        );
      }

      console.log(`Batch ${batchNo} tamamlandı.`);
      if (i + batchSize < documents.length) {
        console.log("Bir sonraki batch için 1 saniye bekleniyor...");
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  async processWebPage(url) {
    let text;
    try {
      text = await getPageContent(url);
      if (!text || text.trim().length === 0) {
        throw new Error("Çıkarılan metin boş.");
      }

      console.log(`Web sayfasından metin çıkarıldı: ${text}`);
    } catch (error) {
      console.error(
        `Dosya '${url}' metin çıkarılırken hata oluştu:`,
        error.message
      );
      throw error; // Hatayı yukarı fırlat
    }

    const docs = await this.textSplitter.createDocuments([text], {
      source: url,
    });
    const documents = docs.map(
      (doc) =>
        new Document({ pageContent: doc.pageContent, metadata: doc.metadata })
    );
    console.log(
      `${url} Web sayfasından ${documents.length} belge parçası oluşturuldu.`
    );
    await this.addDocumentsInBatches(documents);
  }

  async processPlainWebPage(url) {
    let text;
    try {
      text = await getPlainPage(url);
      if (!text || text.trim().length === 0) {
        throw new Error("Çıkarılan metin boş.");
      }

      console.log(`Web sayfasından metin çıkarıldı: ${text}`);
    } catch (error) {
      console.error(
        `Dosya '${url}' metin çıkarılırken hata oluştu:`,
        error.message
      );
      throw error; // Hatayı yukarı fırlat
    }

    const docs = await this.textSplitter.createDocuments([text], {
      source: url,
    });
    const documents = docs.map(
      (doc) =>
        new Document({ pageContent: doc.pageContent, metadata: doc.metadata })
    );
    console.log(
      `${url} Web sayfasından ${documents.length} belge parçası oluşturuldu.`
    );
    await this.addDocumentsInBatches(documents);
  }

  async processPersonelPage() {
    let text;
    const url = "https://kutuphane.itu.edu.tr/hakkimizda/personel-ve-bolumler";
    try {
      text = await getPersonelPage(url);
      if (!text || text.trim().length === 0) {
        throw new Error("Çıkarılan metin boş.");
      }

      console.log(`Web sayfasından metin çıkarıldı: ${text}`);
    } catch (error) {
      console.error(
        `Dosya '${url}' metin çıkarılırken hata oluştu:`,
        error.message
      );
      throw error; // Hatayı yukarı fırlat
    }

    const docs = await this.textSplitter.createDocuments([text], {
      source: url,
    });
    const documents = docs.map(
      (doc) =>
        new Document({ pageContent: doc.pageContent, metadata: doc.metadata })
    );
    console.log(
      `${url} Web sayfasından ${documents.length} belge parçası oluşturuldu.`
    );
    await this.addDocumentsInBatches(documents);
  }

  /**
   * Cache'den vector store'u yükle
   */
  async loadFromCache() {
    if (!this.useCache) {
      console.log('📂 Cache kullanımı devre dışı');
      return false;
    }

    try {
      console.log('📂 Cache\'den vector store yükleniyor...');
      const result = await this.persistence.loadVectorStore('gemini', process.env.GEMINI_API_KEY);
      
      if (result) {
        this.vectorStore = result.vectorStore;
        console.log(`✅ Cache'den yüklendi: ${result.metadata.totalDocuments} doküman`);
        return true;
      } else {
        console.log('ℹ️ Cache bulunamadı veya geçersiz');
        return false;
      }
    } catch (error) {
      console.error('❌ Cache yükleme hatası:', error);
      return false;
    }
  }

  /**
   * Vector store'u cache'e kaydet
   */
  async saveToCache() {
    if (!this.useCache || !this.vectorStore) {
      return false;
    }

    try {
      console.log('💾 Vector store cache\'e kaydediliyor...');
      const success = await this.persistence.saveVectorStore(this.vectorStore, this.processedFiles);
      
      if (success) {
        console.log('✅ Cache\'e kaydedildi');
      } else {
        console.log('❌ Cache\'e kaydetme başarısız');
      }
      
      return success;
    } catch (error) {
      console.error('❌ Cache kaydetme hatası:', error);
      return false;
    }
  }

  /**
   * Cache geçerliliğini kontrol et
   */
  isCacheValid() {
    if (!this.useCache) {
      return false;
    }
    return this.persistence.isCacheValid(this.processedFiles);
  }

  /**
   * Cache bilgilerini al
   */
  getCacheInfo() {
    return this.persistence.getCacheInfo();
  }

  /**
   * Cache'i temizle
   */
  clearCache() {
    return this.persistence.clearCache();
  }

  /**
   * Mevcut vektör deposunu döndürür.
   * @returns {MemoryVectorStore | null}
   */
  getVectorStore() {
    console.log("Vektör deposu alınıyor...");
    return this.vectorStore;
  }

  /**
   * Kolay retriever (graf/agent tarafında k ayarı yapmana gerek kalmasın)
   * @param {number} k
   */
  getRetriever(k = 5) {
    if (!this.vectorStore) return null;
    return this.vectorStore.asRetriever({ k });
  }
}
