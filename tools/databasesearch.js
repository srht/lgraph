import { tool } from "@langchain/core/tools";
import { z } from "zod";

/**
 * Library database search tool
 * Searches for subscribed databases in the ITU library by subject or title
 */
export const createDatabaseSearchTool = () => {
  const name = "get_library_databases";
  const description = `Kütüphanenin abone olduğu veritabanlarını bulur konu başlıklarına göre filtreler. Input should be a keyword string. 'Mesela mühendislik veritabanları var mı?' sorusu için 'mühendislik' kelimesini kullanır. Sonuç olarak bulunan veritabanlarını döndürür.`;

  const fn = async (args) => {
    // Handle different input formats for compatibility
    const userInput = typeof args === "string" ? args : args?.input || args?.query || "";
    
    console.log(`[TOOL ÇAĞRISI] get_library_databases çağrıldı, sorgu: ${userInput}`);
    
    if (!userInput.trim()) {
      return "Lütfen arama yapmak için bir kelime girin.";
    }

    try {
      const tolowerInput = userInput.toLowerCase("tr-TR");
      const encodedInput = encodeURIComponent(userInput);
      
      // Fetch subjects/filters
      const subjectsResponse = await fetch(
        "https://service.library.itu.edu.tr/web/api/Veritabanlari/Filtreler?turid=1"
      );
      
      if (!subjectsResponse.ok) {
        throw new Error(`Subjects API error: ${subjectsResponse.status}`);
      }
      
      const subjectsData = await subjectsResponse.json();
      console.log(`[SUBJECT BULUNDU] ${subjectsData.length} filtre bulundu:`, subjectsData);

      console.log(`[FİLTRE ARANIYOR] ${tolowerInput} filtresi aranıyor...`);
      const foundFilters = subjectsData.filter(
        (i) => i.Adi.toLowerCase("tr-TR").indexOf(tolowerInput) > -1
      );
      console.log(`[FİLTRE BULUNDU] ${foundFilters.length} filtre bulundu:`, foundFilters);

      // Fetch databases by filter
      const filterIdStrings = foundFilters.map((i) => i.Id).join(",");
      const databasesResponse = await fetch(
        `https://service.library.itu.edu.tr/web/api/Veritabanlari/FilterByMultiple?filters=,${filterIdStrings}&page=1`
      );
      
      // Fetch databases by title
      const databasesWithTitleResponse = await fetch(
        `https://service.library.itu.edu.tr/web/api/Veritabanlari/TitleFiltrele?s=${encodedInput}&page=1`
      );

      // Fetch databases by search
      const databasesSearchResponse = await fetch(
        `https://service.library.itu.edu.tr/web/api/Veritabanlari/Ara?s=${encodedInput}&page=1`
      );
      
      console.log('adres:', `https://service.library.itu.edu.tr/web/api/Veritabanlari/TitleFiltrele?s=${encodedInput}&page=1`);
      
      // Parse all responses
      const databasesData = await databasesResponse.json();
      const databasesWithTitleData = await databasesWithTitleResponse.json();
      const databasesSearchData = await databasesSearchResponse.json();
      
      console.log('databasesWithTitleData', databasesWithTitleData.Liste);
      
      let databases = [];
      
      // Process databases by filter
      const databasesWithFilter = (databasesData.Liste || []).map((db) => ({
        name: db.Adi,
        link: `https://kutuphane.itu.edu.tr/arastirma/veritabanlari#${db.Id}`
      }));

      // Process databases by title
      const databasesWithTitle = (databasesWithTitleData.Liste || []).map((db) => ({
        name: db.Adi,
        link: `https://kutuphane.itu.edu.tr/arastirma/veritabanlari#${db.Id}`
      }));

      // Process databases by search
      const databasesWithSearch = (databasesSearchData.Liste || []).map((db) => ({
        name: db.Adi,
        link: `https://kutuphane.itu.edu.tr/arastirma/veritabanlari#${db.Id}`
      }));

      // Combine all results and remove duplicates
      databases = [...databasesWithFilter, ...databasesWithTitle, ...databasesWithSearch];
      
      // Remove duplicates based on name
      const uniqueDatabases = databases.filter((db, index, self) => 
        index === self.findIndex(d => d.name === db.name)
      );

      if (uniqueDatabases.length === 0) {
        return "Aradığınız kriterlere uygun veritabanı bulunamadı.";
      }

      return JSON.stringify(uniqueDatabases);
      
    } catch (error) {
      console.error("Error in database search:", error);
      return `Hata: veritabanı arama aracında beklenmeyen bir hata oluştu: ${error.message}`;
    }
  };

  // Create LangGraph compatible tool
  const databaseSearchTool = tool(fn, {
    name,
    description,
    schema: z.object({
      input: z.string().describe("Arama yapılacak konu, alan veya veritabanı adı"),
    }),
  });

  return databaseSearchTool;
};

// Export the tool creation function
export default createDatabaseSearchTool;
