/**
 * @typedef {Object} PricingInputs
 * @property {number} costo_adquisicion - Costo de compra o fabricación del producto (positivo).
 * @property {number} [costos_adicionales] - Costos directos fijos por unidad (flete, packaging, logística). Default 0.
 * @property {number} alicuota_iibb - Porcentaje de Ingresos Brutos en tanto por uno (ej. 3.50% es 0.035).
 * @property {number} alicuota_tem - Porcentaje de Tasa Municipal en tanto por uno (ej. 0.90% es 0.009).
 * @property {number} comisiones_venta - Porcentaje de la plataforma o pasarela en tanto por uno (ej. 15.00% es 0.15).
 * @property {'neto' | 'bruto'} [base_comision] - Si la comisión aplica sobre el Precio Neto ('neto') o sobre el Total con IVA ('bruto'). Default 'neto'.
 * @property {number} inflacion_estimada - Porcentaje de inflación mensual estimada en tanto por uno (ej. 2.10% es 0.021).
 * @property {number} [dias_reposicion] - Días estimados del ciclo de reposición/cobro (default 30).
 * @property {'precio' | 'costo'} [modo_inflacion] - Base de cálculo del resguardo inflacionario ('costo' = sobre costo de reposición, 'precio' = sobre precio neto). Default 'precio'.
 * @property {number} rentabilidad_esperada - Margen o retorno deseado en tanto por uno (ej. 15.00% es 0.15).
 * @property {'margen_venta' | 'markup_costo'} [modo_rentabilidad] - 'margen_venta' (ROS sobre precio neto) o 'markup_costo' (ROI sobre costo). Default 'margen_venta'.
 * @property {number} [alicuota_iva] - Porcentaje de IVA en tanto por uno (ej. 21.00% es 0.21).
 * @property {number} [porcentaje_descuento] - Porcentaje de descuento a simular en tanto por uno (ej. 5.00% es 0.05).
 * @property {number} [cantidad_unidades] - Cantidad de unidades del lote para proyectar totales (default 1).
 */

