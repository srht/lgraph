function createDocumentSearchTool(VectorStore) {
const document_search = tool(
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
        console.log("VECTOR STORE:");
        console.log(VectorStore);
        /*
        const retriever = VectorStore.asRetriever({ k: 10 });
        const docs = await retriever.getRelevantDocuments(userInput);
        */
        const { hybrid, vecRetriever, bm25Retriever } = buildHybridRetriever({kVec: 10, kLex: 10, minScore: 0.2, searchType: "similarity"});
        const docs = await hybrid.getRelevantDocuments(userInput);
        console.log("GETİRİLEN DOCS:");
        console.log(docs);
        if (!docs || docs.length === 0) {
          // Belge bulunamadığında web search tool'unu öner
          return `Üzgünüm, "${userInput}" konusu hakkında belgelerimde yeterli bilgi bulunamadı. 
  
  💡 **Önerim**: Bu konu hakkında bilgi almak için kütüphane web sitesinde arama yapabilirim. 
  
  🔍 **Web sitesinde arama yapmak için**: "library_web_search" tool'unu kullanarak "${userInput}" konusunda kütüphane web sitesinde arama yapabilirim.
  
  ❓ **Sorunuzu doğru mu anladım?** "${userInput}" konusunda ne öğrenmek istiyordunuz?`;
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
  
        /*
        const chatModel = new ChatOpenAI({
          model: "gpt-4o", // veya 'gpt-4o', 'gpt-4o-mini-tts' değil!
          temperature: 0,
        })
        */
        
        const chatModel = new ChatGoogleGenerativeAI({
          model: "gemini-2.5-flash",
          temperature: 0,
          apiKey: process.env.GEMINI_API_KEY,
        })
  
        const response = await chatModel.invoke([{ role: "user", content: formattedPrompt }]);
        const answer = response.content || "";
  
        // Log chat if logger is available
        if (logger?.logChat) {
          try {
            logger.logChat({ answer, context: docs });
          } catch (e) {
            console.warn("⚠️ logger.logChat hata:", e?.message);
          }
        }
        
        return answer || "Üzgünüm, bu konu hakkında belgemde yeterli bilgi bulunmuyor.";
        
      } catch (error) {
        console.error("❌ Document search hatası:", error?.message);
  
        // Fallback: just return first few documents
        try {
          /*
          const retriever = VectorStore.asRetriever({ k: 3 });
          const docs = await retriever.getRelevantDocuments(userInput);
         */
  
          const { hybrid, vecRetriever, bm25Retriever } = buildHybridRetriever();
          const docs = await hybrid.getRelevantDocuments(userInput);
  
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

