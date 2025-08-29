// test-simple.mjs - OpenAI ile basit RAG sistemi
import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import pdfParse from "pdf-parse";
import xlsx from "xlsx";
import natural from "natural";

// __dirname eşleniği (ES modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// OpenAI API istemcisini başlat
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const app = express();
const PORT = process.env.PORT || 3001;

// --- Middleware'ler ---
app.use(cors());
app.use(express.json());

// Multer yapılandırması
const upload = multer({ dest: "data/" });

// --- Bellek İçi Vektör Veritabanı ---
const documentChunks = [];
const documentEmbeddings = [];

// --- Yardımcı Fonksiyonlar ---

/**
 * Dosyayı okur ve metni cümlelere böler (chunking).
 * @param {string} filePath - Okunacak dosyanın yolu.
 * @returns {string[]} Metin parçalarının dizisi.
 */
async function readFileAndChunk(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.warn(`Uyarı: Dosya bulunamadı: ${filePath}. Otomatik yükleme atlanıyor.`);
      return [];
    }

    const ext = path.extname(filePath).toLowerCase();
    let text = "";

    // Dosya türüne göre metin çıkarma
    switch (ext) {
      case '.pdf':
        console.log(`📄 PDF dosyası okunuyor: ${filePath}`);
        const pdfBuffer = fs.readFileSync(filePath);
        const pdfData = await pdfParse(pdfBuffer);
        text = pdfData.text;
        break;
        
      case '.xlsx':
      case '.xls':
        console.log(`📊 Excel dosyası okunuyor: ${filePath}`);
        const workbook = xlsx.readFile(filePath);
        const sheetTexts = [];
        workbook.SheetNames.forEach(sheetName => {
          const sheet = workbook.Sheets[sheetName];
          const sheetData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
          const sheetText = sheetData
            .map(row => row.join(' | '))
            .filter(row => row.trim().length > 0)
            .join('\n');
          if (sheetText.trim()) {
            sheetTexts.push(`=== ${sheetName} ===\n${sheetText}`);
          }
        });
        text = sheetTexts.join('\n\n');
        break;
        
      case '.json':
        console.log(`📋 JSON dosyası okunuyor: ${filePath}`);
        const jsonData = JSON.parse(fs.readFileSync(filePath, "utf8"));
        text = JSON.stringify(jsonData, null, 2);
        break;
        
      case '.txt':
      case '.md':
      default:
        console.log(`📝 Metin dosyası okunuyor: ${filePath}`);
        text = fs.readFileSync(filePath, "utf8");
        break;
    }

    if (!text || text.trim().length === 0) {
      console.warn(`⚠️ Dosyadan metin çıkarılamadı: ${filePath}`);
      return [];
    }
    
    // Natural tokenizer ile cümle bazlı chunking (~500 token)
    const tokenizer = new natural.SentenceTokenizer();
    const sentences = tokenizer.tokenize(text);
    
    const maxTokensPerChunk = 300;
    const avgWordsPerToken = 0.75; // 1 token ≈ 0.75 kelime (Türkçe için)
    
    const chunks = [];
    let currentChunk = "";
    let currentTokenCount = 0;
    
    for (const sentence of sentences) {
      const sentenceWords = sentence.split(/\s+/).length;
      const sentenceTokens = Math.ceil(sentenceWords / avgWordsPerToken);
      
      // Eğer bu cümle eklenirse chunk çok büyük olur mu?
      if (currentTokenCount + sentenceTokens > maxTokensPerChunk && currentChunk.trim()) {
        // Mevcut chunk'ı kaydet
        chunks.push(currentChunk.trim());
        currentChunk = sentence.trim();
        currentTokenCount = sentenceTokens;
      } else {
        // Cümleyi mevcut chunk'a ekle
        currentChunk += (currentChunk ? " " : "") + sentence.trim();
        currentTokenCount += sentenceTokens;
      }
    }
    
    // Son chunk'ı ekle
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
    
    // Çok kısa chunk'ları filtrele (en az 20 token)
    const finalChunks = chunks.filter(chunk => {
      const words = chunk.split(/\s+/).length;
      const tokens = Math.ceil(words / avgWordsPerToken);
      return tokens >= 20;
    });

    console.log(`✅ ${path.basename(filePath)}: ${finalChunks.length} parça çıkarıldı (~500 token/chunk)`);
    return finalChunks;
  } catch (error) {
    console.error(`❌ Dosya işleme hatası (${path.basename(filePath)}):`, error.message);
    return [];
  }
}

/**
 * Data klasöründeki tüm desteklenen dosyaları yükler ve işler
 * @param {string} dataDir - Data klasörünün yolu
 * @returns {Object} Yüklenen dosya sayısı ve toplam chunk sayısı
 */
