const express = require('express');
const cors = require('cors');
const youtubedl = require('yt-dlp-exec');
const https = require('https');
const http = require('http');

const app = express();
app.use(cors());
app.use(express.json());

// Extract metadata & direct media URLs
app.post('/api/extract', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    const info = await youtubedl(url, {
      dumpSingleJson: true,
      noWarnings: true,
      preferFreeFormats: true,
    });

    const formats = [];

    // Best combined MP4 video
    const videoFormat = info.formats?.find(
      (f) => f.ext === 'mp4' && f.vcodec !== 'none' && f.acodec !== 'none'
    ) || info.formats?.slice(-1)[0];

    if (videoFormat?.url) {
      formats.push({
        type: 'video',
        quality: videoFormat.format_note || 'HD Video (MP4)',
        ext: 'mp4',
        filename: `${(info.title || 'video').slice(0, 40)}.mp4`,
        downloadUrl: videoFormat.url,
      });
    }

    // Audio-only stream
    const audioFormat = info.formats?.find(
      (f) => f.vcodec === 'none' && f.acodec !== 'none'
    );

    if (audioFormat?.url) {
      formats.push({
        type: 'audio',
        quality: 'Audio Only',
        ext: audioFormat.ext || 'm4a',
        filename: `${(info.title || 'audio').slice(0, 40)}.${audioFormat.ext || 'm4a'}`,
        downloadUrl: audioFormat.url,
      });
    }

    // Fallback for direct image posts
    if (formats.length === 0 && info.url) {
      formats.push({
        type: 'image',
        quality: 'Original Quality',
        ext: info.ext || 'jpg',
        filename: `media_${Date.now()}.${info.ext || 'jpg'}`,
        downloadUrl: info.url,
      });
    }

    res.json({
      title: info.title,
      thumbnail: info.thumbnail,
      formats,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not extract media. Ensure the post is public.' });
  }
});

// Proxy stream to force direct file download on mobile & desktop browsers
app.get('/api/download', (req, res) => {
  const { url, filename } = req.query;
  if (!url) return res.status(400).send('Missing URL');

  // Sanitize filename to remove invalid header characters (emojis, special symbols, etc.)
  const safeFilename = (filename || 'download.mp4').replace(/[^\w.-]/g, '_');

  res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
  
  const client = url.startsWith('https') ? https : http;

  client.get(url, (stream) => {
    stream.pipe(res);
  }).on('error', () => {
    res.status(500).send('Download stream failed');
  });
});

app.listen(5000, () => console.log('Extraction server running on http://localhost:5000'));