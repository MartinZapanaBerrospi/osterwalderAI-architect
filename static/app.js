/**
 * OsterwalderAI Architect — Frontend Logic
 * Lógica de la interfaz web: Chat, Upload, Análisis, Comparativa, Exportar PDF
 */

// ══════════════════════════════════════════════════════════════
// INICIALIZACIÓN
// ══════════════════════════════════════════════════════════════

// Inicializar Mermaid.js
mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    themeVariables: {
        darkMode: true,
        primaryColor: '#1a1a3e',
        primaryTextColor: '#e8e8f0',
        primaryBorderColor: '#00d4ff',
        lineColor: '#00d4ff',
        secondaryColor: '#161630',
        tertiaryColor: '#0d0d18',
        fontFamily: 'Inter, sans-serif',
        fontSize: '13px'
    },
    flowchart: { curve: 'basis', padding: 15 },
    mindmap: { padding: 16 }
});

// Estado global de la aplicación
const AppState = {
    systemReady: false,
    uploadedFiles: [],
    generatedModels: {},       // { bmc: {...}, empathy: {...}, ... }
    comparisonResult: null,
    currentView: 'home'
};

// Labels legibles para los bloques
const BLOCK_LABELS = {
    // BMC
    SEGMENTOS_CLIENTES: 'Segmentos de Clientes',
    PROPUESTA_VALOR: 'Propuesta de Valor',
    CANALES: 'Canales',
    RELACIONES_CLIENTES: 'Relaciones con Clientes',
    FUENTES_INGRESOS: 'Fuentes de Ingresos',
    RECURSOS_CLAVE: 'Recursos Clave',
    ACTIVIDADES_CLAVE: 'Actividades Clave',
    ASOCIACIONES_CLAVE: 'Asociaciones Clave',
    ESTRUCTURA_COSTOS: 'Estructura de Costos',
    // Empatía
    PIENSA_SIENTE: 'Piensa y Siente',
    VE: 'Qué Ve',
    OYE: 'Qué Oye',
    DICE_HACE: 'Dice y Hace',
    ESFUERZOS: 'Esfuerzos (Pains)',
    RESULTADOS: 'Resultados (Gains)',
    // Persona
    NOMBRE_PERFIL: 'Perfil',
    DEMOGRAFIA: 'Demografía',
    COMPORTAMIENTO: 'Comportamiento',
    NECESIDADES: 'Necesidades',
    FRUSTRACIONES: 'Frustraciones',
    MOTIVACIONES: 'Motivaciones',
    // Value
    TRABAJOS_CLIENTE: 'Trabajos del Cliente',
    DOLORES: 'Dolores (Pains)',
    GANANCIAS: 'Ganancias (Gains)',
    PRODUCTOS_SERVICIOS: 'Productos y Servicios',
    ALIVIADORES_DOLOR: 'Aliviadores de Dolor',
    CREADORES_GANANCIA: 'Creadores de Ganancia',
    // Journey
    DESCUBRIMIENTO: 'Descubrimiento',
    CONSIDERACION: 'Consideración',
    DECISION: 'Decisión',
    COMPRA: 'Compra',
    USO: 'Uso',
    SOPORTE: 'Soporte',
    RETENCION: 'Retención',
    RECOMENDACION: 'Recomendación',
    // Compare
    COINCIDENCIAS: 'Coincidencias',
    DIFERENCIAS: 'Diferencias',
    FACTIBILIDAD_TECNICA: 'Factibilidad Técnica',
    FACTIBILIDAD_COMERCIAL: 'Factibilidad Comercial',
    RECOMENDACIONES: 'Recomendaciones'
};

const MODEL_ICONS = {
    bmc: '📊',
    empathy: '❤️',
    persona: '👤',
    value: '💎',
    journey: '🗺️'
};

const MODEL_TITLES = {
    bmc: 'Business Model Canvas',
    empathy: 'Mapa de Empatía',
    persona: 'Mapa de Persona / Cliente',
    value: 'Lienzo de Propuesta de Valor',
    journey: 'Customer Journey Map'
};

