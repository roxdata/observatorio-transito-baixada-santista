// Observatório PI2-ANTI · Cross-filtering, mapa (Leaflet) e gráficos (Chart.js)
// Codificação visual segundo .agents/skills/designer-fix/SKILL.md
let mapInstance = null;
let heatLayer = null;
let markersLayer = null;
let chartMunicipios = null;
let chartSeveridade = null;
let chartTemporal = null;
let chartTipos = null;

// Estado global de filtros cruzados
const activeFilters = {
    ano: null,
    municipio: null,
    tipo_acidente: null,
    risco_pista_molhada: null, // 0 = seca, 1 = molhada
    mes: null,
    logradouro: null,
    bairro: null,
    lat: null,
    lng: null,
    locationLabel: null
};

const MUNICIPIO_COORDS = {
    'SANTOS': { coords: [-23.9608, -46.3331], zoom: 13 },
    'SAO VICENTE': { coords: [-23.9631, -46.3919], zoom: 13 },
    'PRAIA GRANDE': { coords: [-24.0058, -46.4028], zoom: 12 },
    'GUARUJA': { coords: [-23.9931, -46.2564], zoom: 13 },
    'CUBATAO': { coords: [-23.8950, -46.4253], zoom: 13 },
    'BERTIOGA': { coords: [-23.8544, -46.1386], zoom: 12 },
    'ITANHAEM': { coords: [-24.1831, -46.7889], zoom: 12 },
    'PERUIBE': { coords: [-24.3200, -46.9983], zoom: 12 },
    'MONGAGUA': { coords: [-24.0931, -46.6208], zoom: 13 },
    'TODOS': { coords: [-23.9650, -46.3600], zoom: 11 }
};

const NOME_MUN = {
    'SANTOS': 'Santos', 'SAO VICENTE': 'São Vicente', 'PRAIA GRANDE': 'Praia Grande',
    'GUARUJA': 'Guarujá', 'CUBATAO': 'Cubatão', 'BERTIOGA': 'Bertioga',
    'ITANHAEM': 'Itanhaém', 'PERUIBE': 'Peruíbe', 'MONGAGUA': 'Mongaguá'
};
const NOMES_MESES = ['', 'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// Paleta de alto contraste (espelha os tokens do CSS · nitidez para telas médias e projetores)
const C = {
    ink: '#0F1419', ink2: '#1E242B', ink3: '#2C353F',
    grid: '#DCD9D0', accent: '#1B456B', muted: '#9FB0C2',
    rain: '#1A5696', dry: '#7A828A', injury: '#D97706', fatal: '#A81425'
};

const fmtInt = n => (n || 0).toLocaleString('pt-BR');
const fmtDec = (n, d = 1) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const prettyMun = s => NOME_MUN[s] || s;
function prettyTipo(s) {
    if (!s) return s;
    const t = s.replace(/COLISAO/g, 'COLISÃO').replace(/TRANSITO/g, 'TRÂNSITO').replace(/VEICULO/g, 'VEÍCULO');
    return t.charAt(0) + t.slice(1).toLowerCase();
}

// ---------- Configuração global do Chart.js ----------
const getChartFontSize = () => window.innerWidth >= 1500 ? 14 : 13;
Chart.defaults.devicePixelRatio = Math.max(window.devicePixelRatio || 1, 2);
Chart.defaults.font.family = '"IBM Plex Sans", "Segoe UI", sans-serif';
Chart.defaults.font.size = getChartFontSize();
Chart.defaults.font.weight = '600';
Chart.defaults.color = C.ink;
Chart.defaults.animation.duration = 300;
Chart.defaults.elements.bar.borderRadius = 0;
Chart.defaults.elements.line.borderWidth = 2.5;
Chart.defaults.elements.point.radius = 0;
Chart.defaults.elements.point.hoverRadius = 5;
Object.assign(Chart.defaults.plugins.tooltip, {
    backgroundColor: C.ink, titleColor: '#fff', bodyColor: '#fff',
    cornerRadius: 0, padding: 10, boxPadding: 4,
    titleFont: { weight: '600', size: 13 }, bodyFont: { weight: '500', size: 13 }
});
Chart.defaults.plugins.legend.display = false;

// Rótulos diretos no fim das barras (Knaflic, 2015): fonte escura e nítida
const directLabels = {
    id: 'directLabels',
    defaults: { enabled: false, format: v => v },
    afterDatasetsDraw(chart, _args, opts) {
        if (!opts.enabled) return;
        const { ctx } = chart;
        const fSize = window.innerWidth >= 1500 ? 14 : 13;
        ctx.save();
        ctx.font = `700 ${fSize}px "IBM Plex Sans", "Segoe UI", sans-serif`;
        ctx.fillStyle = C.ink;
        chart.data.datasets.forEach((ds, i) => {
            const meta = chart.getDatasetMeta(i);
            if (meta.hidden || meta.type !== 'bar') return;
            meta.data.forEach((el, j) => {
                const v = ds.data[j];
                if (v === null || v === undefined) return;
                const txt = opts.format(v);
                if (chart.options.indexAxis === 'y') {
                    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
                    ctx.fillText(txt, el.x + 8, el.y);
                } else {
                    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
                    ctx.fillText(txt, el.x, el.y - 5);
                }
            });
        });
        ctx.restore();
    }
};
Chart.register(directLabels);

const pointerHover = (event, els) => { event.native.target.style.cursor = els[0] ? 'pointer' : 'default'; };

// ---------- Inicialização ----------
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    initEventListeners();
    const start = () => refreshDashboard();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(start); else start();
});

