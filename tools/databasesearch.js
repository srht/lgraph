import { tool } from "@langchain/core/tools";
import { z } from "zod";

/**
 * Parse input to detect multiple search terms separated by conjunctions
 * @param {string} input - The user input string
 * @returns {string[]} - Array of search terms
 */
const parseMultipleTerms = (input) => {
  // Turkish conjunctions and separators
  const conjunctions = ['ve', 'ile', 'ayrıca', 'hem', ',', '&', 'and', 'or', 'veya'];
  
  // Create a regex pattern to split by conjunctions (case insensitive)
  const conjunctionPattern = new RegExp(`\\s+(${conjunctions.join('|')})\\s+`, 'gi');
  
  // Split the input by conjunctions
  let terms = input.split(conjunctionPattern);
  
  // Filter out the conjunctions themselves and clean up terms
  terms = terms.filter(term => {
    const cleanTerm = term.trim().toLowerCase();
    return cleanTerm && !conjunctions.includes(cleanTerm);
  });
  
  // If no conjunctions found, try splitting by common separators
  if (terms.length <= 1) {
    terms = input.split(/[,&]+/).map(term => term.trim()).filter(term => term);
  }
  
  // If still only one term, return as single element array
  if (terms.length <= 1) {
    return [input.trim()];
  }
  
  return terms;
};

/**
 * Search for databases using a single term
 * @param {string} searchTerm - The search term
 * @returns {Promise<Array>} - Array of database objects
 */
const searchSingleTerm = async (searchTerm) => {
  const tolowerInput = searchTerm.toLowerCase("tr-TR");
  const encodedInput = encodeURIComponent(searchTerm);
  
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

  return uniqueDatabases;
};

/**
 * Library database search tool
 * Searches for subscribed databases in the ITU library by subject or title
 */
export const createDatabaseSearchTool = () => {
  const name = "get_library_databases";
  const description = `Kütüphanenin abone olduğu veritabanlarını bulur konu başlıklarına göre filtreler. 
  Erişim bilgilerini döndürür. Input should be a keyword string. 
  Eğer inputta birden fazla veritabanı ismi bağlaçlarla (ve, ile, ayrıca, virgül vb.) ayrılmış şekilde verilirse, 
  her bir terim için ayrı ayrı arama yapar ve sonuçları birleştirir.
  Örnek: 'mühendislik ve tıp veritabanları' → 'mühendislik' ve 'tıp' için ayrı aramalar yapar.
  Sonuç olarak bulunan tüm veritabanlarını tekrarsız şekilde döndürür.`;

  const fn = async (args) => {
    // Handle different input formats for compatibility
    const userInput = typeof args === "string" ? args : args?.input || args?.query || "";
    
    console.log(`[TOOL ÇAĞRISI] get_library_databases çağrıldı, sorgu: ${userInput}`);
    
    if (!userInput.trim()) {
      return "Lütfen arama yapmak için bir kelime girin.";
    }

    try {
      // Parse input to detect multiple database names separated by conjunctions
      const searchTerms = parseMultipleTerms(userInput);
      console.log(`[ARAMA TERİMLERİ] ${searchTerms.length} terim bulundu:`, searchTerms);
      
      // If multiple terms found, search each separately and combine results
      if (searchTerms.length > 1) {
        const allResults = [];
        
        for (const term of searchTerms) {
          console.log(`[TEK ARAMA] "${term}" için arama yapılıyor...`);
          const termResults = await searchSingleTerm(term.trim());
          allResults.push(...termResults);
        }
        
        // Remove duplicates based on name
        const uniqueDatabases = allResults.filter((db, index, self) => 
          index === self.findIndex(d => d.name === db.name)
        );

        if (uniqueDatabases.length === 0) {
          return "Aradığınız kriterlere uygun veritabanı bulunamadı.";
        }

        console.log(`[SONUÇ] ${uniqueDatabases.length} benzersiz veritabanı bulundu`);
        return JSON.stringify(uniqueDatabases);
      }
      
      // Single term search (existing logic)
      const results = await searchSingleTerm(userInput);
      
      if (results.length === 0) {
        return "Aradığınız kriterlere uygun veritabanı bulunamadı.";
      }

      return JSON.stringify(results);
      
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
      input: z.string().describe("Arama yapılacak konu, alan veya veritabanı adı. Birden fazla terim bağlaçlarla (ve, ile, virgül) ayrılabilir."),
    }),
  });

  return databaseSearchTool;
};

// Export the tool creation function
export default createDatabaseSearchTool;
