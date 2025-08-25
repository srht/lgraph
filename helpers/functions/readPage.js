import axios from "axios";
import * as cheerio from "cheerio";

async function getPageContent(url) {
  try {
    // Make a GET request to the URL
    const response = await axios.get(url);
    console.log(`Response status: ${response.data}`);
    // Select the HTML elements containing the titles
    // The selector 'a[id^="title"]' looks for all 'a' tags where the 'id' attribute starts with "title"
    const $ = cheerio.load(response.data);
    // Extract visible text from the body
    const text = $("body").text();
    // Clean up whitespace
    return text.replace(/\s+/g, " ").trim();
  } catch (error) {
    console.error(`An error occurred: ${error}`);
  }
}

async function getPersonelPage(url) {
  let personelData = [];
  try {
    // Make a GET request to the URL
    const response = await axios.get(url);
    console.log(`Response status: ${response.data}`);
    // Select the HTML elements containing the titles
    // The selector 'a[id^="title"]' looks for all 'a' tags where the 'id' attribute starts with "title"
    const $ = cheerio.load(response.data);
    $(".agent").each((i, element) => {
      // Mevcut div içindeki .content sınıfına sahip div'i bul
      const content = $(element).find(".content");

      // İsimi bul ve temizle
      const name = content.find("h4").text().trim();

      // Dış hat numarasını bulmak için `<strong>Dış Hat:</strong>` etiketini kullan
      // Ardından, bu etiketin hemen yanındaki metin düğümünü al ve temizle
      const disHat = content
        .find('strong:contains("Dış Hat")')
        .parent()
        .text()
        .replace("Dış Hat:", "")
        .trim();

      // Dahili numarasını bulmak için `<strong>Dahili:</strong>` etiketini kullan
      // Ardından, bu etiketin hemen yanındaki metin düğümünü al ve temizle
      const dahili = content
        .find('strong:contains("Dahili")')
        .parent()
        .text()
        .replace("Dahili:", "")
        .trim();

      // Sonuçları yazdır
      console.log(`İsim: ${name}`);
      console.log(`Dış Hat: ${disHat}`);
      console.log(`Dahili: ${dahili}`);
      console.log("---");
      personelData.push(`${name} - Dış Hat: ${disHat}, Dahili: ${dahili}`);
    });
  } catch (error) {
    console.error(`An error occurred: ${error}`);
  }

  return personelData.join("\n");
}

async function getPlainPage(url) {
  try {
    // Make a GET request to the URL
    const response = await axios.get(url);
    console.log(`Response status: ${response.data}`);
    return response.data;
  } catch (error) {
    console.error(`An error occurred: ${error}`);
  }

  return "bir sonuç yok";
}
export { getPageContent, getPersonelPage, getPlainPage };
