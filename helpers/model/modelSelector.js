// modelSelector.js
// Chat model seçimi ve yapılandırması
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai"; // Ya da OpenAIEmbeddings
import { OpenAIEmbeddings, ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatAlibabaTongyi } from "@langchain/community/chat_models/alibaba_tongyi";
import { HuggingFaceInferenceEmbeddings } from "@langchain/community/embeddings/hf";
import apiKeyRotation from '../api/apiKeyRotation.js';
/**
 * Seçilen modele göre chat model instance'ı oluşturur
 * @returns {ChatGoogleGenerativeAI | ChatOpenAI | ChatAlibabaTongyi} Chat model instance'ı
 */
async function createChatModel(chatModelName) {
  let chatModel,embeddingModel;

  switch (chatModelName) {
    case "gemini":
      // API key rotasyonu kullan
      const geminiKeyInfo = await apiKeyRotation.getNextKey('gemini');
      
      chatModel = new ChatGoogleGenerativeAI({
        apiKey: geminiKeyInfo.key,
        model: "gemini-2.5-flash",
        temperature: 0.7,
      });
      embeddingModel= new GoogleGenerativeAIEmbeddings({
        apiKey: geminiKeyInfo.key,
        modelName: "gemini-embedding-001" // [[memory:7589622]]
      });
      console.log(`🤖 Gemini model aktif edildi (Key ${geminiKeyInfo.keyIndex}/${geminiKeyInfo.totalKeys} - ${geminiKeyInfo.requestCount}/${geminiKeyInfo.maxRequests})`);
      break;
      
    case "openai":
      // API key rotasyonu kullan
      const openaiKeyInfo = await apiKeyRotation.getNextKey('openai');
      
      chatModel = new ChatOpenAI({
        openAIApiKey: openaiKeyInfo.key,
        modelName: "gpt-4o-mini",
        temperature: 0,
      });
      embeddingModel= new OpenAIEmbeddings({
        openAIApiKey: openaiKeyInfo.key,
        modelName: "text-embedding-3-small" // [[memory:7589622]]
      });
      console.log(`🤖 OpenAI model aktif edildi (Key ${openaiKeyInfo.keyIndex}/${openaiKeyInfo.totalKeys} - ${openaiKeyInfo.requestCount}/${openaiKeyInfo.maxRequests})`);
      break;
      
    case "alibaba":
      // Alibaba için Gemini embedding kullanıyoruz, o yüzden Gemini key'i al
      const alibabaGeminiKeyInfo = await apiKeyRotation.getNextKey('gemini');
      
      chatModel = new ChatAlibabaTongyi({
        model: "qwen-plus",
        temperature: 0.7,
        alibabaApiKey: process.env.QWEN_API_KEY,
      });
      embeddingModel= new GoogleGenerativeAIEmbeddings({
        apiKey: alibabaGeminiKeyInfo.key,
        modelName: "gemini-embedding-001" // [[memory:7589622]]
      });
      console.log(`🤖 Alibaba Tongyi model aktif edildi (Embedding: Gemini Key ${alibabaGeminiKeyInfo.keyIndex}/${alibabaGeminiKeyInfo.totalKeys})`);
      break;
      
    case "qwen":
      // Qwen için Alibaba Tongyi chat model ve Gemini embedding kullanıyoruz
      const qwenGeminiKeyInfo = await apiKeyRotation.getNextKey('gemini');
      
      chatModel = new ChatAlibabaTongyi({
        model: "qwen-plus",
        temperature: 0.7,
        alibabaApiKey: process.env.QWEN_API_KEY,
      });
      embeddingModel = new GoogleGenerativeAIEmbeddings({
        apiKey: qwenGeminiKeyInfo.key,
        modelName: "gemini-embedding-001" // [[memory:7589622]]
      });
      console.log(`🤖 Qwen model aktif edildi (Chat: Qwen-Plus, Embedding: Gemini Key ${qwenGeminiKeyInfo.keyIndex}/${qwenGeminiKeyInfo.totalKeys})`);
      break;
      
    default:
      console.log("⚠️ Geçersiz model seçimi, Gemini varsayılan olarak kullanılıyor");
      // API key rotasyonu kullan
      const defaultGeminiKeyInfo = await apiKeyRotation.getNextKey('gemini');
      
      chatModel = new ChatGoogleGenerativeAI({
        apiKey: defaultGeminiKeyInfo.key,
        model: "gemini-2.5-flash",
        temperature: 0.7,
      });
      embeddingModel= new GoogleGenerativeAIEmbeddings({
        apiKey: defaultGeminiKeyInfo.key,
        modelName: "gemini-embedding-001" // [[memory:7589622]]
      });
      console.log(`🤖 Varsayılan Gemini model aktif edildi (Key ${defaultGeminiKeyInfo.keyIndex}/${defaultGeminiKeyInfo.totalKeys} - ${defaultGeminiKeyInfo.requestCount}/${defaultGeminiKeyInfo.maxRequests})`);
      break;
  }

  return {chatModel,embeddingModel};
}


/**
 * API key rotasyon istatistiklerini gösterir
 * @param {string} provider - Provider adı ('gemini' veya 'openai')
 */
async function showApiKeyStats(provider = 'gemini') {
  try {
    const stats = await apiKeyRotation.getStats(provider);
    if (!stats) {
      console.log(`❌ ${provider} provider bulunamadı`);
      return;
    }

    console.log(`\n📊 === ${stats.provider.toUpperCase()} API Key İstatistikleri ===`);
    console.log(`🔑 Aktif Key: ${stats.currentKeyIndex}/${stats.totalKeys}`);
    console.log(`📈 Aktif Key Sayısı: ${stats.activeKeys}/${stats.totalKeys}`);
    console.log(`🎯 Key Başına Maksimum İstek: ${stats.maxRequestsPerKey}`);
    console.log(`🕐 Son Sıfırlama: ${stats.lastResetTime}`);
    console.log(`⏰ Sonraki Sıfırlama: ${stats.nextResetTime}`);
    
    console.log(`\n🔍 Key Detayları:`);
    stats.keys.forEach(key => {
      const status = key.isActive ? (key.isLimitReached ? '🔴 LİMİT' : '🟢 AKTİF') : '⚫ PASİF';
      console.log(`  ${key.index}. ${key.keyPreview} - ${key.requestCount}/${stats.maxRequestsPerKey} ${status}`);
    });
    
    return stats;
  } catch (error) {
    console.error(`❌ Stats alınırken hata:`, error.message);
  }
}

export default createChatModel;
export { showApiKeyStats, apiKeyRotation };
