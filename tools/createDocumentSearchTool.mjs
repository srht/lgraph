// createDocumentSearchTool.mjs
import { tool } from "@langchain/core/tools";
import { PromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";

/**
 * Document search tool for library documents
 * Searches uploaded documents for specific information
 * 
 * @param {Object} documentProcessor - Document processor with getVectorStore() method
 * @param {Object} chatModel - Chat model (must be used with .bindTools)
 * @param {Object} chatLogger - Optional chat logger with logChat method
 * @returns {Object} LangGraph compatible tool
 */
export function createDocumentSearchTool(
  documentProcessor,
  chatModel,
  chatLogger
) {
  const name = "get_information_from_documents";
  const description ="Kütüphane hakkında bilgileri yüklenen dokümanlardan arama yapar ve sorulara cevap verir."

  // Tool function: supports different input formats for compatibility
  const fn =  tool(
    async (args) => 
    {
      // Handle different input formats for compatibility: { input } or { query } or direct string
      const userInput =
        (typeof args === "string" ? args : undefined) ??
        args?.input ??
        args?.query ??
        "";
  
      console.log("🔍 DOCUMENT SEARCH TOOL ÇAĞRILDI");
      console.log(`[TOOL ÇAĞRISI] Sorgu: ${userInput}`);
  
      if (!userInput.trim()) {
        return "Lütfen arama yapmak için bir kelime girin.";
      }
  
      if (!VectorStore) {
        return "Vektör deposu boş. Lütfen önce bir belge yükleyin.";
      }
  
      try {
        // Simple approach: use retriever directly
        const retriever = vectorStore.asRetriever({ k: 5 });
        const docs = await retriever.getRelevantDocuments(userInput);
  
        if (!docs || docs.length === 0) {
          return "Üzgünüm, bu konu hakkında belgemde yeterli bilgi bulunmuyor.";
        }
  
        // Combine all relevant documents
        const context = docs.map((doc) => doc.pageContent || "").join("\n\n");
        
        // Create a simple prompt for the chat model
        const prompt = PromptTemplate.fromTemplate(
          `Sen yardımcı bir kütüphane asistanısın. Görevin, SADECE BAĞLAM'da (context) verilen bilgilere dayanarak yanıt vermektir.
  
  KURALLAR:
  - BAĞLAM dışında bilgi ekleme, tahmin yürütme veya genelleme yapma.
  - BAĞLAM soruyu yanıtlamak için yeterli değilse şu cümleyi aynen döndür: 
    "Üzgünüm, bu konu hakkında belgemde yeterli bilgi bulunmuyor."
  - Yanıtı kullanıcının dilinde ver.
  - BAĞLAM'da telefon numarası veya web sitesi varsa, bunları HTML <a> etiketiyle ver:
    Örn. Tel: <a href="tel:0000">0000</a>  |  Web: <a href="https://site">site</a>
  - BAĞLAM'da görsel dosya bilgisi (ör. resim URL'si) varsa, <img src="..."/> etiketiyle ekleyebilirsin.
  
  BAĞLAM:
  {context}
  
  SORU: {input}
  
  YANIT:`
        );
  
        // Use the chat model to generate a response
        const formattedPrompt = await prompt.format({
          context: context,
          input: userInput
        });
  
        const response = await chatModel.invoke([{ role: "user", content: formattedPrompt }]);
        const answer = response.content || "";
  
        // Log chat if logger is available
        if (chatLogger?.logChat) {
          try {
            chatLogger.logChat({ answer, context: docs });
          } catch (e) {
            console.warn("⚠️ chatLogger.logChat hata:", e?.message);
          }
        }
        
        return answer || "Üzgünüm, bu konu hakkında belgemde yeterli bilgi bulunmuyor.";
        
      } catch (error) {
        console.error("❌ Document search hatası:", error?.message);
  
        // Fallback: just return first few documents
        try {
          const retriever = VectorStore.asRetriever({ k: 3 });
          const docs = await retriever.getRelevantDocuments(userInput);
  
          if (docs && docs.length > 0) {
            const context = docs.map((d) => d.pageContent || "").join("\n\n");
            const snippet = context.slice(0, 800);
            return `📚 Bulunan belgelerden alıntı:\n\n${snippet}...`;
          }
          return "İlgili belge bulunamadı.";
        } catch (fallbackError) {
          console.error("❌ Fallback hatası:", fallbackError?.message);
          return `Belge sorgulanırken hata oluştu: ${error?.message}`;
        }
      }
    },
    {
      name: "document_search",
      description: "Kütüphane hakkında bilgileri yüklenen dokümanlardan arama yapar ve sorulara cevap verir.",
      schema: z.object({ input: z.string() }),
    }
  );

  // Create LangGraph compatible tool
  const getInformationFromDocumentsTool = tool(fn, {
    name,
    description,
    schema: z.object({
      input: z.string().describe("Kullanıcının doğal dilde sorusu"),
    }),
  });

  return getInformationFromDocumentsTool;
}

// Export the tool creation function
export default createDocumentSearchTool;
