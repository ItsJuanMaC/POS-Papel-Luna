// ============================================================
//  CATEGORÍAS — carga dinámica desde Sheets
//  También llamada por gestion.js cuando cambian las categorías
// ============================================================

let _categoriasCache = []; // nombres de categoría desde Sheets

async function loadCategorias() {
    try {
        const res  = await fetch(`${GAS_URL}?resource=categorias`);
        const json = await res.json();
        if (!json.success) throw new Error(json.message);
        _categoriasCache = json.data
            .map(c => String(c.nombre || "").trim())
            .filter(n => n && n !== "nulo");
    } catch (err) {
        console.error("loadCategorias:", err);
        _categoriasCache = [];
    }
    _poblarSelectCategoria();
}

function _poblarSelectCategoria() {
    const sel = document.getElementById("formCategoria");
    if (!sel) return;

    // Guardar valor seleccionado para restaurarlo si ya había uno
    const valorActual = sel.value;

    // Limpiar y reconstruir
    sel.innerHTML = `<option value="" disabled selected>Selecciona una categoría</option>`;

    _categoriasCache.forEach(nombre => {
        const opt = document.createElement("option");
        opt.value       = nombre;
        opt.textContent = nombre;
        sel.appendChild(opt);
    });

    // Opción "Otro" siempre al final
    const otroOpt = document.createElement("option");
    otroOpt.value       = "Otro";
    otroOpt.textContent = "Otro…";
    sel.appendChild(otroOpt);

    // Restaurar selección previa si sigue siendo válida
    if (valorActual) sel.value = valorActual;
}

// ============================================================
//  crud.js — Módulo CRUD de Productos
//  Contiene: modal de gestión, formulario, lista, editar y
//  eliminar productos.
//
//  Requiere: app.js (cargado antes en el HTML)
// ============================================================

const crudOverlay   = document.getElementById("crudOverlay");
const openCrudBtn   = document.getElementById("openCrud");
const closeCrudBtn  = document.getElementById("closeCrud");
const productForm   = document.getElementById("productForm");
const cancelEditBtn = document.getElementById("cancelEdit");

// ============================================================
//  ABRIR / CERRAR MODAL
// ============================================================

openCrudBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    crudOverlay.classList.remove("remove");
    void crudOverlay.offsetWidth;
    crudOverlay.classList.add("crudVisible");
    await loadCategorias(); // Cargar (o refrescar) categorías desde Sheets
    renderCrudList();
});

function closeCrud() {
    crudOverlay.classList.remove("crudVisible");
    crudOverlay.addEventListener("transitionend", () => {
        crudOverlay.classList.add("remove");
    }, { once: true });
    resetForm();
}

closeCrudBtn.addEventListener("click", closeCrud);
crudOverlay.addEventListener("click", (e) => { if (e.target === crudOverlay) closeCrud(); });

// ============================================================
//  FORMULARIO
// ============================================================

cancelEditBtn.addEventListener("click", resetForm);

function resetForm() {
    productForm.reset();
    document.getElementById("editId").value = "";
    document.getElementById("formSubmitBtn").textContent = "Guardar Producto";
    document.getElementById("formCategoriaCustom").classList.add("remove");
    cancelEditBtn.classList.add("remove");
}

document.getElementById("formCategoria").addEventListener("change", function () {
    const customInput = document.getElementById("formCategoriaCustom");
    if (this.value === "Otro") {
        customInput.classList.remove("remove");
        customInput.required = true;
    } else {
        customInput.classList.add("remove");
        customInput.required = false;
        customInput.value = "";
    }
});

productForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const submitBtn = document.getElementById("formSubmitBtn");
    submitBtn.disabled = true;
    submitBtn.textContent = "Guardando…";

    const editId    = document.getElementById("editId").value;
    const nombre    = document.getElementById("formName").value.trim();
    const precio    = parseInt(document.getElementById("formPrice").value);
    const stock     = parseInt(document.getElementById("formStock").value);
    const imagen    = document.getElementById("formImage").value.trim();
    const costo     = parseInt(document.getElementById("formCosto").value) || 0;
    const catSel    = document.getElementById("formCategoria").value;
    const catCustom = document.getElementById("formCategoriaCustom").value.trim();
    const categoria = catSel === "Otro" ? (catCustom || "Otro") : catSel;

    if (!nombre || !precio || stock < 0 || !imagen || !categoria) {
        submitBtn.disabled = false;
        submitBtn.textContent = editId ? "Actualizar Producto" : "Guardar Producto";
        return;
    }

    if (editId) {
        // Editar producto existente
        const idx = Productos.findIndex(p => p.id === editId);
        if (idx !== -1) {
            const updated = { ...Productos[idx], nombre, precio, stock, imagen, costo, categoria };
            const ok = await saveProductRemote("update", updated);
            if (ok) {
                Productos[idx] = updated;
                showNotification(`Producto <strong>${nombre}</strong> actualizado`);
            }
        }
    } else {
        // Agregar nuevo producto
        const newId = nombre.toLowerCase().replace(/\s+/g, "-") + "-" + Date.now();
        if (Productos.find(p => p.id === newId)) {
            showNotification("Ya existe un producto con ese nombre", "error");
            submitBtn.disabled = false;
            submitBtn.textContent = "Guardar Producto";
            return;
        }
        const newProd = { id: newId, nombre, precio, stock, imagen, costo, categoria };
        const ok = await saveProductRemote("create", newProd);
        if (ok) {
            Productos.push(newProd);
            showNotification(`Producto <strong>${nombre}</strong> agregado`);
        }
    }

    submitBtn.disabled = false;
    submitBtn.textContent = editId ? "Actualizar Producto" : "Guardar Producto";
    resetForm();
    renderAllCards();
    renderCrudList();
});

