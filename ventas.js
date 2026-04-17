// ============================================================
//  ventas.js — Módulo de Ventas
//  Contiene: menú de ventas (2 opciones), modal de pago,
//  factura/recibo e historial de ventas (datos desde Sheets).
//
//  Requiere: app.js, ventasGuardadas.js (cargados en el HTML)
// ============================================================

// ── MÉTODOS DE PAGO ──────────────────────────────────────────
const METODOS_PAGO = [
    { id: "Efectivo", nombre: "Efectivo", img: "https://cdn-icons-png.flaticon.com/512/1041/1041971.png" },
    { id: "Nequi",    nombre: "Nequi",    img: "https://images.seeklogo.com/logo-png/40/2/nequi-logo-png_seeklogo-404357.png" },
    { id: "Debe",     nombre: "Debe",     img: "https://cdn-icons-png.flaticon.com/512/4090/4090236.png" }
];

// ============================================================
//  MENÚ VENTAS — 2 opciones al hacer clic en nav
// ============================================================

const openHistorialBtn = document.getElementById("openHistorial");

openHistorialBtn.addEventListener("click", e => {
    e.preventDefault();

    const prev = document.getElementById("ventasMenuPopup");
    if (prev) { prev.remove(); return; }

    const rect = openHistorialBtn.getBoundingClientRect();
    const menu = document.createElement("div");
    menu.id = "ventasMenuPopup";
    menu.style.cssText = `
        position:fixed;
        top:${rect.bottom + 8}px;
        left:${Math.max(8, rect.left - 60)}px;
        background:#fff;border-radius:0.8em;
        box-shadow:0 6px 24px rgba(0,0,0,0.15);
        border:1px solid rgba(0,0,0,0.08);
        z-index:500;min-width:210px;
        animation:slideUpModal 0.18s ease;
        overflow:hidden;
    `;

    menu.innerHTML = `
        <button id="menuHistorial" class="ventasMenuItem">
            <i class="fa-solid fa-chart-line" style="color:#27ae60;width:1.2em;"></i> Historial de Ventas
        </button>
        <button id="menuVentasGuardadas" class="ventasMenuItem">
            <i class="fa-solid fa-bookmark" style="color:#e6a800;width:1.2em;"></i> Ventas Guardadas
        </button>
    `;

    document.body.appendChild(menu);

    menu.querySelector("#menuHistorial").addEventListener("click", () => {
        menu.remove();
        historialOverlay.classList.remove("remove");
        void historialOverlay.offsetWidth;
        historialOverlay.classList.add("crudVisible");
        document.getElementById("historialResumenTop").innerHTML = "";
        document.getElementById("historialLista").innerHTML = `
            <div class="historialVacio">
                <p style="color:#aaa;padding:2em 0;">Cargando historial…</p>
            </div>`;
        renderHistorial();
    });

    menu.querySelector("#menuVentasGuardadas").addEventListener("click", () => {
        menu.remove();
        abrirVentasGuardadasModal();
    });

    setTimeout(() => {
        document.addEventListener("click", function handler(ev) {
            if (!menu.contains(ev.target) && ev.target !== openHistorialBtn) {
                menu.remove();
            }
            document.removeEventListener("click", handler);
        });
    }, 0);
});

// ============================================================
//  MODAL DE VENTAS — selección de método de pago
// ============================================================

const ventasOverlay  = document.getElementById("ventasOverlay");
const closeVentasBtn = document.getElementById("closeVentas");
let metodoPagoSeleccionado = null;

