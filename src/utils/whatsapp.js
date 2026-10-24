/**
 * Utilidades para normalización y generación de enlaces de WhatsApp
 * Gramajo & Romero Consultores
 */

/**
 * Normaliza y limpia números de teléfono para WhatsApp, adaptado a números argentinos e internacionales.
 * Devuelve únicamente dígitos sin signos (+), espacios, guiones ni paréntesis, en formato E.164 sin prefijo '+'.
 * Para Argentina: 549 + código de área (sin 0) + número local (sin 15).
 * 
 * Ejemplos:
 *  - "+54 9 381 123-4567" -> "5493811234567"
 *  - "381 123-4567"       -> "5493811234567"
 *  - "0381 123-4567"      -> "5493811234567"
 *  - "0381 15 123-4567"   -> "5493811234567"
 *  - "381 15 123-4567"    -> "5493811234567"
 *  - "011 15 1234-5678"   -> "5491112345678"
 *  - "54 381 123 4567"    -> "5493811234567"
 */
export const cleanWhatsAppNumber = (phone) => {
  if (!phone) return '';
  // Convertir a string y quitar cualquier carácter que no sea número
  let clean = String(phone).replace(/\D/g, '');
  if (!clean) return '';

  // Quitar prefijo internacional de salida 00 si existe (ej: 0054...)
  if (clean.startsWith('00')) {
    clean = clean.slice(2);
  }

  // Caso 1: Comienza con código de país 54 (Argentina)
  if (clean.startsWith('54')) {
    let rest = clean.slice(2);
    // Quitar 9 si ya lo tiene para normalizar el resto
    if (rest.startsWith('9')) {
      rest = rest.slice(1);
    }
    // Quitar 0 de código de área si estuviera presente (ej: 5490381...)
    if (rest.startsWith('0')) {
      rest = rest.slice(1);
    }
    // Quitar '15' si tiene 12 dígitos (código de área + 15 + número)
    if (rest.length === 12) {
      if (rest.startsWith('11') && rest.slice(2, 4) === '15') {
        rest = rest.slice(0, 2) + rest.slice(4);
      } else if (rest.slice(3, 5) === '15') {
        rest = rest.slice(0, 3) + rest.slice(5);
      } else if (rest.slice(4, 6) === '15') {
        rest = rest.slice(0, 4) + rest.slice(6);
      }
    }
    return '549' + rest;
  }

  // Caso 2: Número argentino ingresado localmente (sin prefijo 54)
  // Quitar el 0 de prefijo de larga distancia (ej: 0381 -> 381)
  if (clean.startsWith('0')) {
    clean = clean.slice(1);
  }

  // Quitar el '15' si tiene 12 dígitos (ej: 381 15 1234567 -> 381 1234567)
  if (clean.length === 12) {
    if (clean.startsWith('11') && clean.slice(2, 4) === '15') {
      clean = clean.slice(0, 2) + clean.slice(4);
    } else if (clean.slice(3, 5) === '15') {
      clean = clean.slice(0, 3) + clean.slice(5);
    } else if (clean.slice(4, 6) === '15') {
      clean = clean.slice(0, 4) + clean.slice(6);
    }
  }

  // Si tiene 10 dígitos (formato estándar argentino: código de área + número)
  if (clean.length === 10) {
    return '549' + clean;
  }

  // Otros casos (ej: números internacionales de otros países, 11-15 dígitos)
  return clean;
};

/**
 * Genera la URL universal de WhatsApp (api.whatsapp.com/send).
 * Evita el error 404 de wa.me cuando los números contienen formatos erróneos o caracteres especiales,
 * y funciona tanto en PC (WhatsApp Desktop / WhatsApp Web) como en teléfonos móviles.
 * 
 * @param {string} phone - Teléfono del destinatario (opcional)
 * @param {string} message - Texto del mensaje a pre-cargar
 * @returns {string} URL formateada para WhatsApp
 */
export const getWhatsAppUrl = (phone, message = '') => {
  const phoneClean = cleanWhatsAppNumber(phone);
  const encodedText = encodeURIComponent(message || '');
  
  if (phoneClean) {
    return `https://api.whatsapp.com/send?phone=${phoneClean}&text=${encodedText}`;
  }
  return `https://api.whatsapp.com/send?text=${encodedText}`;
};

/**
 * Abre WhatsApp en una pestaña nueva con protección de ventana (noopener, noreferrer).
 * 
 * @param {string} phone - Teléfono del destinatario
 * @param {string} message - Mensaje a enviar
 */
export const openWhatsApp = (phone, message = '') => {
  const url = getWhatsAppUrl(phone, message);
  window.open(url, '_blank', 'noopener,noreferrer');
};