function initEventListeners() {
    const selectAno = document.getElementById('filter-ano');
    selectAno?.addEventListener('change', () => {
        const val = selectAno.value;
        activeFilters.ano = val === '0' ? null : parseInt(val);
        const notice = document.getElementById('coverage-notice');
        if (notice) notice.style.display = val === '2023' ? 'block' : 'none';
        renderFilterChips();
        refreshDashboard(false);
    });

    const selectMun = document.getElementById('filter-mun');
    selectMun?.addEventListener('change', () => {
        const val = selectMun.value;
        activeFilters.municipio = val === 'TODOS' ? null : val;
        flyToMunicipio(val);
        renderFilterChips();
        refreshDashboard(false);
    });

    const selectMes = document.getElementById('filter-mes');
    selectMes?.addEventListener('change', () => {
        const val = selectMes.value;
        activeFilters.mes = val === '0' ? null : parseInt(val);
        renderFilterChips();
        refreshDashboard(false);
    });

    document.getElementById('btn-reset-filters')?.addEventListener('click', resetAllFilters);
    document.getElementById('btn-clear-cross-filters')?.addEventListener('click', resetAllFilters);
}

function resetAllFilters() {
    Object.keys(activeFilters).forEach(k => { activeFilters[k] = null; });
    document.getElementById('filter-ano').value = '0';
    document.getElementById('filter-mun').value = 'TODOS';
    document.getElementById('filter-mes').value = '0';
    const notice = document.getElementById('coverage-notice');
    if (notice) notice.style.display = 'none';
    renderFilterChips();
    flyToMunicipio('TODOS');
    refreshDashboard(false);
}

function removeFilter(key) {
    if (key === 'ano') {
        activeFilters.ano = null;
        document.getElementById('filter-ano').value = '0';
        const notice = document.getElementById('coverage-notice');
        if (notice) notice.style.display = 'none';
    } else if (key === 'municipio') {
        activeFilters.municipio = null;
        document.getElementById('filter-mun').value = 'TODOS';
        flyToMunicipio('TODOS');
    } else if (key === 'location') {
        activeFilters.logradouro = null;
        activeFilters.bairro = null;
        activeFilters.lat = null;
        activeFilters.lng = null;
        activeFilters.locationLabel = null;
    } else if (key === 'mes') {
        activeFilters.mes = null;
        document.getElementById('filter-mes').value = '0';
    } else {
        activeFilters[key] = null;
    }
    renderFilterChips();
    refreshDashboard(false);
}

