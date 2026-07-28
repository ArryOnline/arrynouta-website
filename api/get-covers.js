// api/get-covers.js

function parseCreditLine(description, keywordPattern) {
  // Regex yang lebih presisi: mencari kata kunci (misal "Vocals" atau "Mix & Master") 
  // diikuti tanda hubung/titik dua, lalu mengambil namanya sampai akhir baris
  const regex = new RegExp(`${keywordPattern}\\s*[:\\-=]\\s*([^\\r\\n]+)`, "i");
  const match = description.match(regex);
  
  if (match && match[1]) {
    let name = match[1].trim();

    // Jika mengandung kata "Arry" atau "Alarik", seragamkan jadi "Arry"
    if (name.toLowerCase().includes("arry") || name.toLowerCase().includes("alarik")) {
      return "Arry";
    }
    
    // Cegah bug jika regex tidak sengaja menangkap teks label itu sendiri
    if (name.length > 0 && !name.toLowerCase().includes("mix") && !name.toLowerCase().includes("video")) {
      return name;
    }
  }

  return "Arry"; // Default fallback jika tidak ditemukan di deskripsi
}

export default async function handler(req, res) {
  const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
  const CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID;

  if (!YOUTUBE_API_KEY || !CHANNEL_ID) {
    return res.status(500).json({ error: "Environment variables belum di-set!" });
  }

  try {
    // 1. Ambil video terbaru DENGAN FILTER videoDuration=medium & long (Abaikan Shorts)
    // - videoDuration 'medium': 4 menit hingga 20 menit
    // - videoDuration 'long': lebih dari 20 menit
    // Kita panggil search untuk video kategori umum, lalu filter durasi
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?key=${YOUTUBE_API_KEY}&channelId=${CHANNEL_ID}&part=snippet,id&order=date&maxResults=10&type=video`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();

    if (!searchData.items || searchData.items.length === 0) {
      return res.status(200).json([]);
    }

    const initialVideoIds = searchData.items.map((item) => item.id.videoId).join(",");

    // 2. Ambil detail video untuk memeriksa durasi persisnya (contentDetails) & deskripsi (snippet)
    const detailUrl = `https://www.googleapis.com/youtube/v3/videos?key=${YOUTUBE_API_KEY}&id=${initialVideoIds}&part=snippet,contentDetails`;
    const detailRes = await fetch(detailUrl);
    const detailData = await detailRes.json();

    // 3. Filter out YouTube Shorts (Shorts biasanya berdurasi <= 60 detik / 1 menit)
    const longFormVideos = detailData.items.filter((video) => {
      const durationStr = video.contentDetails.duration; // Format ISO 8601 (misal: PT3M45S)
      
      // Jika durasinya hanya "PT45S" atau "PT1M" tanpa menit panjang, kemungkinan besar Shorts.
      // Cek sederhana: jika durasinya memiliki format 'M' (menit) dan bukan sekadar 60s, itu longform.
      const hasMinutes = durationStr.includes("M");
      return hasMinutes; 
    }).slice(0, 3); // Ambil 3 terkini yang sudah difilter

    // 4. Olah data kredits
    const covers = longFormVideos.map((video) => {
      const description = video.snippet.description || "";
      const thumbnails = video.snippet.thumbnails;

      return {
        id: video.id,
        title: video.snippet.title,
        thumbnail: thumbnails.maxres ? thumbnails.maxres.url : thumbnails.high.url,
        // Pattern disesuaikan dengan variasi penulisan umum di deskripsi
        vocalsBy: parseCreditLine(description, "(Vocal|Vocals|Singer)"),
        mixBy: parseCreditLine(description, "(Mix & Master|Mix/Master|Mix and Master|Mix|Mixing)"),
        videoBy: parseCreditLine(description, "(Video|Movie|Edited|Illustration)"),
      };
    });

    // 5. Header Cache Vercel
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
    return res.status(200).json(covers);

  } catch (error) {
    console.error("Error fetching YouTube API:", error);
    return res.status(500).json({ error: "Gagal mengambil data video" });
  }
}