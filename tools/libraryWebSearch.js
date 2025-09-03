import { tool } from "@langchain/core/tools";
import { z } from "zod";
import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Library Web Search Tool
 * Searches the library website using sitemap when document search doesn't find results
 */
export const createLibraryWebSearchTool = () => {
  return tool(
    async (args) => {
      const { searchQuery } = args;
      
      if (!searchQuery || typeof searchQuery !== 'string') {
        return "Lütfen geçerli bir arama sorgusu girin.";
      }

      console.log(`🌐 Kütüphane web sitesinde arama: ${searchQuery}`);
      
      try {
        // Read the sitemap file
        const sitemapPath = path.join(__dirname, "../public/lib_sitemap.xml");
        
        if (!fs.existsSync(sitemapPath)) {
          return "Sitemap dosyası bulunamadı.";
        }

        const sitemapContent = fs.readFileSync(sitemapPath, 'utf-8');
        
        // Parse sitemap and find relevant URLs
        const relevantUrls = findRelevantUrls(sitemapContent, searchQuery);
        
        if (relevantUrls.length === 0) {
          return `"${searchQuery}" konusu için kütüphane web sitesinde uygun sayfa bulunamadı.`;
        }

        console.log(`🔍 ${relevantUrls.length} uygun sayfa bulundu`);

        // Get URL data with descriptions from sitemap
        const urlData = getUrlDataFromSitemap(sitemapContent, relevantUrls);
        
        // Visit the most relevant pages and extract information
        const pageResults = [];
        const maxPagesToVisit = 3; // Limit to prevent too many requests
        
        for (let i = 0; i < Math.min(relevantUrls.length, maxPagesToVisit); i++) {
          const url = relevantUrls[i];
          const urlInfo = urlData.find(data => data.url === url);
          
          try {
            console.log(`📄 Sayfa ziyaret ediliyor: ${url}`);
            const pageInfo = await extractPageInformation(url, urlInfo?.description);
            if (pageInfo) {
              pageResults.push(pageInfo);
            }
          } catch (error) {
            console.warn(`⚠️ Sayfa ziyaret edilemedi: ${url}`, error.message);
            
            // If page visit fails, use sitemap description as fallback
            if (urlInfo?.description) {
              const urlPath = new URL(url).pathname;
              const fallbackTitle = urlPath.split('/').pop()?.replace(/-/g, ' ') || 'Kütüphane Sayfası';
              
              pageResults.push({
                url,
                title: fallbackTitle,
                description: urlInfo.description,
                keyInfo: [`Sitemap açıklaması: ${urlInfo.description}`],
                isFromSitemap: true
              });
            }
          }
        }

        if (pageResults.length === 0) {
          return `"${searchQuery}" konusu için sayfa bilgileri alınamadı.`;
        }

        // Format the results
        let resultText = `🌐 **"${searchQuery}" konusu için kütüphane web sitesinde bulunan bilgiler:**\n\n`;
        
        pageResults.forEach((page, index) => {
          resultText += `${index + 1}. **${page.title}**\n`;
          resultText += `   🔗 [${page.url}](${page.url})\n`;
          if (page.description) {
            resultText += `   📝 ${page.description}\n`;
          }
          if (page.isFromSitemap) {
            resultText += `   ℹ️ *Sayfa erişilemedi, sitemap bilgisi gösteriliyor*\n`;
          }
          if (page.keyInfo && page.keyInfo.length > 0) {
            resultText += `   💡 **Önemli Bilgiler:**\n`;
            page.keyInfo.slice(0, 5).forEach(info => { // Limit to 5 key info items
              resultText += `      • ${info}\n`;
            });
          }
          resultText += '\n';
        });

        resultText += `💡 **Toplam ${pageResults.length} sayfa ziyaret edildi.**\n`;
        resultText += `🔍 Daha fazla bilgi için yukarıdaki linkleri ziyaret edebilirsiniz.`;

        return resultText;

      } catch (error) {
        console.error("❌ Library web search hatası:", error.message);
        return `Kütüphane web sitesinde arama yapılırken hata oluştu: ${error.message}`;
      }
    },
    {
      name: "library_web_search",
      description: "Kütüphane web sitesinde sitemap kullanarak sayfa arama yapar. URL'lerde ve sayfa açıklamalarında arama yapar. Dokümanlarda sonuç bulunamadığında kullanılır.",
      schema: z.object({ 
        searchQuery: z.string().describe("Aranacak konu veya anahtar kelime")
      }),
    }
  );
};

/**
 * Find relevant URLs from sitemap based on search query
 */