// ══════════════════════════════════════════════════════════════
// NAVEGACIÓN
// ══════════════════════════════════════════════════════════════

const VIEW_TITLES = {
    home: { title: 'Inicio', subtitle: 'Panel principal del sistema' },
    chat: { title: 'Consultar IA', subtitle: 'Chat inteligente con RAG' },
    analyze: { title: 'Analizar Documento', subtitle: 'Genera modelos de negocio desde PDFs' },
    compare: { title: 'Comparativa', subtitle: 'IA vs. Propuesta Original' },
    export: { title: 'Exportar PDF', subtitle: 'Genera un reporte profesional' }
};

function switchView(viewName) {
    // Actualizar nav
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    const activeNav = document.querySelector(`.nav-item[data-view="${viewName}"]`);
    if (activeNav) activeNav.classList.add('active');

    // Actualizar vistas
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const targetView = document.getElementById(`view-${viewName}`);
    if (targetView) targetView.classList.add('active');

    // Actualizar header
    const info = VIEW_TITLES[viewName] || { title: '', subtitle: '' };
    document.getElementById('viewTitle').textContent = info.title;
    document.getElementById('viewSubtitle').textContent = info.subtitle;

    AppState.currentView = viewName;

    // Actualizar preview de exportación si vamos a exportar
    if (viewName === 'export') updateExportPreview();
}

// Event listeners para navegación
document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
});

// Cards del home que redirigen a vistas
document.querySelectorAll('.home-card[data-goto]').forEach(card => {
    card.addEventListener('click', () => switchView(card.dataset.goto));
});

// ══════════════════════════════════════════════════════════════
// POLLING DE ESTADO DEL SISTEMA
// ══════════════════════════════════════════════════════════════

function updateSystemUI(data) {
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    const progress = document.getElementById('statusProgress');
    const badge = document.getElementById('badgeStatus');

    // Actualizar dot
    dot.className = 'status-dot ' + data.state;

    // Actualizar texto
    text.textContent = data.message;

    // Actualizar barra de progreso
    progress.style.width = data.progress + '%';

    // Actualizar badge del header
    if (data.state === 'ready') {
        badge.className = 'badge badge-success';
        badge.textContent = '✅ Sistema Listo';
        AppState.systemReady = true;
    } else if (data.state === 'error') {
        badge.className = 'badge badge-warning';
        badge.textContent = '❌ Error';
        AppState.systemReady = false;
    } else {
        badge.className = 'badge badge-info';
        badge.textContent = '⏳ ' + data.message;
        AppState.systemReady = false;
    }
}

async function pollStatus() {
    try {
        const res = await fetch('/api/status');
        const data = await res.json();
        updateSystemUI(data);

        // Seguir polling si no está listo
        if (data.state !== 'ready' && data.state !== 'error') {
            setTimeout(pollStatus, 2000);
        }
    } catch (e) {
        setTimeout(pollStatus, 3000);
    }
}

// Iniciar polling al cargar
pollStatus();

// ══════════════════════════════════════════════════════════════
// CHAT CON LA IA
// ══════════════════════════════════════════════════════════════

