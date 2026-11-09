import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export const TIPOS_DOCUMENTO = ['CUIT', 'CUIL', 'CDI'];

export const MOTIVOS_PAGO = [
    'Varios',
    'Factura',
    'Orden de pago',
    'Alquiler',
    'Expensas',
    'Servicios'
];

export const CLAUSULAS_CHEQUE = [
    {
        value: 'A la orden',
        label: 'A la orden',
        description: 'El beneficiario puede endosar el cheque'
    },
    {
        value: 'No a la orden',
        label: 'No a la orden',
        description: 'El beneficiario puede ceder el cheque'
    }
];

export const ECHEQ_FIELD_DEFINITIONS = [
    {
        campo: 'COL_1',
        defCampo: 'Tipo de documento',
        longitud: 4,
        tipo: 'AN',
        observaciones: 'CUIT, CUIL O CDI',
        ejemplo: 'CUIT',
        obligatorio: true
    },
    {
        campo: 'COL_2',
        defCampo: 'Nro. de documento',
        longitud: 11,
        tipo: 'N',
        observaciones: 'Sin puntos, comas, ni guiones',
        ejemplo: '30398521151',
        obligatorio: true
    },
    {
        campo: 'COL_3',
        defCampo: 'Monto',
        longitud: 18,
        tipo: 'N',
        observaciones: 'Separar los decimales con coma (,)',
        ejemplo: '1300,3',
        obligatorio: true
    },
    {
        campo: 'COL_4',
        defCampo: 'Fecha de pago',
        longitud: 10,
        tipo: 'AN',
        observaciones: 'Formato: DD/MM/AAAA',
        ejemplo: '20/08/2019',
        obligatorio: true
    },
    {
        campo: 'COL_5',
        defCampo: 'Motivo de pago',
        longitud: 100,
        tipo: 'AN',
        observaciones: 'Motivo de pago del cheque: Varios, Factura, Orden de pago, Alquiler, Expensas, Servicios',
        ejemplo: 'Varios',
        obligatorio: true
    },
    {
        campo: 'COL_6',
        defCampo: 'Referencia pago',
        longitud: 100,
        tipo: 'AN',
        observaciones: 'Referencia pago (no obligatorio) NOTA: si se completa valor referencia pago, se deberá llenar este campo',
        ejemplo: '',
        obligatorio: false
    },
    {
        campo: 'COL_7',
        defCampo: 'Valor referencia pago',
        longitud: 50,
        tipo: 'AN',
        observaciones: 'Valor referencia pago (no obligatorio) NOTA: si se completa referencia pago, se deberá llenar este campo',
        ejemplo: '',
        obligatorio: false
    },
    {
        campo: 'COL_8',
        defCampo: 'Mail',
        longitud: 150,
        tipo: 'AN',
        observaciones: 'Mail al beneficiario (no obligatorio)',
        ejemplo: 'ejemplo@gmail.com',
        obligatorio: false
    },
    {
        campo: 'COL_9',
        defCampo: 'Cláusula',
        longitud: 13,
        tipo: 'AN',
        observaciones: '"A la orden" (el beneficiario puede endosar el cheque), "No a la orden" (el beneficiario puede ceder el cheque)',
        ejemplo: 'A la orden',
        obligatorio: true
    }
];

export const PLANTILLA_HEADERS = [
    'Tipo de documento',
    'Nro. de documento',
    'Monto',
    'Fecha de pago',
    'Motivo de pago',
    'Referencia pago',
    'Valor referencia pago',
    'Mail',
    'Cláusula'
];

/**
 * Convierte fecha ISO (YYYY-MM-DD) a formato DD/MM/AAAA
 */
export const isoToDdMmYyyy = (isoStr) => {
    if (!isoStr) return '';
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(isoStr.trim())) return isoStr.trim();
    const parts = String(isoStr).split('T')[0].split('-');
    if (parts.length !== 3) return isoStr;
    return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
};

/**
 * Convierte fecha DD/MM/AAAA a formato ISO (YYYY-MM-DD)
 */
