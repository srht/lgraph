// modelSelector.js
// Chat model seçimi ve yapılandırması
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai"; // Ya da OpenAIEmbeddings
import { OpenAIEmbeddings, ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatAlibabaTongyi } from "@langchain/community/chat_models/alibaba_tongyi";
import { HuggingFaceInferenceEmbeddings } from "@langchain/community/embeddings/hf";
/**
 * Seçilen modele göre chat model instance'ı oluşturur
 * @returns {ChatGoogleGenerativeAI | ChatOpenAI | ChatAlibabaTongyi} Chat model instance'ı
 */
async function createChatModel(chatModelName) {
  let chatModel, embeddingModel;

  switch (chatModelName) {
    case "gemini":
      chatModel = new ChatGoogleGenerativeAI({
        apiKey: process.env.GEMINI_API_KEY,
        model: "gemini-2.5-flash",
        temperature: 0.7,
      });
      embeddingModel = new GoogleGenerativeAIEmbeddings({
        apiKey: process.env.GEMINI_API_KEY,
        modelName: "gemini-embedding-001", // [[memory:7589622]]
      });
      console.log(`🤖 Gemini model aktif edildi`);
      break;

    case "openai":
      chatModel = new ChatOpenAI({
        openAIApiKey: process.env.OPENAI_API_KEY,
        modelName: "gpt-4o-mini",
        temperature: 0,
      });
      embeddingModel = new OpenAIEmbeddings({
        openAIApiKey: process.env.OPENAI_API_KEY,
        modelName: "text-embedding-3-small", // [[memory:7589622]]
      });
      console.log(`🤖 OpenAI model aktif edildi`);
      break;

    case "alibaba":
      chatModel = new ChatAlibabaTongyi({
        model: "qwen-plus",
        temperature: 0.7,
        alibabaApiKey: process.env.QWEN_API_KEY,
      });
      embeddingModel = new GoogleGenerativeAIEmbeddings({
        apiKey: process.env.GEMINI_API_KEY,
        modelName: "gemini-embedding-001", // [[memory:7589622]]
      });
      console.log(`🤖 Alibaba Tongyi model aktif edildi`);
      break;

    case "qwen":
      chatModel = new ChatAlibabaTongyi({
        model: "qwen-plus",
        temperature: 0.7,
        alibabaApiKey: process.env.QWEN_API_KEY,
      });
      embeddingModel = new GoogleGenerativeAIEmbeddings({
        apiKey: process.env.GEMINI_API_KEY,
        modelName: "gemini-embedding-001", // [[memory:7589622]]
      });
      console.log(
        `🤖 Qwen model aktif edildi (Chat: Qwen-Plus, Embedding: Gemini Key `
      );
      break;

    default:
      console.log(
        "⚠️ Geçersiz model seçimi, Gemini varsayılan olarak kullanılıyor"
      );
      chatModel = new ChatGoogleGenerativeAI({
        apiKey: process.env.GEMINI_API_KEY,
        model: "gemini-2.5-flash",
        temperature: 0.7,
      });
      embeddingModel = new GoogleGenerativeAIEmbeddings({
        apiKey: process.env.GEMINI_API_KEY,
        modelName: "gemini-embedding-001", // [[memory:7589622]]
      });
      console.log(`🤖 Varsayılan Gemini model aktif edildi`);
      break;
  }

  return { chatModel, embeddingModel };
}

export default createChatModel;
