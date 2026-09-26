// الإعدادات العامة (مفصولة عن الكود المباشر)
const API_BASE_URL = "https://ia-uploader.vercel.app";

// اتركها فارغة للعمل على نفس النطاق (مثل Vercel)

// متغيرات الحالة (State)
let uploadedFiles = []; // مصفوفة لتخزين الكائنات: { id, file, status, progress, url }
let isUploading = false;

// عناصر الـ DOM
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const browseBtn = document.getElementById('browse-btn');
const filesListContainer = document.getElementById('files-list');
const uploadBtn = document.getElementById('upload-btn');
const clearBtn = document.getElementById('clear-btn');
const identifierInput = document.getElementById('identifier');
const generateIdentifierBtn = document.getElementById('generate-identifier');
const titleInput = document.getElementById('title');
const descInput = document.getElementById('description');
const resultsSection = document.getElementById('results-section');
const linksListContainer = document.getElementById('links-list');
const copyAllBtn = document.getElementById('copy-all-btn');
const toastEl = document.getElementById('toast');
const isEmbedded = new URLSearchParams(window.location.search).get('embed') === '1';

if (isEmbedded) document.body.classList.add('embedded-uploader');

function generateArchiveIdentifier() {
    return `ia-${Date.now().toString(36)}-${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`;
}

if (!identifierInput.value.trim()) identifierInput.value = generateArchiveIdentifier();
generateIdentifierBtn.addEventListener('click', () => {
    identifierInput.value = generateArchiveIdentifier();
});

window.addEventListener('message', (event) => {
    if (event.origin !== 'https://dsacms-frontend.vercel.app' && event.origin !== 'https://mohamedalahadi.com') return;
    if (event.data?.type !== 'dsacms:archive-context') return;
    const context = event.data;
    if (context.identifier) identifierInput.value = context.identifier;
    if (context.title) titleInput.value = context.title;
    if (context.description) descInput.value = context.description;
});

// === الأحداث (Event Listeners) ===

// أحداث منطقة السحب والإفلات
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', handleDrop);

// دعم لوحة المفاتيح لمنطقة السحب
dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fileInput.click();
    }
});

// أحداث أزرار اختيار الملفات
browseBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', selectFiles);

// أحداث التحكم
uploadBtn.addEventListener('click', startUpload);
clearBtn.addEventListener('click', clearFiles);
copyAllBtn.addEventListener('click', copyAllLinks);


// === الوظائف الأساسية (Functions) ===

function selectFiles(event) {
    const files = event.target.files;
    addFilesToArray(files);
    fileInput.value = ''; // إعادة تعيين الحقل للسماح باختيار نفس الملف مجدداً إذا تم حذفه
}

function handleDrop(event) {
    event.preventDefault();
    dropZone.classList.remove('dragover');
    const files = event.dataTransfer.files;
    addFilesToArray(files);
}

function addFilesToArray(files) {
    if (isUploading) return; // منع الإضافة أثناء الرفع
    
    Array.from(files).forEach(file => {
        // إنشاء معرّف فريد مؤقت للملف
        const id = Math.random().toString(36).substring(2, 9);
        uploadedFiles.push({
            id,
            file,
            status: 'جاهز', // الحالات: جاهز, جاري الرفع, اكتمل, فشل
            progress: 0,
            url: null
        });
    });
    renderFiles();
}

