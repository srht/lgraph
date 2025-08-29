import { tool } from "@langchain/core/tools";
import { z } from "zod";
import axios from "axios";
import * as cheerio from "cheerio";

/**
 * Journal Subscription Search Tool
 * Searches EBSCO database for journal subscriptions
 */
export const createJournalSubscriptionSearchTool = () => {
  return tool(
    async (args) => {
      const { journalName } = args;
      
      if (!journalName || typeof journalName !== 'string') {
        return "Lütfen aranacak dergi adını girin.";
      }

      console.log(`📚 Dergi aboneliği sorgulanıyor: ${journalName}`);
      
      try {
        // EBSCO URL'sini oluştur
        const searchQuery = encodeURIComponent(journalName);
        const ebscoUrl = `https://publications.ebsco.com/?custId=s1115014&search=${searchQuery}&searchField=titlename&searchtype=contains&subjectFacetSchemaFilter=library%20of%20congress`;
        
        console.log(`🔍 EBSCO URL: ${ebscoUrl}`);
        
        // EBSCO sayfasını ziyaret et
        const response = await axios.get(ebscoUrl, {
          timeout: 20000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Referer': 'https://publications.ebsco.com/'
          }
        });

        const $ = cheerio.load(response.data);
        
        // Sayfa başlığını al
        const pageTitle = $('title').text().trim() || 'EBSCO Publications';
        
        // Arama sonuçlarını analiz et
        const searchResults = [];
        let hasAccess = false;
        let totalResults = 0;
        
        // Arama sonuçlarını bul
        $('.result-item, .result, .publication-item').each((index, element) => {
          const title = $(element).find('.title, h3, .publication-title').text().trim();
          const publisher = $(element).find('.publisher, .publisher-name').text().trim();
          const description = $(element).find('.description, .abstract, .summary').text().trim();
          const accessInfo = $(element).find('.access, .availability, .status').text().trim();
          
          if (title && title.toLowerCase().includes(journalName.toLowerCase())) {
            searchResults.push({
              title: title,
              publisher: publisher || 'Bilinmiyor',
              description: description || 'Açıklama bulunamadı',
              accessInfo: accessInfo || 'Erişim bilgisi bulunamadı',
              hasAccess: accessInfo.toLowerCase().includes('full text') || 
                        accessInfo.toLowerCase().includes('available') ||
                        accessInfo.toLowerCase().includes('accessible')
            });
            
            if (searchResults[searchResults.length - 1].hasAccess) {
              hasAccess = true;
            }
          }
        });
        
        // Eğer özel CSS class'lar bulunamazsa, genel arama yap
        if (searchResults.length === 0) {
          // Sayfa içeriğinde dergi adını ara
          const pageContent = $('body').text().toLowerCase();
          const journalNameLower = journalName.toLowerCase();
          
          // Dergi adının farklı varyasyonlarını ara
          const searchVariations = [
            journalNameLower,
            journalNameLower.replace(/journal|dergi|magazine/gi, '').trim(),
            journalNameLower.replace(/the\s+/gi, '').trim(),
            journalNameLower.replace(/\s+/g, ' ').trim()
          ];
          
          for (const variation of searchVariations) {
            if (pageContent.includes(variation) && variation.length > 2) {
              // Dergi adı sayfada bulundu, genel bilgi ver
              hasAccess = true;
              searchResults.push({
                title: journalName,
                publisher: 'EBSCO',
                description: 'Dergi EBSCO veritabanında bulundu (genel arama ile)',
                accessInfo: 'Erişim mevcut olabilir',
                hasAccess: true
              });
              break;
            }
          }
        }
        
        // Sonuçları formatla
        let resultText = `📚 **"${journalName}" Dergisi Abonelik Sorgusu**\n\n`;
        resultText += `🔍 **Arama URL**: [EBSCO Publications](${ebscoUrl})\n\n`;
        
        if (searchResults.length > 0) {
          resultText += `✅ **Sonuç Bulundu!**\n\n`;
          
          searchResults.forEach((result, index) => {
            resultText += `${index + 1}. **${result.title}**\n`;
            resultText += `   📝 Yayıncı: ${result.publisher}\n`;
            if (result.description && result.description !== 'Açıklama bulunamadı') {
              resultText += `   📋 Açıklama: ${result.description.substring(0, 150)}${result.description.length > 150 ? '...' : ''}\n`;
            }
            resultText += `   🔓 Erişim: ${result.hasAccess ? '✅ Mevcut' : '❌ Sınırlı'}\n`;
            resultText += `   📊 Durum: ${result.accessInfo}\n\n`;
          });
          
          if (hasAccess) {
            resultText += `🎉 **Sonuç**: "${journalName}" dergisine kütüphanenizde erişim bulunmaktadır!\n`;
            resultText += `💡 EBSCO veritabanı üzerinden tam metin erişimi mevcut olabilir.\n`;
            resultText += `🔗 **Erişim Linki**: [EBSCO'da Aç](${ebscoUrl})\n`;
          } else {
            resultText += `⚠️ **Sonuç**: "${journalName}" dergisi bulundu ancak erişim sınırlı olabilir.\n`;
            resultText += `💡 Kütüphane personeli ile iletişime geçerek detaylı bilgi alabilirsiniz.\n`;
          }
          
        } else {
          resultText += `❌ **Sonuç Bulunamadı**\n\n`;
          resultText += `"${journalName}" dergisi EBSCO veritabanında bulunamadı.\n\n`;
          resultText += `💡 **Öneriler**:\n`;
          resultText += `• Dergi adını kontrol edin (yazım hatası olabilir)\n`;
          resultText += `• Alternatif dergi adları deneyin (örnek: "Nature" yerine "Nature Journal")\n`;
          resultText += `• Kısaltmaları deneyin (örnek: "IEEE Trans." yerine "IEEE Transactions")\n`;
          resultText += `• Kütüphane personeli ile iletişime geçin\n`;
          resultText += `• Diğer veritabanlarında arama yapın\n`;
        }
        
        resultText += `\n🔗 **EBSCO Arama Linki**: [${ebscoUrl}](${ebscoUrl})`;
        resultText += `\n\n💡 **Not**: Bu sonuçlar EBSCO veritabanından alınmıştır. Detaylı bilgi için kütüphane personeli ile iletişime geçebilirsiniz.`;
        
        return resultText;
        
      } catch (error) {
        console.error("❌ Journal subscription search hatası:", error.message);
        
        if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
          return `⏰ **Bağlantı Zaman Aşımı**: EBSCO veritabanına bağlanırken zaman aşımı oluştu.\n\n💡 **Öneriler**:\n• İnternet bağlantınızı kontrol edin\n• Daha sonra tekrar deneyin\n• Kütüphane personeli ile iletişime geçin\n\n🔍 **Arama URL**: [EBSCO Publications](https://publications.ebsco.com/?custId=s1115014&search=${encodeURIComponent(journalName)}&searchField=titlename&searchtype=contains&subjectFacetSchemaFilter=library%20of%20congress)`;
        }
        
        return `❌ **Arama Hatası**: "${journalName}" dergisi için arama yapılırken hata oluştu.\n\n🔍 **Hata Detayı**: ${error.message}\n\n💡 **Öneriler**:\n• Dergi adını kontrol edin\n• Kütüphane personeli ile iletişime geçin\n• Manuel olarak EBSCO sitesini ziyaret edin\n\n🔗 **EBSCO Ana Sayfa**: [https://publications.ebsco.com/](https://publications.ebsco.com/)`;
      }
    },
    {
      name: "journal_subscription_search",
      description: "EBSCO veritabanında dergi aboneliği sorgular. '[dergi ismi] dergisine aboneliğiniz var mı?' gibi sorulara cevap verir. Belirli bir dergiye kütüphanenin aboneliği olup olmadığını kontrol eder ve erişim durumunu bildirir.",
      schema: z.object({ 
        journalName: z.string().describe("Aranacak dergi adı (örnek: 'Nature', 'Science', 'IEEE Transactions')")
      }),
    }
  );
};

export default createJournalSubscriptionSearchTool;