function abrirVentasModal() {
    const totalCalc  = elementosComprados.reduce((s, p) => s + p.precio * p.cantidad, 0);
    const total      = (typeof totalPersonalizado === "number" && totalPersonalizado >= 0)
                       ? totalPersonalizado : totalCalc;
    const totalUnits = elementosComprados.reduce((s, p) => s + p.cantidad, 0);

    document.getElementById("ventasResumen").innerHTML = `
        <div class="ventasResumenBox">
            <div class="ventasResumenFila"><span>Productos:</span><strong>${totalUnits}</strong></div>
            <div class="ventasResumenFila ventasTotalFila"><span>Total a Pagar:</span><strong>$${total.toLocaleString()}</strong></div>
        </div>
        <div class="ventasItemsList">
            ${elementosComprados.map(p =>
                `<div class="ventasItem">
                    <span>${p.nombre} ×${p.cantidad}</span>
                    <span>$${(p.precio * p.cantidad).toLocaleString()}</span>
                </div>`
            ).join("")}
        </div>`;

    const mc = document.getElementById("metodosContainer");
    mc.innerHTML = "";
    METODOS_PAGO.forEach(m => {
        const btn = document.createElement("button");
        btn.classList.add("metodoPagoBoton");
        btn.dataset.id = m.id;
        btn.innerHTML  = `<img src="${m.img}" class="imgMetodo"><p>${m.nombre}</p>`;
        btn.addEventListener("click", () => seleccionarMetodo(m.id));
        mc.appendChild(btn);
    });

    document.getElementById("ventasFormPago").innerHTML = "";
    document.getElementById("ventasAccion").innerHTML   = "";

    ventasOverlay.classList.remove("remove");
    void ventasOverlay.offsetWidth;
    ventasOverlay.classList.add("crudVisible");
}

function cerrarVentasModal() {
    ventasOverlay.classList.remove("crudVisible");
    ventasOverlay.addEventListener("transitionend", () => {
        ventasOverlay.classList.add("remove");
    }, { once: true });
    metodoPagoSeleccionado = null;
}

closeVentasBtn.addEventListener("click", cerrarVentasModal);
ventasOverlay.addEventListener("click", e => { if (e.target === ventasOverlay) cerrarVentasModal(); });

function seleccionarMetodo(idMetodo) {
    metodoPagoSeleccionado = idMetodo;
    document.querySelectorAll(".metodoPagoBoton").forEach(b =>
        b.classList.toggle("metodoSeleccionado", b.dataset.id === idMetodo)
    );

    const formDiv = document.getElementById("ventasFormPago");
    if (idMetodo === "Efectivo") {
        formDiv.innerHTML = `
            <div class="pago-efectivo-caja">
                <h3>Pago en Efectivo</h3>
                <p>¿Con cuánto vas a pagar?</p>
                <input type="number" id="montoEfectivo" placeholder="Monto en COP" min="1">
            </div>`;
    } else {
        formDiv.innerHTML = `<p class="metodoTexto">Has seleccionado: <strong>${idMetodo}</strong></p>`;
    }

    document.getElementById("ventasAccion").innerHTML =
        `<button id="btnConfirmarFinal" class="btnConfirmarFinal">Confirmar Pedido</button>`;
    document.getElementById("btnConfirmarFinal").addEventListener("click", confirmarPago);
}

function confirmarPago() {
    const metodo = metodoPagoSeleccionado;
    // Usar total personalizado si el usuario lo editó, si no calcular automáticamente
    const totalCalc = elementosComprados.reduce((s, p) => s + p.precio * p.cantidad, 0);
    const total     = (typeof totalPersonalizado === "number" && totalPersonalizado >= 0)
                      ? totalPersonalizado : totalCalc;

    if (!metodo) {
        showNotification("Selecciona un método de pago.", "error");
        return;
    }

    if (metodo === "Efectivo") {
        const monto = parseFloat(document.getElementById("montoEfectivo")?.value);
        if (!monto || monto <= 0) { showNotification("Por favor ingresa el monto con el que pagas.", "error"); return; }
        if (monto < total)        { showNotification(`Monto insuficiente. El total es $${total.toLocaleString()}.`, "error"); return; }
        const vueltas = monto - total;
        const resumen = vueltas > 0
            ? `Pago: <strong>$${monto.toLocaleString()}</strong><br>Total: <strong>$${total.toLocaleString()}</strong><br>Cambio: <strong>$${vueltas.toLocaleString()}</strong>`
            : `Pago exacto: <strong>$${total.toLocaleString()}</strong>`;
        showConfirm(`¿Confirmar pago en Efectivo?<br><br>${resumen}`, () => {
            cerrarVentasModal();
            abrirFacturaModal(metodo, total, vueltas);
        });

    } else if (metodo === "Debe") {
        showConfirm(`¿Registrar esta venta como deuda?<br>Total: <strong>$${total.toLocaleString()}</strong>`, () => {
            cerrarVentasModal();
            abrirFacturaModal(metodo, total, 0);
        });

    } else if (metodo === "Nequi") {
        showConfirm(`¿Confirmar pago por Nequi?<br>Total: <strong>$${total.toLocaleString()}</strong>`, () => {
            cerrarVentasModal();
            abrirFacturaModal(metodo, total, 0);
        });
    }
}

