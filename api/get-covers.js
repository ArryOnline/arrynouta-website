// api/get-covers.js

function parseCreditLine(description, keywordPattern) {
  // Regex mencari format: Label - Nama (atau Label : Nama)
  const regex = new RegExp(`${keywordPattern}\\s*[:\\-=]\\s*([^\\r\\n]+)`, "i");
  const match = description.match(regex);

  if (match && match[1]) {
    let rawName = match[1].trim();

    // Dapatkan nama bersih, buang label jika tersisa
    let cleanName = rawName
      .replace(/^(mix|master|mixing|video|edited|movie|illustration|vocal|vocals)\b/gi, "")
      .replace(/^[\s:\-=&]+/g, "") // Hapus sisa titik dua, strip, ampersand di awal
      .trim();

    // Jika mengandung kata "Arry" atau "Alarik", atau hasilnya kosong/hanya simbol -> return "Arry"
    if (
      !cleanName ||
      cleanName.toLowerCase().includes("arry") ||
      cleanName.toLowerCase().includes("alarik") ||
      cleanName.toLowerCase() === "mix" ||
      cleanName.toLowerCase() === "master"
    ) {
      return "Arry";
    }

    // Kalau ditemukan nama lain yang valid (misal: "Okami Ken"), kembalikan nama tersebut
    return cleanName;
  }

  // Fallback default jika tidak ada pencocokan
  return "Arry";
}

export default async function handler(req, res) {
  const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
  const CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID;

  if (!YOUTUBE_API_KEY || !CHANNEL_ID) {
    return res.status(500).json({ error: "Environment variables belum di-set!" });
  }

  try {
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?key=${YOUTUBE_API_KEY}&channelId=${CHANNEL_ID}&part=snippet,id&order=date&maxResults=10&type=video`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();

    if (!searchData.items || searchData.items.length === 0) {
      return res.status(200).json([]);
    }

    const initialVideoIds = searchData.items.map((item) => item.id.videoId).join(",");

    const detailUrl = `https://www.googleapis.com/youtube/v3/videos?key=${YOUTUBE_API_KEY}&id=${initialVideoIds}&part=snippet,contentDetails`;
    const detailRes = await fetch(detailUrl);
    const detailData = await detailRes.json();

    // Filter Longform (Abaikan Shorts)
    const longFormVideos = detailData.items.filter((video) => {
      const durationStr = video.contentDetails.duration;
      return durationStr.includes("M"); 
    }).slice(0, 3);

    const covers = longFormVideos.map((video) => {
      const description = video.snippet.description || "";
      const thumbnails = video.snippet.thumbnails;

      // Clean Title
      let rawTitle = video.snippet.title;
      let cleanTitle = rawTitle
        .replace(/\|\s*【Cover by Arry】/gi, "")
        .replace(/-\s*Cover by Arry/gi, "")
        .replace(/【Cover by Arry】/gi, "")
        .trim();

      return {
        id: video.id,
        title: cleanTitle,
        thumbnail: thumbnails.maxres ? thumbnails.maxres.url : thumbnails.high.url,
        vocalsBy: "Arry", // Statis Arry
        mixBy: parseCreditLine(description, "(Mix & Master|Mix/Master|Mix and Master|Mix|Mixing)"),
        videoBy: parseCreditLine(description, "(Video|Movie|Edited|Illustration)"),
      };
    });

    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
    return res.status(200).json(covers);

  } catch (error) {
    console.error("Error fetching YouTube API:", error);
    return res.status(500).json({ error: "Gagal mengambil data video" });
  }
}