const axios = require("axios");
const cheerio = require("cheerio");

const url =
  "https://divit.library.itu.edu.tr/search*tur/?searchtype=r&searcharg=";

async function getPublications(id) {
  try {
    // Make a GET request to the URL
    const response = await axios.get(url + id);
    console.log(`Response status: ${response.data}`);
    const $ = cheerio.load(response.data);

    // Array to store publication titles
    const publications = [];

    // Select the HTML elements containing the titles
    // The selector 'a[id^="title"]' looks for all 'a' tags where the 'id' attribute starts with "title"
    $("tr").each((i, row) => {
      const firstTd = $(row).find("td:first-child");

      // İlk <td> içindeki <a> etiketini bulun
      const linkElement = firstTd.find("a");

      // <a> etiketinin href özniteliğini alın
      const href = linkElement.attr("href");
      const hrefText = linkElement.text().trim();

      // Eğer bir köprü bağlantısı varsa, listeye ekleyin
      if (href) {
        publications.push(
          '<a href="https://divit.library.itu.edu.tr' +
            href +
            '">' +
            hrefText +
            "</a>"
        );
      }
    });

    console.log(publications);
    return publications;
  } catch (error) {
    console.error(`An error occurred: ${error}`);
  }
}
module.exports = { getPublications };