// ============================================================
//  MODAL DE FACTURA / RECIBO
// ============================================================

const facturaOverlay  = document.getElementById("facturaOverlay");
const closeFacturaBtn = document.getElementById("closeFactura");
let ventaPendiente = null;

// ── Helper: genera el HTML del recibo ─────────────────────────
function _generarContenidoFactura({ metodo, total, cambio, items, cliente = {}, facturaNum, fechaStr }) {
    fechaStr = fechaStr || new Date().toLocaleString("es-CO");
    const cambioHtml = metodo === "Efectivo" && cambio > 0
        ? `<tr><td>Cambio entregado</td><td><strong>$${cambio.toLocaleString()}</strong></td></tr>` : "";
    const nombre   = cliente.nombre   && cliente.nombre   !== "nulo" ? cliente.nombre   : "";
    const telefono = cliente.telefono && cliente.telefono !== "nulo" ? cliente.telefono : "";
    const correo   = cliente.correo   && cliente.correo   !== "nulo" ? cliente.correo   : "";

    document.getElementById("facturaContenido").innerHTML = `
        <div class="facturaDoc" id="facturaDoc">
            <div class="facturaHeader">
                <div class="facturaLogo">
                    <h2>Papelería Papel y Luna</h2>
                    <p>Recibo de Compra</p>
                </div>
                <div class="facturaNumFecha">
                    <p><strong>${facturaNum}</strong></p>
                    <p>${fechaStr}</p>
                </div>
            </div>
            ${nombre || telefono || correo ? `
            <div class="facturaSeccion">
                <h4>Datos del Cliente</h4>
                ${nombre   ? `<p><i class="fa-solid fa-user"></i> ${nombre}</p>`     : ""}
                ${telefono ? `<p><i class="fa-solid fa-phone"></i> ${telefono}</p>`  : ""}
                ${correo   ? `<p><i class="fa-solid fa-envelope"></i> ${correo}</p>` : ""}
            </div>` : ""}
            <div class="facturaSeccion">
                <h4>Productos</h4>
                <table class="facturaTabla">
                    <thead><tr><th>Producto</th><th>Cant.</th><th>P. Unit.</th><th>Subtotal</th></tr></thead>
                    <tbody>
                        ${items.map(p => `
                        <tr>
                            <td>${p.nombre}</td>
                            <td>${p.cantidad}</td>
                            <td>$${Number(p.precio).toLocaleString()}</td>
                            <td>$${(Number(p.precio) * Number(p.cantidad)).toLocaleString()}</td>
                        </tr>`).join("")}
                    </tbody>
                </table>
            </div>
            <div class="facturaSeccion facturaTotales">
                <table class="facturaTabla">
                    <tr><td>Método de pago</td><td><strong>${metodo}</strong></td></tr>
                    <tr class="totalRow"><td>TOTAL</td><td><strong>$${total.toLocaleString()}</strong></td></tr>
                    ${cambioHtml}
                </table>
            </div>
            <p class="facturaGracias">¡Gracias por tu compra! 🌙</p>
        </div>`;
}

function abrirFacturaModal(metodo, total, cambio) {
    // Siempre pedir datos, pero si viene de venta guardada pre-llenar los campos
    const items = ventaGuardadaActiva
        ? ventaGuardadaActiva.items
        : [...elementosComprados];

    ventaPendiente = { metodo, total, cambio, items };

    // Pre-llenar con datos de la venta guardada si existe
    const cliente = ventaGuardadaActiva?.cliente || {};
    const safe = v => (v && v !== "nulo") ? v : "";
    document.getElementById("clienteNombre").value   = safe(cliente.nombre);
    document.getElementById("clienteTelefono").value = safe(cliente.telefono);
    document.getElementById("clienteCorreo").value   = safe(cliente.correo);

    document.getElementById("facturaClienteForm").classList.remove("remove");
    document.getElementById("facturaContenido").classList.add("remove");
    document.getElementById("facturaAcciones").classList.add("remove");

    facturaOverlay.classList.remove("remove");
    void facturaOverlay.offsetWidth;
    facturaOverlay.classList.add("crudVisible");
}

function cerrarFacturaModal() {
    facturaOverlay.classList.remove("crudVisible");
    facturaOverlay.addEventListener("transitionend", () => {
        facturaOverlay.classList.add("remove");
    }, { once: true });
}