function addChatMessage(role, content) {
    const container = document.getElementById('chatMessages');
    const avatar = role === 'user' ? '👤' : '🧠';

    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-message ${role}`;

    let actionsHTML = '';
    if (role === 'assistant') {
        actionsHTML = `
            <div class="chat-bubble-actions">
                <button class="btn btn-ghost btn-sm" onclick="exportSingleResponse(this)">📄 Exportar a PDF</button>
            </div>
        `;
    }

    msgDiv.innerHTML = `
        <div class="chat-avatar">${avatar}</div>
        <div class="chat-bubble">
            ${escapeHtml(content)}
            ${actionsHTML}
        </div>
    `;

    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
}

function addChatLoading() {
    const container = document.getElementById('chatMessages');
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'chat-message assistant';
    loadingDiv.id = 'chatLoading';
    loadingDiv.innerHTML = `
        <div class="chat-avatar">🧠</div>
        <div class="chat-bubble">
            <div class="flex-row gap-sm">
                <div class="spinner spinner-sm"></div>
                <span class="text-muted text-sm">Pensando...</span>
            </div>
        </div>
    `;
    container.appendChild(loadingDiv);
    container.scrollTop = container.scrollHeight;
}

function removeChatLoading() {
    const el = document.getElementById('chatLoading');
    if (el) el.remove();
}

async function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const query = input.value.trim();
    if (!query) return;

    if (!AppState.systemReady) {
        showToast('El sistema aún se está inicializando. Espera un momento.', 'warning');
        return;
    }

    // Agregar mensaje del usuario
    addChatMessage('user', query);
    input.value = '';
    input.disabled = true;
    document.getElementById('chatSendBtn').disabled = true;

    // Mostrar loading
    addChatLoading();

    try {
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });
        const data = await res.json();

        removeChatLoading();

        if (data.error) {
            addChatMessage('assistant', '⚠️ ' + data.error);
        } else {
            addChatMessage('assistant', data.answer);
        }
    } catch (e) {
        removeChatLoading();
        addChatMessage('assistant', '⚠️ Error de conexión con el servidor.');
    }

    input.disabled = false;
    document.getElementById('chatSendBtn').disabled = false;
    input.focus();
}

// Enviar con Enter
document.getElementById('chatInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
    }
});

// ══════════════════════════════════════════════════════════════
// UPLOAD DE DOCUMENTOS
// ══════════════════════════════════════════════════════════════

const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');

uploadZone.addEventListener('click', () => fileInput.click());

uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('dragover');
});

uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('dragover');
});

uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) uploadFile(files[0]);
});

fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) uploadFile(fileInput.files[0]);
});

async function uploadFile(file) {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
        showToast('Solo se permiten archivos PDF.', 'error');
        return;
    }

    if (!AppState.systemReady) {
        showToast('El sistema aún se está inicializando.', 'warning');
        return;
    }

    showLoading('Subiendo y procesando ' + file.name + '...');

    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        hideLoading();

        if (data.error) {
            showToast(data.error, 'error');
        } else {
            AppState.uploadedFiles.push({
                name: file.name,
                pages: data.pages,
                fragments: data.fragments
            });
            renderUploadedFiles();
            document.getElementById('analyzeAllBtn').disabled = false;
            showToast(data.message, 'success');
        }
    } catch (e) {
        hideLoading();
        showToast('Error al subir el archivo.', 'error');
    }
}

function renderUploadedFiles() {
    const container = document.getElementById('uploadedFiles');
    container.innerHTML = AppState.uploadedFiles.map(f => `
        <div class="uploaded-file animate-fade-in">
            <span class="file-icon">📄</span>
            <span class="file-name">${escapeHtml(f.name)}</span>
            <span class="file-status">✓ ${f.pages} págs · ${f.fragments} fragmentos</span>
        </div>
    `).join('');
}

// ══════════════════════════════════════════════════════════════
// GENERACIÓN DE LOS 5 MODELOS DE NEGOCIO
// ══════════════════════════════════════════════════════════════

const MODEL_TYPES = ['bmc', 'empathy', 'persona', 'value', 'journey'];

async function generateAllModels() {
    if (!AppState.systemReady) {
        showToast('El sistema no está listo.', 'warning');
        return;
    }

    const grid = document.getElementById('modelsGrid');
    grid.innerHTML = '';
    const statusEl = document.getElementById('analyzeStatus');
    document.getElementById('analyzeAllBtn').disabled = true;

    for (let i = 0; i < MODEL_TYPES.length; i++) {
        const type = MODEL_TYPES[i];
        statusEl.textContent = `Generando ${MODEL_TITLES[type]}... (${i + 1}/${MODEL_TYPES.length})`;

        // Agregar skeleton
        const skeletonId = `skeleton-${type}`;
        grid.innerHTML += `
            <div class="glass-card-static model-card" id="${skeletonId}">
                <div class="model-card-header">
                    <h3>${MODEL_ICONS[type]} <span>${MODEL_TITLES[type]}</span></h3>
                    <div class="spinner spinner-sm"></div>
                </div>
                <div class="model-card-body">
                    <div class="skeleton skeleton-line"></div>
                    <div class="skeleton skeleton-line"></div>
                    <div class="skeleton skeleton-line"></div>
                </div>
            </div>
        `;

        try {
            const res = await fetch('/api/generate-model', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model_type: type })
            });
            const data = await res.json();

            if (data.error) {
                replaceModelCard(skeletonId, type, null, data.error);
            } else {
                AppState.generatedModels[type] = data;
                replaceModelCard(skeletonId, type, data, null);
            }
        } catch (e) {
            replaceModelCard(skeletonId, type, null, 'Error de conexión.');
        }
    }

    statusEl.textContent = '✅ ¡Todos los modelos generados!';
    document.getElementById('analyzeAllBtn').disabled = false;
    document.getElementById('exportBtn').disabled = false;
    showToast('¡5 modelos de negocio generados exitosamente!', 'success');
}

function replaceModelCard(skeletonId, type, data, error) {
    const skeleton = document.getElementById(skeletonId);
    if (!skeleton) return;

    if (error) {
        skeleton.innerHTML = `
            <div class="model-card-header">
                <h3>${MODEL_ICONS[type]} <span>${MODEL_TITLES[type]}</span></h3>
                <span class="badge badge-warning">Error</span>
            </div>
            <div class="model-card-body">
                <p class="text-muted">${escapeHtml(error)}</p>
            </div>
        `;
        return;
    }

    const blocksHTML = Object.entries(data.blocks).map(([key, items]) => `
        <div class="model-block">
            <h4>${BLOCK_LABELS[key] || key}</h4>
            <ul>
                ${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
            </ul>
        </div>
    `).join('');

    const mermaidId = `mermaid-${type}-${Date.now()}`;
    const mermaidCode = buildMermaidDiagram(type, data.blocks);

    skeleton.innerHTML = `
        <div class="model-card-header">
            <h3>${MODEL_ICONS[type]} <span>${data.title}</span></h3>
            <div class="flex-row gap-sm">
                <button class="btn btn-ghost btn-sm" onclick="exportModelToPDF('${type}')">📄 PDF</button>
                <span class="badge badge-success">Completado</span>
            </div>
        </div>
        <div class="model-card-body">
            <div class="model-blocks">${blocksHTML}</div>
            <div class="mermaid-container" id="${mermaidId}">
                <pre class="mermaid">${mermaidCode}</pre>
            </div>
        </div>
    `;

    // Renderizar Mermaid
    try {
        mermaid.run({ nodes: skeleton.querySelectorAll('.mermaid') });
    } catch (e) {
        console.warn('Mermaid render error:', e);
    }
}

// ══════════════════════════════════════════════════════════════
// CONSTRUCCIÓN DE DIAGRAMAS MERMAID
// ══════════════════════════════════════════════════════════════

function sanitizeMermaid(text) {
    return text.replace(/[()[\]{}<>|"'`#&]/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 50);
}

function buildMermaidDiagram(type, blocks) {
    switch (type) {
        case 'bmc':
            return buildBMCMermaid(blocks);
        case 'empathy':
            return buildEmpathyMermaid(blocks);
        case 'persona':
            return buildPersonaMermaid(blocks);
        case 'value':
            return buildValueMermaid(blocks);
        case 'journey':
            return buildJourneyMermaid(blocks);
        default:
            return 'mindmap\n  root((Modelo))';
    }
}

function buildBMCMermaid(b) {
    let lines = ['mindmap', '  root((Business Model Canvas))'];
    const mapping = {
        ASOCIACIONES_CLAVE: 'Asociaciones Clave',
        ACTIVIDADES_CLAVE: 'Actividades Clave',
        PROPUESTA_VALOR: 'Propuesta de Valor',
        RELACIONES_CLIENTES: 'Relaciones',
        SEGMENTOS_CLIENTES: 'Segmentos',
        RECURSOS_CLAVE: 'Recursos Clave',
        CANALES: 'Canales',
        ESTRUCTURA_COSTOS: 'Costos',
        FUENTES_INGRESOS: 'Ingresos'
    };
    for (const [key, label] of Object.entries(mapping)) {
        lines.push(`    ${label}`);
        if (b[key]) {
            b[key].slice(0, 2).forEach(item => {
                lines.push(`      ${sanitizeMermaid(item)}`);
            });
        }
    }
    return lines.join('\n');
}

function buildEmpathyMermaid(b) {
    let lines = ['mindmap', '  root((Mapa de Empatia))'];
    const mapping = {
        PIENSA_SIENTE: 'Piensa y Siente',
        VE: 'Que Ve',
        OYE: 'Que Oye',
        DICE_HACE: 'Dice y Hace',
        ESFUERZOS: 'Esfuerzos',
        RESULTADOS: 'Resultados'
    };
    for (const [key, label] of Object.entries(mapping)) {
        lines.push(`    ${label}`);
        if (b[key]) {
            b[key].slice(0, 2).forEach(item => {
                lines.push(`      ${sanitizeMermaid(item)}`);
            });
        }
    }
    return lines.join('\n');
}

function buildPersonaMermaid(b) {
    let lines = ['mindmap', '  root((Cliente Ideal))'];
    const mapping = {
        NOMBRE_PERFIL: 'Perfil',
        DEMOGRAFIA: 'Demografia',
        COMPORTAMIENTO: 'Comportamiento',
        NECESIDADES: 'Necesidades',
        FRUSTRACIONES: 'Frustraciones',
        MOTIVACIONES: 'Motivaciones'
    };
    for (const [key, label] of Object.entries(mapping)) {
        lines.push(`    ${label}`);
        if (b[key]) {
            b[key].slice(0, 2).forEach(item => {
                lines.push(`      ${sanitizeMermaid(item)}`);
            });
        }
    }
    return lines.join('\n');
}

function buildValueMermaid(b) {
    let lines = ['mindmap', '  root((Propuesta de Valor))'];
    lines.push('    Perfil del Cliente');
    ['TRABAJOS_CLIENTE', 'DOLORES', 'GANANCIAS'].forEach(key => {
        const label = BLOCK_LABELS[key] || key;
        lines.push(`      ${label}`);
        if (b[key]) {
            b[key].slice(0, 1).forEach(item => {
                lines.push(`        ${sanitizeMermaid(item)}`);
            });
        }
    });
    lines.push('    Mapa de Valor');
    ['PRODUCTOS_SERVICIOS', 'ALIVIADORES_DOLOR', 'CREADORES_GANANCIA'].forEach(key => {
        const label = BLOCK_LABELS[key] || key;
        lines.push(`      ${label}`);
        if (b[key]) {
            b[key].slice(0, 1).forEach(item => {
                lines.push(`        ${sanitizeMermaid(item)}`);
            });
        }
    });
    return lines.join('\n');
}

function buildJourneyMermaid(b) {
    let lines = ['graph LR'];
    // Simplificado para evitar errores de sintaxis
    lines.push('    subgraph ANTES');
    lines.push('        A1[Descubrimiento] --> A2[Consideracion] --> A3[Decision]');
    lines.push('    end');
    lines.push('    subgraph DURANTE');
    lines.push('        A3 --> D1[Compra] --> D2[Uso]');
    lines.push('    end');
    lines.push('    subgraph DESPUES');
    lines.push('        D2 --> P1[Soporte] --> P2[Retencion] --> P3[Recomendacion]');
    lines.push('    end');
    return lines.join('\n');
}

// ══════════════════════════════════════════════════════════════
// COMPARATIVA
// ══════════════════════════════════════════════════════════════

async function runComparison() {
    if (!AppState.systemReady) {
        showToast('El sistema no está listo.', 'warning');
        return;
    }

    const originalText = document.getElementById('originalProposal').value.trim();
    if (!originalText) {
        showToast('Por favor, escribe un resumen de la propuesta original.', 'warning');
        return;
    }

    // Construir resumen de la propuesta IA
    let aiSummary = '';
    for (const [type, data] of Object.entries(AppState.generatedModels)) {
        aiSummary += `${data.title}: `;
        for (const [key, items] of Object.entries(data.blocks)) {
            aiSummary += items.join(', ') + '. ';
        }
        aiSummary += '\n';
    }

    if (!aiSummary.trim()) {
        showToast('Primero genera los modelos de negocio en "Analizar Documento".', 'warning');
        return;
    }

    showLoading('Ejecutando análisis comparativo...');
    document.getElementById('compareBtn').disabled = true;

    try {
        const res = await fetch('/api/compare', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                original_summary: originalText,
                ai_analysis: aiSummary
            })
        });
        const data = await res.json();
        hideLoading();

        if (data.error) {
            showToast(data.error, 'error');
        } else {
            AppState.comparisonResult = data;
            renderComparisonResults(data);
            showToast('Análisis comparativo completado.', 'success');
        }
    } catch (e) {
        hideLoading();
        showToast('Error de conexión.', 'error');
    }

    document.getElementById('compareBtn').disabled = false;
}

