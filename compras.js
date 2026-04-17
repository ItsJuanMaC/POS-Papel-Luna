// ============================================================
//  compras.js — Registro de Compras
//  Permite registrar una compra a un proveedor seleccionando
//  productos del catálogo, cantidades y costos unitarios.
//  Genera un recibo similar al de ventas y guarda en Sheets.
//
//  Requiere: app.js (GAS_URL, gasPost, Productos, showNotification,
//            showConfirm, saveProductRemote)
// ============================================================

// ── Estado ───────────────────────────────────────────────────
let _comprasItems           = [];    // [{ productoId, nombre, cantidad, costoUnit }]
let _proveedoresCache       = [];    // [{ id, entidad }]
let _totalCompraPersonalizado = null; // null = auto, número = editado manualmente

// ============================================================
//  ABRIR MODAL
// ============================================================

document.getElementById("openCompras").addEventListener("click", async e => {
    e.preventDefault();
    _comprasItems                = [];
    _totalCompraPersonalizado   = null;
    document.getElementById("comprasTotalInput").value = "";

    const overlay = document.getElementById("comprasOverlay");
    overlay.classList.remove("remove");
    void overlay.offsetWidth;
    overlay.classList.add("crudVisible");

    await Promise.all([_cargarProveedores(), _renderComprasItems()]);
    _iniciarListenersTotalCompra();
});

document.getElementById("closeCompras").addEventListener("click", cerrarComprasModal);
document.getElementById("comprasOverlay").addEventListener("click", e => {
    if (e.target === document.getElementById("comprasOverlay")) cerrarComprasModal();
});

function cerrarComprasModal() {
    const overlay = document.getElementById("comprasOverlay");
    overlay.classList.remove("crudVisible");
    overlay.addEventListener("transitionend", () => overlay.classList.add("remove"), { once: true });
}

// ============================================================
//  CARGAR PROVEEDORES
// ============================================================

async function _cargarProveedores() {
    const sel = document.getElementById("comprasProveedor");
    sel.innerHTML = `<option value="" disabled selected>Cargando proveedores…</option>`;

    try {
        const res  = await fetch(`${GAS_URL}?resource=proveedores`);
        const json = await res.json();
        if (!json.success) throw new Error(json.message);

        _proveedoresCache = json.data.map(p => ({
            id:      String(p.id || ""),
            entidad: String(p.entidad || "Sin nombre")
        }));

        sel.innerHTML = `<option value="" disabled selected>Selecciona un proveedor</option>`;
        _proveedoresCache.forEach(p => {
            const opt = document.createElement("option");
            opt.value       = p.id;
            opt.textContent = p.entidad;
            sel.appendChild(opt);
        });

        if (_proveedoresCache.length === 0) {
            sel.innerHTML = `<option value="" disabled selected>No hay proveedores registrados</option>`;
        }
    } catch (err) {
        console.error("_cargarProveedores:", err);
        sel.innerHTML = `<option value="" disabled selected>Error al cargar proveedores</option>`;
    }
}

// ============================================================
//  RENDER ÍTEMS DE COMPRA
// ============================================================

function _renderComprasItems() {
    const container = document.getElementById("comprasItems");
    container.innerHTML = "";

    if (_comprasItems.length === 0) {
        container.innerHTML = `<p class="comprasVacio">Agrega productos usando el botón de abajo.</p>`;
        _actualizarTotalCompra();
        return;
    }

    _comprasItems.forEach((item, idx) => {
        const row = document.createElement("div");
        row.classList.add("compraItemRow");

        // Select de productos
        const prodOpts = Productos.map(p =>
            `<option value="${p.id}" ${p.id === item.productoId ? "selected" : ""}>${_esc(p.nombre)}</option>`
        ).join("");

        row.innerHTML = `
            <div class="compraItemTop">
                <select class="compraSelectProd" data-idx="${idx}">
                    <option value="" disabled ${!item.productoId ? "selected" : ""}>Seleccionar producto</option>
                    ${prodOpts}
                </select>
                <button class="compraEliminarItem btnEliminar" data-idx="${idx}" title="Quitar">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
            <div class="compraItemBottom">
                <div class="compraField">
                    <label>Cantidad</label>
                    <input class="compraInputCant" type="number" min="1" value="${item.cantidad || 1}" data-idx="${idx}">
                </div>
                <div class="compraField">
                    <label>Costo unit. ($)</label>
                    <input class="compraInputCosto" type="number" min="0" value="${item.costoUnit || 0}" data-idx="${idx}">
                </div>
                <div class="compraField compraSubtotalField">
                    <label>Subtotal</label>
                    <strong class="compraSubtotal" data-idx="${idx}">$${((item.cantidad || 1) * (item.costoUnit || 0)).toLocaleString()}</strong>
                </div>
            </div>
        `;
        container.appendChild(row);
    });

    // Eventos: cambio de producto
    container.querySelectorAll(".compraSelectProd").forEach(sel => {
        sel.addEventListener("change", function () {
            const idx  = parseInt(this.dataset.idx);
            const prod = Productos.find(p => p.id === this.value);
            _comprasItems[idx].productoId = this.value;
            _comprasItems[idx].nombre     = prod ? prod.nombre : "";
            // Pre-llenar costo del producto si tiene
            if (prod && prod.costo) {
                _comprasItems[idx].costoUnit = prod.costo;
                // Actualizar el input de costo en el DOM
                const costoInput = this.closest(".compraItemRow").querySelector(".compraInputCosto");
                if (costoInput) costoInput.value = prod.costo;
            }
            _recalcularSubtotal(idx);
            _actualizarTotalCompra();
        });
    });

    // Eventos: cambio de cantidad
    container.querySelectorAll(".compraInputCant").forEach(input => {
        input.addEventListener("input", function () {
            const idx = parseInt(this.dataset.idx);
            _comprasItems[idx].cantidad = Math.max(1, parseInt(this.value) || 1);
            _recalcularSubtotal(idx);
            _actualizarTotalCompra();
        });
    });

    // Eventos: cambio de costo
    container.querySelectorAll(".compraInputCosto").forEach(input => {
        input.addEventListener("input", function () {
            const idx = parseInt(this.dataset.idx);
            _comprasItems[idx].costoUnit = Math.max(0, parseFloat(this.value) || 0);
            _recalcularSubtotal(idx);
            _actualizarTotalCompra();
        });
    });

    // Eventos: eliminar ítem
    container.querySelectorAll(".compraEliminarItem").forEach(btn => {
        btn.addEventListener("click", function () {
            _comprasItems.splice(parseInt(this.dataset.idx), 1);
            _renderComprasItems();
        });
    });

    _actualizarTotalCompra();
}

