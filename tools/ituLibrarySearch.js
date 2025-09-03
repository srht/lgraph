import { tool } from "@langchain/core/tools";
import { z } from "zod";
import axios from "axios";
import * as cheerio from "cheerio";

const createITULibrarySearchTool = () => {
  return tool(
    async (args) => {
      const { searchType, searchQuery } = args;
      
      if (!searchQuery || typeof searchQuery !== 'string') {
        return "Lütfen geçerli bir arama sorgusu girin.";
      }

      if (!searchType || !['author', 'title', 'isbn', 'subject'].includes(searchType)) {
        return "Lütfen geçerli bir arama türü belirtin: 'author', 'title', 'isbn', veya 'subject'";
      }

      console.log(`🔍 ITU Kütüphanesi'nde ${searchType} arama: ${searchQuery}`);
      
      try {
        // Base URL for ITU Library search
        const baseUrl = "https://divit.library.itu.edu.tr";
        
        let searchUrl;
        
        // Construct search URL based on search type
        switch (searchType) {
          case 'author':
            // Author search: searchtype=a
            searchUrl = `${baseUrl}/search*tur/?searchtype=a&searcharg=${encodeURIComponent(searchQuery)}&sortdropdown=-&SORT=D&extended=0&SUBMIT=Ara&searchlimits=&searchorigarg=a${encodeURIComponent(searchQuery)}`;
            break;
          case 'title':
            // Title search: searchtype=t
            searchUrl = `${baseUrl}/search*tur/?searchtype=t&searcharg=${encodeURIComponent(searchQuery)}&sortdropdown=-&SORT=D&extended=0&SUBMIT=Ara&searchlimits=&searchorigarg=t${encodeURIComponent(searchQuery)}`;
            break;
          case 'isbn':
            // ISBN search: searchtype=i
            searchUrl = `${baseUrl}/search*tur/?searchtype=i&searcharg=${encodeURIComponent(searchQuery)}&SORT=D&extended=0&SUBMIT=Ara&searchlimits=&searchorigarg=i${encodeURIComponent(searchQuery)}`;
            break;
          case 'subject':
            // Subject search: searchtype=d (konu arama)
            searchUrl = `${baseUrl}/search*tur/?searchtype=d&searcharg=${encodeURIComponent(searchQuery)}&sortdropdown=-&SORT=D&extended=0&SUBMIT=Ara&searchlimits=&searchorigarg=d${encodeURIComponent(searchQuery)}`;
            break;
          default:
            return "Geçersiz arama türü. Lütfen 'author', 'title', 'isbn', veya 'subject' kullanın.";
        }
        
        console.log(`🔗 Arama URL'i: ${searchUrl}`);
        
        const searchResponse = await axios.get(searchUrl, {
          timeout: 30000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        });

        const $ = cheerio.load(searchResponse.data);
        
        let finalResults = [];
        
        if (searchType === 'author') {
          // Handle author search with existing logic
          const {authorResults, authorPageUrl} = await handleAuthorSearch($, searchQuery, baseUrl);
          finalResults = authorResults;
          searchUrl = authorPageUrl;
        } else if (searchType === 'title') {
          // Handle title search
          finalResults = handleTitleSearch($, searchQuery);
        } else if (searchType === 'isbn') {
          // Handle ISBN search
          finalResults = handleISBNSearch($, searchQuery);
        } else if (searchType === 'subject') {
          // Handle subject search
          finalResults = handleSubjectSearch($, searchQuery);
        }

        if (finalResults.length === 0) {
          return `"${searchQuery}" için ITU Kütüphanesi'nde ${searchType === 'author' ? 'yazar' : searchType === 'title' ? 'kitap' : searchType === 'isbn' ? 'ISBN' : searchType === 'subject' ? 'konu başlığı' : 'sonuç'} bulunamadı. Lütfen arama kriterlerini kontrol edin.`;
        }

        // Format the results based on search type
        let resultText = `📚 **${searchType === 'author' ? 'Yazar' : searchType === 'title' ? 'Kitap Başlığı' : searchType === 'isbn' ? 'ISBN' : searchType === 'subject' ? 'Konu Başlıkları' : 'Sonuçlar'}**: "${searchQuery}" için ITU Kütüphanesi'nde bulunan sonuçlar:\n\n`;
        
        if (searchType === 'isbn') {
          // ISBN search usually returns single result with detailed info
          const book = finalResults[0];
          resultText += `📖 **${book.title}**\n` +
            `   ✍️ ${book.author}\n` +
            `   📅 ${book.year || 'Yıl belirtilmemiş'}\n` +
            `   📍 ${book.location || 'Konum belirtilmemiş'}\n` +
            `   🔢 ISBN: ${book.isbn || searchQuery}\n` +
            `   🔗 [Kütüphane Kaydı](${baseUrl}${book.link})\n`;
        } else if (searchType === 'subject') {
          // Subject search returns topic/subject links, not books
          resultText += finalResults.map((subject, index) => 
            `${index + 1}. **${subject.title}**\n` +
            `   🔗 [Konu Detayı](${baseUrl}${subject.link})\n` +
            `   📂 Tür: ${subject.type === 'subject' ? 'Ana Konu' : 'Genel Kategori'}\n`
          ).join('\n');
          
          // Add subject-specific information
          resultText += `\n💡 **Konu Arama Bilgisi**: "${searchQuery}" ile ilgili ${finalResults.length} konu başlığı bulundu.\n`;
          resultText += `\n📖 **Not**: Bu sonuçlar konu başlıklarıdır. Her bir konuya tıklayarak o konudaki kitapları görebilirsiniz.\n`;
        } else {
          // Multiple results for author/title search
          resultText += finalResults.map((book, index) => 
            `${index + 1}. **${book.title}**\n` +
            `   ✍️ ${book.author}\n` +
            `   📅 ${book.year || 'Yıl belirtilmemiş'}\n` +
            `   📍 ${book.location || 'Konum belirtilmemiş'}\n` +
            `   🔗 [Kütüphane Kaydı](${baseUrl}${book.link})\n`
          ).join('\n');
        }
        resultText += `🔍 **Ana Arama URL**: [Sonuç Listesi](${searchUrl})\n`;
        resultText += `\n💡 **Toplam ${finalResults.length} sonuç bulundu.**`;

        return resultText;

      } catch (error) {
        console.error(`❌ ITU Kütüphanesi ${searchType} arama hatası:`, error.message);
        
        if (error.code === 'ECONNABORTED') {
          return "Arama zaman aşımına uğradı. Lütfen daha sonra tekrar deneyin.";
        }
        
        if (error.response?.status === 404) {
          return `"${searchQuery}" için sonuç bulunamadı.`;
        }
        
        return `ITU Kütüphanesi'nde ${searchType === 'subject' ? 'konu' : searchType} araması yapılırken hata oluştu: ${error.message}`;
      }
    },
    {
      name: "itu_library_search",
      description: "ITU Kütüphanesi katalog sisteminde yazar ismi, kitap başlığı, ISBN numarası veya konu ile arama yapar. Dört farklı arama türünü destekler: 'author', 'title', 'isbn', 'subject'.",
      schema: z.object({ 
        searchType: z.enum(['author', 'title', 'isbn', 'subject']).describe("Arama türü: 'author' (yazar), 'title' (kitap başlığı), 'isbn' (ISBN numarası), veya 'subject' (konu)"),
        searchQuery: z.string().describe("Aranacak yazar ismi, kitap başlığı, ISBN numarası veya konu")
      }),
    }
  );
};

