// documentRetrievalNode.js
import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { PromptTemplate } from "@langchain/core/prompts";

import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { EnsembleRetriever } from "langchain/retrievers/ensemble";
import { BM25Retriever } from "@langchain/community/retrievers/bm25";

import { OpenAIEmbeddings, ChatOpenAI } from "@langchain/openai";
import {
  GoogleGenerativeAIEmbeddings,
  ChatGoogleGenerativeAI,
} from "@langchain/google-genai";
import VectorStorePersistence from "./vectorStorePersistence.js";

// -----------------------------
// Config
// -----------------------------
const DEFAULTS = {
  kVec: 3,
  kLex: 3,
  minScore: 0.1, // similaritySearchWithScore için alt eşik
  searchType: "similarity", // "similarity" | "mmr"
  modelProvider: "gemini", // "gemini" | "openai"
  chatModel: {
    gemini: { model: "gemini-2.5-flash", temperature: 0 },
    openai: { model: "gpt-4o-mini", temperature: 0 },
  },
  embeddingProvider: "gemini", // "gemini" | "openai"
  embeddingModel: {
    gemini: "gemini-embedding-001",          // çok dilli
    openai: "text-embedding-3-small",      // çok dilli
  },
};

// -----------------------------
// State (process içi)
// -----------------------------
let VectorStore = null;   // MemoryVectorStore veya kalıcı bir store
let AllDocs = [];         // BM25 için doküman listesi
let PersistenceStore = null; // Vector store persistence

// -----------------------------
// Helpers
// -----------------------------
function makeEmbeddings({ provider, apiKey }) {
  if (provider === "openai") {
    return new OpenAIEmbeddings({
      apiKey,
      model: DEFAULTS.embeddingModel.openai,
    });
  }
  // default gemini
  return new GoogleGenerativeAIEmbeddings({
    apiKey,
    model: DEFAULTS.embeddingModel.gemini,
  });
}

function makeChatModel({ provider, apiKey }) {
  if (provider === "openai") {
    const cfg = DEFAULTS.chatModel.openai;
    return new ChatOpenAI({
      apiKey,
      model: cfg.model,
      temperature: cfg.temperature,
    });
  }
  // default gemini
  const cfg = DEFAULTS.chatModel.gemini;
  return new ChatGoogleGenerativeAI({
    apiKey:process.env.GEMINI_API_KEY,
    model: cfg.model,
    temperature: cfg.temperature,
  });
}

export async function createVectorStoreFromDocs({
  docs,                         // Document[] (pageContent, metadata)
  embeddingProvider = DEFAULTS.embeddingProvider,
  embeddingApiKey,
}) {
  const embeddings = makeEmbeddings({
    provider: embeddingProvider,
    apiKey: embeddingApiKey,
  });

  VectorStore = await MemoryVectorStore.fromDocuments(docs, embeddings);
  AllDocs = docs;

  console.log("✅ VectorStore hazır. docs_count:", docs.length);
  console.log(
    "embeddings_class:",
    VectorStore?.embeddings?.constructor?.name
  );

  return { VectorStore };
}

// -----------------------------
// Vector Store Persistence
// -----------------------------

/**
 * Persistence store'dan vector store'u yükle
 */
export async function loadVectorStoreFromCache({
  embeddingProvider = DEFAULTS.embeddingProvider,
  embeddingApiKey,
  cacheDir = null,
} = {}) {
  try {
    console.log("📂 Cache'den vector store yükleniyor...");
    
    if (!PersistenceStore) {
      PersistenceStore = new VectorStorePersistence(cacheDir);
    }
    
    const result = await PersistenceStore.loadVectorStore(embeddingProvider, embeddingApiKey);
    
    if (result) {
      VectorStore = result.vectorStore;
      console.log(`✅ Cache'den vector store yüklendi: ${result.metadata.totalDocuments} doküman`);
      
      // AllDocs'u da güncelle
      const retriever = VectorStore.asRetriever({ k: 1000 });
      AllDocs = await retriever.getRelevantDocuments("");
      
      return { VectorStore, metadata: result.metadata };
    } else {
      console.log("ℹ️ Cache bulunamadı veya geçersiz");
      return null;
    }
  } catch (error) {
    console.error("❌ Cache'den vector store yükleme hatası:", error);
    return null;
  }
}

/**
 * Vector store'u cache'e kaydet
 */
export async function saveVectorStoreToCache({
  vectorStore = VectorStore,
  sourceFiles = [],
  cacheDir = null,
} = {}) {
  try {
    console.log("💾 Vector store cache'e kaydediliyor...");
    
    if (!vectorStore) {
      console.warn("⚠️ Kaydedilecek vector store bulunamadı");
      return false;
    }
    
    if (!PersistenceStore) {
      PersistenceStore = new VectorStorePersistence(cacheDir);
    }
    
    const success = await PersistenceStore.saveVectorStore(vectorStore, sourceFiles);
    
    if (success) {
      console.log("✅ Vector store cache'e kaydedildi");
    } else {
      console.log("❌ Vector store cache'e kaydetme başarısız");
    }
    
    return success;
  } catch (error) {
    console.error("❌ Vector store cache'e kaydetme hatası:", error);
    return false;
  }
}