function _recalcularSubtotal(idx) {
    const item    = _comprasItems[idx];
    const subtotal = (item.cantidad || 1) * (item.costoUnit || 0);
    const el       = document.querySelector(`.compraSubtotal[data-idx="${idx}"]`);
    if (el) el.textContent = `$${subtotal.toLocaleString()}`;
}

function _actualizarTotalCompra() {
    const totalCalc = _comprasItems.reduce((s, i) => s + (i.cantidad || 1) * (i.costoUnit || 0), 0);

    // Actualizar total calculado
    const calcEl = document.getElementById("comprasTotalCalc");
    if (calcEl) calcEl.textContent = `$${totalCalc.toLocaleString()}`;

    // Actualizar total final solo si NO hay valor manual
    const totalInput  = document.getElementById("comprasTotalInput");
    const resetBtn    = document.getElementById("comprasBtnResetTotal");
    if (!totalInput) return;

    if (_totalCompraPersonalizado === null) {
        totalInput.value = totalCalc;
        if (resetBtn) resetBtn.classList.add("remove");
    } else {
        totalInput.value = _totalCompraPersonalizado;
        if (resetBtn) resetBtn.classList.remove("remove");
    }
}

// Escuchar edición manual del total final (se llama una vez al iniciar el modal)
function _iniciarListenersTotalCompra() {
    const totalInput = document.getElementById("comprasTotalInput");
    const resetBtn   = document.getElementById("comprasBtnResetTotal");
    if (!totalInput) return;

    totalInput.addEventListener("input", function () {
        const v = parseFloat(this.value);
        _totalCompraPersonalizado = (!isNaN(v) && v >= 0) ? v : null;
        if (resetBtn) {
            resetBtn.classList.toggle("remove", _totalCompraPersonalizado === null);
        }
    });

    totalInput.addEventListener("keydown", e => { if (e.key === "Enter") e.preventDefault(); });

    if (resetBtn) {
        resetBtn.addEventListener("click", () => {
            _totalCompraPersonalizado = null;
            _actualizarTotalCompra();
        });
    }
}

// Botón agregar ítem
document.getElementById("comprasAgregarItem").addEventListener("click", () => {
    _comprasItems.push({ productoId: "", nombre: "", cantidad: 1, costoUnit: 0 });
    _renderComprasItems();
});

// ============================================================
//  REGISTRAR COMPRA
// ============================================================

