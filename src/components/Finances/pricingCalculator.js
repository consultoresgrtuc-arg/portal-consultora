/**
 * @typedef {Object} PricingInputs
 * @property {number} costo_adquisicion - Costo de compra o fabricación del producto (positivo).
 * @property {number} [costos_adicionales] - Costos directos fijos por unidad (flete, packaging, logística). Default 0.
 * @property {number} alicuota_iibb - Porcentaje de Ingresos Brutos en tanto por uno (ej. 3.00% es 0.03).
 * @property {number} alicuota_tem - Porcentaje de Tasa Municipal en tanto por uno (ej. 0.90% es 0.009).
 * @property {number} comisiones_venta - Porcentaje de costo por cobro y cuotas de pasarela en tanto por uno (ej. 15.00% es 0.15).
 * @property {number} inflacion_estimada - Porcentaje de inflación estimada en tanto por uno (ej. 1.50% es 0.015).
 * @property {number} rentabilidad_esperada - Porcentaje de rentabilidad deseada sobre el costo en tanto por uno (ej. 20.00% es 0.20).
 * @property {number} [alicuota_iva] - Porcentaje de IVA en tanto por uno (ej. 21.00% es 0.21).
 * @property {number} [porcentaje_descuento] - Porcentaje de descuento a simular en tanto por uno (ej. 5.00% es 0.05).
 * @property {number} [cantidad_unidades] - Cantidad de unidades del lote para proyectar totales (default 1).
 */