closeFacturaBtn.addEventListener("click", () => {
    if (ventaPendiente) {
        finalizarVenta(ventaPendiente.metodo, ventaPendiente.total, ventaPendiente.cambio, ventaPendiente.items, {});
        ventaPendiente = null;
    }
    cerrarFacturaModal();
});

facturaOverlay.addEventListener("click", e => {
    if (e.target === facturaOverlay) {
        if (ventaPendiente) {
            finalizarVenta(ventaPendiente.metodo, ventaPendiente.total, ventaPendiente.cambio, ventaPendiente.items, {});
            ventaPendiente = null;
        }
        cerrarFacturaModal();
    }
});

document.getElementById("btnGenerarFactura").addEventListener("click", async () => {
    const nombre   = document.getElementById("clienteNombre").value.trim();
    const telefono = document.getElementById("clienteTelefono").value.trim();
    const correo   = document.getElementById("clienteCorreo").value.trim();
    const { metodo, total, cambio, items } = ventaPendiente;

    // Obtener (o crear) el cliente y usar su id como id de la venta
    const clienteData = { nombre, telefono, correo };
    const clienteId   = await saveClienteRemote(clienteData);

    // id de venta: si hay venta guardada activa se usa su id, si no la del cliente o timestamp
    const ventaId    = ventaGuardadaActiva ? ventaGuardadaActiva.id
                     : (clienteId || Date.now());
    const facturaNum = "F-" + String(ventaId).slice(-6);

    _generarContenidoFactura({ metodo, total, cambio, items, cliente: clienteData, facturaNum });

    document.getElementById("facturaClienteForm").classList.add("remove");
    document.getElementById("facturaContenido").classList.remove("remove");
    document.getElementById("facturaAcciones").classList.remove("remove");

    finalizarVenta(metodo, total, cambio, items, { ...clienteData, facturaNum }, ventaId);
    updateStockRemote(items);

    // Si venía de venta guardada, eliminarla de Sheets
    if (ventaGuardadaActiva) limpiarVentaGuardadaActiva();

    ventaPendiente = null;
});

async function finalizarVenta(metodo, total, cambio, items, cliente = {}, ventaId = null) {
    const venta = {
        id:     ventaId || Date.now(),
        fecha:  new Date().toLocaleString("es-CO"),
        metodo, total, cambio,
        items:  items.map(p => ({ nombre: p.nombre, cantidad: p.cantidad, precio: p.precio })),
        cliente
    };

    await saveVentaRemote(venta);

    const cambioMsg = metodo === "Efectivo" && cambio > 0
        ? ` · Cambio: $${cambio.toLocaleString()}` : "";
    showNotification(`¡Venta confirmada! $${total.toLocaleString()} · ${metodo}${cambioMsg}`);

    elementosComprados  = [];
    ventaGuardadaActiva = null;   // la compra se completó → ya no es guardada
    totalPersonalizado  = null;   // resetear total manual
    saveCart();
    renderCart();
    recalcularCounter();
}

// ============================================================
//  HISTORIAL DE VENTAS — datos desde Google Sheets
// ============================================================

const historialOverlay  = document.getElementById("historialOverlay");
const closeHistorialBtn = document.getElementById("closeHistorial");

function cerrarHistorial() {
    historialOverlay.classList.remove("crudVisible");
    historialOverlay.addEventListener("transitionend", () => {
        historialOverlay.classList.add("remove");
    }, { once: true });
}

closeHistorialBtn.addEventListener("click", cerrarHistorial);
historialOverlay.addEventListener("click", e => { if (e.target === historialOverlay) cerrarHistorial(); });

