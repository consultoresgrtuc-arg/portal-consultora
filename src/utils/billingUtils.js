/**
 * Utilidades puras y constantes compartidas para el módulo de Facturación.
 */

export const WEBHOOK_URL = "https://us-central1-gyrconsultores-82422.cloudfunctions.net/whatsappWebhook";

export const MONTHS = [
    { value: 'todos', label: 'Todos los Meses' },
    { value: '1', label: 'Enero' },
    { value: '2', label: 'Febrero' },
    { value: '3', label: 'Marzo' },
    { value: '4', label: 'Abril' },
    { value: '5', label: 'Mayo' },
    { value: '6', label: 'Junio' },
    { value: '7', label: 'Julio' },
    { value: '8', label: 'Agosto' },
    { value: '9', label: 'Septiembre' },
    { value: '10', label: 'Octubre' },
    { value: '11', label: 'Noviembre' },
    { value: '12', label: 'Diciembre' }
];

export const MAX_FILES = 10;
export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
export const MAX_TOTAL_SIZE = 30 * 1024 * 1024; // 30 MB
export const SAFE_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
export const SAFE_IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];

/** Parsea montos contables en formato AR ($ 150.000,50), EN (150,000.50) o numérico. */
export const parseAmount = (val) => {
    if (typeof val === 'number') {
        return isNaN(val) ? 0 : val;
    }
    if (!val) return 0;
    let s = String(val).trim().replace(/[$\s]/g, '');
    if (s.includes('.') && s.includes(',')) {
        if (s.indexOf('.') < s.indexOf(',')) {
            // Formato AR: 150.000,50 -> 150000.50
            s = s.replace(/\./g, '').replace(',', '.');
        } else {
            // Formato EN: 150,000.50 -> 150000.50
            s = s.replace(/,/g, '');
        }
    } else if (s.includes(',')) {
        s = s.replace(',', '.');
    } else if (s.includes('.')) {
        const parts = s.split('.');
        if (parts.length === 2 && parts[1].length === 3 && parseInt(parts[0], 10) > 0) {
            // Caso común de miles sin decimales: 150.000
            s = parts[0] + parts[1];
        } else if (parts.length > 2) {
            // Caso millones: 1.500.000
            s = parts.join('');
        }
    }
    const num = parseFloat(s);
    return isNaN(num) ? 0 : num;
};

/** Parsea fechas locales soportando DD/MM/YYYY, DD/MM/YY, DD-MM-YYYY, YYYY-MM-DD, Timestamp y Date. */
export const parseLocalDate = (dateVal) => {
    const currentYear = new Date().getFullYear();
    let result = null;

    if (!dateVal) {
        result = new Date();
    } else if (dateVal instanceof Date && !isNaN(dateVal.getTime())) {
        result = new Date(dateVal);
    } else if (dateVal?.toDate && typeof dateVal.toDate === 'function') {
        try {
            const d = dateVal.toDate();
            if (!isNaN(d.getTime())) result = d;
        } catch (e) { /* Ignorar timestamp inválido */ }
    }

    if (!result) {
        const s = String(dateVal).trim();
        // Soporta DD/MM/YYYY o DD/MM/YY (ej: 03/10/26)
        const dmyMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
        if (dmyMatch) {
            const day = parseInt(dmyMatch[1], 10);
            const month = parseInt(dmyMatch[2], 10) - 1;
            let year = parseInt(dmyMatch[3], 10);
            if (year < 100) year += 2000; // Ej: 26 -> 2026
            const d = new Date(year, month, day, 12, 0, 0);
            if (!isNaN(d.getTime())) result = d;
        } else {
            const ymdMatch = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
            if (ymdMatch) {
                const year = parseInt(ymdMatch[1], 10);
                const month = parseInt(ymdMatch[2], 10) - 1;
                const day = parseInt(ymdMatch[3], 10);
                const d = new Date(year, month, day, 12, 0, 0);
                if (!isNaN(d.getTime())) result = d;
            } else {
                const parsed = new Date(s);
                if (!isNaN(parsed.getTime())) result = parsed;
            }
        }
    }

    if (!result || isNaN(result.getTime())) {
        result = new Date();
    }

    // Si la IA o comprobante antiguo leyó un año del pasado, ajustar defensivamente al ejercicio corriente
    if (result.getFullYear() < currentYear) {
        result.setFullYear(currentYear);
    }

    return result;
};

/** Detecta fechas dudosas o fuera del ejercicio fiscal corriente. */
export const checkSuspiciousDate = (dateVal) => {
    if (!dateVal) return null;
    const currentYear = new Date().getFullYear();
    const now = new Date();

    let originalYear = null;
    let originalMonth = null;
    let originalDay = null;

    const s = String(dateVal).trim();
    const dmyMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (dmyMatch) {
        originalDay = parseInt(dmyMatch[1], 10);
        originalMonth = parseInt(dmyMatch[2], 10);
        let y = parseInt(dmyMatch[3], 10);
        if (y < 100) y += 2000;
        originalYear = y;
    } else {
        const ymdMatch = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
        if (ymdMatch) {
            originalYear = parseInt(ymdMatch[1], 10);
            originalMonth = parseInt(ymdMatch[2], 10);
            originalDay = parseInt(ymdMatch[3], 10);
        } else {
            const parsed = new Date(s);
            if (!isNaN(parsed.getTime())) {
                originalYear = parsed.getFullYear();
                originalMonth = parsed.getMonth() + 1;
                originalDay = parsed.getDate();
            }
        }
    }

    if (!originalYear || isNaN(originalYear)) return null;

    const isPastYear = originalYear < currentYear;
    const isFutureYear = originalYear > currentYear;

    if (isPastYear || isFutureYear) {
        const pad = (n) => String(n).padStart(2, '0');
        const safeMonth = (originalMonth >= 1 && originalMonth <= 12) ? originalMonth : (now.getMonth() + 1);
        const safeDay = (originalDay >= 1 && originalDay <= 31) ? originalDay : now.getDate();

        const suggestedCorrectedDate = `${currentYear}-${pad(safeMonth)}-${pad(safeDay)}`;
        const suggestedCorrectedDisplay = `${pad(safeDay)}/${pad(safeMonth)}/${currentYear}`;
        const todayDate = `${currentYear}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
        const todayDisplay = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${currentYear}`;

        return {
            isSuspicious: true,
            detectedYear: originalYear,
            currentYear,
            originalDateFormatted: `${pad(safeDay)}/${pad(safeMonth)}/${originalYear}`,
            suggestedCorrectedDate,
            suggestedCorrectedDisplay,
            todayDate,
            todayDisplay,
            reason: isPastYear
                ? `La IA detectó el año ${originalYear}, pero el ejercicio actual de trabajo es ${currentYear}. Podría ser un comprobante antiguo subido por error o una lectura errónea de la IA (ej. interpretar el año '26' como '24').`
                : `La IA detectó una fecha en el año futuro ${originalYear}. Se recomienda verificar.`
        };
    }

    return null;
};

/** Normaliza un CUIT eliminando guiones y caracteres no numéricos. */
export const cleanCuit = (c) => (c ? String(c).replace(/\D/g, '') : '');

/** Valida que una URL de vista previa tenga un protocolo seguro permitido. */
export const getSafePreviewUrl = (url) => {
    if (!url || typeof url !== 'string') return '';
    if (url.startsWith('blob:') || url.startsWith('https://') || url.startsWith('http://')) {
        return url;
    }
    return '';
};

/** Formatea montos numéricos en moneda ARS (es-AR). */
export const formatCurrency = (value) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(Number(value) || 0);
