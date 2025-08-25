import { tool } from "@langchain/core/tools";
import { z } from "zod";
import axios from "axios";
import * as cheerio from "cheerio";

const createITULibrarySearchTool = () => {
  return tool(
    async (args) => {
      const { authorName } = args;
      
      if (!authorName || typeof authorName !== 'string') {
        return "Lütfen geçerli bir yazar ismi girin.";
      }

      console.log(`🔍 ITU Kütüphanesi'nde yazar arama: ${authorName}`);
      
      try {
        // Base URL for ITU Library search
        const baseUrl = "https://divit.library.itu.edu.tr";
        
        // First, search for the author
        const searchUrl = `${baseUrl}/search*tur/a?${encodeURIComponent(authorName)}`;
        console.log(`🔗 Arama URL'i: ${searchUrl}`);
        
        const searchResponse = await axios.get(searchUrl, {
          timeout: 30000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        });

        const $ = cheerio.load(searchResponse.data);
        
        // Check if we have author suggestions
        const authorSuggestions = [];
        const normalizedAuthorName = authorName.toLowerCase().trim();
        const authorParts = normalizedAuthorName.split(' ').filter(part => part.length > 0);
        
        $('a[href*="/search*tur/a?"]').each((i, element) => {
          const href = $(element).attr('href');
          const text = $(element).text().trim();
          
          if (text && href) {
            const normalizedText = text.toLowerCase().trim();
            let isMatch = false;
            
            // Direct match
            if (normalizedText.includes(normalizedAuthorName)) {
              isMatch = true;
            }
            // Check for "Soyad, Ad" format
            else if (authorParts.length >= 2 && normalizedText.includes(',')) {
              // Check if both first and last parts are present
              if (normalizedText.includes(authorParts[0]) && 
                  normalizedText.includes(authorParts[authorParts.length - 1])) {
                isMatch = true;
              }
            }
            // Check if any part of the author name is present
            else if (authorParts.some(part => normalizedText.includes(part))) {
              isMatch = true;
            }
            
            if (isMatch) {
              authorSuggestions.push({ text, href });
            }
          }
        });

        let finalResults = [];
        
        if (authorSuggestions.length > 0) {
          console.log(`📚 ${authorSuggestions.length} yazar önerisi bulundu`);
          
          // Sort suggestions by relevance
          authorSuggestions.sort((a, b) => {
            const aText = a.text.toLowerCase();
            const bText = b.text.toLowerCase();
            
            // Exact match gets highest priority
            if (aText === normalizedAuthorName) return -1;
            if (bText === normalizedAuthorName) return 1;
            
            // Contains full name gets higher priority
            if (aText.includes(normalizedAuthorName) && !bText.includes(normalizedAuthorName)) return -1;
            if (bText.includes(normalizedAuthorName) && !aText.includes(normalizedAuthorName)) return 1;
            
            // Contains more parts gets higher priority
            const aParts = authorParts.filter(part => aText.includes(part)).length;
            const bParts = authorParts.filter(part => bText.includes(part)).length;
            if (aParts !== bParts) return bParts - aParts;
            
            // Shorter text gets higher priority (more specific)
            return aText.length - bText.length;
          });
          
          // Use the best match
          const bestMatch = authorSuggestions[0];
          console.log(`🎯 En uygun eşleşme: ${bestMatch.text}`);
          
          // Visit the author's page to get books
          const authorPageUrl = baseUrl + bestMatch.href;
          console.log(`🔗 Yazar sayfası: ${authorPageUrl}`);
          
          const authorPageResponse = await axios.get(authorPageUrl, {
            timeout: 30000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
          });
          
          const authorPage$ = cheerio.load(authorPageResponse.data);
          finalResults = extractBooksFromPage(authorPage$, authorName);
          
        } else {
          // No author suggestions, try to extract books directly from search page
          console.log("📚 Yazar önerisi bulunamadı, doğrudan arama sonuçlarından kitap çıkarılıyor");
          finalResults = extractBooksFromPage($, authorName);
        }

        if (finalResults.length === 0) {
          return `"${authorName}" yazarı için ITU Kütüphanesi'nde kitap bulunamadı. Lütfen yazar ismini kontrol edin veya farklı bir yazar deneyin.`;
        }

        // Format the results
        const resultText = `📚 **${authorName}** yazarı için ITU Kütüphanesi'nde bulunan kitaplar:\n\n` +
          finalResults.map((book, index) => 
            `${index + 1}. **${book.title}**\n` +
            `   📖 ${book.author}\n` +
            `   📅 ${book.year || 'Yıl belirtilmemiş'}\n` +
            `   📍 ${book.location || 'Konum belirtilmemiş'}\n` +
            `   🔗 [Kütüphane Kaydı](${baseUrl}${book.link})\n`
          ).join('\n') +
          `\n💡 **Toplam ${finalResults.length} kitap bulundu.**`;

        return resultText;

      } catch (error) {
        console.error("❌ ITU Kütüphanesi arama hatası:", error.message);
        
        if (error.code === 'ECONNABORTED') {
          return "Arama zaman aşımına uğradı. Lütfen daha sonra tekrar deneyin.";
        }
        
        if (error.response?.status === 404) {
          return `"${authorName}" yazarı için sonuç bulunamadı.`;
        }
        
        return `ITU Kütüphanesi'nde arama yapılırken hata oluştu: ${error.message}`;
      }
    },
    {
      name: "itu_library_search",
      description: "ITU Kütüphanesi katalog sisteminde yazar ismiyle kitap arama yapar. Yazar önerilerini de kontrol eder ve en uygun sonuçları getirir.",
      schema: z.object({ 
        authorName: z.string().describe("Aranacak yazarın adı (örn: 'İlber Ortaylı', 'Orhan Pamuk')") 
      }),
    }
  );
};

