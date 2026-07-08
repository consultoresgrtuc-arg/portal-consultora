/**
 * @typedef {Object} PricingInputs
 * @property {number} costo_adquisicion - Costo de compra o fabricación del producto (positivo).
 * @property {number} alicuota_iibb - Porcentaje de Ingresos Brutos (ej. 3.50% es 0.035).
 * @property {number} alicuota_tem - Porcentaje de Tasa Emergencia Municipal (ej. 0.90% es 0.009).
 * @property {number} comisiones_venta - Porcentaje de la plataforma o pasarela (ej. 15.00% es 0.15).
 * @property {number} inflacion_estimada - Porcentaje de resguardo mensual (ej. 2.10% es 0.021).
 * @property {number} rentabilidad_esperada - Margen neto limpio deseado (ej. 15.00% es 0.15).
 * @property {number} [alicuota_iva] - Porcentaje de IVA (ej. 21.00% es 0.21).
 * @property {number} [porcentaje_descuento] - Porcentaje de descuento a simular (ej. 5.00% es 0.05).
 */

/**
 * @typedef {Object} DiscountSimulationResult
 * @property {number} precio_neto_con_descuento - Precio neto con el descuento aplicado.
 * @property {number} precio_con_descuento - Precio final (con IVA) con el descuento aplicado.
 * @property {number} pago_iva_desc - Pago de IVA recalculado con descuento.
 * @property {number} pago_iibb_desc - Pago de IIBB recalculado con descuento.
 * @property {number} pago_tem_desc - Pago de TEM recalculado con descuento.
 * @property {number} pago_comisiones_desc - Pago de comisiones recalculado con descuento.
 * @property {number} cobertura_inflacion_desc - Cobertura de inflación recalculada con descuento.
 * @property {number} nueva_ganancia_neta - Margen neto limpio restante en pesos con descuento.
 * @property {number} nueva_rentabilidad_real - Margen neto porcentual logrado con descuento.
 */

/**
 * @typedef {Object} PricingOutputs
 * @property {number} precio_neto - Precio de venta sugerido antes de IVA (Base Imponible).
 * @property {number} pago_iva - Monto destinado al pago del IVA.
 * @property {number} precio_venta_sugerido - Precio final de venta al público sugerido (con IVA).
 * @property {number} total_cobrado - Equivalente al precio de venta sugerido (con IVA).
 * @property {number} pago_iibb - Monto destinado al pago de Ingresos Brutos.
 * @property {number} pago_tem - Monto destinado a la Tasa de Emergencia Municipal.
 * @property {number} pago_comisiones - Monto de comisiones de venta.
 * @property {number} cobertura_inflacion - Monto de resguardo inflacionario.
 * @property {number} recupero_costo - Monto correspondiente al costo de adquisición.
 * @property {number} ganancia_neta_obtenida - Margen neto limpio en pesos.
 * @property {number} rentabilidad_real_lograda - Margen neto porcentual logrado.
 * @property {DiscountSimulationResult} [simulacion_descuento] - Resultados del simulador de descuentos si se provee descuento.
 */

/**
 * Calcula el precio de venta sugerido y el desglose financiero asegurando la rentabilidad.
 * 
 * @param {PricingInputs} inputs 
 * @returns {PricingOutputs}
 * @throws {Error} Si algún parámetro es inválido, negativo, o si la suma de porcentajes es >= 100%.
 */
