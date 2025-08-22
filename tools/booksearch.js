import { tool } from "@langchain/core/tools";
import { z } from "zod";

/**
 * Book search tool for library catalog
 * Searches the ITU library catalog for books and returns formatted results
 */
export const createBookSearchTool = () => {
  const name = "get_books";
  const description = `Kütüphane kataloğundaki yayınları bulur. Input should be a keyword string. 'Mesela denemeler kitabı var mı?' sorusu için 'denemeler' kelimesini kullan.
      Cevap verirken tüm kaydı vereceksen Kitabın adı, yazarı, ISBN'i, yayın yılı ve yer numarasını metin olarak verir`;

  const fn = async (args) => {
    // Handle different input formats for compatibility
    const userInput = typeof args === "string" ? args : args?.input || args?.query || "";
    
    console.log(`[TOOL ÇAĞRISI] get_books çağrıldı, sorgu: ${userInput}`);
    
    if (!userInput.trim()) {
      return "Lütfen arama yapmak için bir kelime girin.";
    }

    const rawInput = userInput.toLowerCase("tr-TR");
    const encodedInput = encodeURIComponent(rawInput);
    const url = `https://service.library.itu.edu.tr/web/api/llm/search?keyword=${encodedInput}`;
    
    const headers = {
      "User-Agent": "Mozilla/5.0",
      Accept: "application/json, text/plain, */*",
      Referer: "https://library.itu.edu.tr/",
      Origin: "https://library.itu.edu.tr",
      Host: "service.library.itu.edu.tr",
      "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
      "X-Requested-With": "XMLHttpRequest",
    };

    console.log(`[FETCH İSTEĞİ] ${url} adresine istek gönderiliyor...`);
    console.log(`[FETCH REQUEST HEADERS]`, headers);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log(`[FETCH YANITI] Status: ${response.status}`);
      console.log(`[FETCH YANITI] Data:`, JSON.stringify(data, null, 2));

      if (!Array.isArray(data) || data.length === 0) {
        return "Aradığınız kriterlere uygun kitap bulunamadı.";
      }

      const books = data.map((book) => {
        console.log(`[KİTAP DETAY]`, book);
        
        let row = `${book.bib.Title} - ${book.bib.Author} (${book.bib.PublishYear}) - ISBN: ${book.bib.ISBN} - Katalog Kaydı Adresi: ${book.bib.URL}`;
        
        if (book.bib.MaterialType?.Value?.indexOf("E-book") > -1) {
          row += " (E-kitap)";
        } else if (book.bib.CallNumber) {
          row += ` - Yer Numarası: ${book.bib.CallNumber}`;
        }

        return row;
      });

      console.log(`[FETCH YANITI] Processed books:`, JSON.stringify(books, null, 2));
      return books.join("<br>");

    } catch (error) {
      console.log(`[FETCH HATASI]`, error);
      return `Hata: kitap arama aracında beklenmeyen bir hata oluştu: ${error.message}`;
    }
  };

  // Create LangGraph compatible tool
  const bookSearchTool = tool(fn, {
    name,
    description,
    schema: z.object({
      input: z.string().describe("Arama yapılacak kitap adı, yazar veya anahtar kelime"),
    }),
  });

  return bookSearchTool;
};

// Export the tool creation function
export default createBookSearchTool;