// Helper function to extract books from HTML
function extractBooksFromPage($, authorName) {
  const books = [];
  
  // Normalize author name for better matching
  const normalizedAuthorName = authorName.toLowerCase().trim();
  const authorParts = normalizedAuthorName.split(' ').filter(part => part.length > 0);
  
  // Look for book entries in the search results
  // This pattern might need adjustment based on the actual HTML structure
  $('tr').each((i, element) => {
    const $row = $(element);
    const $cells = $row.find('td');
    
    if ($cells.length >= 3) {
      const titleCell = $cells.eq(1); // Usually title is in second column
      const authorCell = $cells.eq(0); // Usually author is in first column
      const yearCell = $cells.eq(2);   // Usually year is in third column
      
      const title = titleCell.text().trim();
      const author = authorCell.text().trim();
      const year = yearCell.text().trim();
      
      // Check if this row contains a book by the searched author
      // Consider both "Ad Soyad" and "Soyad, Ad" formats
      if (title && author) {
        const normalizedAuthor = author.toLowerCase().trim();
        let isAuthorMatch = false;
        
        // Direct match
        if (normalizedAuthor.includes(normalizedAuthorName)) {
          isAuthorMatch = true;
        }
        // Check if title contains author name
        else if (title.toLowerCase().includes(normalizedAuthorName)) {
          isAuthorMatch = true;
        }
        // Check for "Soyad, Ad" format (e.g., "Ortaylı, İlber")
        else if (authorParts.length >= 2) {
          // Check if author cell contains "Soyad, Ad" format
          if (normalizedAuthor.includes(authorParts[authorParts.length - 1]) && // Last part (Ad)
              normalizedAuthor.includes(authorParts[0])) { // First part (Soyad)
            isAuthorMatch = true;
          }
          // Also check for "Soyad, Ad" with comma
          else if (normalizedAuthor.includes(',') && 
                   authorParts.some(part => normalizedAuthor.includes(part))) {
            isAuthorMatch = true;
          }
        }
        
        if (isAuthorMatch) {
          // Try to find the link to the book record
          let link = '';
          titleCell.find('a').each((j, linkElement) => {
            const href = $(linkElement).attr('href');
            if (href && href.includes('/search*tur')) {
              link = href;
            }
          });
          
          // Extract location information if available
          let location = '';
          if ($cells.length >= 4) {
            location = $cells.eq(3).text().trim();
          }
          
          books.push({
            title: title,
            author: author,
            year: year,
            location: location,
            link: link
          });
        }
      }
    }
  });
  
  // If no books found with the above pattern, try alternative patterns
  if (books.length === 0) {
    // Look for any text that might contain book information
    $('body').find('*').each((i, element) => {
      const text = $(element).text().trim();
      if (text && text.length > 20 && text.length < 500) {
        // Check if this text contains book-like information
        if (text.includes(authorName) && 
            (text.includes('ISBN') || text.includes('Yayın') || text.includes('Kitap'))) {
          books.push({
            title: text.substring(0, 100) + '...',
            author: authorName,
            year: 'Bilinmiyor',
            location: 'Bilinmiyor',
            link: ''
          });
        }
      }
    });
  }
  
  return books;
}

export { createITULibrarySearchTool };