/**
 * Calcula el precio de venta fijado (sin IVA), la incorporación del IVA, el punto de equilibrio
 * y el desglose financiero/contable completo.
 *
 * Ecuación central:
 * 1) Ganancia Limpia Objetivo = Costo Total * rentabilidad_esperada (no aplica ganancia sobre impuestos ni pasarela)
 * 2) Precio de Venta sin IVA (precio_neto) = (Costo Total + Ganancia Limpia Objetivo) / (1 - (IIBB + TEM + Comisiones + Inflación))
 *    -> Traslada todos los costos y gastos al precio para que, una vez pagado todo, se obtenga exactamente el % de rentabilidad deseado s/costo,
 *       mientras que el Margen Real sobre Venta (Ganancia / Precio) disminuye cuando suben IIBB, TEM o Comisiones.
 * 3) Precio Final con IVA (precio_venta_sugerido) = precio_neto * (1 + alicuota_iva)
 * 4) Verificación inversa desde Precio con IVA: precio_neto = precio_venta_sugerido / (1 + alicuota_iva)
 *
 * @param {PricingInputs} inputs
 * @returns {Object}
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

    for (const field of requiredFields) {
        const val = inputs[field];
        if (typeof val !== 'number' || isNaN(val) || val < 0) {
            throw new Error(`El campo '${field}' es requerido y debe ser un número mayor o igual a 0.`);
        }
    }

    const {
        costo_adquisicion,
        costos_adicionales = 0,
        alicuota_iibb,
        alicuota_tem,
        comisiones_venta,
        inflacion_estimada,
        rentabilidad_esperada,
        alicuota_iva = 0,
        porcentaje_descuento,
        cantidad_unidades = 1
    } = inputs;

    if (typeof costos_adicionales !== 'number' || isNaN(costos_adicionales) || costos_adicionales < 0) {
        throw new Error("El campo 'costos_adicionales' debe ser un número mayor o igual a 0.");
    }

    if (typeof alicuota_iva !== 'number' || isNaN(alicuota_iva) || alicuota_iva < 0) {
        throw new Error("El campo 'alicuota_iva' debe ser un número mayor o igual a 0.");
    }

    const unidades = Math.max(1, Number(cantidad_unidades) || 1);

    // 1. Costo Total Unitario de Adquisición / Producción
    const recupero_costo = costo_adquisicion + costos_adicionales;

    // 2. Ganancia Limpia Objetivo sobre el Costo (no se infla cuando suben impuestos o comisiones)
    const ganancia_objetivo = recupero_costo * rentabilidad_esperada;

    // 3. Suma de Gastos Variables, Impuestos e Inflación a trasladar a precio (Grossing-Up)
    const gastos_variables_pct = alicuota_iibb + alicuota_tem + comisiones_venta + inflacion_estimada;
    const sumaPorcentajes = gastos_variables_pct;
    const denominador = 1 - gastos_variables_pct;

    if (denominador <= 0) {
        throw new Error(
            `La suma de los porcentajes de gastos, inflación e impuestos (${(gastos_variables_pct * 100).toFixed(2)}%) no puede ser igual o mayor al 100%.`
        );
    }

    // 4. Precio de Venta Fijado (sin IVA) - Independiente de la alícuota de IVA
    const precio_neto = (recupero_costo + ganancia_objetivo) / denominador;

    // 5. Incorporación del IVA directamente sobre el Precio de Venta Fijado (Pasamanos fiscal)
    const factor_iva = 1 + alicuota_iva;
    const pago_iva = precio_neto * alicuota_iva;
    const precio_venta_sugerido = precio_neto * factor_iva;
    const total_cobrado = precio_venta_sugerido;
    const precio_sin_iva_verificado = factor_iva > 0 ? precio_venta_sugerido / factor_iva : precio_neto;

    // 6. Cuadro de Control (Desglose en cascada sobre el Precio de Venta fijado sin IVA)
    const pago_iibb = precio_neto * alicuota_iibb;
    const pago_tem = precio_neto * alicuota_tem;
    const pago_comisiones = precio_neto * comisiones_venta;
    const cobertura_inflacion = precio_neto * inflacion_estimada;
    const costo_reposicion_total = recupero_costo + cobertura_inflacion;

    const ganancia_neta_obtenida = precio_neto - (
        pago_iibb +
        pago_tem +
        pago_comisiones +
        cobertura_inflacion +
        recupero_costo
    );

    // Indicadores de rentabilidad:
    // - roi_sobre_costo: % de rentabilidad neta lograda sobre el costo invertido (coincide con rentabilidad_esperada una vez pagados todos los gastos)
    // - rentabilidad_real_lograda (ROS): incidencia de la ganancia limpia sobre el precio de venta s/IVA (disminuye cuando suben los gastos/impuestos)
    const rentabilidad_real_lograda = precio_neto > 0 ? ganancia_neta_obtenida / precio_neto : 0;
    const rentabilidad_sobre_total = precio_venta_sugerido > 0 ? ganancia_neta_obtenida / precio_venta_sugerido : 0;
    const roi_sobre_costo = recupero_costo > 0 ? ganancia_neta_obtenida / recupero_costo : 0;
    const roi_sobre_reposicion = costo_reposicion_total > 0 ? ganancia_neta_obtenida / costo_reposicion_total : 0;

    // 7. Recargos (Markup) y Multiplicadores (diferenciando Neto Comercial vs. Final con IVA)
    const markup_neto = recupero_costo > 0 ? (precio_neto / recupero_costo) - 1 : 0;
    const markup_final = recupero_costo > 0 ? (precio_venta_sugerido / recupero_costo) - 1 : 0;
    const multiplicador_neto = recupero_costo > 0 ? precio_neto / recupero_costo : 0;
    const multiplicador_final = recupero_costo > 0 ? precio_venta_sugerido / recupero_costo : 0;

    // 8. Punto de Equilibrio Unitario (Precio mínimo para Ganancia Neta = $0 cubriendo costo, inflación, comisiones e impuestos)
    const precio_equilibrio_neto = recupero_costo / denominador;
    const precio_equilibrio_final = precio_equilibrio_neto * factor_iva;
    const descuento_maximo_equilibrio = precio_neto > 0
        ? Math.max(0, 1 - (precio_equilibrio_neto / precio_neto))
        : 0;

    // Utilidades de redondeo:
    // - 2 decimales para montos monetarios
    // - 6 decimales para tasas/proporciones (evita pérdida de precisión al convertir a %)
    const round2 = (num) => Math.round((num + Number.EPSILON) * 100) / 100;
    const round6 = (num) => Math.round((num + Number.EPSILON) * 1000000) / 1000000;

    const output = {
        costo_base: round2(costo_adquisicion),
        costos_adicionales: round2(costos_adicionales),
        recupero_costo: round2(recupero_costo),
        cobertura_inflacion: round2(cobertura_inflacion),
        costo_reposicion_total: round2(costo_reposicion_total),
        inflacion_periodo: round6(inflacion_estimada),
        comision_efectiva_neto: round6(comisiones_venta),
        gastos_variables_pct: round6(gastos_variables_pct),
        suma_porcentajes: round6(sumaPorcentajes),
        factor_iva: round6(factor_iva),
        precio_neto: round2(precio_neto),
        precio_sin_iva_verificado: round2(precio_sin_iva_verificado),
        pago_iva: round2(pago_iva),
        precio_venta_sugerido: round2(precio_venta_sugerido),
        total_cobrado: round2(total_cobrado),
        pago_iibb: round2(pago_iibb),
        pago_tem: round2(pago_tem),
        pago_comisiones: round2(pago_comisiones),
        ganancia_neta_obtenida: round2(ganancia_neta_obtenida),
        rentabilidad_real_lograda: round6(rentabilidad_real_lograda),
        rentabilidad_sobre_total: round6(rentabilidad_sobre_total),
        roi_sobre_costo: round6(roi_sobre_costo),
        roi_sobre_reposicion: round6(roi_sobre_reposicion),
        markup_neto: round6(markup_neto),
        markup_final: round6(markup_final),
        multiplicador_neto: round6(multiplicador_neto),
        multiplicador_final: round6(multiplicador_final),
        precio_equilibrio_neto: round2(precio_equilibrio_neto),
        precio_equilibrio_final: round2(precio_equilibrio_final),
        descuento_maximo_equilibrio: round6(descuento_maximo_equilibrio),
        cantidad_unidades: unidades,
        lote: {
            unidades,
            costo_total_lote: round2(recupero_costo * unidades),
            costo_reposicion_lote: round2(costo_reposicion_total * unidades),
            facturacion_neta_lote: round2(precio_neto * unidades),
            facturacion_final_lote: round2(precio_venta_sugerido * unidades),
            ganancia_neta_lote: round2(ganancia_neta_obtenida * unidades)
        }
    };

    // 9. Simulador de Descuentos Comerciales
    if (porcentaje_descuento !== undefined && porcentaje_descuento !== null) {
        if (typeof porcentaje_descuento !== 'number' || isNaN(porcentaje_descuento) || porcentaje_descuento < 0 || porcentaje_descuento > 1) {
            throw new Error("El porcentaje de descuento debe ser un número entre 0 y 1 (ej: 0.05 para 5%).");
        }

        const precio_neto_con_descuento = precio_neto * (1 - porcentaje_descuento);
        const pago_iva_desc = precio_neto_con_descuento * alicuota_iva;
        const precio_con_descuento = precio_neto_con_descuento * factor_iva;
        const pago_iibb_desc = precio_neto_con_descuento * alicuota_iibb;
        const pago_tem_desc = precio_neto_con_descuento * alicuota_tem;
        const pago_comisiones_desc = precio_neto_con_descuento * comisiones_venta;
        const cobertura_inflacion_desc = precio_neto_con_descuento * inflacion_estimada;

        const nueva_ganancia_neta = precio_neto_con_descuento - (
            pago_iibb_desc +
            pago_tem_desc +
            pago_comisiones_desc +
            cobertura_inflacion_desc +
            recupero_costo
        );

        const nueva_rentabilidad_real = precio_neto_con_descuento > 0
            ? nueva_ganancia_neta / precio_neto_con_descuento
            : 0;
        const nuevo_roi_sobre_costo = recupero_costo > 0
            ? nueva_ganancia_neta / recupero_costo
            : 0;

        output.simulacion_descuento = {
            precio_neto_con_descuento: round2(precio_neto_con_descuento),
            precio_con_descuento: round2(precio_con_descuento),
            ahorro_cliente: round2(precio_venta_sugerido - precio_con_descuento),
            pago_iva_desc: round2(pago_iva_desc),
            pago_iibb_desc: round2(pago_iibb_desc),
            pago_tem_desc: round2(pago_tem_desc),
            pago_comisiones_desc: round2(pago_comisiones_desc),
            cobertura_inflacion_desc: round2(cobertura_inflacion_desc),
            nueva_ganancia_neta: round2(nueva_ganancia_neta),
            nueva_ganancia_lote: round2(nueva_ganancia_neta * unidades),
            nueva_rentabilidad_real: round6(nueva_rentabilidad_real),
            nuevo_roi_sobre_costo: round6(nuevo_roi_sobre_costo)
        };
    }

    return output;
}