function renderFilterChips() {
    const container = document.getElementById('active-filters-container');
    const chipsBox = document.getElementById('active-filters-chips');
    if (!container || !chipsBox) return;

    chipsBox.innerHTML = '';
    const chips = [];
    if (activeFilters.municipio) chips.push({ key: 'municipio', label: `Município: ${prettyMun(activeFilters.municipio)}` });
    if (activeFilters.ano) chips.push({ key: 'ano', label: `Ano: ${activeFilters.ano}` });
    if (activeFilters.mes) chips.push({ key: 'mes', label: `Mês: ${NOMES_MESES[activeFilters.mes]}` });
    if (activeFilters.tipo_acidente) chips.push({ key: 'tipo_acidente', label: `Tipo: ${prettyTipo(activeFilters.tipo_acidente)}` });
    if (activeFilters.risco_pista_molhada !== null) {
        chips.push({ key: 'risco_pista_molhada', label: activeFilters.risco_pista_molhada === 1 ? 'Pista molhada' : 'Pista seca' });
    }
    if (activeFilters.locationLabel || activeFilters.logradouro || activeFilters.bairro) {
        chips.push({ key: 'location', label: `Local: ${activeFilters.locationLabel || activeFilters.logradouro || activeFilters.bairro}` });
    }

    if (chips.length > 0) {
        container.style.display = 'flex';
        chips.forEach(c => {
            const chipEl = document.createElement('div');
            chipEl.className = 'filter-chip';
            chipEl.innerHTML = `<span>${c.label}</span><span class="filter-chip-remove" role="button" tabindex="0" onclick="removeFilter('${c.key}')" title="Remover filtro" aria-label="Remover filtro">×</span>`;
            chipsBox.appendChild(chipEl);
        });
    } else {
        container.style.display = 'none';
    }
}

function buildQueryString() {
    const p = new URLSearchParams();
    if (activeFilters.ano) p.append('ano', activeFilters.ano);
    if (activeFilters.municipio) p.append('municipio', activeFilters.municipio);
    if (activeFilters.tipo_acidente) p.append('tipo_acidente', activeFilters.tipo_acidente);
    if (activeFilters.risco_pista_molhada !== null) p.append('risco_pista_molhada', activeFilters.risco_pista_molhada);
    if (activeFilters.mes) p.append('mes', activeFilters.mes);
    if (activeFilters.logradouro) p.append('logradouro', activeFilters.logradouro);
    if (activeFilters.bairro) p.append('bairro', activeFilters.bairro);
    if (activeFilters.lat && activeFilters.lng) {
        p.append('lat', activeFilters.lat);
        p.append('lng', activeFilters.lng);
        p.append('radius_km', 1.0);
    }
    return p.toString();
}

// Descrição textual do recorte, usada na manchete
function describeScope() {
    const parts = [];
    parts.push(activeFilters.municipio ? `em ${prettyMun(activeFilters.municipio)}` : 'na Baixada Santista');
    if (activeFilters.mes && activeFilters.ano) parts.push(`em ${NOMES_MESES[activeFilters.mes]}/${activeFilters.ano}`);
    else if (activeFilters.ano) parts.push(`em ${activeFilters.ano}`);
    else if (activeFilters.mes) parts.push(`nos meses de ${NOMES_MESES[activeFilters.mes]}`);
    if (activeFilters.tipo_acidente) parts.push(`(${prettyTipo(activeFilters.tipo_acidente).toLowerCase()})`);
    return parts.join(' ');
}

function refreshDashboard(shouldFly = false) {
    updateKPIs();
    updateCharts();
    updateMap();
    updateInsights();
    if (shouldFly && activeFilters.municipio) flyToMunicipio(activeFilters.municipio);
}

function flyToMunicipio(munKey) {
    const target = MUNICIPIO_COORDS[munKey] || MUNICIPIO_COORDS['TODOS'];
    if (mapInstance) mapInstance.flyTo(target.coords, target.zoom, { duration: 1.0, easeLinearity: 0.25 });
}

// ---------- 1. KPIs ----------
async function updateKPIs() {
    try {
        const res = await fetch(`/api/kpis?${buildQueryString()}`);
        const d = await res.json();
        document.getElementById('kpi-total').innerText = fmtInt(d.total_acidentes);
        document.getElementById('kpi-fatais').innerText = fmtInt(d.total_fatais);
        document.getElementById('kpi-taxa-let').innerText = `${fmtDec(d.taxa_letalidade, 2)}%`;
        document.getElementById('kpi-vitimas').innerText = fmtInt(d.total_com_vitimas);
        document.getElementById('kpi-chuva').innerText = fmtInt(d.total_pista_molhada);
        document.getElementById('kpi-pct-chuva').innerText = `${fmtDec(d.taxa_pista_molhada, 1)}%`;
        document.getElementById('kpi-rodovias').innerText = fmtInt(d.total_rodovias);
        document.getElementById('kpi-pct-rodovias').innerText = `${fmtDec(d.taxa_rodovias, 1)}%`;
    } catch (e) {
        console.error('Erro ao atualizar KPIs:', e);
    }
}