async function renderHistorial() {
    const listaEl   = document.getElementById("historialLista");
    const resumenEl = document.getElementById("historialResumenTop");

    let historial = [];
    try {
        const res  = await fetch(`${GAS_URL}?resource=ventas`);
        const json = await res.json();
        if (!json.success) throw new Error(json.message);

        historial = json.data.map(v => ({
            id:      v.id,
            fecha:   v.fecha   || "",
            metodo:  v.metodo  || "",
            total:   Number(v.total  || 0),
            cambio:  Number(v.cambio || 0),
            items:   (() => { try { return JSON.parse(v.items   || "[]"); } catch { return []; } })(),
            cliente: (() => { try { return JSON.parse(v.cliente || "{}"); } catch { return {}; } })()
        })).reverse();

    } catch (err) {
        console.error("renderHistorial:", err);
        resumenEl.innerHTML = "";
        listaEl.innerHTML = `
            <div class="historialVacio">
                <img src="https://cdn-icons-png.flaticon.com/512/6195/6195678.png" class="nadaEncontrado">
                <p>No se pudo cargar el historial.<br>Revisa tu conexión e intenta de nuevo.</p>
            </div>`;
        return;
    }

    if (historial.length === 0) {
        resumenEl.innerHTML = "";
        listaEl.innerHTML = `
            <div class="historialVacio">
                <img src="https://cdn-icons-png.flaticon.com/512/1178/1178479.png" class="nadaEncontrado">
                <p>Aún no hay ventas registradas.</p>
            </div>`;
        return;
    }

    const totalVentas   = historial.length;
    const totalIngresos = historial.filter(v => v.metodo !== "Debe").reduce((s, v) => s + v.total, 0);
    const totalDeudas   = historial.filter(v => v.metodo === "Debe").reduce((s, v) => s + v.total, 0);

    resumenEl.innerHTML = `
        <div class="historialStats">
            <div class="statBox"><span>Ventas</span><strong>${totalVentas}</strong></div>
            <div class="statBox statIngresos"><span>Ingresos</span><strong>$${totalIngresos.toLocaleString()}</strong></div>
            <div class="statBox statDeudas"><span>Por Cobrar</span><strong>$${totalDeudas.toLocaleString()}</strong></div>
        </div>`;

    listaEl.innerHTML = "";
    historial.forEach(venta => {
        const div         = document.createElement("div");
        div.classList.add("historialVenta");
        const metodoIcon  = { Efectivo: "💵", Nequi: "📱", Debe: "📋" }[venta.metodo] || "💰";
        const metodoLabel = venta.metodo || "Desconocido";
        const cambioHtml  = venta.metodo === "Efectivo" && venta.cambio > 0
            ? `<span class="ventaCambio">Cambio: $${venta.cambio.toLocaleString()}</span>` : "";
        const clienteHtml = venta.cliente?.nombre
            ? `<span class="ventaCliente"><i class="fa-solid fa-user"></i> ${venta.cliente.nombre}</span>` : "";

        div.innerHTML = `
            <div class="ventaEncabezado">
                <span class="ventaMetodo">${metodoIcon} ${metodoLabel}</span>
                <span class="ventaFecha">${venta.fecha}</span>
                <span class="ventaTotal">$${venta.total.toLocaleString()}</span>
            </div>
            ${clienteHtml}${cambioHtml}
            <div class="ventaItems">
                ${(venta.items || []).map(i => `<span class="ventaItemChip">${i.nombre} ×${i.cantidad}</span>`).join("")}
            </div>
            <div class="ventaReciboBtn">
                <button class="btnVerRecibo" data-idx="${historial.indexOf(venta)}">
                    <i class="fa-solid fa-receipt"></i> Ver Recibo
                </button>
            </div>`;
        listaEl.appendChild(div);
    });

    listaEl.querySelectorAll(".btnVerRecibo").forEach(btn => {
        btn.addEventListener("click", () => {
            const venta = historial[parseInt(btn.dataset.idx)];
            if (venta) abrirReciboHistorial(venta);
        });
    });
}

function abrirReciboHistorial(venta) {
    cerrarHistorial();

    const facturaNum = venta.cliente?.facturaNum || "F-" + String(venta.id).slice(-6);
    const cambioHtml = venta.metodo === "Efectivo" && venta.cambio > 0
        ? `<tr><td>Cambio entregado</td><td><strong>$${venta.cambio.toLocaleString()}</strong></td></tr>` : "";
    const cliente = venta.cliente || {};

    document.getElementById("facturaClienteForm").classList.add("remove");
    document.getElementById("facturaContenido").classList.remove("remove");
    document.getElementById("facturaAcciones").classList.remove("remove");

    _generarContenidoFactura({
        metodo:     venta.metodo,
        total:      venta.total,
        cambio:     venta.cambio,
        items:      venta.items || [],
        cliente,
        facturaNum,
        fechaStr:   venta.fecha
    });

    const overlay = document.getElementById("facturaOverlay");
    overlay.classList.remove("remove");
    void overlay.offsetWidth;
    overlay.classList.add("crudVisible");
}
