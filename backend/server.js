const express = require('express');
const cors = require('cors');
const { Readable } = require('node:stream');
const { handleUpload } = require('@vercel/blob/client');
const { get, del } = require('@vercel/blob');
require('dotenv').config();
const { createIaItem, uploadBlobToIa, getItemMetadata } = require('./lib/internetArchive');

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
    const { identifier, title, description, mediatype } = req.body;
    
    if (!identifier) {
      return res.status(400).json({ error: 'Identifier is required' });
    }

    await createIaItem(identifier, title, description, mediatype || 'data');
    res.status(201).json({ success: true, identifier });

  } catch (error) {
    const responseBody = error.response?.data;
    console.error('Create Item Error:', JSON.stringify({
      status: error.response?.status,
      message: error.message,
      response: typeof responseBody === 'string' ? responseBody.slice(0, 1000) : responseBody
    }));
    res.status(500).json({ error: 'Failed to create item on Internet Archive' });
  }
});

// 3. Upload Endpoint (Generates Direct Upload URL)
app.post('/api/blob-upload-token', async (req, res) => {
  try {
    const result = await handleUpload({
      request: req,
      body: req.body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const payload = JSON.parse(clientPayload || '{}');
        validateUploadFields(payload.identifier, payload.filename);
        const expectedPath = `ia-uploads/${payload.identifier}/${payload.uploadId}/${payload.filename}`;
        if (!/^[a-f0-9-]{36}$/i.test(payload.uploadId || '') || pathname !== expectedPath) {
          throw new Error('Upload path does not match its item identifier');
        }
        return {
          allowedContentTypes: ['*/*'],
          maximumSizeInBytes: 5 * 1024 * 1024 * 1024,
          addRandomSuffix: false,
          allowOverwrite: false,
          tokenPayload: JSON.stringify(payload),
        };
      },
    });
    res.status(200).json(result);
  } catch (error) {
    console.error('Blob upload token error:', error.message);
    res.status(400).json({ error: error.message || 'Failed to authorize temporary upload' });
  }
});

// Transfer the private temporary Blob to IAS3, then remove it even on failure.
app.post('/api/complete-upload', async (req, res) => {
  const { blobUrl, pathname, identifier, filename, contentType } = req.body || {};
  let shouldDeleteBlob = false;
  try {
    validateUploadFields(identifier, filename);
    if (typeof blobUrl !== 'string' || typeof pathname !== 'string') {
      return res.status(400).json({ error: 'Uploaded Blob details are required' });
    }

    const url = new URL(blobUrl);
    const segments = pathname.split('/');
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.private.blob.vercel-storage.com') ||
        segments.length !== 4 || segments[0] !== 'ia-uploads' || segments[1] !== identifier ||
        !/^[a-f0-9-]{36}$/i.test(segments[2]) || segments[3] !== filename ||
        decodeURIComponent(url.pathname.slice(1)) !== pathname) {
      return res.status(400).json({ error: 'Temporary upload details are invalid' });
    }
    shouldDeleteBlob = true;

    const blob = await get(blobUrl, { access: 'private', useCache: false });
    if (!blob || blob.statusCode !== 200) {
      return res.status(404).json({ error: 'Temporary upload was not found' });
    }
    const fileUrl = await uploadBlobToIa(
      identifier,
      filename,
      contentType || blob.blob.contentType,
      Readable.fromWeb(blob.stream),
      blob.blob.size
    );
    res.status(200).json({ success: true, identifier, files: [{ name: filename, url: fileUrl }] });
  } catch (error) {
    const responseBody = error.response?.data;
    console.error('Complete Upload Error:', JSON.stringify({
      status: error.response?.status,
      message: error.message,
      response: typeof responseBody === 'string' ? responseBody.slice(0, 1000) : responseBody,
    }));
    res.status(502).json({ error: 'Failed to transfer file to Internet Archive' });
  } finally {
    if (shouldDeleteBlob && blobUrl) {
      try {
        await del(blobUrl, { access: 'private' });
      } catch (deleteError) {
        console.error('Temporary Blob cleanup failed:', deleteError.message);
      }
    }
  }
});

function validateUploadFields(identifier, filename) {
  if (typeof identifier !== 'string' || !/^[a-z0-9][a-z0-9._-]{2,99}$/i.test(identifier)) {
    throw new Error('A valid Internet Archive identifier is required');
  }
  if (typeof filename !== 'string' || filename.length < 1 || filename.length > 255 ||
      filename === '.' || filename === '..' || /[\\/\x00-\x1f\x7f]/.test(filename)) {
    throw new Error('A valid filename is required');
  }
}

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