// Handle author search with existing logic
async function handleAuthorSearch($, authorName, baseUrl) {
        // Check if we have author suggestions
        const authorSuggestions = [];
        const normalizedAuthorName = authorName.toLowerCase().trim();
        const authorParts = normalizedAuthorName.split(' ').filter(part => part.length > 0);
        let authorResultsPageUrl = '';
        $('a[href*="/search*tur/a?"]').each((i, element) => {
          const href = $(element).attr('href');
          const text = $(element).text().trim();
          console.log(text, href);
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
          authorResultsPageUrl = baseUrl + bestMatch.href;
          console.log(`🔗 Yazar sayfası: ${authorResultsPageUrl}`);
          
          const authorPageResponse = await axios.get(authorResultsPageUrl, {
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

  return {authorResults: finalResults, authorPageUrl:authorResultsPageUrl};
}

// Handle title search
function handleTitleSearch($, titleQuery) {
  const books = [];
  const normalizedTitleQuery = titleQuery.toLowerCase().trim();
  
  // Look for book entries in the search results
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
      
      // Check if this row contains a book with matching title
      if (title && title.toLowerCase().includes(normalizedTitleQuery)) {
        // Try to find the link to the book record
        let link = '';
        titleCell.find('a').each((j, linkElement) => {
          const href = $(linkElement).attr('href');
          if (href && href.includes('/search*tur')&&!href.includes('patron')) {
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
  });
  console.log(books);
  return books;
}

// Handle ISBN search
function handleISBNSearch($, isbnQuery) {
  const books = [];
  const normalizedISBNQuery = isbnQuery.replace(/[-\s]/g, '').toLowerCase();
  
  // For ISBN search, we usually get a single detailed result
  // Look for the book details in the MARC display
  $('tr').each((i, element) => {
    const $row = $(element);
    const $cells = $row.find('td');
    
    if ($cells.length >= 2) {
      const firstCell = $cells.eq(0).text().trim();
      const secondCell = $cells.eq(1).text().trim();
      
      // Check if this row contains ISBN information
      if (firstCell.toLowerCase().includes('isbn') || 
          secondCell.toLowerCase().includes('isbn') ||
          firstCell.toLowerCase().includes(normalizedISBNQuery) ||
          secondCell.toLowerCase().includes(normalizedISBNQuery)) {
        
        // Extract book information from surrounding context
        let title = '';
        let author = '';
        let year = '';
        let location = '';
        let link = '';
        let isbn = '';
        
        // Look for title and author in nearby cells or text
        $row.find('*').each((j, elem) => {
          const text = $(elem).text().trim();
          if (text) {
            if (text.toLowerCase().includes('title') && !title) {
              title = text.replace(/title/i, '').trim();
            } else if (text.toLowerCase().includes('author') && !author) {
              author = text.replace(/author/i, '').trim();
            } else if (text.toLowerCase().includes('isbn') && !isbn) {
              isbn = text.replace(/isbn/i, '').trim();
            }
          }
        });
        
        // If we found ISBN info, try to get more context
        if (isbn || firstCell.toLowerCase().includes('isbn') || secondCell.toLowerCase().includes('isbn')) {
          // Look for the actual book title and author in the page
          $('body').find('*').each((k, elem) => {
            const text = $(elem).text().trim();
            if (text && text.length > 10 && text.length < 200) {
              if (!title && text.includes('Title') && text.length < 100) {
                title = text.replace(/title/i, '').trim();
              } else if (!author && text.includes('Author') && text.length < 100) {
                author = text.replace(/author/i, '').trim();
              }
            }
          });
          
          // If we still don't have title/author, use the search query as title
          if (!title) title = `ISBN: ${isbnQuery}`;
          if (!author) author = 'Bilinmiyor';
          
          books.push({
            title: title,
            author: author,
            year: year,
            location: location,
            link: link,
            isbn: isbn || isbnQuery
          });
          
          // ISBN search usually returns one result, so break after finding it
          return false;
        }
      }
    }
  });
  
  // If no structured results found, try to extract from general text
  if (books.length === 0) {
    $('body').find('*').each((i, element) => {
      const text = $(element).text().trim();
      if (text && text.includes(normalizedISBNQuery) && text.length > 20) {
        books.push({
          title: `ISBN: ${isbnQuery}`,
          author: 'Bilinmiyor',
          year: 'Bilinmiyor',
          location: 'Bilinmiyor',
          link: '',
          isbn: isbnQuery
        });
        return false;
      }
    });
  }
  
  return books;
}

// Helper function to extract books from HTML (existing logic)
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

// Handle subject search (konu arama) - returns subject/topic links
function handleSubjectSearch($, subjectQuery) {
  const subjects = [];
  const normalizedSubjectQuery = subjectQuery.toLowerCase().trim();
  
  console.log(`🔍 Konu arama sonuçları işleniyor: ${subjectQuery}`);
  
  // Look for subject links in the page
  // ITU Library subject search returns a list of related topics/subjects with links
  
  // Look for links that contain subject information
  $('a').each((i, element) => {
    const $link = $(element);
    const href = $link.attr('href');
    const text = $link.text().trim();
    
    if (href && text && text.length > 3) {
      // Check if this is a subject/topic link
      if (href.includes('/search*tur') && 
          (href.includes('searchtype=d') || href.includes('searchtype=X'))) {
        
        // Check if the text is related to our search query
        const normalizedText = text.toLowerCase();
        if (normalizedText.includes(normalizedSubjectQuery) || 
            normalizedSubjectQuery.split(' ').some(word => 
              word.length > 2 && normalizedText.includes(word))) {
          
          subjects.push({
            title: text,
            link: href,
            type: 'subject'
          });
        }
      }
      // Also look for general subject links
      else if (href.includes('/search*tur') && text.length > 5 && text.length < 200) {
        const normalizedText = text.toLowerCase();
        
        // Check for broader subject matches
        if (normalizedText.includes(normalizedSubjectQuery) || 
            normalizedSubjectQuery.split(' ').some(word => 
              word.length > 2 && normalizedText.includes(word))) {
          
          subjects.push({
            title: text,
            link: href,
            type: 'general'
          });
        }
      }
    }
  });
  
  // Remove duplicates based on title
  const uniqueSubjects = [];
  const seenTitles = new Set();
  
  subjects.forEach(subject => {
    if (!seenTitles.has(subject.title.toLowerCase())) {
      seenTitles.add(subject.title.toLowerCase());
      uniqueSubjects.push(subject);
    }
  });
  
  // Sort by relevance - exact matches first, then partial matches
  uniqueSubjects.sort((a, b) => {
    const aTitle = a.title.toLowerCase();
    const bTitle = b.title.toLowerCase();
    
    // Exact match gets highest priority
    if (aTitle === normalizedSubjectQuery) return -1;
    if (bTitle === normalizedSubjectQuery) return 1;
    
    // Contains full query gets higher priority
    if (aTitle.includes(normalizedSubjectQuery) && !bTitle.includes(normalizedSubjectQuery)) return -1;
    if (bTitle.includes(normalizedSubjectQuery) && !aTitle.includes(normalizedSubjectQuery)) return 1;
    
    // Shorter titles get higher priority (more specific)
    return aTitle.length - bTitle.length;
  });
  
  // Limit to most relevant 15 results
  const limitedSubjects = uniqueSubjects.slice(0, 15);
  console.log(limitedSubjects);
  console.log(`📚 Konu aramada ${limitedSubjects.length} konu başlığı bulundu`);
  return limitedSubjects;
}

export { createITULibrarySearchTool };
