# Internet Archive Uploader - Backend

هذا هو الـ Backend الخاص بتطبيق Internet Archive Uploader. مبني باستخدام Node.js و Express، ومصمم خصيصاً ليتوافق مع النشر على Vercel Serverless Functions.

## 🏗️ Architecture (مهم جداً لفهم طريقة رفع الملفات الكبيرة)

بسبب القيود الصارمة في Vercel على حجم الـ Payload (حد أقصى 4.5MB)، **لا تمر الملفات الكبيرة عبر هذا السيرفر أبداً**.
بدلاً من ذلك، نستخدم معمارية **Direct Upload (Pre-signed URL Pattern)**:

1. **إنشاء العنصر (Create Item):** يقوم Frontend بإرسال معلومات العنصر `(Identifier, Title)`، فيقوم Backend بالتواصل مع S3 API الخاص بـ Internet Archive لإنشاء الـ Bucket/Item.
2. **طلب رابط الرفع:** يرسل Frontend اسم الملف ونوعه (بدون الملف نفسه) إلى `/api/upload`.
3. **توليد الرابط:** يقوم Backend باستخدام الـ Secret Keys لتوليد رابط رفع مباشر `uploadUrl` صالح لمدة ساعة، ويُعيده إلى Frontend.
4. **الرفع المباشر:** يقوم الـ Frontend باستخدام الـ `uploadUrl` لعمل طلب `PUT` مباشر للملف الحقيقي إلى خوادم Internet Archive.

## 🚀 طريقة التثبيت والتشغيل محلياً

1. قم بتنزيل المستودع وادخل إلى المجلد:
   ```bash
   cd backend
   npm install
