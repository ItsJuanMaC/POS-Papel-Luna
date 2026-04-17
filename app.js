// ============================================================
//  app.js — Aplicación General
//  Contiene: config, capa de datos, notificaciones, popup de
//  confirmación, carrito, tarjetas de productos, búsqueda e init.
//
//  Depende de: ventas.js, ventasGuardadas.js, crud.js
// ============================================================

const GAS_URL = "https://script.google.com/macros/s/AKfycbxRbuAaS9b4RqwkQWwp72BSWd8L0L9WwrAJ_i5a0djU6zGZc93Kf4MMbmeuJaPK8DsaWA/exec";

let Productos = [];
let elementosComprados    = JSON.parse(sessionStorage.getItem("carrito")) || [];
let totalPersonalizado    = null; // null = calcular automáticamente; número = total editado manualmente

// ============================================================
//  DATA LAYER — Google Sheets
// ============================================================

async function loadProducts() {
    const res  = await fetch(`${GAS_URL}?resource=productos`);
    const json = await res.json();
    if (!json.success) throw new Error(json.message || "Error al cargar productos");
    Productos = json.data.map(p => ({
        id:        String(p.id       || p.Id       || ""),
        nombre:    p.nombre    || p.Nombre    || "",
        precio:    Number(p.precio    || p.Precio    || 0),
        stock:     Number(p.stock     || p.Stock     || 0),
        costo:     Number(p.costo     || p.Costo     || 0),
        categoria: p.categoria || p.Categoria || "",
        imagen:    p.imagen    || p.Imagen    || ""
    }));
}