export function calcularPrecioVenta(inputs) {
    if (!inputs || typeof inputs !== 'object') {
        throw new Error("Se requiere un objeto con los parámetros de entrada.");
    }

    const requiredFields = [
        'costo_adquisicion',
        'alicuota_iibb',
        'alicuota_tem',
        'comisiones_venta',
        'inflacion_estimada',
        'rentabilidad_esperada'
    ];

    // Validación de campos obligatorios y formato
    for (const field of requiredFields) {
        const val = inputs[field];
        if (typeof val !== 'number' || isNaN(val) || val < 0) {
            throw new Error(`El campo '${field}' es requerido y debe ser un número mayor o igual a 0.`);
        }
    }

    const {
        costo_adquisicion,
        alicuota_iibb,
        alicuota_tem,
        comisiones_venta,
        inflacion_estimada,
        rentabilidad_esperada,
        alicuota_iva = 0,
        porcentaje_descuento
    } = inputs;

    if (typeof alicuota_iva !== 'number' || isNaN(alicuota_iva) || alicuota_iva < 0) {
        throw new Error("El campo 'alicuota_iva' debe ser un número mayor o igual a 0.");
    }

    // Cálculo del denominador (sobre base imponible/precio neto)
    const sumaPorcentajes = alicuota_iibb + alicuota_tem + comisiones_venta + inflacion_estimada + rentabilidad_esperada;
    const denominador = 1 - sumaPorcentajes;

    if (denominador <= 0) {
        throw new Error(
            `La suma de los porcentajes de costos e impuestos (${(sumaPorcentajes * 100).toFixed(2)}%) no puede ser igual o mayor al 100%.`
        );
    }

    // A) Precio Neto (Base Imponible)
    const precio_neto = costo_adquisicion / denominador;

    // B) IVA y Precio de Venta Sugerido (Con IVA)
    const pago_iva = precio_neto * alicuota_iva;
    const precio_venta_sugerido = precio_neto + pago_iva;
    const total_cobrado = precio_venta_sugerido;

    // C) Cuadro de Control (Desglose sobre precio neto)
    const pago_iibb = precio_neto * alicuota_iibb;
    const pago_tem = precio_neto * alicuota_tem;
    const pago_comisiones = precio_neto * comisiones_venta;
    const cobertura_inflacion = precio_neto * inflacion_estimada;
    const recupero_costo = costo_adquisicion;
    const ganancia_neta_obtenida = precio_neto - (pago_iibb + pago_tem + pago_comisiones + cobertura_inflacion + recupero_costo);
    const rentabilidad_real_lograda = ganancia_neta_obtenida / precio_neto;

    // Utilidad de redondeo a 2 decimales
    const round = (num) => Math.round((num + Number.EPSILON) * 100) / 100;

    const output = {
        precio_neto: round(precio_neto),
        pago_iva: round(pago_iva),
        precio_venta_sugerido: round(precio_venta_sugerido),
        total_cobrado: round(total_cobrado),
        pago_iibb: round(pago_iibb),
        pago_tem: round(pago_tem),
        pago_comisiones: round(pago_comisiones),
        cobertura_inflacion: round(cobertura_inflacion),
        recupero_costo: round(recupero_costo),
        ganancia_neta_obtenida: round(ganancia_neta_obtenida),
        rentabilidad_real_lograda: round(rentabilidad_real_lograda)
    };

    // D) Simulador de Descuentos
    if (porcentaje_descuento !== undefined && porcentaje_descuento !== null) {
        if (typeof porcentaje_descuento !== 'number' || isNaN(porcentaje_descuento) || porcentaje_descuento < 0 || porcentaje_descuento > 1) {
            throw new Error("El porcentaje de descuento debe ser un número entre 0 y 1 (ej: 0.05 para 5%).");
        }

        const precio_neto_con_descuento = precio_neto * (1 - porcentaje_descuento);
        const precio_con_descuento = precio_neto_con_descuento * (1 + alicuota_iva);
        const pago_iva_desc = precio_neto_con_descuento * alicuota_iva;
        const pago_iibb_desc = precio_neto_con_descuento * alicuota_iibb;
        const pago_tem_desc = precio_neto_con_descuento * alicuota_tem;
        const pago_comisiones_desc = precio_neto_con_descuento * comisiones_venta;
        const cobertura_inflacion_desc = precio_neto_con_descuento * inflacion_estimada;
        const nueva_ganancia_neta = precio_neto_con_descuento - (pago_iibb_desc + pago_tem_desc + pago_comisiones_desc + cobertura_inflacion_desc + recupero_costo);
        const nueva_rentabilidad_real = nueva_ganancia_neta / precio_neto_con_descuento;

        output.simulacion_descuento = {
            precio_neto_con_descuento: round(precio_neto_con_descuento),
            precio_con_descuento: round(precio_con_descuento),
            pago_iva_desc: round(pago_iva_desc),
            pago_iibb_desc: round(pago_iibb_desc),
            pago_tem_desc: round(pago_tem_desc),
            pago_comisiones_desc: round(pago_comisiones_desc),
            cobertura_inflacion_desc: round(cobertura_inflacion_desc),
            nueva_ganancia_neta: round(nueva_ganancia_neta),
            nueva_rentabilidad_real: round(nueva_rentabilidad_real)
        };
    }

    return output;
}
