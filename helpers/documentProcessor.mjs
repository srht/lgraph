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
   */
  constructor(chunkSize = 1000, chunkOverlap = 300) {
    
    /*
    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENAI_API_KEY,
    });

    */
    this.embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: process.env.GEMINI_API_KEY,
    })

    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize,
      chunkOverlap,
    });

    /** @type {MemoryVectorStore | null} */
    this.vectorStore = null;
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
        
        return normalizeText(data.text);
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
        let extractedText = "";

        workbook.SheetNames.forEach((sheetName) => {
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

          extractedText += `\n=== ${sheetName} ===\n`;
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
              if (rowText.trim())
                extractedText += `Satır ${rowIndex + 1}: ${rowText}\n`;
            }
          });
        });

        extractedText = normalizeText(extractedText);
        if (!extractedText)
          throw new Error("Excel dosyasından metin çıkarılamadı.");

        console.log(
          "Excel'den çıkarılan metin:",
          extractedText.substring(0, 500) + "..."
        );
        return extractedText;
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
    try {
      text = await this.#extractTextFromFile(filePath, mimeType);
      if (!text) throw new Error("Çıkarılan metin boş.");
    } catch (error) {
      console.error(`'${fileName}' metin çıkarılırken hata:`, error.message);
      throw error;
    }

    const docs = await this.textSplitter.createDocuments([text], {
      source: fileName,
    });
    const documents = docs.map(
      (d) => new Document({ pageContent: d.pageContent, metadata: d.metadata })
    );

    await this.addDocumentsInBatches(documents);
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
