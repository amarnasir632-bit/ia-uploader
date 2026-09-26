const axios = require('axios');
const crypto = require('crypto');

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

/**
 * دالة لتوليد رابط رفع مباشر (Pre-signed URL)
 */
async function getPresignedUploadUrl(identifier, filename, contentType) {
  const accessKey = process.env.IA_ACCESS_KEY;
  const secretKey = process.env.IA_SECRET_KEY;
  if (!accessKey || !secretKey) {
    throw new Error('Internet Archive S3 credentials are not configured');
  }

  // IAS3 uses Signature V2 query authentication; SigV4 URLs are rejected as
  // AWS access keys because Internet Archive credentials are not AWS IAM keys.
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const encodedIdentifier = encodeURIComponent(identifier);
  const encodedFilename = encodeURIComponent(filename).replace(/%2F/gi, '/');
  const canonicalResource = `/${encodedIdentifier}/${encodedFilename}`;
  const stringToSign = `PUT\n\n${contentType}\n${expires}\n${canonicalResource}`;
  const signature = crypto
    .createHmac('sha1', secretKey)
    .update(stringToSign, 'utf8')
    .digest('base64');
  const query = new URLSearchParams({
    AWSAccessKeyId: accessKey,
    Expires: String(expires),
    Signature: signature
  });

  return `${IA_S3_ENDPOINT}${canonicalResource}?${query.toString()}`;
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