function renderComparisonResults(data) {
    const container = document.getElementById('compareResults');

    let html = '<div class="compare-verdict animate-fade-in">';
    for (const [key, items] of Object.entries(data.comparison)) {
        const label = BLOCK_LABELS[key] || key;
        html += `
            <div class="verdict-item">
                <span class="verdict-label">${label}</span>
                <span class="verdict-value">${items.map(i => escapeHtml(i)).join('<br>')}</span>
            </div>
        `;
    }
    html += '</div>';

    // Botón de exportar comparativa
    html += `
        <div class="mt-md">
            <button class="btn btn-secondary" onclick="exportComparisonToPDF()">📄 Exportar Comparativa a PDF</button>
        </div>
    `;

    container.innerHTML = html;
}

// ══════════════════════════════════════════════════════════════
// EXPORTAR A PDF
// ══════════════════════════════════════════════════════════════

function updateExportPreview() {
    const container = document.getElementById('exportPreview');
    const models = Object.keys(AppState.generatedModels);

    if (models.length === 0) {
        container.innerHTML = '<p class="text-sm text-muted">No hay modelos generados aún. Ve a "Analizar Documento" para generar los modelos primero.</p>';
        document.getElementById('exportBtn').disabled = true;
        return;
    }

    let html = '<h3 style="font-size:14px; margin-bottom:12px;">Secciones a incluir:</h3>';
    models.forEach(type => {
        html += `
            <div class="export-section-item">
                <input type="checkbox" class="export-section-check" data-type="${type}" checked>
                <span class="export-section-name">${MODEL_ICONS[type]} ${MODEL_TITLES[type]}</span>
            </div>
        `;
    });

    if (AppState.comparisonResult) {
        html += `
            <div class="export-section-item">
                <input type="checkbox" class="export-section-check" data-type="comparison" checked>
                <span class="export-section-name">⚖️ Análisis Comparativo</span>
            </div>
        `;
    }

    container.innerHTML = html;
    document.getElementById('exportBtn').disabled = false;
}