function renderFiles() {
    filesListContainer.innerHTML = '';
    
    if (uploadedFiles.length === 0) {
        uploadBtn.disabled = true;
        clearBtn.disabled = true;
        return;
    }

    uploadBtn.disabled = isUploading;
    clearBtn.disabled = isUploading;

    uploadedFiles.forEach(item => {
        const sizeMB = (item.file.size / (1024 * 1024)).toFixed(2);
        
        // تحديد فئة اللون بناءً على الحالة
        let statusClass = 'status-ready';
        if (item.status === 'جاري الرفع') statusClass = 'status-uploading';
        if (item.status === 'اكتمل') statusClass = 'status-success';
        if (item.status === 'فشل') statusClass = 'status-error';

        const card = document.createElement('div');
        card.className = 'file-card';
        card.innerHTML = `
            <div class="file-info-header">
                <div class="file-name" title="${item.file.name}">${item.file.name}</div>
                <div class="file-status ${statusClass}">${item.status} (${item.progress}%)</div>
            </div>
            <div class="file-meta">${sizeMB} MB • ${item.file.type || 'Unknown'}</div>
            <div class="progress-container" role="progressbar" aria-valuenow="${item.progress}" aria-valuemin="0" aria-valuemax="100">
                <div class="progress-bar" style="width: ${item.progress}%"></div>
            </div>
        `;
        filesListContainer.appendChild(card);
    });
}

function validateFiles() {
    const identifier = identifierInput.value.trim();
    if (!/^[a-z0-9][a-z0-9._-]{4,100}$/i.test(identifier)) {
        showToast('معرّف Internet Archive يجب أن يكون من 5 إلى 101 حرفاً، ويبدأ بحرف أو رقم، ويحتوي على حروف أو أرقام أو نقطة أو شرطة فقط.');
        identifierInput.focus();
        return false;
    }
    if (uploadedFiles.length === 0) {
        showToast('يرجى اختيار ملفات للرفع');
        return false;
    }
    return true;
}

async function startUpload() {
    if (!validateFiles() || isUploading) return;

    isUploading = true;
    renderFiles(); // تحديث الواجهة لتعطيل الأزرار

    const filesToUpload = uploadedFiles.filter(f => f.status === 'جاهز' || f.status === 'فشل');
    const firstFileType = filesToUpload[0]?.file.type || '';
    const firstFileName = filesToUpload[0]?.file.name.toLowerCase() || '';
    const mediatype = firstFileType.startsWith('audio/') || /\.(aac|flac|m4a|mp3|oga|ogg|opus|wav|wma)$/.test(firstFileName) ? 'audio'
        : firstFileType.startsWith('video/') ? 'movies'
        : firstFileType.startsWith('image/') || /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/.test(firstFileName) ? 'image'
        : 'data';

    try {
        const response = await fetch(`${API_BASE_URL}/api/create-item`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                identifier: identifierInput.value.trim(),
                title: titleInput.value.trim(),
                description: descInput.value.trim(),
                mediatype
            })
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || `تعذر تجهيز العنصر (${response.status})`);
        }
    } catch (error) {
        isUploading = false;
        renderFiles();
        showToast(error.message || 'تعذر الاتصال بالخادم');
        return;
    }

    // فلترة الملفات الجاهزة فقط (لتجنب إعادة رفع ملفات اكتملت)
    for (const item of filesToUpload) {
        await uploadFile(item);
    }

    isUploading = false;
    renderFiles();
    
    // التحقق مما إذا كان هناك روابط ناجحة لعرض قسم النتائج
    if (uploadedFiles.some(f => f.url)) {
        renderResults();
    }
}