// ============================================================
//  LISTA DE PRODUCTOS EN EL MODAL
// ============================================================

function renderCrudList() {
    const list = document.getElementById("crudProductList");
    list.innerHTML = "<h3>Productos existentes</h3>";

    if (Productos.length === 0) {
        list.innerHTML += "<p>No hay productos.</p>";
        return;
    }

    Productos.forEach(p => {
        const row = document.createElement("div");
        row.classList.add("crudRow");
        row.innerHTML = `
            <img src="${p.imagen}" class="crudThumb" onerror="this.src='https://cdn-icons-png.flaticon.com/512/1178/1178479.png'">
            <div class="crudRowInfo">
                <strong>${p.nombre}</strong>
                ${p.categoria ? `<span class="categoriaBadge categoriaBadgeCrud">${p.categoria}</span>` : ''}
                <span class="crudPrices">Precio: $${p.precio.toLocaleString()}${p.costo ? ` · Costo: $${p.costo.toLocaleString()} · <span class="margenLabel">Margen: $${(p.precio - p.costo).toLocaleString()}</span>` : ''}</span>
                <span>Stock: ${p.stock}</span>
            </div>
            <div class="crudRowBtns">
                <button class="btnEditar"   data-id="${p.id}"><i class="fa-solid fa-pen"></i></button>
                <button class="btnEliminar" data-id="${p.id}"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;
        list.appendChild(row);
    });

    list.querySelectorAll(".btnEditar").forEach(b   => b.addEventListener("click", startEdit));
    list.querySelectorAll(".btnEliminar").forEach(b => b.addEventListener("click", deleteProduct));
}

// ============================================================
//  EDITAR PRODUCTO
// ============================================================

function startEdit(e) {
    const id   = e.currentTarget.dataset.id;
    const prod = Productos.find(p => p.id === id);
    if (!prod) return;

    document.getElementById("editId").value    = prod.id;
    document.getElementById("formName").value  = prod.nombre;
    document.getElementById("formPrice").value = prod.precio;
    document.getElementById("formStock").value = prod.stock;
    document.getElementById("formImage").value = prod.imagen;
    document.getElementById("formCosto").value = prod.costo || 0;

    const selectEl    = document.getElementById("formCategoria");
    const customInput = document.getElementById("formCategoriaCustom");
    const presetVals  = Array.from(selectEl.options).map(o => o.value);

    if (prod.categoria && presetVals.includes(prod.categoria)) {
        selectEl.value = prod.categoria;
        customInput.classList.add("remove");
        customInput.required = false;
    } else if (prod.categoria) {
        selectEl.value = "Otro";
        customInput.value = prod.categoria;
        customInput.classList.remove("remove");
        customInput.required = true;
    } else {
        selectEl.value = "";
    }

    document.getElementById("formSubmitBtn").textContent = "Actualizar Producto";
    cancelEditBtn.classList.remove("remove");
    document.getElementById("crudModal").scrollTop = 0;
}

// ============================================================
//  ELIMINAR PRODUCTO
// ============================================================

async function deleteProduct(e) {
    const id   = e.currentTarget.dataset.id;
    const prod = Productos.find(p => p.id === id);
    if (!prod) return;

    showConfirm(`¿Eliminar "<strong>${prod.nombre}</strong>"?<br>Esta acción no se puede deshacer.`, async () => {
        const ok = await saveProductRemote("delete", { id });
        if (!ok) return;

        Productos = Productos.filter(p => p.id !== id);

        const wasInCart = elementosComprados.find(p => p.id === id);
        if (wasInCart) {
            elementosComprados = elementosComprados.filter(p => p.id !== id);
            saveCart();
            renderCart();
            recalcularCounter();
        }

        showNotification(`Producto <strong>${prod.nombre}</strong> eliminado`);
        renderAllCards();
        renderCrudList();
        resetForm();
    });
}
