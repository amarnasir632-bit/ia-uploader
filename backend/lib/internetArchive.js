const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const axios = require('axios');

// تهيئة عميل S3 للتعامل مع خوادم Internet Archive
const s3Client = new S3Client({
  region: 'us-east-1', // IA لا يستخدم Regions فعلياً، لكن SDK يطلبه
  endpoint: 'https://s3.us.archive.org',
  credentials: {
    accessKeyId: process.env.IA_ACCESS_KEY,
    secretAccessKey: process.env.IA_SECRET_KEY
  }
});

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

/**
 * دالة لتوليد رابط رفع مباشر (Pre-signed URL)
 */
async function getPresignedUploadUrl(identifier, filename, contentType) {
  const command = new PutObjectCommand({
    Bucket: identifier,
    Key: filename,
    ContentType: contentType
  });
  
  // الرابط يكون صالحاً لمدة ساعة واحدة (3600 ثانية)
  return await getSignedUrl(s3Client, command, { expiresIn: 3600 });
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
  getPresignedUploadUrl,
  getItemMetadata
};
