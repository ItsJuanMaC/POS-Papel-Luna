// ============================================================
//  gestion.js — Módulo de Gestión
//  Menú: Clientes · Proveedores · Categorías
//  Todos con CRUD completo + validación de duplicados.
//
//  Requiere: app.js (cargado antes en el HTML)
// ============================================================

// ── Utilidad compartida ───────────────────────────────────────
function escHtml(str) {
    return String(str || "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function _normalizar(v) { return String(v || "").trim().toLowerCase(); }

// ============================================================
//  MENÚ GESTIÓN
// ============================================================

document.getElementById("openGestion").addEventListener("click", e => {
    e.preventDefault();
    const prev = document.getElementById("gestionMenuPopup");
    if (prev) { prev.remove(); return; }

    const rect = document.getElementById("openGestion").getBoundingClientRect();
    const menu = document.createElement("div");
    menu.id = "gestionMenuPopup";
    menu.style.cssText = `
        position:fixed;top:${rect.bottom + 8}px;left:${Math.max(8, rect.left - 40)}px;
        background:#fff;border-radius:0.8em;box-shadow:0 6px 24px rgba(0,0,0,0.15);
        border:1px solid rgba(0,0,0,0.08);z-index:500;min-width:210px;
        animation:slideUpModal 0.18s ease;overflow:hidden;
    `;
    menu.innerHTML = `
        <button class="ventasMenuItem" id="menuClientes">
            <i class="fa-solid fa-users"  style="color:#3498db;width:1.2em;"></i> Clientes
        </button>
        <button class="ventasMenuItem" id="menuProveedores">
            <i class="fa-solid fa-truck"  style="color:#e67e22;width:1.2em;"></i> Proveedores
        </button>
        <button class="ventasMenuItem" id="menuCategorias">
            <i class="fa-solid fa-tags"   style="color:#9b59b6;width:1.2em;"></i> Categorías
        </button>
    `;
    document.body.appendChild(menu);

    menu.querySelector("#menuClientes").addEventListener("click",    () => { menu.remove(); abrirClientesModal();    });
    menu.querySelector("#menuProveedores").addEventListener("click", () => { menu.remove(); abrirProveedoresModal(); });
    menu.querySelector("#menuCategorias").addEventListener("click",  () => { menu.remove(); abrirCategoriasModal();  });

    setTimeout(() => {
        document.addEventListener("click", function h(ev) {
            if (!menu.contains(ev.target) && ev.target !== document.getElementById("openGestion")) menu.remove();
            document.removeEventListener("click", h);
        });
    }, 0);
});

// ============================================================
//  FÁBRICA GENÉRICA — construye el módulo CRUD para una entidad
//  config = {
//    resource,          // nombre hoja Sheets
//    overlayId,         // id del overlay
//    closeId,           // id del botón cerrar
//    formId,            // id del div form
//    editHiddenId,      // id del input hidden
//    listaId,           // id del div lista
//    searchId,          // id del input búsqueda
//    submitId,          // id del botón submit
//    cancelId,          // id del botón cancelar
//    camposPrimario,    // { id, label, placeholder, tipo } campo principal (debe ser único)
//    camposExtra,       // [{ id, label, placeholder, tipo }] campos adicionales (puede ser [])
//    labelEntidad,      // "Cliente" / "Proveedor" / "Categoría"
//    labelEntidades,    // "clientes" / "proveedores" / "categorías"
//    keyUnico,          // clave del campo que debe ser único, ej: "nombre"/"entidad"/"nombre"
//  }
// ============================================================

function _crearModuloGestion(cfg) {
    let _data   = [];    // cache
    let _editId = null;  // id editando

    const overlay   = document.getElementById(cfg.overlayId);
    const closeBtn  = document.getElementById(cfg.closeId);
    const submitBtn = document.getElementById(cfg.submitId);
    const cancelBtn = document.getElementById(cfg.cancelId);
    const searchEl  = document.getElementById(cfg.searchId);
    const listaEl   = document.getElementById(cfg.listaId);

    // ── Abrir / Cerrar ────────────────────────────────────────
    function abrir() {
        overlay.classList.remove("remove");
        void overlay.offsetWidth;
        overlay.classList.add("crudVisible");
        _reset();
        searchEl.value = "";
        listaEl.innerHTML = `<p style="text-align:center;color:#aaa;padding:2em 0;">Cargando…</p>`;
        _cargar();
    }

    function cerrar() {
        overlay.classList.remove("crudVisible");
        overlay.addEventListener("transitionend", () => overlay.classList.add("remove"), { once: true });
        _reset();
    }

    closeBtn.addEventListener("click", cerrar);
    overlay.addEventListener("click", e => { if (e.target === overlay) cerrar(); });

    // ── Reset formulario ──────────────────────────────────────
    function _reset() {
        document.getElementById(cfg.editHiddenId).value = "";
        [cfg.camposPrimario, ...cfg.camposExtra].forEach(c => {
            const el = document.getElementById(c.id);
            if (el) el.value = "";
        });
        submitBtn.textContent = `Guardar ${cfg.labelEntidad}`;
        cancelBtn.classList.add("remove");
        _editId = null;
    }

    cancelBtn.addEventListener("click", () => { _reset(); _renderFiltrado(); });

    // ── Submit: crear o actualizar ────────────────────────────
    submitBtn.addEventListener("click", async () => {
        const primVal = document.getElementById(cfg.camposPrimario.id).value.trim();
        if (!primVal) {
            showNotification(`${cfg.camposPrimario.label} es obligatorio.`, "error");
            return;
        }

        // ── Validar duplicado ─────────────────────────────────
        const duplicado = _data.find(d =>
            _normalizar(d[cfg.keyUnico]) === _normalizar(primVal) && d.id !== _editId
        );
        if (duplicado) {
            showNotification(
                `Ya existe ${cfg.labelEntidad.toLowerCase()} con ${cfg.camposPrimario.label.toLowerCase()} <strong>${escHtml(primVal)}</strong>.`,
                "error"
            );
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = "Guardando…";

        // Construir payload con los campos extra
        const extraVals = {};
        cfg.camposExtra.forEach(c => {
            extraVals[c.key] = document.getElementById(c.id).value.trim() || "nulo";
        });

        try {
            if (_editId) {
                // UPDATE
                const json = await gasPost(cfg.resource, {
                    action: "update", id: _editId,
                    [cfg.keyUnico]: primVal,
                    ...extraVals
                });
                if (!json.success) throw new Error(json.message);

                const idx = _data.findIndex(d => d.id === _editId);
                if (idx !== -1) _data[idx] = { id: _editId, [cfg.keyUnico]: primVal, ...extraVals };
                showNotification(`${cfg.labelEntidad} <strong>${escHtml(primVal)}</strong> actualizado/a ✔`);
                if (cfg.resource === "categorias" && typeof loadCategorias === "function") loadCategorias();

            } else {
                // CREATE
                const newId = String(Date.now());
                const json  = await gasPost(cfg.resource, {
                    id: newId,
                    [cfg.keyUnico]: primVal,
                    ...extraVals
                });
                if (!json.success) throw new Error(json.message);

                _data.push({ id: newId, [cfg.keyUnico]: primVal, ...extraVals });
                showNotification(`${cfg.labelEntidad} <strong>${escHtml(primVal)}</strong> agregado/a ✔`);
                if (cfg.resource === "categorias" && typeof loadCategorias === "function") loadCategorias();
            }

            _reset();
            _renderFiltrado();

        } catch (err) {
            console.error(`${cfg.resource} submit:`, err);
            showNotification("Error al guardar. Intenta de nuevo.", "error");
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = _editId
                ? `Actualizar ${cfg.labelEntidad}`
                : `Guardar ${cfg.labelEntidad}`;
        }
    });

    // ── Cargar desde Sheets ───────────────────────────────────
    async function _cargar() {
        try {
            const res  = await fetch(`${GAS_URL}?resource=${cfg.resource}`);
            const json = await res.json();
            if (!json.success) throw new Error(json.message);

            _data = json.data.map(row => {
                const obj = { id: String(row.id || "") };
                [cfg.camposPrimario, ...cfg.camposExtra].forEach(c => {
                    obj[c.key] = String(row[c.key] || "");
                });
                return obj;
            });

            _renderFiltrado();
        } catch (err) {
            console.error(`_cargar ${cfg.resource}:`, err);
            listaEl.innerHTML = `
                <div class="historialVacio">
                    <img src="https://cdn-icons-png.flaticon.com/512/6195/6195678.png" class="nadaEncontrado">
                    <p>No se pudieron cargar los datos.<br>Revisa tu conexión.</p>
                </div>`;
        }
    }

    // ── Buscador ──────────────────────────────────────────────
    searchEl.addEventListener("input", function () {
        _renderFiltrado(this.value.trim().toLowerCase());
    });

    function _renderFiltrado(query = "") {
        const filtrados = query
            ? _data.filter(d =>
                [cfg.camposPrimario, ...cfg.camposExtra].some(c =>
                    _normalizar(d[c.key]).includes(query)
                )
              )
            : _data;
        _renderLista(filtrados);
    }

    // ── Renderizar lista ──────────────────────────────────────
    function _renderLista(items) {
        if (_data.length === 0) {
            listaEl.innerHTML = `
                <div class="historialVacio">
                    <img src="https://cdn-icons-png.flaticon.com/512/1178/1178479.png" class="nadaEncontrado">
                    <p>No hay ${cfg.labelEntidades} registrados/as aún.<br>Usa el formulario de arriba.</p>
                </div>`;
            return;
        }
        if (items.length === 0) {
            listaEl.innerHTML = `
                <div class="historialVacio">
                    <img src="https://cdn-icons-png.flaticon.com/512/1178/1178479.png" class="nadaEncontrado">
                    <p>No hay coincidencias con tu búsqueda.</p>
                </div>`;
            return;
        }

        const sufijo = items.length !== 1 ? "s" : "";
        const total  = _data.length !== items.length ? ` de ${_data.length}` : "";
        listaEl.innerHTML = `<h3 class="clientesContador">${items.length} ${cfg.labelEntidades.slice(0, -1) + sufijo}${total}</h3>`;

        items.forEach(item => {
            const row = document.createElement("div");
            row.classList.add("crudRow");

            // Valor primario
            const primMostrar = item[cfg.keyUnico] && item[cfg.keyUnico] !== "nulo"
                ? item[cfg.keyUnico] : `Sin ${cfg.camposPrimario.label.toLowerCase()}`;

            // Campos extra como spans
            const extrasHtml = cfg.camposExtra.map(c => {
                const val = item[c.key] && item[c.key] !== "nulo" ? item[c.key] : "—";
                return `<span><i class="fa-solid fa-${c.icon}" style="color:#aaa;font-size:0.78em;margin-right:0.3em;"></i>${escHtml(val)}</span>`;
            }).join("");

            row.innerHTML = `
                <div class="crudRowInfo clienteInfo">
                    <strong>${escHtml(primMostrar)}</strong>
                    ${extrasHtml}
                </div>
                <div class="crudRowBtns">
                    <button class="btnEditar  _btnEditar"   data-id="${item.id}" title="Editar">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btnEliminar _btnEliminar" data-id="${item.id}" title="Eliminar">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>`;
            listaEl.appendChild(row);
        });

        listaEl.querySelectorAll("._btnEditar").forEach(btn =>
            btn.addEventListener("click", () => _iniciarEdicion(btn.dataset.id))
        );
        listaEl.querySelectorAll("._btnEliminar").forEach(btn =>
            btn.addEventListener("click", () => _eliminar(btn.dataset.id))
        );
    }

    // ── Iniciar edición ───────────────────────────────────────
    function _iniciarEdicion(id) {
        const item = _data.find(d => d.id === id);
        if (!item) return;

        _editId = id;
        document.getElementById(cfg.editHiddenId).value = id;

        const primEl = document.getElementById(cfg.camposPrimario.id);
        if (primEl) {
            primEl.value = item[cfg.keyUnico] !== "nulo" ? item[cfg.keyUnico] : "";
        }
        cfg.camposExtra.forEach(c => {
            const el = document.getElementById(c.id);
            if (el) el.value = item[c.key] !== "nulo" ? item[c.key] : "";
        });

        submitBtn.textContent = `Actualizar ${cfg.labelEntidad}`;
        cancelBtn.classList.remove("remove");

        document.getElementById(cfg.formId).scrollIntoView({ behavior: "smooth", block: "start" });
        document.getElementById(cfg.camposPrimario.id).focus();
    }

    // ── Eliminar ──────────────────────────────────────────────
    function _eliminar(id) {
        const item = _data.find(d => d.id === id);
        if (!item) return;
        const nom = item[cfg.keyUnico] !== "nulo" ? item[cfg.keyUnico] : `este/a ${cfg.labelEntidad.toLowerCase()}`;

        showConfirm(
            `¿Eliminar <strong>${escHtml(nom)}</strong>?<br>Esta acción no se puede deshacer.`,
            async () => {
                try {
                    const json = await gasPost(cfg.resource, { action: "delete", id });
                    if (!json.success) throw new Error(json.message);

                    _data = _data.filter(d => d.id !== id);
                    if (_editId === id) _reset();

                    showNotification(`${cfg.labelEntidad} <strong>${escHtml(nom)}</strong> eliminado/a.`);
                    if (cfg.resource === "categorias" && typeof loadCategorias === "function") loadCategorias();
                    _renderFiltrado(searchEl.value.trim().toLowerCase());
                } catch (err) {
                    console.error(`_eliminar ${cfg.resource}:`, err);
                    showNotification("Error al eliminar. Intenta de nuevo.", "error");
                }
            }
        );
    }

    // Exponer sólo la función de apertura
    return { abrir };
}

// ============================================================
//  INSTANCIAR LOS 3 MÓDULOS
// ============================================================

// ── CLIENTES ──────────────────────────────────────────────────
const _clientesMod = _crearModuloGestion({
    resource:      "clientes",
    overlayId:     "clientesOverlay",
    closeId:       "closeClientes",
    formId:        "clienteForm",
    editHiddenId:  "clienteEditId",
    listaId:       "clientesLista",
    searchId:      "clientesSearch",
    submitId:      "clienteFormSubmit",
    cancelId:      "clienteFormCancelar",
    camposPrimario: { id: "clienteFormNombre",   label: "Nombre",   key: "nombre",   tipo: "text",  placeholder: "Nombre del cliente",  icon: "user"     },
    camposExtra:   [
        { id: "clienteFormTelefono", label: "Teléfono", key: "telefono", tipo: "tel",   placeholder: "Número de teléfono",  icon: "phone"    },
        { id: "clienteFormCorreo",   label: "Correo",   key: "correo",   tipo: "email", placeholder: "correo@ejemplo.com",  icon: "envelope" }
    ],
    labelEntidad:  "Cliente",
    labelEntidades:"clientes",
    keyUnico:      "nombre"
});
function abrirClientesModal() { _clientesMod.abrir(); }

// ── PROVEEDORES ───────────────────────────────────────────────
const _proveedoresMod = _crearModuloGestion({
    resource:      "proveedores",
    overlayId:     "proveedoresOverlay",
    closeId:       "closeProveedores",
    formId:        "proveedorForm",
    editHiddenId:  "proveedorEditId",
    listaId:       "proveedoresLista",
    searchId:      "proveedoresSearch",
    submitId:      "proveedorFormSubmit",
    cancelId:      "proveedorFormCancelar",
    camposPrimario: { id: "proveedorFormEntidad",  label: "Entidad",  key: "entidad",  tipo: "text",  placeholder: "Nombre de la entidad", icon: "building" },
    camposExtra:   [
        { id: "proveedorFormTelefono", label: "Teléfono", key: "telefono", tipo: "tel",   placeholder: "Número de teléfono", icon: "phone"    },
        { id: "proveedorFormCorreo",   label: "Correo",   key: "correo",   tipo: "email", placeholder: "correo@ejemplo.com", icon: "envelope" }
    ],
    labelEntidad:  "Proveedor",
    labelEntidades:"proveedores",
    keyUnico:      "entidad"
});
function abrirProveedoresModal() { _proveedoresMod.abrir(); }

// ── CATEGORÍAS ────────────────────────────────────────────────
const _categoriasMod = _crearModuloGestion({
    resource:      "categorias",
    overlayId:     "categoriasOverlay",
    closeId:       "closeCategorias",
    formId:        "categoriaForm",
    editHiddenId:  "categoriaEditId",
    listaId:       "categoriasLista",
    searchId:      "categoriasSearch",
    submitId:      "categoriaFormSubmit",
    cancelId:      "categoriaFormCancelar",
    camposPrimario: { id: "categoriaFormNombre", label: "Categoría", key: "nombre", tipo: "text", placeholder: "Nombre de la categoría", icon: "tag" },
    camposExtra:   [],   // sin campos extra
    labelEntidad:  "Categoría",
    labelEntidades:"categorías",
    keyUnico:      "nombre"
});
function abrirCategoriasModal() { _categoriasMod.abrir(); }
