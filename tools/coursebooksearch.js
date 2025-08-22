import { tool } from "@langchain/core/tools";
import { z } from "zod";

/**
 * Course book search tool for library catalog
 * Searches for course materials and textbooks in the ITU library
 */
export const createCourseBookSearchTool = () => {
  const name = "get_course_books";
  const description = "Kütüphane kataloğundaki ders kitaplarını bulur. Input should be a keyword string. Mesela 'GID 411E ders materyalleri var mı?' sorusu için 'GID 411E' kelimesini kullan.";

  const fn = async (args) => {
    // Handle different input formats for compatibility
    const userInput = typeof args === "string" ? args : args?.input || args?.query || "";
    
    try {
      console.log(`[TOOL ÇAĞRISI] get_course_books çağrıldı, sorgu: ${userInput}`);
      
      if (!userInput.trim()) {
        return "Lütfen ders kodu veya ders adı girin.";
      }

      // TODO: Implement getPublications function or replace with actual course book search logic
      // For now, return a placeholder response
      return `Ders materyali arama özelliği geliştiriliyor. Aradığınız: "${userInput}" için lütfen kütüphane kataloğunu kullanın.`;
      
      // Uncomment when getPublications is available:
      // const books = await getPublications(userInput);
      // return books;
      
    } catch (error) {
      console.log(`[FETCH HATASI]`, error);
      return `Hata: ders kitabı arama aracında beklenmeyen bir hata oluştu: ${error.message}`;
    }
  };

  // Create LangGraph compatible tool
  const courseBookSearchTool = tool(fn, {
    name,
    description,
    schema: z.object({
      input: z.string().describe("Ders kodu, ders adı veya anahtar kelime"),
    }),
  });

  return courseBookSearchTool;
};

// Export the tool creation function
export default createCourseBookSearchTool;