async function exportToPDF() {
    const title = document.getElementById('exportTitle').value.trim() || 'Análisis de Modelo de Negocio';

    // Recopilar secciones seleccionadas
    const sections = [];
    document.querySelectorAll('.export-section-check:checked').forEach(cb => {
        const type = cb.dataset.type;
        if (type === 'comparison' && AppState.comparisonResult) {
            let content = '';
            for (const [key, items] of Object.entries(AppState.comparisonResult.comparison)) {
                content += `${BLOCK_LABELS[key] || key}:\n`;
                items.forEach(i => content += `  - ${i}\n`);
                content += '\n';
            }
            sections.push({ title: 'Análisis Comparativo', content });
        } else if (AppState.generatedModels[type]) {
            const data = AppState.generatedModels[type];
            let content = '';
            for (const [key, items] of Object.entries(data.blocks)) {
                content += `${BLOCK_LABELS[key] || key}:\n`;
                items.forEach(i => content += `  - ${i}\n`);
                content += '\n';
            }
            sections.push({ title: data.title, content });
        }
    });

    if (sections.length === 0) {
        showToast('Selecciona al menos una sección para exportar.', 'warning');
        return;
    }

    showLoading('Generando reporte PDF...');

    try {
        const res = await fetch('/api/export-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, sections })
        });

        if (res.ok) {
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `OsterwalderAI_Reporte_${Date.now()}.pdf`;
            a.click();
            window.URL.revokeObjectURL(url);
            hideLoading();
            showToast('¡Reporte PDF descargado exitosamente!', 'success');
        } else {
            hideLoading();
            showToast('Error al generar el PDF.', 'error');
        }
    } catch (e) {
        hideLoading();
        showToast('Error de conexión.', 'error');
    }
}