async function loadAllDataFiles(dataDir) {
  const supportedExtensions = ['.txt', '.pdf', '.xlsx', '.xls', '.json', '.md'];
  const allChunks = [];
  let processedFiles = 0;
  
  try {
    console.log(`📂 Data klasörü taranıyor: ${dataDir}`);
    
    if (!fs.existsSync(dataDir)) {
      console.warn(`⚠️ Data klasörü bulunamadı: ${dataDir}`);
      return { processedFiles: 0, totalChunks: 0 };
    }

    const files = fs.readdirSync(dataDir)
      .filter(file => {
        const ext = path.extname(file).toLowerCase();
        return supportedExtensions.includes(ext);
      })
      .map(file => path.join(dataDir, file));

    console.log(`📋 ${files.length} desteklenen dosya bulundu`);
    
    for (const filePath of files) {
      try {
        const chunks = await readFileAndChunk(filePath);
        if (chunks.length > 0) {
          // Her chunk'a kaynak dosya bilgisi ekle
          const chunksWithSource = chunks.map(chunk => ({
            text: chunk,
            source: path.basename(filePath)
          }));
          allChunks.push(...chunksWithSource);
          processedFiles++;
        }
      } catch (error) {
        console.error(`❌ Dosya işleme hatası: ${path.basename(filePath)}:`, error.message);
      }
    }

    console.log(`✅ ${processedFiles} dosya işlendi, toplam ${allChunks.length} chunk oluşturuldu`);
    return { 
      processedFiles, 
      totalChunks: allChunks.length, 
      chunks: allChunks.map(item => item.text),
      sources: allChunks.map(item => item.source)
    };
    
  } catch (error) {
    console.error("❌ Data klasörü yükleme hatası:", error);
    return { processedFiles: 0, totalChunks: 0, chunks: [], sources: [] };
  }
}

/**
 * OpenAI ile metin embedding'i oluşturur
 * @param {string[]} texts - Embedding oluşturulacak metinlerin dizisi.
 * @returns {number[][]} Her metin için bir embedding vektörü içeren dizi.
 */
async function getEmbeddings(texts) {
  try {
    const embeddings = [];
    const batchSize = 25; // OpenAI embedding batch size
    
    console.log(`${texts.length} metin için OpenAI embedding oluşturuluyor (${batchSize}'lik batch'ler)...`);
    
    // Batch processing (OpenAI API için)
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchNumber = Math.floor(i/batchSize) + 1;
      const totalBatches = Math.ceil(texts.length/batchSize);
      
      console.log(`Batch ${batchNumber}/${totalBatches} işleniyor (${batch.length} metin)...`);
      
      try {
        // OpenAI batch embedding API
        const response = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: batch,
        });
        
        // Batch sonuçlarını ekle
        response.data.forEach(item => {
          embeddings.push(item.embedding);
        });
        
        console.log(`Batch ${batchNumber} tamamlandı (${response.data.length} embedding).`);
        
        // Her batch sonrası kısa bekleme
        if (i + batchSize < texts.length) {
          console.log(`1 saniye bekleniyor...`);
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
      } catch (error) {
        console.error(`Batch ${batchNumber} embedding hatası: ${error.message}`);
        // Hata durumunda batch kadar boş array ekle
        for (let j = 0; j < batch.length; j++) {
          embeddings.push([]);
        }
      }
    }
    
    console.log(`${embeddings.length} embedding oluşturuldu.`);
    return embeddings.filter(emb => emb.length > 0); // Boş embedding'leri filtrele
  } catch (error) {
    console.error("Embeddings oluşturulurken hata oluştu:", error);
    return [];
  }
}

/**
 * Query için embedding oluşturur
 * @param {string} query - Sorgu metni.
 * @returns {number[]} Query'nin embedding vektörü.
 */
async function getQueryEmbedding(query) {
  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: [query],
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error("Query embedding oluşturulurken hata oluştu:", error);
    return [];
  }
}

/**
 * İki vektör arasındaki kosinüs benzerliğini hesaplar.
 * @param {number[]} vecA - Birinci vektör.
 * @param {number[]} vecB - İkinci vektör.
 * @returns {number} Kosinüs benzerliği değeri.
 */
function calculateCosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) {
    return 0;
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    magnitudeA += vecA[i] * vecA[i];
    magnitudeB += vecB[i] * vecB[i];
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Query ile en benzer doküman parçalarını bulur.
 * @param {string} query - Kullanıcının sorgusu.
 * @param {number} topK - Döndürülecek en benzer sonuç sayısı.
 * @returns {Array} En benzer doküman parçaları ve benzerlik skorları.
 */
async function findSimilarDocuments(query, topK = 3) {
  if (documentChunks.length === 0 || documentEmbeddings.length === 0) {
    console.warn("Doküman veritabanı boş.");
    return [];
  }

  const queryEmbedding = await getQueryEmbedding(query);
  if (queryEmbedding.length === 0) {
    console.warn("Query embedding oluşturulamadı.");
    return [];
  }

  const similarities = documentEmbeddings.map((docEmbedding, index) => ({
    index,
    text: documentChunks[index],
    similarity: calculateCosineSimilarity(queryEmbedding, docEmbedding),
  }));

  console.log(similarities);

  // Benzerlik skoruna göre sırala ve en iyi topK sonucu döndür
  return similarities
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK)
    .filter(item => item.similarity > 0.05); // Minimum threshold (düşürüldü)
}

// --- API Endpoint'leri ---

/**
 * Dosya yükleme endpoint'i
 */
app.post("/upload", upload.single("document"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Lütfen bir dosya yükleyin." });
    }

    const filePath = req.file.path;
    console.log(`Dosya yüklendi: ${filePath}`);

    const chunks = await readFileAndChunk(filePath);
    if (chunks.length === 0) {
      return res.status(400).json({ message: "Dosyadan metin çıkarılamadı." });
    }

    console.log("Embeddings oluşturuluyor...");
    const embeddings = await getEmbeddings(chunks);
    
    if (embeddings.length === 0) {
      return res.status(500).json({ message: "Embedding oluşturulamadı." });
    }

    // Bellek içi veritabanını güncelle
    documentChunks.splice(0, documentChunks.length, ...chunks);
    documentEmbeddings.splice(0, documentEmbeddings.length, ...embeddings);

    // Yüklenen dosyayı temizle
    fs.unlinkSync(filePath);

    res.status(200).json({
      message: "Dosya başarıyla yüklendi ve indekslendi.",
      chunksCount: chunks.length,
      embeddingsCount: embeddings.length,
    });
  } catch (error) {
    console.error("Dosya yükleme hatası:", error);
    res.status(500).json({
      message: "Dosya yüklenirken bir hata oluştu.",
      error: error.message,
    });
  }
});

/**
 * Chatbot soru-cevap endpoint'i
 */
app.post("/query", async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({ message: "Lütfen bir soru sorun." });
    }

    console.log(`Sorgu alındı: ${query}`);

    // Benzer dokümanları bul
    const similarDocs = await findSimilarDocuments(query, 3);
    
    if (similarDocs.length === 0) {
      return res.status(200).json({ 
        response: "Üzgünüm, bu konu hakkında belgelerimde yeterli bilgi bulunamadı." 
      });
    }

    // Bağlam oluştur
    const contextStr = similarDocs
      .map((doc, i) => `[${i + 1}] ${doc.text} (Benzerlik: ${doc.similarity.toFixed(3)})`)
      .join("\n\n");

    console.log(`${similarDocs.length} benzer doküman bulundu.`);

    // OpenAI ile yanıt oluştur
    const messages = [
      {
        role: "system",
        content: `Sen yardımcı bir kütüphane asistanısın. Görevin, SADECE BAĞLAM'daki bilgilere dayanarak yanıt vermektir.

KURALLAR:
- BAĞLAM dışında bilgi ekleme, tahmin yürütme veya genelleme yapma.
- Eğer BAĞLAM doğrudan yanıt içermiyorsa ama benzer veya ilgili bilgiler varsa, bunları "İlgili bilgi:" başlığı altında kullanıcıya aktar.
- BAĞLAM soruyu yanıtlamak için yeterli değilse şu cümleyi aynen döndür: "Üzgünüm, bu konu hakkında belgemde yeterli bilgi bulunmuyor."
- Yanıtı kullanıcının dilinde ver.
- Kaynakları en sonda madde madde göster.`
      },
      {
        role: "user",
        content: `BAĞLAM:
${contextStr}

KULLANICI SORUSU: ${query}`
      }
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages,
      temperature: 0.7,
      max_tokens: 1000,
    });

    const botResponse = completion.choices[0].message.content;

    res.status(200).json({ response: botResponse });
  } catch (error) {
    console.error("Chatbot sorgusu işlenirken hata oluştu:", error);
    res.status(500).json({
      message: "Sorgunuz işlenirken bir sunucu hatası oluştu.",
      error: error.message,
    });
  }
});

/**
 * Sistem durumu endpoint'i
 */
