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
const titleInput = document.getElementById('title');
const descInput = document.getElementById('description');
const resultsSection = document.getElementById('results-section');
const linksListContainer = document.getElementById('links-list');
const copyAllBtn = document.getElementById('copy-all-btn');
const toastEl = document.getElementById('toast');

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
    if (!identifier) {
        showToast('خطأ: يرجى إدخال المعرف (Identifier) أولاً');
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

    // فلترة الملفات الجاهزة فقط (لتجنب إعادة رفع ملفات اكتملت)
    const filesToUpload = uploadedFiles.filter(f => f.status === 'جاهز' || f.status === 'فشل');

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

function uploadFile(item) {
    return new Promise((resolve) => {
        // تحديث الحالة
        item.status = 'جاري الرفع';
        updateProgress(item.id, 0, item.status);

        const formData = new FormData();
        formData.append('file', item.file);
        formData.append('identifier', identifierInput.value.trim());
        formData.append('title', titleInput.value.trim());
        formData.append('description', descInput.value.trim());

        const xhr = new XMLHttpRequest();
        
        // نقطة النهاية للـ API (Backend يجب أن يستقبلها هنا)
        xhr.open('POST', `${API_BASE_URL}/api/upload`, true);

        // مراقبة تقدم الرفع
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 100);
                updateProgress(item.id, percent, 'جاري الرفع');
            }
        };

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const response = JSON.parse(xhr.responseText);
                    // نتوقع أن الـ API يعيد الرابط المباشر
                    showResult(item.id, response.url || `https://archive.org/download/${identifierInput.value.trim()}/${item.file.name}`);
                } catch (e) {
                    showResult(item.id, `https://archive.org/download/${identifierInput.value.trim()}/${item.file.name}`);
                }
            } else {
                updateProgress(item.id, 0, 'فشل'); // Network Error أو 4xx/5xx
            }
            resolve();
        };

        xhr.onerror = () => {
            updateProgress(item.id, 0, 'فشل'); // Network Error
            resolve();
        };

        xhr.send(formData);
    });
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
        
        linkBlock.innerHTML = `
            <div class="link-item-header">${item.file.name}</div>
            <div class="link-input-group">
                <input type="text" value="${item.url}" readonly>
                <button class="btn btn-primary" onclick="copyLink('${item.url}')">نسخ الرابط</button>
            </div>
        `;
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