function findRelevantUrls(sitemapContent, searchQuery) {
  const urls = [];
  const normalizedQuery = searchQuery.toLowerCase().trim();
  const queryWords = normalizedQuery.split(/\s+/).filter(word => word.length > 2);
  
  // Extract URL entries with descriptions from sitemap using regex
  const urlEntryRegex = /<url>\s*<loc>(.*?)<\/loc>\s*<lastmod>.*?<\/lastmod>\s*(?:<description>(.*?)<\/description>\s*)?<priority>.*?<\/priority>\s*<\/url>/gs;
  
  let match;
  while ((match = urlEntryRegex.exec(sitemapContent)) !== null) {
    const url = match[1].trim();
    const description = match[2] ? match[2].trim() : '';
    
    const urlPath = new URL(url).pathname;
    const urlText = urlPath.replace(/[\/\-_]/g, ' ').toLowerCase();
    const descriptionText = description.toLowerCase();
    
    // Calculate relevance score
    let score = 0;
    let matchSource = [];
    
    // Check URL path matches
    if (urlText.includes(normalizedQuery)) {
      score += 100;
      matchSource.push('URL tam eşleşme');
    }
    
    // Check description matches (higher priority than URL path word matches)
    if (description && descriptionText.includes(normalizedQuery)) {
      score += 120;
      matchSource.push('Açıklama tam eşleşme');
    }
    
    // Check for word matches in URL
    queryWords.forEach(word => {
      if (urlText.includes(word)) {
        score += 45;
        matchSource.push(`URL: "${word}"`);
      }
    });
    
    // Check for word matches in description (higher weight)
    if (description) {
      queryWords.forEach(word => {
        if (descriptionText.includes(word)) {
          score += 55;
          matchSource.push(`Açıklama: "${word}"`);
        }
      });
    }
    
    // Priority adjustments
    if (urlPath.includes('/en/')) {
      score -= 10; // English pages get lower priority
    }
    
    // Priority boost for main sections
    if (urlPath.includes('/hizmetler/') || urlPath.includes('/arastirma/') || urlPath.includes('/hakkimizda/')) {
      score += 10;
    }
    
    // Priority boost for FAQ and contact pages
    if (urlPath.includes('/sss') || urlPath.includes('/iletisim')) {
      score += 15;
    }
    
    // Priority boost for highly relevant descriptions
    if (description) {
      if (descriptionText.includes('hizmet') || descriptionText.includes('bilgi') || descriptionText.includes('nasıl')) {
        score += 8;
      }
    }
    
    if (score > 0) {
      urls.push({ 
        url, 
        score, 
        path: urlPath, 
        description,
        matchSource: matchSource.join(', ')
      });
    }
  }
  
  // Sort by relevance score (highest first)
  urls.sort((a, b) => b.score - a.score);
  
  // Log matching results for debugging
  console.log(`🎯 En iyi ${Math.min(5, urls.length)} eşleşme:`);
  urls.slice(0, 5).forEach((item, index) => {
    console.log(`   ${index + 1}. (${item.score} puan) ${item.path}`);
    console.log(`      Eşleşme: ${item.matchSource}`);
    if (item.description) {
      console.log(`      Açıklama: ${item.description.substring(0, 80)}...`);
    }
  });
  
  // Return top relevant URLs
  return urls.slice(0, 10).map(item => item.url);
}

/**
 * Get URL data with descriptions from sitemap
 */
function getUrlDataFromSitemap(sitemapContent, urls) {
  const urlData = [];
  const urlEntryRegex = /<url>\s*<loc>(.*?)<\/loc>\s*<lastmod>.*?<\/lastmod>\s*(?:<description>(.*?)<\/description>\s*)?<priority>.*?<\/priority>\s*<\/url>/gs;
  
  let match;
  while ((match = urlEntryRegex.exec(sitemapContent)) !== null) {
    const url = match[1].trim();
    const description = match[2] ? match[2].trim() : '';
    
    if (urls.includes(url)) {
      urlData.push({ url, description });
    }
  }
  
  return urlData;
}

/**
 * Extract information from a web page
 */
async function extractPageInformation(url, sitemapDescription = null) {
  try {
    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    const $ = cheerio.load(response.data);
    
    // Extract page title
    const title = $('title').text().trim() || $('h1').first().text().trim() || 'Başlık bulunamadı';
    
    // Extract meta description, prefer sitemap description if available
    const metaDescription = $('meta[name="description"]').attr('content') || 
                           $('meta[property="og:description"]').attr('content') || '';
    
    const description = sitemapDescription || metaDescription;
    
    // Extract key information from page content
    const keyInfo = [];
    
    // Add sitemap description as key info if available
    if (sitemapDescription && sitemapDescription !== metaDescription) {
      keyInfo.push(`📋 Sayfa açıklaması: ${sitemapDescription}`);
    }
    
    // Look for important content in headings
    $('h1, h2, h3, h4').each((i, element) => {
      const headingText = $(element).text().trim();
      if (headingText && headingText.length > 10 && headingText.length < 200) {
        keyInfo.push(headingText);
      }
    });
    
    // Look for content in paragraphs
    $('p').each((i, element) => {
      const paragraphText = $(element).text().trim();
      if (paragraphText && paragraphText.length > 20 && paragraphText.length < 300) {
        // Avoid duplicate content
        if (!keyInfo.some(info => info.includes(paragraphText.substring(0, 50)))) {
          keyInfo.push(paragraphText);
        }
      }
    });
    
    // Look for content in lists
    $('ul li, ol li').each((i, element) => {
      const listText = $(element).text().trim();
      if (listText && listText.length > 10 && listText.length < 200) {
        if (!keyInfo.some(info => info.includes(listText.substring(0, 30)))) {
          keyInfo.push(listText);
        }
      }
    });
    
    // Limit key info to prevent overwhelming response
    const limitedKeyInfo = keyInfo.slice(0, 8);
    
    return {
      url,
      title,
      description,
      keyInfo: limitedKeyInfo
    };
    
  } catch (error) {
    console.warn(`⚠️ Sayfa bilgileri alınamadı: ${url}`, error.message);
    return null;
  }
}

export default createLibraryWebSearchTool;