async function uploadFile(item) {
    item.status = 'جاري الرفع';
    updateProgress(item.id, 0, item.status);

    const identifier = identifierInput.value.trim();
    const lowerName = item.file.name.toLowerCase();
    const contentType = lowerName.endsWith('.m4a') ? 'audio/mp4' : (item.file.type || 'application/octet-stream');
    const uploadId = crypto.randomUUID();
    const pathname = `ia-uploads/${identifier}/${uploadId}/${item.file.name}`;

    try {
        const { upload } = window.IAUploaderBlob || {};
        if (!upload) throw new Error('تعذر تحميل مكوّن الرفع. حدّث الصفحة وحاول مرة أخرى.');

        const blob = await upload(pathname, item.file, {
            access: 'private',
            contentType,
            multipart: true,
            handleUploadUrl: `${API_BASE_URL}/api/blob-upload-token`,
            clientPayload: JSON.stringify({ identifier, filename: item.file.name, contentType, uploadId }),
            onUploadProgress: (event) => {
                const percent = Math.round(event.percentage * 0.75);
                updateProgress(item.id, percent, 'جاري الرفع إلى التخزين المؤقت');
            }
        });

        updateProgress(item.id, 75, 'جاري النقل إلى Internet Archive');
        const response = await fetch(`${API_BASE_URL}/api/complete-upload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                blobUrl: blob.url,
                pathname: blob.pathname,
                identifier,
                filename: item.file.name,
                contentType
            })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) {
            throw new Error(result.error || `فشل نقل الملف إلى Internet Archive (${response.status})`);
        }
        showResult(item.id, result.files?.[0]?.url || `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(item.file.name)}`);
    } catch (error) {
        updateProgress(item.id, 0, 'فشل');
        showToast(error.message || `فشل رفع ${item.file.name}`);
    }
}

function updateProgress(id, percent, status) {
    const itemIndex = uploadedFiles.findIndex(f => f.id === id);
    if (itemIndex > -1) {
        uploadedFiles[itemIndex].progress = percent;
        uploadedFiles[itemIndex].status = status;
        renderFiles();
    }
}

function showResult(id, url) {
    const itemIndex = uploadedFiles.findIndex(f => f.id === id);
    if (itemIndex > -1) {
        uploadedFiles[itemIndex].progress = 100;
        uploadedFiles[itemIndex].status = 'اكتمل';
        uploadedFiles[itemIndex].url = url;
        renderFiles();
    }
}

function renderResults() {
    resultsSection.classList.remove('hidden');
    linksListContainer.innerHTML = '';
    
    const successfulFiles = uploadedFiles.filter(f => f.url !== null);
    
    successfulFiles.forEach(item => {
        const linkBlock = document.createElement('div');
        linkBlock.className = 'link-item';
        const heading = document.createElement('div');
        heading.className = 'link-item-header';
        heading.textContent = item.file.name;
        const group = document.createElement('div');
        group.className = 'link-input-group';
        const input = document.createElement('input');
        input.type = 'text';
        input.value = item.url;
        input.readOnly = true;
        const copyButton = document.createElement('button');
        copyButton.className = 'btn btn-primary';
        copyButton.type = 'button';
        copyButton.textContent = 'نسخ الرابط';
        copyButton.addEventListener('click', () => copyLink(item.url));
        group.append(input, copyButton);
        if (isEmbedded) {
            const useButton = document.createElement('button');
            useButton.className = 'btn btn-outline-primary use-link-btn';
            useButton.type = 'button';
            useButton.textContent = 'استخدام الرابط في الموقع';
            useButton.addEventListener('click', () => {
                let parentOrigin;
                try { parentOrigin = new URL(document.referrer).origin; } catch (_) { return; }
                if (parentOrigin !== 'https://dsacms-frontend.vercel.app' && parentOrigin !== 'https://mohamedalahadi.com') return;
                window.parent.postMessage({
                    type: 'dsacms:archive-file-selected',
                    url: item.url,
                    filename: item.file.name,
                    contentType: item.file.type || ''
                }, parentOrigin);
            });
            group.appendChild(useButton);
        }
        linkBlock.append(heading, group);
        linksListContainer.appendChild(linkBlock);
    });
}

function copyLink(url) {
    navigator.clipboard.writeText(url).then(() => {
        showToast('تم نسخ الرابط');
    }).catch(() => {
        showToast('فشل نسخ الرابط');
    });
}

function copyAllLinks() {
    const links = uploadedFiles
        .filter(f => f.url !== null)
        .map(f => f.url)
        .join('\n');
        
    if (links) {
        navigator.clipboard.writeText(links).then(() => {
            showToast('تم نسخ جميع الروابط');
        });
    }
}

function clearFiles() {
    if (isUploading) return;
    uploadedFiles = [];
    resultsSection.classList.add('hidden');
    renderFiles();
}

let toastTimeout;
function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toastEl.classList.remove('show');
    }, 3000);
}