export const ddMmYyyyToIso = (ddmmStr) => {
    if (!ddmmStr) return '';
    const clean = String(ddmmStr).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
    const parts = clean.split('/');
    if (parts.length !== 3) return '';
    const [dd, mm, yyyy] = parts;
    if (!dd || !mm || !yyyy || yyyy.length !== 4) return '';
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
};

/**
 * Convierte un número o string numérico al formato de plantilla con coma decimal (sin separador de miles)
 */
export const formatMontoConComa = (val) => {
    if (val === null || val === undefined || val === '') return '';
    const raw = String(val).trim();
    const num = parseMontoNumerico(raw);
    if (isNaN(num) || num <= 0) return raw;
    // Mantener decimales si existen, separados por coma
    const str = String(Number(num.toFixed(2)));
    return str.replace('.', ',');
};

/**
 * Parsea un string de monto (con coma o punto) a número flotante
 */
export const parseMontoNumerico = (val) => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    let s = String(val).trim().replace(/\$/g, '').replace(/\s/g, '');
    // Si tiene punto y coma (ej: 1.300,30), quitar puntos de mil y pasar coma a punto
    if (s.includes('.') && s.includes(',')) {
        s = s.replace(/\./g, '').replace(',', '.');
    } else if (s.includes(',')) {
        s = s.replace(',', '.');
    }
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
};

/**
 * Limpia el Nro. de documento dejando únicamente dígitos (sin puntos, comas ni guiones)
 */
export const sanitizeNroDocumento = (val) => {
    if (!val) return '';
    return String(val).replace(/\D/g, '').slice(0, 11);
};

/**
 * Valida una fila de emisión según las reglas estrictas de las 9 columnas
 */
export const validateEcheqRow = (row) => {
    const errors = {};

    // COL_1: Tipo de documento (4, AN: CUIT, CUIL O CDI)
    const tipoDoc = String(row.tipoDocumento || '').trim().toUpperCase();
    if (!tipoDoc) {
        errors.tipoDocumento = 'Seleccione el tipo de documento (CUIT, CUIL o CDI).';
    } else if (!TIPOS_DOCUMENTO.includes(tipoDoc)) {
        errors.tipoDocumento = 'Debe ser CUIT, CUIL o CDI (máx. 4 caracteres).';
    }

    // COL_2: Nro. de documento (11, N: Sin puntos, comas, ni guiones)
    const nroDocRaw = String(row.nroDocumento || '').trim();
    if (!nroDocRaw) {
        errors.nroDocumento = 'Ingrese el Nro. de documento (11 dígitos).';
    } else if (!/^\d{11}$/.test(nroDocRaw)) {
        errors.nroDocumento = 'Debe contener exactamente 11 dígitos numéricos sin puntos, comas ni guiones.';
    }

    // COL_3: Monto (18, N: Separar los decimales con coma)
    const montoNum = parseMontoNumerico(row.monto);
    const montoComa = formatMontoConComa(row.monto);
    if (!row.monto || isNaN(montoNum) || montoNum <= 0) {
        errors.monto = 'Ingrese un monto mayor a 0.';
    } else if (montoComa.length > 18) {
        errors.monto = 'El monto no puede superar los 18 caracteres.';
    }

    // COL_4: Fecha de pago (10, AN: Formato DD/MM/AAAA)
    const fechaStr = isoToDdMmYyyy(row.fechaPago);
    if (!fechaStr || !/^\d{2}\/\d{2}\/\d{4}$/.test(fechaStr)) {
        errors.fechaPago = 'La fecha de pago debe tener formato DD/MM/AAAA.';
    } else {
        const [d, m, y] = fechaStr.split('/').map(Number);
        const dt = new Date(y, m - 1, d);
        if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) {
            errors.fechaPago = 'La fecha de pago ingresada no es una fecha calendario válida.';
        }
    }

    // COL_5: Motivo de pago (100, AN)
    const motivo = String(row.motivoPago || '').trim();
    if (!motivo) {
        errors.motivoPago = 'Seleccione o ingrese un motivo de pago.';
    } else if (motivo.length > 100) {
        errors.motivoPago = 'El motivo de pago no puede superar los 100 caracteres.';
    }

    // COL_6 y COL_7: Referencia pago (100, AN) y Valor referencia pago (50, AN)
    // Regla cruzada: si se completa uno, es obligatorio completar el otro
    const refPago = String(row.referenciaPago || '').trim();
    const valRefPago = String(row.valorReferenciaPago || '').trim();

    if (refPago.length > 100) {
        errors.referenciaPago = 'La referencia de pago no puede superar los 100 caracteres.';
    }
    if (valRefPago.length > 50) {
        errors.valorReferenciaPago = 'El valor de referencia no puede superar los 50 caracteres.';
    }
    if (valRefPago && !refPago) {
        errors.referenciaPago = 'Obligatorio cuando se completa "Valor referencia pago".';
    }
    if (refPago && !valRefPago) {
        errors.valorReferenciaPago = 'Obligatorio cuando se completa "Referencia pago".';
    }

    // COL_8: Mail (150, AN, no obligatorio)
    const mail = String(row.mail || '').trim();
    if (mail) {
        if (mail.length > 150) {
            errors.mail = 'El mail no puede superar los 150 caracteres.';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
            errors.mail = 'Formato de correo electrónico inválido.';
        }
    }

    // COL_9: Cláusula (13, AN: "A la orden" o "No a la orden")
    const clausula = String(row.clausula || '').trim();
    if (!clausula) {
        errors.clausula = 'Seleccione la cláusula del cheque.';
    } else if (clausula !== 'A la orden' && clausula !== 'No a la orden') {
        errors.clausula = 'Debe ser "A la orden" o "No a la orden".';
    }

    return {
        isValid: Object.keys(errors).length === 0,
        errors
    };
};