/**
 * Calcula el precio de venta sugerido, punto de equilibrio y desglose financiero/de costos con precisión contable.
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
        base_comision = 'neto',
        inflacion_estimada,
        dias_reposicion = 30,
        modo_inflacion = 'precio',
        rentabilidad_esperada,
        modo_rentabilidad = 'margen_venta',
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

    if (typeof dias_reposicion !== 'number' || isNaN(dias_reposicion) || dias_reposicion < 0) {
        throw new Error("El campo 'dias_reposicion' debe ser un número mayor o igual a 0.");
    }

    const unidades = Math.max(1, Number(cantidad_unidades) || 1);

    // 1. Costo Total Unitario de Adquisición / Producción
    const recupero_costo = costo_adquisicion + costos_adicionales;

    // 2. Incidencia efectiva de la comisión sobre la Base Imponible (Precio Neto)
    // Si la pasarela/plataforma cobra comisión sobre el total facturado con IVA ('bruto'),
    // su peso sobre el precio neto es comisiones_venta * (1 + alicuota_iva).
    const comision_efectiva_neto = base_comision === 'bruto'
        ? comisiones_venta * (1 + alicuota_iva)
        : comisiones_venta;

    // 3. Tasa de inflación compuesta para el ciclo de reposición/cobro (n días)
    const inflacion_periodo = dias_reposicion === 30
        ? inflacion_estimada
        : (dias_reposicion === 0 ? 0 : Math.pow(1 + inflacion_estimada, dias_reposicion / 30) - 1);

    // 4. Gastos comerciales e impositivos variables directos sobre el Precio Neto
    const gastos_variables_pct = alicuota_iibb + alicuota_tem + comision_efectiva_neto;

    // 5. Determinación del Precio Neto (Base Imponible) y Cobertura de Inflación según metodología
    let precio_neto = 0;
    let cobertura_inflacion = 0;

    if (modo_rentabilidad === 'markup_costo') {
        // Rentabilidad objetivo expresada como Retorno sobre el Costo (Markup Neto / ROI)
        if (modo_inflacion === 'costo') {
            const denominador = 1 - gastos_variables_pct;
            if (denominador <= 0) {
                throw new Error(
                    `La suma de impuestos y comisiones efectivas (${(gastos_variables_pct * 100).toFixed(2)}%) no puede alcanzar o superar el 100% del precio neto.`
                );
            }
            cobertura_inflacion = recupero_costo * inflacion_periodo;
            const costo_reposicion = recupero_costo + cobertura_inflacion;
            const ganancia_objetivo = costo_reposicion * rentabilidad_esperada;
            precio_neto = (costo_reposicion + ganancia_objetivo) / denominador;
        } else {
            const sumaCargos = gastos_variables_pct + inflacion_periodo;
            const denominador = 1 - sumaCargos;
            if (denominador <= 0) {
                throw new Error(
                    `La suma de impuestos, comisiones e inflación (${(sumaCargos * 100).toFixed(2)}%) no puede ser igual o mayor al 100%.`
                );
            }
            const ganancia_objetivo = recupero_costo * rentabilidad_esperada;
            precio_neto = (recupero_costo + ganancia_objetivo) / denominador;
            cobertura_inflacion = precio_neto * inflacion_periodo;
        }
    } else {
        // Rentabilidad objetivo expresada como Margen Neto sobre Venta (Return on Sales - ROS)
        if (modo_inflacion === 'costo') {
            const sumaPorcentajes = gastos_variables_pct + rentabilidad_esperada;
            const denominador = 1 - sumaPorcentajes;
            if (denominador <= 0) {
                throw new Error(
                    `La suma de impuestos, comisiones efectivas y margen sobre venta (${(sumaPorcentajes * 100).toFixed(2)}%) no puede ser igual o mayor al 100%.`
                );
            }
            cobertura_inflacion = recupero_costo * inflacion_periodo;
            const costo_reposicion = recupero_costo + cobertura_inflacion;
            precio_neto = costo_reposicion / denominador;
        } else {
            const sumaPorcentajes = gastos_variables_pct + inflacion_periodo + rentabilidad_esperada;
            const denominador = 1 - sumaPorcentajes;
            if (denominador <= 0) {
                throw new Error(
                    `La suma de los porcentajes de costos, impuestos y margen (${(sumaPorcentajes * 100).toFixed(2)}%) no puede ser igual o mayor al 100%.`
                );
            }
            precio_neto = recupero_costo / denominador;
            cobertura_inflacion = precio_neto * inflacion_periodo;
        }
    }

    // 6. IVA y Precio Final de Venta Sugerido (Con IVA)
    const pago_iva = precio_neto * alicuota_iva;
    const precio_venta_sugerido = precio_neto + pago_iva;
    const total_cobrado = precio_venta_sugerido;

    // 7. Cuadro de Control (Desglose exacto)
    const pago_iibb = precio_neto * alicuota_iibb;
    const pago_tem = precio_neto * alicuota_tem;
    const pago_comisiones = precio_neto * comision_efectiva_neto;
    const costo_reposicion_total = recupero_costo + cobertura_inflacion;

    const ganancia_neta_obtenida = precio_neto - (
        pago_iibb +
        pago_tem +
        pago_comisiones +
        cobertura_inflacion +
        recupero_costo
    );

    const rentabilidad_real_lograda = precio_neto > 0 ? ganancia_neta_obtenida / precio_neto : 0;
    const rentabilidad_sobre_total = precio_venta_sugerido > 0 ? ganancia_neta_obtenida / precio_venta_sugerido : 0;
    const roi_sobre_costo = recupero_costo > 0 ? ganancia_neta_obtenida / recupero_costo : 0;
    const roi_sobre_reposicion = costo_reposicion_total > 0 ? ganancia_neta_obtenida / costo_reposicion_total : 0;

    // 8. Recargos (Markup) y Multiplicadores (diferenciando Neto Comercial vs. Final con IVA)
    const markup_neto = recupero_costo > 0 ? (precio_neto / recupero_costo) - 1 : 0;
    const markup_final = recupero_costo > 0 ? (precio_venta_sugerido / recupero_costo) - 1 : 0;
    const multiplicador_neto = recupero_costo > 0 ? precio_neto / recupero_costo : 0;
    const multiplicador_final = recupero_costo > 0 ? precio_venta_sugerido / recupero_costo : 0;

    // 9. Punto de Equilibrio Unitario (Precio mínimo para Ganancia Neta = $0 cubriendo reposición e impuestos)
    const denominador_equilibrio = 1 - gastos_variables_pct;
    const precio_equilibrio_neto = denominador_equilibrio > 0
        ? (recupero_costo + cobertura_inflacion) / denominador_equilibrio
        : precio_neto;
    const precio_equilibrio_final = precio_equilibrio_neto * (1 + alicuota_iva);
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
        inflacion_periodo: round6(inflacion_periodo),
        comision_efectiva_neto: round6(comision_efectiva_neto),
        gastos_variables_pct: round6(gastos_variables_pct),
        precio_neto: round2(precio_neto),
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

    // 10. Simulador de Descuentos Comerciales
    if (porcentaje_descuento !== undefined && porcentaje_descuento !== null) {
        if (typeof porcentaje_descuento !== 'number' || isNaN(porcentaje_descuento) || porcentaje_descuento < 0 || porcentaje_descuento > 1) {
            throw new Error("El porcentaje de descuento debe ser un número entre 0 y 1 (ej: 0.05 para 5%).");
        }

        const precio_neto_con_descuento = precio_neto * (1 - porcentaje_descuento);
        const pago_iva_desc = precio_neto_con_descuento * alicuota_iva;
        const precio_con_descuento = precio_neto_con_descuento + pago_iva_desc;
        const pago_iibb_desc = precio_neto_con_descuento * alicuota_iibb;
        const pago_tem_desc = precio_neto_con_descuento * alicuota_tem;
        const pago_comisiones_desc = precio_neto_con_descuento * comision_efectiva_neto;

        // El costo de reposición por inflación no disminuye al otorgar un descuento al cliente
        const cobertura_inflacion_desc = cobertura_inflacion;

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
        const ahorro_cliente = precio_venta_sugerido - precio_con_descuento;

        output.simulacion_descuento = {
            precio_neto_con_descuento: round2(precio_neto_con_descuento),
            precio_con_descuento: round2(precio_con_descuento),
            ahorro_cliente: round2(ahorro_cliente),
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