// Exportar un solo modelo a PDF
async function exportModelToPDF(type) {
    const data = AppState.generatedModels[type];
    if (!data) return;

    let content = '';
    for (const [key, items] of Object.entries(data.blocks)) {
        content += `${BLOCK_LABELS[key] || key}:\n`;
        items.forEach(i => content += `  - ${i}\n`);
        content += '\n';
    }

    showLoading('Generando PDF...');
    try {
        const res = await fetch('/api/export-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: data.title,
                sections: [{ title: data.title, content }]
            })
        });
        if (res.ok) {
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `OsterwalderAI_${type}_${Date.now()}.pdf`;
            a.click();
            window.URL.revokeObjectURL(url);
            showToast('PDF descargado.', 'success');
        }
        hideLoading();
    } catch (e) {
        hideLoading();
        showToast('Error al generar PDF.', 'error');
    }
}

// Exportar una respuesta individual del chat a PDF
async function exportSingleResponse(btn) {
    const bubble = btn.closest('.chat-bubble');
    const text = bubble.childNodes[0].textContent.trim();

    showLoading('Generando PDF...');
    try {
        const res = await fetch('/api/export-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: 'Respuesta de OsterwalderAI',
                sections: [{ title: 'Consulta IA', content: text }]
            })
        });
        if (res.ok) {
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `OsterwalderAI_chat_${Date.now()}.pdf`;
            a.click();
            window.URL.revokeObjectURL(url);
            showToast('PDF descargado.', 'success');
        }
        hideLoading();
    } catch (e) {
        hideLoading();
        showToast('Error.', 'error');
    }
}