document.getElementById("comprasRegistrar").addEventListener("click", async () => {
    // Validaciones
    const proveedorId = document.getElementById("comprasProveedor").value;
    if (!proveedorId) {
        showNotification("Selecciona un proveedor.", "error");
        return;
    }

    const itemsValidos = _comprasItems.filter(i => i.productoId);
    if (itemsValidos.length === 0) {
        showNotification("Agrega al menos un producto.", "error");
        return;
    }

    const itemsSinProd = _comprasItems.filter(i => !i.productoId);
    if (itemsSinProd.length > 0) {
        showNotification("Hay filas sin producto seleccionado. Completa o elimínalas.", "error");
        return;
    }

    const totalCalcFinal = _comprasItems.reduce((s, i) => s + (i.cantidad || 1) * (i.costoUnit || 0), 0);
    const totalFinal = (_totalCompraPersonalizado !== null) ? _totalCompraPersonalizado : totalCalcFinal;
    const proveedor  = _proveedoresCache.find(p => p.id === proveedorId);
    const fecha      = new Date().toLocaleString("es-CO");
    const id         = "C-" + Date.now();

    const payload = {
        id,
        fecha,
        proveedor_id:     proveedorId,
        proveedor_nombre: proveedor?.entidad || "Desconocido",
        total:            totalFinal,
        items:            JSON.stringify(itemsValidos.map(i => ({
            productoId: i.productoId,
            nombre:     i.nombre,
            cantidad:   i.cantidad,
            costoUnit:  i.costoUnit,
            subtotal:   i.cantidad * i.costoUnit
        })))
    };

    const btn = document.getElementById("comprasRegistrar");
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Registrando…`;

    try {
        // 1. Guardar compra en Sheets
        const json = await gasPost("compras", payload);
        if (!json.success) throw new Error(json.message);

        // 2. Actualizar costo de cada producto en Sheets
        for (const item of itemsValidos) {
            const prod = Productos.find(p => p.id === item.productoId);
            if (prod) {
                prod.costo = item.costoUnit;
                await saveProductRemote("update", prod);
            }
        }

        // 3. Reset total personalizado
        _totalCompraPersonalizado = null;

        // 4. Mostrar recibo
        _mostrarReciboCompra({ id, fecha, proveedor: proveedor?.entidad || "—", items: itemsValidos, total: totalFinal });

        cerrarComprasModal();

    } catch (err) {
        console.error("comprasRegistrar:", err);
        showNotification("Error al registrar la compra. Intenta de nuevo.", "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-receipt"></i> Registrar Compra`;
    }
});

// ============================================================
//  RECIBO DE COMPRA
// ============================================================

function _mostrarReciboCompra({ id, fecha, proveedor, items, total }) {
    const overlay = document.getElementById("reciboCompraOverlay");
    const cont    = document.getElementById("reciboCompraContenido");

    const totalCalc = items.reduce((s, i) => s + i.cantidad * i.costoUnit, 0);

    cont.innerHTML = `
        <div class="facturaDoc" id="reciboCompraDoc">
            <div class="facturaHeader">
                <div class="facturaLogo">
                    <h2>Papelería Papel y Luna</h2>
                    <p>Recibo de Compra a Proveedor</p>
                </div>
                <div class="facturaNumFecha">
                    <p><strong>${id}</strong></p>
                    <p>${fecha}</p>
                </div>
            </div>
            <div class="facturaSeccion">
                <h4>Proveedor</h4>
                <p><i class="fa-solid fa-truck" style="margin-right:0.4em;color:#888;"></i>${_esc(proveedor)}</p>
            </div>
            <div class="facturaSeccion">
                <h4>Productos Comprados</h4>
                <table class="facturaTabla">
                    <thead>
                        <tr>
                            <th>Producto</th>
                            <th>Cant.</th>
                            <th>Costo unit.</th>
                            <th>Subtotal</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map(i => `
                        <tr>
                            <td>${_esc(i.nombre)}</td>
                            <td>${i.cantidad}</td>
                            <td>$${Number(i.costoUnit).toLocaleString()}</td>
                            <td>$${(i.cantidad * i.costoUnit).toLocaleString()}</td>
                        </tr>`).join("")}
                    </tbody>
                </table>
            </div>
            <div class="facturaSeccion facturaTotales">
                <table class="facturaTabla">
                    ${total !== totalCalc ? `<tr><td>Total calculado</td><td>$${totalCalc.toLocaleString()}</td></tr>` : ""}
                    <tr class="totalRow"><td>TOTAL PAGADO</td><td><strong>$${total.toLocaleString()}</strong></td></tr>
                </table>
            </div>
            <p class="facturaGracias">Compra registrada correctamente ✔</p>
        </div>`;

    overlay.classList.remove("remove");
    void overlay.offsetWidth;
    overlay.classList.add("crudVisible");
}

document.getElementById("closeReciboCompra").addEventListener("click", () => {
    const overlay = document.getElementById("reciboCompraOverlay");
    overlay.classList.remove("crudVisible");
    overlay.addEventListener("transitionend", () => overlay.classList.add("remove"), { once: true });
});

document.getElementById("reciboCompraOverlay").addEventListener("click", e => {
    if (e.target === document.getElementById("reciboCompraOverlay")) {
        document.getElementById("reciboCompraOverlay").classList.remove("crudVisible");
        document.getElementById("reciboCompraOverlay").addEventListener("transitionend", () =>
            document.getElementById("reciboCompraOverlay").classList.add("remove"), { once: true });
    }
});

// ── Utilidad ──────────────────────────────────────────────────
function _esc(str) {
    return String(str || "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
