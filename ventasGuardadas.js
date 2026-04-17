// ============================================================
//  ventasGuardadas.js — Módulo de Ventas Guardadas
//  Permite guardar el carrito activo con datos del cliente,
//  listarlo en un modal y reabrirlo en el carrito para pagar.
//
//  Requiere: app.js, ventas.js (cargados antes en el HTML)
// ============================================================

// ── ESTADO ───────────────────────────────────────────────────
// Si se abrió una venta guardada, guardamos su metadata aquí
// para que al pagar no se pidan datos nuevamente.
let ventaGuardadaActiva = null; // { id, cliente, items }

// ============================================================
//  MODAL DE VENTAS GUARDADAS
// ============================================================

const ventasGuardadasOverlay  = document.getElementById("ventasGuardadasOverlay");
const closeVentasGuardadasBtn = document.getElementById("closeVentasGuardadas");

function abrirVentasGuardadasModal() {
    ventasGuardadasOverlay.classList.remove("remove");
    void ventasGuardadasOverlay.offsetWidth;
    ventasGuardadasOverlay.classList.add("crudVisible");

    document.getElementById("vgLista").innerHTML = `
        <div class="historialVacio">
            <p style="color:#aaa;padding:1.5em 0;">Cargando ventas guardadas…</p>
        </div>`;

    renderVentasGuardadas();
}

function cerrarVentasGuardadasModal() {
    ventasGuardadasOverlay.classList.remove("crudVisible");
    ventasGuardadasOverlay.addEventListener("transitionend", () => {
        ventasGuardadasOverlay.classList.add("remove");
    }, { once: true });
}

closeVentasGuardadasBtn.addEventListener("click", cerrarVentasGuardadasModal);
ventasGuardadasOverlay.addEventListener("click", e => {
    if (e.target === ventasGuardadasOverlay) cerrarVentasGuardadasModal();
});

// ============================================================
//  CARGAR Y RENDERIZAR VENTAS GUARDADAS DESDE SHEETS
// ============================================================

async function renderVentasGuardadas() {
    const listaEl = document.getElementById("vgLista");

    let ventas = [];
    try {
        const res  = await fetch(`${GAS_URL}?resource=ventas_guardadas`);
        const json = await res.json();
        if (!json.success) throw new Error(json.message);

        ventas = json.data.map(v => ({
            id:      String(v.id || ""),
            fecha:   v.fecha   || "",
            total:   Number(v.total || 0),
            items:   (() => { try { return JSON.parse(v.items   || "[]"); } catch { return []; } })(),
            cliente: (() => { try { return JSON.parse(v.cliente || "{}"); } catch { return {};  } })()
        })).reverse();

    } catch (err) {
        console.error("renderVentasGuardadas:", err);
        listaEl.innerHTML = `
            <div class="historialVacio">
                <img src="https://cdn-icons-png.flaticon.com/512/6195/6195678.png" class="nadaEncontrado">
                <p>No se pudo cargar. Revisa tu conexión.</p>
            </div>`;
        return;
    }

    if (ventas.length === 0) {
        listaEl.innerHTML = `
            <div class="historialVacio">
                <img src="https://cdn-icons-png.flaticon.com/512/1178/1178479.png" class="nadaEncontrado">
                <p>No hay ventas guardadas aún.</p>
            </div>`;
        return;
    }

    listaEl.innerHTML = "";
    ventas.forEach((venta, idx) => {
        const div = document.createElement("div");
        div.classList.add("historialVenta", "vgCard");

        const clienteHtml = venta.cliente?.nombre
            ? `<span class="ventaCliente"><i class="fa-solid fa-user"></i> ${venta.cliente.nombre}</span>` : "";

        div.innerHTML = `
            <div class="ventaEncabezado">
                <span class="ventaMetodo">🗒️ Venta guardada</span>
                <span class="ventaFecha">${venta.fecha}</span>
                <span class="ventaTotal">$${venta.total.toLocaleString()}</span>
            </div>
            ${clienteHtml}
            <div class="ventaItems">
                ${(venta.items || []).map(i => `<span class="ventaItemChip">${i.nombre || i.id} ×${i.cantidad}</span>`).join("")}
            </div>
            <div class="vgBotones">
                <button class="btnAbrirVG" data-idx="${idx}">
                    <i class="fa-solid fa-basket-shopping"></i> Abrir en carrito
                </button>
                <button class="btnEliminarVG" data-idx="${idx}">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>`;
        listaEl.appendChild(div);
    });

    // Abrir venta → restaurar carrito
    listaEl.querySelectorAll(".btnAbrirVG").forEach(btn => {
        btn.addEventListener("click", () => {
            const venta = ventas[parseInt(btn.dataset.idx)];
            if (venta) abrirVentaGuardadaEnCarrito(venta);
        });
    });

    // Eliminar venta guardada
    listaEl.querySelectorAll(".btnEliminarVG").forEach(btn => {
        btn.addEventListener("click", () => {
            const venta = ventas[parseInt(btn.dataset.idx)];
            if (venta) eliminarVentaGuardada(venta.id);
        });
    });
}