// ---------- 2. Mapa ----------
function initMap() {
    const esri = path => `https://server.arcgisonline.com/ArcGIS/rest/services/${path}/MapServer/tile/{z}/{y}/{x}`;
    const grayBase = L.tileLayer(esri('Canvas/World_Light_Gray_Base'), { attribution: 'Base &copy; Esri, HERE, Garmin', maxZoom: 16 });
    const grayRef = L.tileLayer(esri('Canvas/World_Light_Gray_Reference'), { maxZoom: 16, pane: 'overlayPane' });
    const streets = L.tileLayer(esri('World_Street_Map'), { attribution: 'Base &copy; Esri, HERE, Garmin', maxZoom: 19 });
    const imagery = L.tileLayer(esri('World_Imagery'), { attribution: 'Imagem &copy; Esri, Maxar', maxZoom: 18 });

    const lightGray = L.layerGroup([grayBase, grayRef]);

    mapInstance = L.map('map-container', {
        center: [-23.9650, -46.3600],
        zoom: 11,
        layers: [lightGray],
        scrollWheelZoom: false
    });
    // Zoom por roda só após clicar no mapa (evita "sequestrar" a rolagem da página)
    mapInstance.on('click', () => mapInstance.scrollWheelZoom.enable());
    mapInstance.on('mouseout', () => mapInstance.scrollWheelZoom.disable());

    L.control.layers({ 'Cinza claro (padrão)': lightGray, 'Ruas': streets, 'Satélite': imagery }, null, { position: 'topright' }).addTo(mapInstance);
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(mapInstance);
    markersLayer = L.layerGroup().addTo(mapInstance);
}

window.filtrarPorLocal = function (mun, logr, bai, lat, lng) {
    if (mun && mun !== 'NI') {
        activeFilters.municipio = mun;
        document.getElementById('filter-mun').value = mun;
    }
    if (logr && logr !== 'NI') {
        activeFilters.logradouro = logr;
        activeFilters.locationLabel = logr;
    } else if (bai && bai !== 'NI') {
        activeFilters.bairro = bai;
        activeFilters.locationLabel = `Bairro ${bai}`;
    }
    activeFilters.lat = lat;
    activeFilters.lng = lng;
    renderFilterChips();
    refreshDashboard(false);
    mapInstance.setView([lat, lng], 15);
};