// Exportar comparativa a PDF
async function exportComparisonToPDF() {
    if (!AppState.comparisonResult) return;

    let content = '';
    for (const [key, items] of Object.entries(AppState.comparisonResult.comparison)) {
        content += `${BLOCK_LABELS[key] || key}:\n`;
        items.forEach(i => content += `  - ${i}\n`);
        content += '\n';
    }

    showLoading('Generando PDF...');
    try {
        const res = await fetch('/api/export-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: 'Análisis Comparativo de Factibilidad',
                sections: [{ title: 'Comparativa IA vs Original', content }]
            })
        });
        if (res.ok) {
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `OsterwalderAI_comparativa_${Date.now()}.pdf`;
            a.click();
            window.URL.revokeObjectURL(url);
            showToast('PDF descargado.', 'success');
        }
        hideLoading();
    } catch (e) {
        hideLoading();
        showToast('Error.', 'error');
    }
}

// ══════════════════════════════════════════════════════════════
// UTILIDADES UI
// ══════════════════════════════════════════════════════════════

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showLoading(text) {
    document.getElementById('loadingText').textContent = text;
    document.getElementById('loadingOverlay').classList.add('active');
}

function hideLoading() {
    document.getElementById('loadingOverlay').classList.remove('active');
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    toast.innerHTML = `<span>${icons[type] || ''}</span><span>${message}</span>`;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('toast-exit');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

console.log('%c🧠 OsterwalderAI Architect', 'color: #00d4ff; font-size: 18px; font-weight: bold;');
console.log('%cConsultor de Negocios Inteligente — 100% Offline', 'color: #8888a0; font-size: 12px;');
