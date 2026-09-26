const axios = require('axios');
const IA_S3_ENDPOINT = 'https://s3.us.archive.org';

/**
 * دالة لإنشاء Item جديد في Internet Archive
 * يتم إنشاؤه عبر رفع ملف Metadata صغير جداً مع تمرير الـ Headers المطلوبة
 */
async function createIaItem(identifier, title, description, mediatype = 'data') {
  const url = `https://s3.us.archive.org/${identifier}/_project_metadata.json`;
  const metadata = { created_by: "IA Uploader App", timestamp: new Date().toISOString() };

  if (!process.env.IA_ACCESS_KEY || !process.env.IA_SECRET_KEY) {
    throw new Error('Internet Archive S3 credentials are not configured');
  }

  const headers = {
    'Authorization': `LOW ${process.env.IA_ACCESS_KEY}:${process.env.IA_SECRET_KEY}`,
    'Content-Type': 'application/json',
    'x-amz-auto-make-bucket': '1',
    'x-archive-meta-mediatype': mediatype,
  };

  if (title) headers['x-archive-meta-title'] = title;
  if (description) headers['x-archive-meta-description'] = description;

  // رفع ملف صغير فقط لإنشاء الـ Bucket/Item مع البيانات الوصفية
  await axios.put(url, metadata, { headers });
  return true;
}

/** Stream a private Blob object to Internet Archive using IAS3 LOW auth. */
async function uploadBlobToIa(identifier, filename, contentType, stream, size) {
  if (!process.env.IA_ACCESS_KEY || !process.env.IA_SECRET_KEY) {
    throw new Error('Internet Archive S3 credentials are not configured');
  }

  const safeFilename = encodeURIComponent(filename);
  const url = `${IA_S3_ENDPOINT}/${encodeURIComponent(identifier)}/${safeFilename}`;
  await axios.put(url, stream, {
    headers: {
      Authorization: `LOW ${process.env.IA_ACCESS_KEY}:${process.env.IA_SECRET_KEY}`,
      'Content-Type': contentType || 'application/octet-stream',
      'Content-Length': String(size),
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    timeout: 10 * 60 * 1000,
  });
  return `https://archive.org/download/${encodeURIComponent(identifier)}/${safeFilename}`;
}

/**
 * دالة لجلب البيانات الوصفية للعنصر
 */
async function getItemMetadata(identifier) {
  const response = await axios.get(`https://archive.org/metadata/${identifier}`);
  return response.data;
}

module.exports = {
  createIaItem,
  uploadBlobToIa,
  getItemMetadata
};