async function updateMap() {
    try {
        const res = await fetch(`/api/map/hotspots?limit=2500&${buildQueryString()}`);
        const points = await res.json();

        if (heatLayer) mapInstance.removeLayer(heatLayer);
        if (markersLayer) markersLayer.clearLayers();

        heatLayer = L.heatLayer(points.map(p => [p.lat, p.lng, p.intensity]), {
            radius: 12, blur: 14, maxZoom: 15, minOpacity: 0.25,
            gradient: { 0.25: '#D1E5F0', 0.5: '#4393C3', 0.75: '#F4A582', 1.0: '#B2182B' }
        }).addTo(mapInstance);

        // Severidade codificada por cor E tamanho (não depender só da cor)
        points.filter(p => p.intensity >= 0.7).slice(0, 80).forEach(p => {
            const isFatal = p.intensity === 1.0;
            const circle = L.circleMarker([p.lat, p.lng], {
                radius: isFatal ? 6 : 4,
                fillColor: isFatal ? C.fatal : C.injury,
                color: '#FFFFFF', weight: 1, opacity: 1, fillOpacity: 0.95
            });

            const esc = s => (s || '').replace(/'/g, "\\'");
            const logrSafe = p.logradouro && p.logradouro !== 'NI' ? esc(p.logradouro) : '';
            const baiSafe = p.bairro && p.bairro !== 'NI' ? esc(p.bairro) : '';
            const row = (k, v) => (v && v !== 'NI') ? `<dt>${k}</dt><dd>${v}</dd>` : '';

            circle.bindPopup(`
                <div class="popup-title ${isFatal ? 'fatal' : 'injury'}">${isFatal ? 'Sinistro fatal' : 'Sinistro com vítima'}</div>
                <dl class="popup-dl">
                    ${row('Município', prettyMun(p.municipio))}
                    ${row('Bairro', p.bairro)}
                    ${row('Via', p.logradouro)}
                    ${row('Tipo', prettyTipo(p.tipo))}
                    ${row('Data', p.data)}
                    ${row('Pista', p.pista_molhada === 1 ? 'Molhada' : 'Seca')}
                </dl>
                <button class="btn-filter-here" onclick="window.filtrarPorLocal('${esc(p.municipio)}', '${logrSafe}', '${baiSafe}', ${p.lat}, ${p.lng})">Filtrar o painel por este local</button>
            `);
            markersLayer.addLayer(circle);
        });
    } catch (e) {
        console.error('Erro ao atualizar mapa:', e);
    }
}

// ---------- 3. Gráficos ----------
function updateCharts() {
    updateChartMunicipios();
    updateChartSeveridade();
    updateChartTemporal();
    updateChartTipos();
}

const valueAxis = (extra = {}) => ({
    grid: { color: C.grid, drawTicks: false },
    border: { display: false },
    ticks: { color: C.ink2, font: { size: getChartFontSize() - 1, weight: '600' }, padding: 6, ...extra }
});
const categoryAxis = (extra = {}) => ({
    grid: { display: false },
    border: { display: false },
    ticks: { color: C.ink, font: { size: getChartFontSize(), weight: '600' }, ...extra }
});

async function updateChartMunicipios() {
    try {
        const res = await fetch(`/api/charts/municipios?${buildQueryString()}`);
        const data = await res.json();
        const total = data.data.reduce((a, b) => a + b, 0) || 1;

        if (data.labels.length) {
            const top = data.labels[0];
            const pct = (data.data[0] / total) * 100;
            document.getElementById('takeaway-municipios').textContent =
                `${prettyMun(top)} concentra ${fmtDec(pct, 0)}% dos sinistros do recorte`;
        }

        if (chartMunicipios) chartMunicipios.destroy();
        chartMunicipios = new Chart(document.getElementById('chart-municipios'), {
            type: 'bar',
            data: {
                labels: data.labels,
                datasets: [{
                    label: 'Sinistros',
                    data: data.data,
                    backgroundColor: data.labels.map(l => (!activeFilters.municipio || l === activeFilters.municipio) ? C.accent : C.muted),
                    barPercentage: 0.75, categoryPercentage: 0.9
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { right: 68 } },
                onClick: (_e, els) => {
                    if (!els.length) return;
                    const cidade = chartMunicipios.data.labels[els[0].index];
                    if (activeFilters.municipio === cidade) {
                        activeFilters.municipio = null;
                        document.getElementById('filter-mun').value = 'TODOS';
                        flyToMunicipio('TODOS');
                    } else {
                        activeFilters.municipio = cidade;
                        document.getElementById('filter-mun').value = cidade;
                        flyToMunicipio(cidade);
                    }
                    renderFilterChips();
                    refreshDashboard(false);
                },
                onHover: pointerHover,
                plugins: {
                    directLabels: { enabled: true, format: v => fmtInt(v) },
                    tooltip: { callbacks: {
                        title: items => prettyMun(items[0].label),
                        label: ctx => `${fmtInt(ctx.raw)} sinistros (${fmtDec(ctx.raw / total * 100, 1)}%)`
                    } }
                },
                scales: {
                    x: { ...valueAxis({ callback: v => fmtInt(v) }), display: false },
                    y: categoryAxis({ callback: function (v) { return prettyMun(this.getLabelForValue(v)); } })
                }
            }
        });
    } catch (e) { console.error(e); }
}

async function updateChartSeveridade() {
    try {
        const res = await fetch(`/api/charts/severidade?${buildQueryString()}`);
        const data = await res.json();
        // data.vitimas = [seca, molhada]; data.fatais = [seca, molhada]
        const [vSeca, vMol] = data.vitimas;
        const [totSeca, totMol] = data.totais_condicao || [0, 0];
        const [qVitSeca, qVitMol] = data.qtd_vitimas || [0, 0];
        const diff = vMol - vSeca;

        const noticeSev = document.getElementById('notice-severidade');
        if (totSeca + totMol === 0) {
            document.getElementById('takeaway-severidade').textContent = 'Sem registros de condição de pista no recorte';
            if (noticeSev) {
                noticeSev.style.display = 'block';
                noticeSev.innerHTML = '<strong>Nota do período:</strong> Não há sinistros registrados neste recorte para comparação entre pista seca e molhada.';
            }
        } else {
            document.getElementById('takeaway-severidade').textContent = Math.abs(diff) < 0.5
                ? `Proporção de vítimas é semelhante com pista seca e molhada (${fmtDec(vSeca)}% × ${fmtDec(vMol)}%)`
                : `Com pista molhada, ${fmtDec(vMol)}% dos sinistros têm vítimas, contra ${fmtDec(vSeca)}% com pista seca`;

            if (noticeSev) {
                if (totMol > 0 && qVitMol === 0) {
                    noticeSev.style.display = 'block';
                    noticeSev.innerHTML = `<strong>Nota do recorte:</strong> Houve <strong>${fmtInt(totMol)} sinistros em pista molhada</strong> e <strong>${fmtInt(totSeca)} em pista seca</strong> neste período, porém os ${fmtInt(qVitSeca)} sinistros com vítimas/fatais concentraram-se em pista seca (${fmtInt(qVitMol)} vítimas em pista molhada = 0,0%).`;
                } else if (totMol === 0) {
                    noticeSev.style.display = 'block';
                    noticeSev.innerHTML = `<strong>Nota do recorte:</strong> Todos os ${fmtInt(totSeca)} sinistros deste recorte ocorreram em condição de pista seca (0 ocorrências em pista molhada).`;
                } else {
                    noticeSev.style.display = 'none';
                    noticeSev.innerHTML = '';
                }
            }
        }

        const sel = activeFilters.risco_pista_molhada;
        const alpha = (cond, color) => (sel === null || sel === cond) ? color : color + '55';

        if (chartSeveridade) chartSeveridade.destroy();
        chartSeveridade = new Chart(document.getElementById('chart-severidade'), {
            type: 'bar',
            data: {
                labels: ['Com vítima', 'Fatal'],
                datasets: [
                    { label: `Pista seca (n=${fmtInt(totSeca)})`, data: [vSeca, data.fatais[0]], backgroundColor: alpha(0, C.dry), barPercentage: 0.8, categoryPercentage: 0.7 },
                    { label: `Pista molhada (n=${fmtInt(totMol)})`, data: [vMol, data.fatais[1]], backgroundColor: alpha(1, C.rain), barPercentage: 0.8, categoryPercentage: 0.7 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 26 } },
                onClick: (_e, els) => {
                    if (!els.length) return;
                    const cond = els[0].datasetIndex; // 0 = seca, 1 = molhada
                    activeFilters.risco_pista_molhada = activeFilters.risco_pista_molhada === cond ? null : cond;
                    renderFilterChips();
                    refreshDashboard(false);
                },
                onHover: pointerHover,
                plugins: {
                    legend: {
                        display: true, position: 'top', align: 'start',
                        labels: { boxWidth: 13, boxHeight: 13, color: C.ink, font: { size: getChartFontSize(), weight: '600' } }
                    },
                    directLabels: { enabled: true, format: v => `${fmtDec(v)}%` },
                    tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmtDec(ctx.raw, 2)}%` } }
                },
                scales: {
                    x: categoryAxis(),
                    y: { ...valueAxis({ callback: v => `${v}%` }), beginAtZero: true, grace: '10%' }
                }
            }
        });
    } catch (e) { console.error(e); }
}

async function updateChartTemporal() {
    try {
        const res = await fetch(`/api/charts/temporal?${buildQueryString()}`);
        const data = await res.json();

        if (data.acidentes.length) {
            const iMax = data.acidentes.indexOf(Math.max(...data.acidentes));
            const [mm, yyyy] = data.labels[iMax].split('/');
            document.getElementById('takeaway-temporal').textContent =
                `Pico em ${NOMES_MESES[parseInt(mm)]}/${yyyy}, com ${fmtInt(data.acidentes[iMax])} sinistros`;
        }

        const selLabel = activeFilters.mes && activeFilters.ano ? `${String(activeFilters.mes).padStart(2, '0')}/${activeFilters.ano}` : null;
        const prettyX = l => { const [m, y] = l.split('/'); return `${NOMES_MESES[parseInt(m)]}/${y.slice(2)}`; };

        if (chartTemporal) chartTemporal.destroy();
        chartTemporal = new Chart(document.getElementById('chart-temporal'), {
            data: {
                labels: data.labels,
                datasets: [
                    {
                        type: 'line', label: 'Sinistros', data: data.acidentes,
                        borderColor: C.accent, backgroundColor: C.accent, tension: 0.2, yAxisID: 'y',
                        pointRadius: data.labels.map(l => l === selLabel ? 5 : 0)
                    },
                    {
                        type: 'bar', label: 'Chuva média (mm/h)', data: data.chuva_media,
                        backgroundColor: data.labels.map(l => (!selLabel || l === selLabel) ? C.rain : C.rain + '55'),
                        yAxisID: 'y1', barPercentage: 0.8, categoryPercentage: 0.95
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                onClick: (_e, els) => {
                    if (!els.length) return;
                    const [m, y] = chartTemporal.data.labels[els[0].index].split('/').map(Number);
                    if (activeFilters.mes === m && activeFilters.ano === y) {
                        activeFilters.mes = null;
                        document.getElementById('filter-mes').value = '0';
                    } else {
                        activeFilters.mes = m;
                        activeFilters.ano = y;
                        document.getElementById('filter-ano').value = String(y);
                        document.getElementById('filter-mes').value = String(m);
                    }
                    renderFilterChips();
                    refreshDashboard(false);
                },
                onHover: pointerHover,
                plugins: {
                    tooltip: { callbacks: {
                        title: items => prettyX(items[0].label),
                        label: ctx => ctx.datasetIndex === 0 ? `Sinistros: ${fmtInt(ctx.raw)}` : `Chuva média: ${fmtDec(ctx.raw, 2)} mm/h`
                    } }
                },
                scales: {
                    x: categoryAxis({ color: C.ink2, maxRotation: 0, autoSkip: true, maxTicksLimit: 12, callback: function (v) { return prettyX(this.getLabelForValue(v)); } }),
                    // Small multiples: dois painéis empilhados no mesmo eixo X (sem eixo duplo)
                    y: {
                        ...valueAxis({ callback: v => fmtInt(v), maxTicksLimit: 4 }),
                        stack: 'tempo', stackWeight: 2, offset: true,
                        title: { display: true, text: 'Sinistros/mês', color: C.accent, font: { size: getChartFontSize(), weight: '700' } }
                    },
                    y1: {
                        ...valueAxis({ callback: v => fmtDec(v, 1), maxTicksLimit: 3 }),
                        stack: 'tempo', stackWeight: 1, offset: true, beginAtZero: true,
                        title: { display: true, text: 'Chuva (mm/h)', color: C.rain, font: { size: getChartFontSize(), weight: '700' } }
                    }
                }
            }
        });
    } catch (e) { console.error(e); }
}

async function updateChartTipos() {
    try {
        const res = await fetch(`/api/charts/tipos?${buildQueryString()}`);
        const data = await res.json();
        const noticeTipos = document.getElementById('notice-tipos');
        const totalNi = data.total_ni || 0;

        let chartLabels = data.labels;
        let chartData = data.data;

        if (data.labels.length) {
            document.getElementById('takeaway-tipos').textContent =
                `${prettyTipo(data.labels[0])} é o tipo mais frequente (${fmtInt(data.data[0])} registros)`;
            if (noticeTipos) {
                noticeTipos.style.display = 'none';
                noticeTipos.innerHTML = '';
            }
        } else if (totalNi > 0) {
            document.getElementById('takeaway-tipos').textContent =
                `Tipologia não classificada na origem (${fmtInt(totalNi)} registros como “NI”)`;
            chartLabels = ['Não informado na base RENAEST (NI)'];
            chartData = [totalNi];
            if (noticeTipos) {
                noticeTipos.style.display = 'block';
                noticeTipos.innerHTML = `<strong>Nota do período:</strong> Nos lotes de 2025 para o Estado de São Paulo, a SENATRAN/RENAEST exportou a coluna <code>tp_acidente = DESCONHECIDO</code> em 100% dos ${fmtInt(totalNi)} registros do recorte (padronizados no ETL como <code>NI</code>). Este aviso desaparece automaticamente ao selecionar outro período com tipologia classificada.`;
            }
        } else {
            document.getElementById('takeaway-tipos').textContent = 'Sem registros de tipologia no recorte';
            if (noticeTipos) {
                noticeTipos.style.display = 'block';
                noticeTipos.innerHTML = '<strong>Nota do período:</strong> Não há registros de sinistros disponíveis para este recorte.';
            }
        }

        if (chartTipos) chartTipos.destroy();
        chartTipos = new Chart(document.getElementById('chart-tipos'), {
            type: 'bar',
            data: {
                labels: chartLabels,
                datasets: [{
                    label: 'Sinistros',
                    data: chartData,
                    backgroundColor: chartLabels.map(l => l.includes('(NI)') ? C.muted : ((!activeFilters.tipo_acidente || l === activeFilters.tipo_acidente) ? C.accent : C.muted)),
                    barPercentage: 0.75, categoryPercentage: 0.9
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { right: 68 } },
                onClick: (_e, els) => {
                    if (!els.length) return;
                    const tipo = chartTipos.data.labels[els[0].index];
                    if (tipo.includes('(NI)')) return;
                    activeFilters.tipo_acidente = activeFilters.tipo_acidente === tipo ? null : tipo;
                    renderFilterChips();
                    refreshDashboard(false);
                },
                onHover: pointerHover,
                plugins: {
                    directLabels: { enabled: true, format: v => fmtInt(v) },
                    tooltip: { callbacks: { title: items => prettyTipo(items[0].label), label: ctx => `${fmtInt(ctx.raw)} sinistros` } }
                },
                scales: {
                    x: { ...valueAxis(), display: false },
                    y: categoryAxis({ callback: function (v) { return prettyTipo(this.getLabelForValue(v)); } })
                }
            }
        });
    } catch (e) { console.error(e); }
}

// ---------- 4. Evidência estatística + manchete ----------
async function updateInsights() {
    const badge = document.getElementById('insights-hypothesis-badge');
    const headline = document.getElementById('headline-finding');
    if (badge) { badge.className = 'verdict loading'; badge.textContent = 'calculando'; }

    try {
        const res = await fetch(`/api/insights?${buildQueryString()}`);
        const d = await res.json();
        const hasOr = d.odds_ratio !== null && d.odds_ratio !== undefined;
        const or = hasOr ? Number(d.odds_ratio) : null;
        const varPct = hasOr ? (or - 1) * 100 : null;
        const scope = describeScope();

        // Veredito
        if (badge) {
            if (!hasOr) { badge.className = 'verdict refuted'; badge.textContent = 'sem registros no recorte'; }
            else if (d.hipotese_validada) { badge.className = 'verdict confirmed'; badge.textContent = 'H₁ sustentada'; }
            else { badge.className = 'verdict refuted'; badge.textContent = 'H₁ não sustentada no recorte'; }
        }

        // Manchete (título-conclusão)
        if (headline) {
            if (!hasOr) {
                headline.innerHTML = `Sem registros de sinistros disponíveis ${scope} (ver nota metodológica no diagnóstico).`;
            } else if (or >= 1.05) {
                headline.innerHTML = `Com chuva acima de 5 mm ou pista molhada, a chance de um sinistro ter vítimas é <em>${fmtDec(varPct, 0)}% maior</em> ${scope} (odds ratio ${fmtDec(or, 2)}).`;
            } else if (or <= 0.95) {
                headline.innerHTML = `${scope.charAt(0).toUpperCase() + scope.slice(1)}, a pista molhada <em>não</em> elevou a chance de vítimas (odds ratio ${fmtDec(or, 2)}); recorte pequeno exige cautela.`;
            } else {
                headline.innerHTML = `${scope.charAt(0).toUpperCase() + scope.slice(1)}, a chance de vítimas é praticamente igual com pista seca ou molhada (odds ratio ${fmtDec(or, 2)}).`;
            }
        }

        // Tabela de contingência
        if (d.tabela) {
            ['a', 'b', 'c', 'd'].forEach(k => {
                const el = document.getElementById(`ct-${k}`);
                if (el) el.textContent = fmtInt(d.tabela[k]);
            });
        }

        document.getElementById('insight-or-value').textContent = hasOr ? fmtDec(or, 3) : '—';
        document.getElementById('insight-risk-pct').textContent = hasOr ? `${varPct >= 0 ? '+' : ''}${fmtDec(varPct, 1)}%` : '—';
        document.getElementById('insight-letality').textContent = d.taxa_letalidade != null ? `${fmtDec(d.taxa_letalidade, 2)}%` : '—';
        const chiEl = document.getElementById('insight-chi2');
        if (chiEl) {
            chiEl.textContent = d.chi2 != null
                ? `${fmtDec(d.chi2, 1)}${d.p_valor != null ? (d.p_valor < 0.001 ? ' · p<0,001' : ` · p=${fmtDec(d.p_valor, 3)}`) : ''}`
                : '—';
        }

        const kpiOr = document.getElementById('kpi-or-subtext');
        if (kpiOr) kpiOr.textContent = hasOr ? `${fmtDec(or, 2)} (${varPct >= 0 ? '+' : ''}${fmtDec(varPct, 0)}%)` : '—';

        document.getElementById('insight-evidencia').textContent = d.evidencia_estatistica || '';
        document.getElementById('insight-diagnostico').textContent = d.diagnostico || '';

        const recEl = document.getElementById('insight-recomendacoes');
        if (recEl && d.recomendacoes?.length) recEl.innerHTML = d.recomendacoes.map(r => `<li>${r}</li>`).join('');
    } catch (e) {
        console.error('Erro ao atualizar evidências:', e);
        if (badge) { badge.className = 'verdict refuted'; badge.textContent = 'erro no cálculo'; }
    }
}
