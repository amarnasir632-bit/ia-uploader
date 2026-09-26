const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { createIaItem, getPresignedUploadUrl, getItemMetadata } = require('./lib/internetArchive');

const app = express();

// إعدادات CORS بطريقة آمنة
const corsOptions = {
  origin: process.env.FRONTEND_URL || '*',
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// معالجة JSON فقط للطلبات الصغيرة (نمنع الملفات الكبيرة من المرور عبر السيرفر)
app.use(express.json({ limit: '2mb' }));

// 1. Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 2. Create Item Endpoint
app.post('/api/create-item', async (req, res) => {
  try {
    const { identifier, title, description } = req.body;
    
    if (!identifier) {
      return res.status(400).json({ error: 'Identifier is required' });
    }

    await createIaItem(identifier, title, description);
    res.status(201).json({ success: true, identifier });

  } catch (error) {
    console.error('Create Item Error:', error.message);
    res.status(500).json({ error: 'Failed to create item on Internet Archive' });
  }
});

// 3. Upload Endpoint (Generates Direct Upload URL)
app.post('/api/upload', async (req, res) => {
  try {
    const { identifier, filename, contentType } = req.body;
    
    if (!identifier || !filename) {
      return res.status(400).json({ error: 'Identifier and filename are required' });
    }

    // توليد الرابط المؤقت المباشر
    const uploadUrl = await getPresignedUploadUrl(
      identifier, 
      filename, 
      contentType || 'application/octet-stream'
    );

    // ترميز اسم الملف ليكون جاهزاً في رابط التحميل النهائي (مع الحفاظ على الشرطات المائلة إن وجدت)
    const encodedFilename = encodeURIComponent(filename).replace(/%2F/g, '/');
    const fileUrl = `https://archive.org/download/${identifier}/${encodedFilename}`;

    res.status(200).json({
      success: true,
      identifier,
      uploadUrl, // Frontend سيستخدم هذا الرابط لرفع الملف الحقيقي عبر XHR/Fetch (PUT)
      files: [
        {
          name: filename,
          url: fileUrl
        }
      ]
    });

  } catch (error) {
    console.error('Generate Upload URL Error:', error.message);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

// 4. Get Item Metadata Endpoint
app.get('/api/item/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;
    const metadata = await getItemMetadata(identifier);
    
    if (!metadata || !metadata.metadata) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    res.status(200).json({ success: true, data: metadata.metadata });
  } catch (error) {
    res.status(404).json({ error: 'Item not found or unavailable' });
  }
});

// 5. Get Files Endpoint
app.get('/api/files/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;
    const metadata = await getItemMetadata(identifier);
    
    if (!metadata || !metadata.files) {
      return res.status(404).json({ error: 'Files not found' });
    }

    const filesList = metadata.files.map(file => {
      const encodedFilename = encodeURIComponent(file.name).replace(/%2F/g, '/');
      return {
        name: file.name,
        size: file.size,
        format: file.format,
        url: `https://archive.org/download/${identifier}/${encodedFilename}`
      };
    });

    res.status(200).json({ success: true, identifier, files: filesList });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve files' });
  }
});

// Handle undefined routes
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start the server (for local development)
const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

// Export the Express API for Vercel
module.exports = app;