/**
 * Cache geçerliliğini kontrol et
 */
export function isCacheValid(sourceFiles = []) {
  try {
    if (!PersistenceStore) {
      PersistenceStore = new VectorStorePersistence();
    }
    
    return PersistenceStore.isCacheValid(sourceFiles);
  } catch (error) {
    console.error("❌ Cache validation hatası:", error);
    return false;
  }
}

/**
 * Cache bilgilerini al
 */
export function getCacheInfo() {
  try {
    if (!PersistenceStore) {
      PersistenceStore = new VectorStorePersistence();
    }
    
    return PersistenceStore.getCacheInfo();
  } catch (error) {
    console.error("❌ Cache bilgi alma hatası:", error);
    return { exists: false, error: error.message };
  }
}

/**
 * Cache'i temizle
 */
export function clearCache() {
  try {
    if (!PersistenceStore) {
      PersistenceStore = new VectorStorePersistence();
    }
    
    const success = PersistenceStore.clearCache();
    
    if (success) {
      VectorStore = null;
      AllDocs = [];
    }
    
    return success;
  } catch (error) {
    console.error("❌ Cache temizleme hatası:", error);
    return false;
  }
}

async function buildHybridRetriever({
  kVec = DEFAULTS.kVec,
  kLex = DEFAULTS.kLex,
  searchType = DEFAULTS.searchType,
}) {
  if (!VectorStore) {
    throw new Error("VectorStore tanımlı değil. Önce indeksleme yapın.");
  }
  if (!AllDocs?.length) {
    console.warn("BM25 için AllDocs boş görünüyor.");
    const retriever = VectorStore.asRetriever({ k: 1000 });
    AllDocs = await retriever.getRelevantDocuments("");
    console.log("AllDocs:", AllDocs);
  }

  const vecRetriever = VectorStore.asRetriever({ k: kVec, searchType });
  const bm25Retriever = new BM25Retriever({
    docs: AllDocs || [],
  });
  bm25Retriever.k = kLex;

  const hybrid = new EnsembleRetriever({
    retrievers: [vecRetriever, bm25Retriever],
    weights: [0.6, 0.4], // ihtiyaca göre oynat
  });
  return { hybrid, vecRetriever, bm25Retriever };
}

function buildAnswerPrompt() {
  return PromptTemplate.fromTemplate(
`Sen yardımcı bir kütüphane asistanısın. Görevin, SADECE BAĞLAM'daki bilgilere dayanarak yanıt vermektir.

KURALLAR:
- BAĞLAM dışında bilgi ekleme, tahmin yürütme veya genelleme yapma.
- Eğer BAĞLAM doğrudan yanıt içermiyorsa ama benzer veya ilgili bilgiler varsa, bunları "İlgili bilgi:" başlığı altında kullanıcıya aktar.
- BAĞLAM soruyu yanıtlamak için yeterli değilse şu cümleyi aynen döndür:
  "Üzgünüm, bu konu hakkında belgemde yeterli bilgi bulunmuyor."
- Yanıtı kullanıcının dilinde ver.
- BAĞLAM'da telefon numarası veya web sitesi varsa, bunları HTML <a> etiketiyle ver.
- Kaynakları en sonda madde madde göster (dosya adı + sayfa vb. varsa).

BAĞLAM:
{context}

SORU: {input}

YANIT:
`
  );
}

