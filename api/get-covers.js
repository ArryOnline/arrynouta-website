function parseCreditLine(description, keyword) {
  const regex = new RegExp(`${keyword}\\s*[-:]\\s*(.+)`, "i");
  const match = description.match(regex);
  if (match && match[1]) {
    let name = match[1].trim();
    if (name.toLowerCase().includes("arry") || name.toLowerCase().includes("alarik")) {
      return "Arry";
    }
    return name;
  }
  return "Arry"; // Default fallback
}

export default async function handler(req, res) {
  const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
  const CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID;

  if (!YOUTUBE_API_KEY || !CHANNEL_ID) {
    return res.status(500).json({ error: "Environment variables belum di-set!" });
  }

  try {
    // 1. Ambil 3 video terbaru
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?key=${YOUTUBE_API_KEY}&channelId=${CHANNEL_ID}&part=snippet,id&order=date&maxResults=3&type=video`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();

    if (!searchData.items || searchData.items.length === 0) {
      return res.status(200).json([]);
    }

    const videoIds = searchData.items.map((item) => item.id.videoId).join(",");

    // 2. Ambil detail deskripsi & thumbnail tinggi
    const detailUrl = `https://www.googleapis.com/youtube/v3/videos?key=${YOUTUBE_API_KEY}&id=${videoIds}&part=snippet`;
    const detailRes = await fetch(detailUrl);
    const detailData = await detailRes.json();

    // 3. Olah data
    const covers = detailData.items.map((video) => {
      const description = video.snippet.description || "";
      const thumbnails = video.snippet.thumbnails;

      return {
        id: video.id,
        title: video.snippet.title,
        thumbnail: thumbnails.maxres ? thumbnails.maxres.url : thumbnails.high.url,
        vocalsBy: parseCreditLine(description, "Vocals?"),
        mixBy: parseCreditLine(description, "(Mix & Master|Mix/Master|Mix)"),
        videoBy: parseCreditLine(description, "(Video|Edited)"),
      };
    });

    // 4. Set Header Cache Vercel (Cache selama 1 jam = 3600 detik)
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
    return res.status(200).json(covers);

  } catch (error) {
    console.error("Error fetching YouTube API:", error);
    return res.status(500).json({ error: "Gagal mengambil data video" });
  }
}