const escapeXml = (str) => {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
};

const colNumberToLetter = (colNum) => {
    let temp, letter = '';
    while (colNum > 0) {
        temp = (colNum - 1) % 26;
        letter = String.fromCharCode(temp + 65) + letter;
        colNum = (colNum - temp - 1) / 26;
    }
    return letter;
};

const buildWorksheetXml = (aoa, boldRows = []) => {
    const boldSet = new Set(boldRows);
    let rowsXml = '';

    aoa.forEach((row, rIdx) => {
        const rowNum = rIdx + 1;
        const isBold = boldSet.has(rowNum);
        let cellsXml = '';

        row.forEach((cellVal, cIdx) => {
            if (cellVal === null || cellVal === undefined || cellVal === '') return;
            const colLetter = colNumberToLetter(cIdx + 1);
            const cellRef = `${colLetter}${rowNum}`;
            const styleAttr = isBold ? ' s="1"' : '';
            cellsXml += `<c r="${cellRef}" t="inlineStr"${styleAttr}><is><t>${escapeXml(cellVal)}</t></is></c>`;
        });

        rowsXml += `<row r="${rowNum}">${cellsXml}</row>`;
    });

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${rowsXml}</sheetData>
</worksheet>`;
};

/**
 * Genera y descarga un archivo .xlsx con las 2 pestañas ("Ayuda" y "Plantilla para emisión")
 * respetando todas las especificaciones de formato sin incluir nombres de entidades bancarias.
 */
export const exportEcheqPlantillaExcel = async (chequeRows = [], customFilename = null) => {
    const zip = new JSZip();

    // Hoja 1: Ayuda
    const ayudaAoa = [
        ['', 'Ayuda : Plantilla de Excel para emisión de cheques electrónicos'],
        ['', '1. Completar la hoja de este excel llamada "Plantilla para emisión" según las siguientes definiciones'],
        ['', '2. Guardar y cargar al momento de emitir'],
        ['Campo', 'Def_Campo', 'Longitud', 'Tipo', 'Observaciones', '', 'EJEMPLO DE CARGA', ''],
        ...ECHEQ_FIELD_DEFINITIONS.map(def => [
            def.campo,
            def.defCampo,
            String(def.longitud),
            def.tipo,
            def.observaciones,
            '',
            def.defCampo,
            def.ejemplo
        ])
    ];

    // Hoja 2: Plantilla para emisión
    const plantillaAoa = [
        PLANTILLA_HEADERS,
        ...chequeRows.map(r => [
            String(r.tipoDocumento || 'CUIT').trim().toUpperCase(),
            sanitizeNroDocumento(r.nroDocumento),
            formatMontoConComa(r.monto),
            isoToDdMmYyyy(r.fechaPago),
            String(r.motivoPago || 'Varios').trim().slice(0, 100),
            String(r.referenciaPago || '').trim().slice(0, 100),
            String(r.valorReferenciaPago || '').trim().slice(0, 50),
            String(r.mail || '').trim().slice(0, 150),
            String(r.clausula || 'A la orden').trim()
        ])
    ];

    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`);

    zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`);

    zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Ayuda" sheetId="1" r:id="rId1"/>
    <sheet name="Plantilla para emisión" sheetId="2" r:id="rId2"/>
  </sheets>
</workbook>`);

    zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);

    zip.file('xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><name val="Calibri"/></font>
  </fonts>
  <fills count="2">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
  </fills>
  <borders count="1">
    <border><left/><right/><top/><bottom/><diagonal/></border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
  </cellXfs>
</styleSheet>`);

    zip.file('xl/worksheets/sheet1.xml', buildWorksheetXml(ayudaAoa, [1, 4]));
    zip.file('xl/worksheets/sheet2.xml', buildWorksheetXml(plantillaAoa, [1]));

    const blob = await zip.generateAsync({
        type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    const todayStr = new Date().toISOString().split('T')[0];
    saveAs(blob, customFilename || `Plantilla_Emision_Cheques_${todayStr}.xlsx`);
};

const colLettersToIndex = (letters) => {
    let idx = 0;
    for (let i = 0; i < letters.length; i++) {
        idx = idx * 26 + (letters.charCodeAt(i) - 64);
    }
    return idx - 1;
};

/**
 * Convierte un número serial de fecha de Excel (ej. 43697) a DD/MM/AAAA
 */
const excelSerialToDdMmYyyy = (serial) => {
    const num = Number(serial);
    if (isNaN(num) || num < 20000 || num > 80000) return String(serial);
    const utcDays = Math.floor(num - 25569);
    const utcValue = utcDays * 86400;
    const dateInfo = new Date(utcValue * 1000);
    const dd = String(dateInfo.getUTCDate()).padStart(2, '0');
    const mm = String(dateInfo.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = dateInfo.getUTCFullYear();
    return `${dd}/${mm}/${yyyy}`;
};

const extractRowsFromAoa = (aoa) => {
    if (!Array.isArray(aoa) || aoa.length === 0) return [];
    let headerRowIndex = -1;

    for (let i = 0; i < aoa.length; i++) {
        const row = aoa[i] || [];
        const firstCell = String(row[0] || '').trim().toLowerCase();
        const secondCell = String(row[1] || '').trim().toLowerCase();
        if (firstCell.includes('tipo de documento') && secondCell.includes('documento')) {
            headerRowIndex = i;
            break;
        }
    }

    const startRow = headerRowIndex >= 0 ? headerRowIndex + 1 : 0;
    const extracted = [];

    for (let i = startRow; i < aoa.length; i++) {
        const r = aoa[i] || [];
        const c0 = String(r[0] || '').trim();
        const c1 = String(r[1] || '').trim();
        const c2 = String(r[2] || '').trim();

        // Ignorar filas vacías o filas residuales (ej. una letra suelta sin documento ni monto)
        if (!c0 && !c1 && !c2) continue;
        if (c0.toUpperCase().startsWith('COL_') || c0.toLowerCase() === 'campo') continue;
        if (!c1 && !c2 && c0.length <= 2) continue;

        let rawFecha = String(r[3] || '').trim();
        if (/^\d{5}$/.test(rawFecha)) {
            rawFecha = excelSerialToDdMmYyyy(rawFecha);
        }

        const rawMonto = String(r[2] || '').trim().replace('.', ',');

        extracted.push({
            tipoDocumento: (c0 || 'CUIT').toUpperCase(),
            nroDocumento: sanitizeNroDocumento(c1),
            monto: rawMonto,
            fechaPago: ddMmYyyyToIso(rawFecha) || rawFecha,
            motivoPago: String(r[4] || 'Varios').trim() || 'Varios',
            referenciaPago: String(r[5] || '').trim(),
            valorReferenciaPago: String(r[6] || '').trim(),
            mail: String(r[7] || '').trim(),
            clausula: String(r[8] || 'A la orden').trim() || 'A la orden'
        });
    }

    return extracted;
};

/**
 * Lee un archivo .xlsx o .csv y devuelve las filas listas para validar/cargar
 */
export const parseEcheqExcelOrCsvFile = async (file) => {
    const fileName = (file?.name || '').toLowerCase();

    if (fileName.endsWith('.csv') || fileName.endsWith('.txt')) {
        const text = await file.text();
        const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
        const delimiter = (lines[0] && lines[0].split(';').length > lines[0].split(',').length) ? ';' : ',';
        const aoa = lines.map(line => {
            const result = [];
            let current = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                const ch = line[i];
                if (ch === '"') {
                    inQuotes = !inQuotes;
                } else if (ch === delimiter && !inQuotes) {
                    result.push(current.trim());
                    current = '';
                } else {
                    current += ch;
                }
            }
            result.push(current.trim());
            return result;
        });
        return extractRowsFromAoa(aoa);
    }

    // Archivo .xlsx (OpenXML zip)
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const parser = new DOMParser();

    // 1. Leer sharedStrings.xml si existe
    const sharedStrings = [];
    const sharedStringsFile = zip.file('xl/sharedStrings.xml');
    if (sharedStringsFile) {
        const ssXml = await sharedStringsFile.async('string');
        const ssDoc = parser.parseFromString(ssXml, 'application/xml');
        const siNodes = ssDoc.getElementsByTagName('si');
        for (let i = 0; i < siNodes.length; i++) {
            const tNodes = siNodes[i].getElementsByTagName('t');
            let textVal = '';
            for (let j = 0; j < tNodes.length; j++) {
                textVal += tNodes[j].textContent || '';
            }
            sharedStrings.push(textVal);
        }
    }

    // 2. Recorrer hojas buscando las filas de "Plantilla para emisión"
    const sheetFiles = Object.keys(zip.files)
        .filter(k => /^xl\/worksheets\/sheet\d+\.xml$/i.test(k))
        .sort();

    let allExtracted = [];

    for (const sheetPath of sheetFiles) {
        const sheetXml = await zip.file(sheetPath).async('string');
        const sheetDoc = parser.parseFromString(sheetXml, 'application/xml');
        const rowNodes = sheetDoc.getElementsByTagName('row');
        const aoa = [];

        for (let r = 0; r < rowNodes.length; r++) {
            const rowNode = rowNodes[r];
            const cellNodes = rowNode.getElementsByTagName('c');
            const rowArr = [];

            for (let c = 0; c < cellNodes.length; c++) {
                const cell = cellNodes[c];
                const ref = cell.getAttribute('r') || '';
                const colLetters = ref.replace(/\d+/g, '');
                const colIdx = colLetters ? colLettersToIndex(colLetters) : c;
                const cellType = cell.getAttribute('t');

                let val = '';
                if (cellType === 's') {
                    const vNode = cell.getElementsByTagName('v')[0];
                    const idx = parseInt(vNode?.textContent || '0', 10);
                    val = sharedStrings[idx] ?? '';
                } else if (cellType === 'inlineStr') {
                    const tNode = cell.getElementsByTagName('t')[0];
                    val = tNode?.textContent || '';
                } else {
                    const vNode = cell.getElementsByTagName('v')[0];
                    val = vNode?.textContent || '';
                }

                rowArr[colIdx] = val;
            }
            aoa.push(rowArr);
        }

        const rowsFromSheet = extractRowsFromAoa(aoa);
        if (rowsFromSheet.length > 0) {
            allExtracted = allExtracted.concat(rowsFromSheet);
        }
    }

    return allExtracted;
};