// -----------------------------
// TOOL: document_search (Hybrid)
// -----------------------------
export function buildDocumentSearchTool({
  modelProvider = DEFAULTS.modelProvider,
  modelApiKey,
  minScore = DEFAULTS.minScore,
  kVec = DEFAULTS.kVec,
  kLex = DEFAULTS.kLex,
  searchType = DEFAULTS.searchType,
  logger = null,
  vectorStore = null,
  useCache = true,
  cacheDir = null,
  sourceFiles = [],
} = {}) {
  const chatModel = makeChatModel({ provider: modelProvider, apiKey: modelApiKey });
  const prompt = buildAnswerPrompt();

  // Vector store'u ayarla
  if (vectorStore) {
    VectorStore = vectorStore;
  } else if (useCache) {
    // Cache'den yüklemeyi dene
    console.log("🔄 docsRetriever: Cache'den vector store yükleniyor...");
    loadVectorStoreFromCache({
      embeddingProvider: modelProvider,
      embeddingApiKey: modelApiKey,
      cacheDir: cacheDir
    }).then(result => {
      if (!result && sourceFiles.length > 0) {
        console.log("ℹ️ Cache bulunamadı, manuel yükleme gerekli");
      }
    }).catch(error => {
      console.warn("⚠️ Cache yükleme hatası:", error.message);
    });
  }

  return tool(
    async (args) => {
      const userInput =
        (typeof args === "string" ? args : undefined) ??
        args?.input ??
        args?.query ??
        "";

      console.log("🔍 DOCUMENT SEARCH (hybrid) çağrıldı:", userInput);

      if (!userInput.trim()) {
        return "Lütfen arama yapmak için bir kelime girin.";
      }
      
      // Vector store yoksa cache'den yüklemeyi dene
      if (!VectorStore && useCache) {
        console.log("🔄 Vector store yok, cache'den yükleniyor...");
        const result = await loadVectorStoreFromCache({
          embeddingProvider: modelProvider,
          embeddingApiKey: modelApiKey,
          cacheDir: cacheDir
        });
        
        if (!result) {
          return "Vektör deposu bulunamadı. Lütfen önce belgeleri işleyin veya cache'i kontrol edin.";
        }
      }
      
      if (!VectorStore) {
        return "Vektör deposu boş. Lütfen önce bir belge yükleyin.";
      }

      try {

        // 1) HYBRID
        const { hybrid } = await buildHybridRetriever({ kVec, kLex, searchType });
        let docs = await hybrid.getRelevantDocuments(userInput);
        console.log("hybrid docs:", docs);
        // 2) Eğer hybrid boş kalırsa → BM25 deneyelim
        if (!docs || docs.length === 0) {
          console.warn("Hybrid boş döndü. BM25 retriever deneniyor…");
          const { bm25Retriever } = await buildHybridRetriever({ kVec, kLex, searchType });
          docs = await bm25Retriever.getRelevantDocuments(userInput);
        }

        const withScores = await VectorStore.similaritySearchWithScore(userInput, Math.max(kVec, 10));
          console.log(
            "similarity scores:",
            withScores.map(([d, s], i) => ({
              i,
              score: s,
              src: d.metadata?.source,
              page: d.metadata?.page,
            }))
          );
          let withScoresDocs = withScores
            .filter(([_, score]) => (typeof score === "number" ? score >= minScore : true))
            .map(([doc]) => doc);
          docs.push(...withScoresDocs);

        // 3) Hâlâ boşsa → vektör skorlarına bak
        /*
        if (!docs || docs.length === 0) {
          console.warn("BM25 de boş. similaritySearchWithScore deneniyor…");
          
        }

        */

        // 4) Yine boşsa → kullanıcıya net mesaj
        if (!docs || docs.length === 0) {
          return `Üzgünüm, "${userInput}" hakkında belgelerimde yeterli bilgi bulunamadı.`;
        }

        console.log("tüm docs:", docs);
        
        // Logger kullanarak retrieval sonuçlarını logla
        if (logger?.logRetrieval) {
          logger.logRetrieval(userInput, docs, {
            hybridUsed: true,
            vectorK: kVec,
            lexicalK: kLex,
            minScore: minScore
          });
        }
        
        // 5) Promptu oluştur
        const context = docs.map((d) => d.pageContent || "").join("\n\n");
        const formatted = await prompt.format({ context, input: userInput });
        console.log("formatted:", formatted);
        const response = await chatModel.invoke([{ role: "user", content: formatted }]);
        console.log("response:", response);
        const answer = (response?.content ?? "").toString();

        // 6) Kaynak listesi
        const uniqueSources = [];
        for (const d of docs) {
          const src = [
            d.metadata?.source,
            (d.metadata?.page !== undefined && d.metadata?.page !== null) ? `p.${d.metadata.page}` : null,
          ]
            .filter(Boolean)
            .join(" - ");
          if (src && !uniqueSources.includes(src)) uniqueSources.push(src);
        }
        const sourcesBlock =
          uniqueSources.length > 0
            ? `\n\n<hr/>\n<b>Kaynaklar:</b>\n<ul>\n${uniqueSources
                .map((s) => `<li>${s}</li>`)
                .join("\n")}\n</ul>`
            : "";

        const finalAnswer = answer + sourcesBlock;

        if (logger?.logChat) {
          try {
            logger.logChat({ answer: finalAnswer, context: docs });
          } catch (e) {
            console.warn("⚠️ logger.logChat hata:", e?.message);
          }
        }

        return finalAnswer || "Üzgünüm, bu konu hakkında belgemde yeterli bilgi bulunmuyor.";
      } catch (err) {
        console.error("❌ document_search (hybrid) hata:", err?.message);
        return `Belge sorgulanırken hata oluştu: ${err?.message}`;
      }
    },
    {
      name: "document_search",
      description:
        "Yüklenen dokümanlarda (hybrid: vektör + BM25) arama yapar ve sorulara sadece BAĞLAM'a dayanarak yanıt verir. Cache'den otomatik vector store yükleme desteği.",
      schema: z.object({ input: z.string() }),
    }
  );
}