async function gasPost(resource, data) {
    const res = await fetch(`${GAS_URL}?resource=${encodeURIComponent(resource)}`, {
        method:  "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body:    JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

async function saveProductRemote(action, producto) {
    try {
        const json = await gasPost("productos", { action, ...producto });
        if (!json.success) throw new Error(json.message || "Error al guardar");
        return true;
    } catch (err) {
        console.error("saveProductRemote:", err);
        showNotification("Error al guardar en Google Sheets. Intenta de nuevo.", "error");
        return false;
    }
}

async function saveVentaRemote(venta) {
    try {
        const payload = {
            id:      venta.id,
            fecha:   venta.fecha,
            metodo:  venta.metodo,
            total:   venta.total,
            cambio:  venta.cambio,
            items:   JSON.stringify(venta.items || []),
            cliente: JSON.stringify(venta.cliente || {})
        };
        const json = await gasPost("ventas", payload);
        if (!json.success) throw new Error(json.message || "Error al registrar venta");
        return true;
    } catch (err) {
        console.error("saveVentaRemote:", err);
        showNotification("La venta no se pudo registrar en Sheets.", "error");
        return false;
    }
}

// Busca cliente por nombre en Sheets; si existe devuelve su id,
// si no existe lo crea. Siempre devuelve el id usado (o null si falla).
async function saveClienteRemote(cliente) {
    const nombreBuscar = (cliente.nombre || "").trim();
    try {
        if (nombreBuscar && nombreBuscar !== "nulo") {
            const res  = await fetch(`${GAS_URL}?resource=clientes`);
            const json = await res.json();
            if (json.success && json.data) {
                const existente = json.data.find(c =>
                    String(c.nombre || "").trim().toLowerCase() === nombreBuscar.toLowerCase()
                );
                if (existente) {
                    // Cliente ya existe → devolver su id sin crear uno nuevo
                    return Number(existente.id);
                }
            }
        }
        // Cliente nuevo → crear con id propio
        const newId = Date.now();
        const payload = {
            id:       newId,
            nombre:   cliente.nombre   || "nulo",
            telefono: cliente.telefono || "nulo",
            correo:   cliente.correo   || "nulo"
        };
        const json = await gasPost("clientes", payload);
        if (!json.success) throw new Error(json.message || "Error al guardar cliente");
        return newId;
    } catch (err) {
        console.error("saveClienteRemote:", err);
        return null;
    }
}

async function updateStockRemote(items) {
    for (const item of items) {
        const prod = Productos.find(p => p.id === item.id);
        if (!prod) continue;
        try {
            await gasPost("productos", { action: "update", ...prod });
        } catch (err) {
            console.error("updateStockRemote:", err);
        }
    }
}

// ============================================================
//  CARRITO — sessionStorage
// ============================================================

function saveCart() {
    sessionStorage.setItem("carrito", JSON.stringify(elementosComprados));
}

// ============================================================
//  NOTIFICACIONES
// ============================================================

const alertaNoti = document.getElementById("alertaNoti");
let timeoutId = null;

function showNotification(mensaje, tipo = "success") {
    alertaNoti.classList.remove("hide", "remove", "show");
    void alertaNoti.offsetWidth;
    alertaNoti.classList.add("show");
    document.getElementById("alertMsj").innerHTML = mensaje;

    const iconBg = document.getElementById("alertIcon");
    iconBg.style.backgroundColor = tipo === "error" ? "#e53e3e" : "#17a34a";

    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
        alertaNoti.classList.remove("show");
        alertaNoti.classList.add("hide");
        alertaNoti.addEventListener("animationend", () => {
            if (!alertaNoti.classList.contains("show")) alertaNoti.classList.add("remove");
        }, { once: true });
    }, 3000);
}

document.getElementById("alertClose").addEventListener("click", () => {
    if (timeoutId) clearTimeout(timeoutId);
    alertaNoti.classList.remove("show");
    alertaNoti.classList.add("hide");
    alertaNoti.addEventListener("animationend", () => {
        alertaNoti.classList.add("remove");
    }, { once: true });
});

// ============================================================
//  POPUP DE CONFIRMACIÓN
// ============================================================

function showConfirm(mensaje, onConfirm, onCancel) {
    const existing = document.getElementById("customConfirmOverlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "customConfirmOverlay";
    overlay.style.cssText = `
        position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;
        display:flex;align-items:center;justify-content:center;
        animation:fadeInOverlay 0.2s ease;
    `;

    const box = document.createElement("div");
    box.style.cssText = `
        background:#fff;border-radius:1em;padding:2em 2em 1.5em;
        max-width:360px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.18);
        animation:slideUpModal 0.22s ease;text-align:center;
    `;

    box.innerHTML = `
        <div style="font-size:2em;margin-bottom:0.4em;">❓</div>
        <p style="font-size:1em;color:#333;margin-bottom:1.4em;line-height:1.5;">${mensaje}</p>
        <div style="display:flex;gap:0.8em;justify-content:center;">
            <button id="confirmNo" style="flex:1;padding:0.65em 1em;border-radius:2em;border:1.5px solid #ccc;background:#f5f5f5;font-size:0.95em;cursor:pointer;font-weight:600;">Cancelar</button>
            <button id="confirmSi" style="flex:1;padding:0.65em 1em;border-radius:2em;border:none;background:#FDCD00;font-size:0.95em;cursor:pointer;font-weight:700;">Confirmar</button>
        </div>
    `;

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector("#confirmSi").addEventListener("click", () => { close(); onConfirm && onConfirm(); });
    overlay.querySelector("#confirmNo").addEventListener("click", () => { close(); onCancel && onCancel(); });
    overlay.addEventListener("click", e => { if (e.target === overlay) { close(); onCancel && onCancel(); } });
}

// ============================================================
//  TARJETAS DE PRODUCTOS + EMPTY STATE
// ============================================================

function renderProductsEmptyState(tipo = "vacio") {
    const contenido = document.getElementById("contenido");
    if (tipo === "error") {
        contenido.innerHTML = `
            <div class="productsEmptyState">
                <img src="https://cdn-icons-png.flaticon.com/512/6195/6195678.png" alt="Error de conexión" class="emptyStateImg">
                <h2>Sin conexión con la tienda</h2>
                <p>No pudimos cargar los productos.<br>Revisa tu conexión e intenta de nuevo.</p>
                <button class="btnRecargar" onclick="location.reload()">
                    <i class="fa-solid fa-rotate-right"></i> Reintentar
                </button>
            </div>`;
    } else {
        contenido.innerHTML = `
            <div class="productsEmptyState">
                <img src="https://cdn-icons-png.flaticon.com/512/4076/4076549.png" alt="Sin productos" class="emptyStateImg">
                <h2>No hay productos disponibles</h2>
                <p>Todavía no se han agregado productos a la tienda.</p>
                <button class="btnRecargar" onclick="location.reload()">
                    <i class="fa-solid fa-rotate-right"></i> Actualizar
                </button>
            </div>`;
    }
}

function crearTarjeta(producto) {
    const contenedor = document.getElementById("contenido");
    const tarjeta    = document.createElement("div");
    tarjeta.classList.add("tarjeta");
    tarjeta.setAttribute("id", `tarjeta-${producto.id}`);
    tarjeta.innerHTML = `
        <div class="imgContainer"><img src="${producto.imagen}" class="imagenProducto" onerror="this.src='https://cdn-icons-png.flaticon.com/512/1178/1178479.png'"></div>
        <div class="info">
            ${producto.categoria ? `<span class="categoriaBadge">${producto.categoria}</span>` : ''}
            <h2>${producto.nombre}</h2>
            <p id="stock-${producto.id}">Stock: ${producto.stock}</p>
            <p>Precio: $${producto.precio.toLocaleString()}</p>
        </div>
        <button class="ponerCarro ${producto.stock <= 0 ? 'disabledButton' : ''}"
                id="btn-${producto.id}"
                data-id="${producto.id}"
                ${producto.stock <= 0 ? 'disabled' : ''}>
            ${producto.stock <= 0 ? 'Agotado' : 'Agregar a carrito'}
        </button>
    `;
    contenedor.appendChild(tarjeta);
    if (producto.stock > 0) {
        tarjeta.querySelector(`#btn-${producto.id}`).addEventListener("click", addToCart);
    }
}

function renderAllCards() {
    document.getElementById("contenido").innerHTML = "";
    if (Productos.length === 0) { renderProductsEmptyState("vacio"); return; }
    Productos.forEach(p => crearTarjeta(p));
    buscarProductos();
}

// ============================================================
//  LÓGICA DEL CARRITO
// ============================================================

function addToCart(e) {
    const idProducto = e.target.dataset.id;
    const producto   = Productos.find(p => p.id === idProducto);
    if (!producto || producto.stock <= 0) return;

    producto.stock--;
    document.getElementById(`stock-${producto.id}`).innerHTML = `Stock: ${producto.stock}`;

    if (producto.stock <= 0) {
        const btn = document.getElementById(`btn-${producto.id}`);
        btn.innerHTML = "Agotado";
        btn.classList.remove("ponerCarro");
        btn.classList.add("disabledButton");
        btn.disabled = true;
    }

    const existente = elementosComprados.find(p => p.id === idProducto);
    if (existente) {
        existente.cantidad++;
    } else {
        elementosComprados.push({ id: producto.id, nombre: producto.nombre, precio: producto.precio, imagen: producto.imagen, cantidad: 1 });
    }
    saveCart();
    renderCart();
    recalcularCounter();
    showNotification(`Se añadió: <strong>${producto.nombre}</strong> al carrito`);
}

function renderCart() {
    const container = document.getElementById("cartItemsContainer");
    const emptyEl   = document.getElementById("empty");
    const payEl     = document.getElementById("payresult");

    // ── Actualizar título según tipo de venta ──────────────────
    const tituloEl = document.getElementById("cartTitulo");
    const badgeEl  = document.getElementById("cartBadge");
    if (tituloEl) tituloEl.textContent = "Venta";
    if (badgeEl) {
        if (ventaGuardadaActiva) {
            const nombre = ventaGuardadaActiva.cliente?.nombre &&
                           ventaGuardadaActiva.cliente.nombre !== "nulo"
                           ? ventaGuardadaActiva.cliente.nombre : null;
            badgeEl.innerHTML = nombre
                ? `<span class="cartBadgeGuardada"><i class="fa-solid fa-bookmark"></i> Guardada · ${nombre}</span>`
                : `<span class="cartBadgeGuardada"><i class="fa-solid fa-bookmark"></i> Guardada</span>`;
        } else {
            badgeEl.innerHTML = `<span class="cartBadgeNueva"><i class="fa-solid fa-plus"></i> Nueva</span>`;
        }
    }

    container.innerHTML = "";

    if (elementosComprados.length === 0) {
        emptyEl.style.display = "block";
        payEl.style.display   = "none";
        return;
    }

    emptyEl.style.display = "none";
    payEl.style.display   = "flex";

    elementosComprados.forEach(producto => {
        const div = document.createElement("div");
        div.classList.add("producto");
        div.innerHTML = `
            <div class="infoProducto">
                <h2>${producto.nombre}</h2>
                <div class="editableRow">
                    <label class="editableLabel">Precio unit.</label>
                    <div class="editableInputWrap">
                        <span class="editablePrefix">$</span>
                        <input class="inputPrecio" type="number" min="0"
                               data-id="${producto.id}"
                               value="${producto.precio}"
                               title="Editar precio unitario">
                    </div>
                    <button class="btnActualizarPrecio" data-id="${producto.id}"
                            title="Guardar nuevo precio en el catálogo">
                        <i class="fa-solid fa-cloud-arrow-up"></i>
                    </button>
                </div>
                <div class="editableRow subtotalRow">
                    <label class="editableLabel">Subtotal</label>
                    <span class="subtotalVal" id="precio-${producto.id}">
                        $${(producto.precio * producto.cantidad).toLocaleString()}
                    </span>
                </div>
            </div>
            <div class="containerBotones" id="cbtns-${producto.id}">
                <button class="quitar"   data-id="${producto.id}">-</button>
                <input class="inputCantidad" type="number" min="1"
                       data-id="${producto.id}"
                       value="${producto.cantidad}"
                       title="Editar cantidad">
                <button class="agregar"  data-id="${producto.id}">+</button>
                <button class="eliminar" data-id="${producto.id}">x</button>
            </div>
        `;
        container.appendChild(div);
    });

    container.querySelectorAll(".agregar").forEach(b  => b.addEventListener("click", cartAdd));
    container.querySelectorAll(".quitar").forEach(b   => b.addEventListener("click", cartRemove));
    container.querySelectorAll(".eliminar").forEach(b => b.addEventListener("click", cartDelete));

    // ── Edición inline de precio ──────────────────────────────
    // "input": actualiza subtotal y total en tiempo real mientras escribe
    // Enter: bloqueado (el botón de nube es el único que sube precio a Sheets)
    container.querySelectorAll(".inputPrecio").forEach(input => {
        // Bloquear Enter para que no dispare eventos no deseados
        input.addEventListener("keydown", function (e) {
            if (e.key === "Enter") e.preventDefault();
        });

        input.addEventListener("input", function () {
            const id        = this.dataset.id;
            const cartProd  = elementosComprados.find(p => p.id === id);
            if (!cartProd) return;
            const nuevoPrecio = Math.max(0, parseFloat(this.value) || 0);
            cartProd.precio = nuevoPrecio;
            // Actualizar subtotal visual sin re-renderizar
            const subEl = document.getElementById(`precio-${id}`);
            if (subEl) subEl.textContent = `$${(nuevoPrecio * cartProd.cantidad).toLocaleString()}`;
            totalPersonalizado = null;
            saveCart();
            _actualizarTotalUI();
        });

        // Al salir del campo, limpiar valor vacío
        input.addEventListener("blur", function () {
            if (this.value === "" || isNaN(parseFloat(this.value))) {
                const id = this.dataset.id;
                const cartProd = elementosComprados.find(p => p.id === id);
                this.value = cartProd ? cartProd.precio : 0;
            }
        });
    });

    // ── Actualizar precio en Sheets ──────────────────────────
    container.querySelectorAll(".btnActualizarPrecio").forEach(btn => {
        btn.addEventListener("click", async function () {
            const id       = this.dataset.id;
            const cartProd = elementosComprados.find(p => p.id === id);
            const prod     = Productos.find(p => p.id === id);
            if (!cartProd || !prod) return;

            const nuevoPrecio = cartProd.precio;
            if (nuevoPrecio === prod.precio) {
                showNotification("El precio ya está actualizado en el catálogo.", "error");
                return;
            }

            this.disabled = true;
            this.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;

            const productoActualizado = { ...prod, precio: nuevoPrecio };
            const ok = await saveProductRemote("update", productoActualizado);

            if (ok) {
                prod.precio = nuevoPrecio; // actualizar en memoria local también
                showNotification(`Precio de <strong>${prod.nombre}</strong> actualizado a $${nuevoPrecio.toLocaleString()} en el catálogo ✔`);
                this.innerHTML = `<i class="fa-solid fa-check"></i>`;
                this.style.background = "#27ae60";
                this.style.color = "#fff";
                this.style.borderColor = "#27ae60";
                setTimeout(() => {
                    this.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i>`;
                    this.style.background = "";
                    this.style.color = "";
                    this.style.borderColor = "";
                    this.disabled = false;
                }, 2000);
            } else {
                this.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i>`;
                this.disabled = false;
            }
        });
    });

    // ── Edición inline de cantidad ────────────────────────────
    container.querySelectorAll(".inputCantidad").forEach(input => {
        input.addEventListener("change", function () {
            const id        = this.dataset.id;
            const cartProd  = elementosComprados.find(p => p.id === id);
            const prod      = Productos.find(p => p.id === id);
            if (!cartProd) return;

            const cantAnterior = cartProd.cantidad;
            let   cantNueva    = Math.max(1, parseInt(this.value) || 1);

            // Verificar stock disponible
            if (prod) {
                const stockDisponible = prod.stock + cantAnterior; // stock real + lo que ya está en carrito
                if (cantNueva > stockDisponible) {
                    cantNueva = stockDisponible;
                    showNotification(`Stock máximo disponible: ${stockDisponible}`, "error");
                }
                // Ajustar stock local
                prod.stock = prod.stock + cantAnterior - cantNueva;
                const stockEl = document.getElementById(`stock-${id}`);
                if (stockEl) stockEl.innerHTML = `Stock: ${prod.stock}`;
                const btnEl = document.getElementById(`btn-${id}`);
                if (btnEl) {
                    if (prod.stock <= 0) {
                        btnEl.innerHTML = "Agotado"; btnEl.classList.remove("ponerCarro");
                        btnEl.classList.add("disabledButton"); btnEl.disabled = true;
                    } else {
                        btnEl.innerHTML = "Agregar a carrito"; btnEl.classList.add("ponerCarro");
                        btnEl.classList.remove("disabledButton"); btnEl.disabled = false;
                    }
                }
            }

            this.value = cantNueva;
            cartProd.cantidad = cantNueva;
            // Actualizar subtotal visual sin re-renderizar
            const subEl = document.getElementById(`precio-${id}`);
            if (subEl) subEl.textContent = `$${(cartProd.precio * cantNueva).toLocaleString()}`;
            totalPersonalizado = null;
            saveCart();
            _actualizarTotalUI();
            recalcularCounter();
        });
    });

    renderPayResult();
}

function renderPayResult() {
    const totalCalc  = elementosComprados.reduce((s, p) => s + p.precio * p.cantidad, 0);
    const totalUnits = elementosComprados.reduce((s, p) => s + p.cantidad, 0);
    const totalMostrar = totalPersonalizado !== null ? totalPersonalizado : totalCalc;
    const payEl      = document.getElementById("payresult");
    payEl.innerHTML  = `
        <p class="cartUnidades">Productos: <strong>${totalUnits}</strong></p>
        <div class="totalEditableRow">
            <label class="totalEditableLabel">Total</label>
            <div class="totalEditableWrap">
                <span class="editablePrefix">$</span>
                <input id="inputTotalVenta" class="inputTotalVenta" type="number" min="0"
                       value="${totalMostrar}"
                       title="Editar total de la venta">
            </div>
            ${totalPersonalizado !== null ? `<button id="btnResetTotal" class="btnResetTotal" title="Restaurar total calculado">
                <i class="fa-solid fa-rotate-left"></i>
            </button>` : ""}
        </div>
        <div class="cartAcciones">
            <button class="pagar" id="btnPagar">Pagar</button>
            <button class="btnGuardarVenta" id="btnGuardarVenta">
                <i class="fa-solid fa-bookmark"></i> Guardar Venta
            </button>
            <button class="btnVaciarCarrito" id="btnVaciarCarrito" title="Vaciar venta">
                <i class="fa-solid fa-trash"></i> Vaciar
            </button>
        </div>
    `;
    document.getElementById("btnPagar").addEventListener("click", pagar);
    document.getElementById("btnGuardarVenta").addEventListener("click", iniciarGuardarVenta);
    document.getElementById("btnVaciarCarrito").addEventListener("click", vaciarCarrito);

    // Edición del total
    document.getElementById("inputTotalVenta").addEventListener("change", function () {
        const v = parseFloat(this.value);
        if (!isNaN(v) && v >= 0) {
            totalPersonalizado = v;
        } else {
            totalPersonalizado = null;
            this.value = elementosComprados.reduce((s, p) => s + p.precio * p.cantidad, 0);
        }
        // Re-render solo el panel de pago para mostrar/ocultar botón reset
        renderPayResult();
    });

    const resetBtn = document.getElementById("btnResetTotal");
    if (resetBtn) {
        resetBtn.addEventListener("click", () => {
            totalPersonalizado = null;
            renderPayResult();
        });
    }
}

// Actualiza solo el valor del total sin re-renderizar todo
function _actualizarTotalUI() {
    const input = document.getElementById("inputTotalVenta");
    if (!input || totalPersonalizado !== null) return; // si hay total manual no tocar
    const totalCalc = elementosComprados.reduce((s, p) => s + p.precio * p.cantidad, 0);
    input.value = totalCalc;
}

function vaciarCarrito() {
    showConfirm("¿Vaciar toda la venta actual?<br>Los productos volverán al stock.", () => {
        // Devolver stock de todos los items
        elementosComprados.forEach(item => {
            const prod = Productos.find(p => p.id === item.id);
            if (!prod) return;
            prod.stock += item.cantidad;
            const stockEl = document.getElementById(`stock-${prod.id}`);
            if (stockEl) stockEl.innerHTML = `Stock: ${prod.stock}`;
            const btnEl = document.getElementById(`btn-${prod.id}`);
            if (btnEl && prod.stock > 0) {
                btnEl.innerHTML = "Agregar a carrito";
                btnEl.classList.add("ponerCarro");
                btnEl.classList.remove("disabledButton");
                btnEl.disabled = false;
                btnEl.addEventListener("click", addToCart);
            }
        });
        // Limpiar venta guardada activa si existía
        ventaGuardadaActiva  = null;
        totalPersonalizado   = null;
        elementosComprados   = [];
        saveCart();
        renderCart();
        recalcularCounter();
        showNotification("Venta vaciada. Stock restaurado.");
    });
}

function cartAdd(e) {
    const id       = e.target.dataset.id;
    const prod     = Productos.find(p => p.id === id);
    const cartProd = elementosComprados.find(p => p.id === id);
    if (!cartProd) return;
    if (prod && prod.stock <= 0) { showNotification(`No hay más stock de <strong>${cartProd.nombre}</strong>`, "error"); return; }
    cartProd.cantidad++;
    if (prod) {
        prod.stock--;
        document.getElementById(`stock-${id}`).innerHTML = `Stock: ${prod.stock}`;
        if (prod.stock <= 0) {
            const btn = document.getElementById(`btn-${id}`);
            if (btn) { btn.innerHTML = "Agotado"; btn.classList.remove("ponerCarro"); btn.classList.add("disabledButton"); btn.disabled = true; }
        }
    }
    saveCart(); renderCart(); recalcularCounter();
}

function cartRemove(e) {
    const id       = e.target.dataset.id;
    const cartProd = elementosComprados.find(p => p.id === id);
    const prod     = Productos.find(p => p.id === id);
    if (!cartProd || cartProd.cantidad <= 1) { showNotification(`No se puede dejar en 0`, "error"); return; }
    cartProd.cantidad--;
    if (prod) {
        prod.stock++;
        document.getElementById(`stock-${id}`).innerHTML = `Stock: ${prod.stock}`;
        const btn = document.getElementById(`btn-${id}`);
        if (btn && prod.stock > 0) { btn.innerHTML = "Agregar a carrito"; btn.classList.add("ponerCarro"); btn.classList.remove("disabledButton"); btn.disabled = false; btn.addEventListener("click", addToCart); }
    }
    saveCart(); renderCart(); recalcularCounter();
}

function cartDelete(e) {
    const id       = e.target.dataset.id;
    const cartProd = elementosComprados.find(p => p.id === id);
    const prod     = Productos.find(p => p.id === id);
    showConfirm("¿Quitar este producto del carrito?", () => {
        if (cartProd && prod) {
            prod.stock += cartProd.cantidad;
            document.getElementById(`stock-${id}`).innerHTML = `Stock: ${prod.stock}`;
            const btn = document.getElementById(`btn-${id}`);
            if (btn && prod.stock > 0) { btn.innerHTML = "Agregar a carrito"; btn.classList.add("ponerCarro"); btn.classList.remove("disabledButton"); btn.disabled = false; btn.addEventListener("click", addToCart); }
        }
        elementosComprados = elementosComprados.filter(p => p.id !== id);
        saveCart(); renderCart(); recalcularCounter();
    });
}

function pagar() {
    if (elementosComprados.length === 0) return;
    metodoPagoSeleccionado = null;
    abrirVentasModal();
}

// ============================================================
//  CONTADOR
// ============================================================

function recalcularCounter() {
    document.getElementById("contador").innerHTML = elementosComprados.reduce((s, p) => s + p.cantidad, 0);
}

// ============================================================
//  BUSCADOR
// ============================================================

let antifiltro = [];

function buscarProductos() {
    const search = document.getElementById("search");
    search.removeEventListener("input", handleSearch);
    search.addEventListener("input", handleSearch);
}

function handleSearch(e) {
    const inputText = e.target.value.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const filtro    = Productos.filter(i => i.nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(inputText));
    antifiltro      = Productos.filter(i => !i.nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(inputText));
    filtro.forEach(i => { const t = document.getElementById(`tarjeta-${i.id}`); if (t) { t.classList.remove("remove"); t.classList.add("showDiv"); } });
    antifiltro.forEach(i => { const t = document.getElementById(`tarjeta-${i.id}`); if (t) t.classList.add("remove"); });
    toggleEmptyMessage();
}

function toggleEmptyMessage() {
    document.getElementById("buscadorVacio").style.display = antifiltro.length === Productos.length ? "block" : "none";
}

// ============================================================
//  INIT
// ============================================================

document.addEventListener("DOMContentLoaded", async () => {
    document.getElementById("contenido").innerHTML =
        `<p style="grid-column:1/-1;text-align:center;color:#888;padding:2rem;">Cargando productos…</p>`;
    try {
        await loadProducts();
        renderAllCards();
    } catch (err) {
        console.error("Init error:", err);
        renderProductsEmptyState("error");
    }
    renderCart();
    recalcularCounter();
});