// ============================================================
//  GUARDAR VENTA ACTIVA
//  Se llama desde el botón "Guardar Venta" del carrito
// ============================================================

function iniciarGuardarVenta() {
    if (elementosComprados.length === 0) {
        showNotification("El carrito está vacío.", "error");
        return;
    }
    mostrarPopupClienteVG();
}

function mostrarPopupClienteVG() {
    const existing = document.getElementById("popupVGOverlay");
    if (existing) existing.remove();

    // Si hay una venta guardada activa, pre-llenar con sus datos
    const safe = v => (v && v !== "nulo") ? v : "";
    const clientePrevio = ventaGuardadaActiva?.cliente || {};
    const esActualizacion = !!ventaGuardadaActiva;

    const overlay = document.createElement("div");
    overlay.id = "popupVGOverlay";
    overlay.style.cssText = `
        position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;
        display:flex;align-items:center;justify-content:center;
        animation:fadeInOverlay 0.2s ease;
    `;

    const box = document.createElement("div");
    box.style.cssText = `
        background:#fff;border-radius:1em;padding:2em;
        max-width:360px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.18);
        animation:slideUpModal 0.22s ease;display:flex;flex-direction:column;gap:0.9em;
    `;

    box.innerHTML = `
        <h3 style="font-size:1.1em;border-bottom:2px solid #FDCD00;padding-bottom:0.4em;">
            <i class="fa-solid fa-bookmark"></i> ${esActualizacion ? "Actualizar Venta Guardada" : "Guardar Venta"}
        </h3>
        ${esActualizacion ? '<p style="font-size:0.82em;color:#888;margin:0;background:#fdf0b3;padding:0.4em 0.7em;border-radius:0.5em;">Esta venta ya estaba guardada. Se actualizará con los items actuales del carrito.</p>' : ""}
        <p style="font-size:0.88em;color:#666;margin:0;">
            Datos del Cliente <span style="font-weight:normal;color:#aaa;">(opcional)</span>
        </p>
        <div style="display:flex;flex-direction:column;gap:0.6em;">
            <input id="vgNombre"   type="text"  placeholder="Nombre"        value="${safe(clientePrevio.nombre)}"   style="${inputStyle()}">
            <input id="vgTelefono" type="tel"   placeholder="Teléfono"      value="${safe(clientePrevio.telefono)}" style="${inputStyle()}">
            <input id="vgCorreo"   type="email" placeholder="correo@ej.com" value="${safe(clientePrevio.correo)}"   style="${inputStyle()}">
        </div>
        <div style="display:flex;gap:0.7em;margin-top:0.2em;">
            <button id="vgCancelarBtn" style="flex:1;padding:0.65em;border-radius:2em;border:1.5px solid #ccc;background:#f5f5f5;font-size:0.95em;cursor:pointer;font-weight:600;">Cancelar</button>
            <button id="vgGuardarBtn"  style="flex:1;padding:0.65em;border-radius:2em;border:none;background:#FDCD00;font-size:0.95em;cursor:pointer;font-weight:700;">
                <i class="fa-solid fa-bookmark"></i> ${esActualizacion ? "Actualizar" : "Guardar"}
            </button>
        </div>
    `;

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector("#vgCancelarBtn").addEventListener("click", close);
    overlay.addEventListener("click", e => { if (e.target === overlay) close(); });

    overlay.querySelector("#vgGuardarBtn").addEventListener("click", async () => {
        const nombre   = overlay.querySelector("#vgNombre").value.trim();
        const telefono = overlay.querySelector("#vgTelefono").value.trim();
        const correo   = overlay.querySelector("#vgCorreo").value.trim();

        const btn = overlay.querySelector("#vgGuardarBtn");
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${esActualizacion ? "Actualizando…" : "Guardando…"}`;

        await guardarVentaRemote({ nombre, telefono, correo });
        close();
    });
}

function inputStyle() {
    return `width:100%;padding:0.55em 0.9em;border-radius:0.6em;border:1px solid #ccc;font-size:0.95em;font-family:inherit;`;
}

async function guardarVentaRemote(cliente) {
    const total = elementosComprados.reduce((s, p) => s + p.precio * p.cantidad, 0);
    // Guardamos id, nombre, cantidad y precio — suficiente para mostrar y reconstruir
    const itemsMin = elementosComprados.map(p => ({
        id:       p.id,
        nombre:   p.nombre,
        cantidad: p.cantidad,
        precio:   p.precio
    }));
    const fecha = new Date().toLocaleString("es-CO");

    try {
        const clienteId = await saveClienteRemote(cliente);
        const clienteObj = {
            nombre:   cliente.nombre   || "nulo",
            telefono: cliente.telefono || "nulo",
            correo:   cliente.correo   || "nulo"
        };

        const payload = {
            fecha,
            total,
            items:   JSON.stringify(itemsMin),
            cliente: JSON.stringify(clienteObj)
        };

        let json;
        if (ventaGuardadaActiva) {
            // Ya existe → actualizar la fila existente (no crear una nueva)
            payload.id     = ventaGuardadaActiva.id;
            payload.action = "update";
            json = await gasPost("ventas_guardadas", payload);
            if (!json.success) throw new Error(json.message);
            showNotification(`Venta actualizada${cliente.nombre ? " para <strong>" + cliente.nombre + "</strong>" : ""} ✔`);
        } else {
            // Nueva venta guardada → id prefijado como string para evitar pérdida de precisión en Sheets
            payload.id = "VG-" + (clienteId || Date.now());
            json = await gasPost("ventas_guardadas", payload);
            if (!json.success) throw new Error(json.message);
            showNotification(`Venta guardada${cliente.nombre ? " para <strong>" + cliente.nombre + "</strong>" : ""} ✔`);
        }

        // Al guardar/actualizar se limpia la venta activa y el carrito
        ventaGuardadaActiva = null;
        elementosComprados  = [];
        saveCart();
        renderCart();
        recalcularCounter();

    } catch (err) {
        console.error("guardarVentaRemote:", err);
        showNotification("No se pudo guardar la venta. Intenta de nuevo.", "error");
    }
}

// ============================================================
//  ABRIR VENTA GUARDADA EN EL CARRITO
// ============================================================

function abrirVentaGuardadaEnCarrito(venta) {
    // Si hay items en el carrito, preguntar antes de reemplazar
    if (elementosComprados.length > 0) {
        showConfirm(
            "Hay productos en el carrito.<br>¿Reemplazarlos con esta venta guardada?",
            () => _cargarVentaEnCarrito(venta)
        );
    } else {
        _cargarVentaEnCarrito(venta);
    }
}

function _cargarVentaEnCarrito(venta) {
    // ── Paso 1: devolver al stock lo que había en el carrito actual ─
    // (por si el usuario tenía items antes de abrir la venta guardada)
    elementosComprados.forEach(itemActual => {
        const prod = Productos.find(p => p.id === itemActual.id);
        if (!prod) return;
        prod.stock += itemActual.cantidad;
        const stockEl = document.getElementById(`stock-${prod.id}`);
        if (stockEl) stockEl.innerHTML = `Stock: ${prod.stock}`;
        const btnEl = document.getElementById(`btn-${prod.id}`);
        if (btnEl && prod.stock > 0) {
            btnEl.innerHTML = "Agregar a carrito";
            btnEl.classList.add("ponerCarro");
            btnEl.classList.remove("disabledButton");
            btnEl.disabled = false;
        }
    });

    // ── Paso 2: reconstruir los items desde Productos (solo id+cantidad guardados) ─
    const itemsReconstruidos = [];
    const errores = [];

    venta.items.forEach(itemMin => {
        const prod = Productos.find(p => p.id === itemMin.id);
        if (!prod) {
            errores.push(`"${itemMin.nombre || itemMin.id}" ya no existe en el catálogo`);
            return;
        }
        // El stock disponible es el real actual (ya devolvimos el carrito anterior arriba)
        if (prod.stock < itemMin.cantidad) {
            errores.push(`"${prod.nombre}": necesitas ${itemMin.cantidad} pero solo hay ${prod.stock} en stock`);
            return;
        }
        itemsReconstruidos.push({
            id:       prod.id,
            nombre:   prod.nombre,   // del catálogo actual (más fresco)
            precio:   prod.precio,   // precio actual del producto
            imagen:   prod.imagen,
            cantidad: itemMin.cantidad
        });
    });

    if (errores.length > 0) {
        // Revertir: volver a descontar los items que habíamos devuelto
        elementosComprados.forEach(itemActual => {
            const prod = Productos.find(p => p.id === itemActual.id);
            if (!prod) return;
            prod.stock -= itemActual.cantidad;
            const stockEl = document.getElementById(`stock-${prod.id}`);
            if (stockEl) stockEl.innerHTML = `Stock: ${prod.stock}`;
            const btnEl = document.getElementById(`btn-${prod.id}`);
            if (btnEl && prod.stock <= 0) {
                btnEl.innerHTML = "Agotado";
                btnEl.classList.remove("ponerCarro");
                btnEl.classList.add("disabledButton");
                btnEl.disabled = true;
            }
        });
        showNotification(
            `No se pudo abrir la venta:<br>${errores.map(e => `• ${e}`).join("<br>")}`,
            "error"
        );
        return;
    }

    // ── Paso 3: descontar stock de los items de la venta guardada ──
    itemsReconstruidos.forEach(item => {
        const prod = Productos.find(p => p.id === item.id);
        if (!prod) return;
        prod.stock -= item.cantidad;
        const stockEl = document.getElementById(`stock-${prod.id}`);
        if (stockEl) stockEl.innerHTML = `Stock: ${prod.stock}`;
        const btnEl = document.getElementById(`btn-${prod.id}`);
        if (btnEl) {
            if (prod.stock <= 0) {
                btnEl.innerHTML = "Agotado";
                btnEl.classList.remove("ponerCarro");
                btnEl.classList.add("disabledButton");
                btnEl.disabled = true;
            } else {
                btnEl.innerHTML = "Agregar a carrito";
                btnEl.classList.add("ponerCarro");
                btnEl.classList.remove("disabledButton");
                btnEl.disabled = false;
            }
        }
    });

    // ── Paso 4: cargar en el carrito y guardar metadata ─────────
    elementosComprados = itemsReconstruidos;
    saveCart();

    ventaGuardadaActiva = {
        id:      venta.id,
        cliente: venta.cliente,
        items:   elementosComprados
    };

    cerrarVentasGuardadasModal();
    renderCart();
    recalcularCounter();

    const nombreCliente = venta.cliente?.nombre && venta.cliente.nombre !== "nulo"
        ? venta.cliente.nombre : "cliente";
    showNotification(`Venta de <strong>${nombreCliente}</strong> cargada en el carrito ✔`);
}

// ============================================================
//  ELIMINAR VENTA GUARDADA
// ============================================================

function eliminarVentaGuardada(id) {
    showConfirm("¿Eliminar esta venta guardada?<br>No se puede deshacer.", async () => {
        try {
            const json = await gasPost("ventas_guardadas", { action: "delete", id: String(id) });
            if (!json.success) throw new Error(json.message);
            showNotification("Venta guardada eliminada.");
            renderVentasGuardadas();
        } catch (err) {
            console.error("eliminarVentaGuardada:", err);
            showNotification("No se pudo eliminar. Intenta de nuevo.", "error");
        }
    });
}

// ============================================================
//  ELIMINAR VENTA GUARDADA TRAS COMPLETAR EL PAGO
//  Se llama desde ventas.js → finalizarVenta()
// ============================================================

async function limpiarVentaGuardadaActiva() {
    if (!ventaGuardadaActiva) return;
    try {
        await gasPost("ventas_guardadas", { action: "delete", id: String(ventaGuardadaActiva.id) });
    } catch (err) {
        console.error("limpiarVentaGuardadaActiva:", err);
    }
    ventaGuardadaActiva = null;
}