app.get("/status", (req, res) => {
  res.json({
    status: "aktif",
    documentsCount: documentChunks.length,
    embeddingsCount: documentEmbeddings.length,
    model: "gpt-4o-mini",
    embeddingModel: "text-embedding-3-small",
    supportedFormats: [".txt", ".pdf", ".xlsx", ".xls", ".json", ".md"],
    dataDirectory: "data/"
  });
});

/**
 * Data klasörünü yeniden yükleme endpoint'i
 */
app.post("/reload-data", async (req, res) => {
  try {
    console.log("🔄 Data klasörü yeniden yükleniyor...");
    
    const dataDir = path.join(__dirname, "data");
    const loadResult = await loadAllDataFiles(dataDir);
    
    if (loadResult.totalChunks > 0) {
      console.log("🔄 Embeddings yeniden oluşturuluyor...");
      const embeddings = await getEmbeddings(loadResult.chunks);
      
      if (embeddings.length > 0) {
        documentChunks.splice(0, documentChunks.length, ...loadResult.chunks);
        documentEmbeddings.splice(0, documentEmbeddings.length, ...embeddings);
        
        const uniqueSources = [...new Set(loadResult.sources)];
        
        res.status(200).json({
          message: "Data klasörü başarıyla yeniden yüklendi",
          processedFiles: loadResult.processedFiles,
          totalChunks: loadResult.totalChunks,
          embeddingsCount: embeddings.length,
          files: uniqueSources
        });
        
        console.log(`✅ Data klasörü yeniden yüklendi: ${loadResult.processedFiles} dosya, ${loadResult.totalChunks} chunk`);
      } else {
        res.status(500).json({ message: "Embedding oluşturulamadı" });
      }
    } else {
      res.status(404).json({ message: "Data klasöründe işlenebilir dosya bulunamadı" });
    }
  } catch (error) {
    console.error("❌ Data yeniden yükleme hatası:", error);
    res.status(500).json({
      message: "Data yeniden yüklenirken hata oluştu",
      error: error.message
    });
  }
});

// --- Sunucuyu Başlat ---
app.listen(PORT, async () => {
  console.log(`🚀 OpenAI RAG Backend sunucusu http://localhost:${PORT} adresinde çalışıyor.`);
  console.log(`📊 Model: gpt-4o-mini | Embedding: text-embedding-3-small`);

  // Yükleme klasörünü oluştur
  if (!fs.existsSync("uploads")) {
    fs.mkdirSync("uploads");
  }

  // --- DATA KLASÖRÜNDEKİ TÜM DOSYALARI YÜKLE ---
  const dataDir = path.join(__dirname, "data");
  console.log(`📂 Data klasöründeki tüm dosyalar yükleniyor: ${dataDir}`);

  try {
    const loadResult = await loadAllDataFiles(dataDir);
    
    if (loadResult.totalChunks > 0) {
      console.log("🔄 Tüm dosyalar için embeddings oluşturuluyor...");
      const embeddings = await getEmbeddings(loadResult.chunks);
      
      if (embeddings.length > 0) {
        documentChunks.splice(0, documentChunks.length, ...loadResult.chunks);
        documentEmbeddings.splice(0, documentEmbeddings.length, ...embeddings);
        console.log(`✅ Data klasörü başarıyla indekslendi:`);
        console.log(`   📁 ${loadResult.processedFiles} dosya işlendi`);
        console.log(`   📝 ${loadResult.totalChunks} chunk oluşturuldu`);
        console.log(`   🔮 ${embeddings.length} embedding oluşturuldu`);
        
        // İşlenen dosyaları listele
        const uniqueSources = [...new Set(loadResult.sources)];
        console.log(`   📋 İşlenen dosyalar: ${uniqueSources.join(', ')}`);
      } else {
        console.log("❌ Embedding oluşturulamadı.");
      }
    } else {
      console.log("⚠️ Data klasöründe işlenebilir dosya bulunamadı.");
      
      // Fallback: initial_document.txt dene
      const initialDocumentPath = path.join(__dirname, "initial_document.txt");
      if (fs.existsSync(initialDocumentPath)) {
        console.log(`📄 Fallback: ${initialDocumentPath} yükleniyor...`);
        const chunks = await readFileAndChunk(initialDocumentPath);
        if (chunks.length > 0) {
          const embeddings = await getEmbeddings(chunks);
          if (embeddings.length > 0) {
            documentChunks.splice(0, documentChunks.length, ...chunks);
            documentEmbeddings.splice(0, documentEmbeddings.length, ...embeddings);
            console.log(`✅ Fallback belge yüklendi (${chunks.length} chunk, ${embeddings.length} embedding)`);
          }
        }
      }
    }
  } catch (error) {
    console.error("❌ Data klasörü yüklenirken hata oluştu:", error);
  }
});