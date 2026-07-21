/**
 * Almaria Perfumes — Panel de administración
 *
 * Colecciones en Firestore:
 *  - perfumes/{id}     catálogo público: casa, nombre, precioMayor, precioDetal,
 *                      precioOferta (opcional), stock, imagen (opcional)
 *  - costos/{id}       datos privados por producto: costo (mi costo), proveedorId
 *  - ventas/{id}       fecha, cliente, items[], total, pagado, abonos[], notas
 *  - proveedores/{id}  nombre, telefono, correo, notas
 *  - movimientos/{id}  fecha, productId, nombre, casa, tipo, cantidad, motivo
 */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

// ─── Estado global ───────────────────────────────────────────
const S = {
  fb: null, // { db, auth, fs: módulo firestore }
  productos: [], // perfumes + costo/proveedorId fusionados
  ventas: [],
  pedidos: [], // pedidos web pendientes de confirmar
  proveedores: [],
  clientes: [], // { id, nombre, telefono }
  movimientos: [],
  moneda: { tasaPropia: 0, tasaBcv: 0, actualizado: "" },
  prodBusqueda: "",
  carrito: [], // items de la venta en curso
};

// ─── Utilidades ──────────────────────────────────────────────
const fmt = (n) => `$${(Number(n) || 0).toFixed(2).replace(/\.00$/, "")}`;

const normalizar = (t) =>
  (t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const hoyISO = () => new Date().toISOString();

const fmtFecha = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" });
};

function esc(t) {
  const div = document.createElement("div");
  div.textContent = t ?? "";
  return div.innerHTML;
}

function toast(msg, tipo = "") {
  const el = document.createElement("div");
  el.className = `toast ${tipo}`;
  el.textContent = msg;
  $("#toasts").appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

const saldoVenta = (v) => Math.max(0, (v.total || 0) - (v.pagado || 0));

// ─── Iconos SVG (trazo, heredan el color del texto) ──────────
const ICONS = {
  editar: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
  basura: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  stock: '<line x1="8" y1="3" x2="8" y2="21"/><polyline points="4 7 8 3 12 7"/><line x1="16" y1="3" x2="16" y2="21"/><polyline points="12 17 16 21 20 17"/>',
  arriba: '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>',
  abajo: '<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>',
  camara: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  subir: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  dolar: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  gota: '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>',
};

const icon = (nombre, cls = "") =>
  `<svg class="icono ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[nombre]}</svg>`;

/**
 * Sube una imagen a Cloudinary (preset sin firma) y devuelve la URL
 * optimizada (formato y calidad automáticos, máx. 800px de ancho).
 */
async function subirACloudinary(archivo) {
  if (typeof CLOUDINARY_CONFIG === "undefined" || !CLOUDINARY_CONFIG?.cloudName) {
    throw new Error("Cloudinary no está configurado en js/firebase-config.js");
  }
  const datos = new FormData();
  datos.append("file", archivo);
  datos.append("upload_preset", CLOUDINARY_CONFIG.uploadPreset);
  datos.append("folder", "perfumes");

  const resp = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/image/upload`,
    { method: "POST", body: datos }
  );
  const json = await resp.json();
  if (!resp.ok) {
    throw new Error(json?.error?.message || `HTTP ${resp.status}`);
  }
  // Entrega optimizada: f_auto (mejor formato), q_auto (calidad), w_800
  return json.secure_url.replace("/upload/", "/upload/f_auto,q_auto,w_800/");
}

// ─── Modal genérico ──────────────────────────────────────────
function abrirModal(html) {
  $("#modal").innerHTML = html;
  $("#modal-overlay").hidden = false;
  const primero = $("#modal input, #modal select");
  if (primero) primero.focus();
}

function cerrarModal() {
  $("#modal-overlay").hidden = true;
  $("#modal").innerHTML = "";
}

$("#modal-overlay").addEventListener("click", (e) => {
  if (e.target === $("#modal-overlay")) cerrarModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("#modal-overlay").hidden) cerrarModal();
});

// ─── Inicialización de Firebase ──────────────────────────────
async function initFirebase() {
  if (typeof FIREBASE_CONFIG === "undefined" || !FIREBASE_CONFIG) {
    throw new Error("FIREBASE_CONFIG no está definido en js/firebase-config.js");
  }
  const { initializeApp } = await import(
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"
  );
  const auth = await import(
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js"
  );
  const fs = await import(
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"
  );
  const app = initializeApp(FIREBASE_CONFIG);
  return { app, auth, fs, db: fs.getFirestore(app), authInst: auth.getAuth(app) };
}

// ─── Carga de datos ──────────────────────────────────────────
async function cargarTodo() {
  const { fs, db } = S.fb;
  const [perfumesSnap, costosSnap, ventasSnap, pedidosSnap, provSnap, cliSnap, movSnap] = await Promise.all([
    fs.getDocs(fs.collection(db, "perfumes")),
    fs.getDocs(fs.collection(db, "costos")),
    fs.getDocs(fs.collection(db, "ventas")),
    fs.getDocs(fs.collection(db, "pedidos")),
    fs.getDocs(fs.collection(db, "proveedores")),
    fs.getDocs(fs.collection(db, "clientes")),
    fs.getDocs(fs.query(fs.collection(db, "movimientos"), fs.orderBy("fecha", "desc"), fs.limit(30))),
  ]);

  const costos = {};
  costosSnap.forEach((d) => (costos[d.id] = d.data()));

  S.productos = perfumesSnap.docs
    .map((d) => ({
      id: d.id,
      ...d.data(),
      costo: costos[d.id]?.costo ?? 0,
      proveedorId: costos[d.id]?.proveedorId ?? "",
    }))
    .sort((a, b) => a.casa.localeCompare(b.casa, "es") || a.nombre.localeCompare(b.nombre, "es"));

  S.ventas = ventasSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));

  S.pedidos = pedidosSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((p) => p.estado === "pendiente")
    .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));

  S.proveedores = provSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es"));

  S.clientes = cliSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es"));

  S.movimientos = movSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Config de moneda (documento único config/moneda)
  try {
    const monedaDoc = await fs.getDoc(fs.doc(db, "config", "moneda"));
    if (monedaDoc.exists()) S.moneda = { ...S.moneda, ...monedaDoc.data() };
  } catch (e) {
    /* si no existe aún, quedan los valores por defecto */
  }
}

function renderTodo() {
  renderDashboard();
  renderProductos();
  renderPedidos();
  renderVentas();
  renderDeudores();
  renderProveedores();
  renderMoneda();
}

// ═════════════════════ DASHBOARD ═════════════════════════════
function renderDashboard() {
  const ahora = new Date();
  $("#dash-fecha").textContent = ahora.toLocaleDateString("es-VE", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const mes = ahora.toISOString().slice(0, 7);
  const ventasMes = S.ventas.filter((v) => (v.fecha || "").startsWith(mes));
  const totalMes = ventasMes.reduce((s, v) => s + (v.total || 0), 0);
  const costoMes = ventasMes.reduce(
    (s, v) => s + (v.items || []).reduce((si, it) => si + (it.costoUnit || 0) * it.cantidad, 0),
    0
  );
  const porCobrar = S.ventas.reduce((s, v) => s + saldoVenta(v), 0);
  const unidades = S.productos.reduce((s, p) => s + (p.stock || 0), 0);
  const valorInv = S.productos.reduce((s, p) => s + (p.costo || 0) * (p.stock || 0), 0);

  $("#dash-stats").innerHTML = `
    ${stat("Pedidos web", S.pedidos.length, S.pedidos.length ? "vino" : "", "por confirmar")}
    ${stat("Productos", S.productos.length, "", "en catálogo")}
    ${stat("Unidades en stock", unidades, "", `inversión: ${fmt(valorInv)}`)}
    ${stat("Ventas del mes", fmt(totalMes), "vino", `${ventasMes.length} ventas`)}
    ${stat("Ganancia estimada", fmt(totalMes - costoMes), "green", "ventas del mes − costo")}
    ${stat("Por cobrar", fmt(porCobrar), porCobrar > 0 ? "red" : "green", `${clientesDeudores().length} deudores`)}
  `;

  $("#dash-ventas").innerHTML = S.ventas.length
    ? `<div class="mini-list">${S.ventas.slice(0, 6).map((v) => `
        <div class="mini-row">
          <span>${esc(v.cliente || "Cliente")} <span class="muted">· ${fmtFecha(v.fecha)}</span></span>
          <strong>${fmt(v.total)}</strong>
        </div>`).join("")}</div>`
    : `<p class="muted">Sin ventas todavía.</p>`;

  const bajos = S.productos.filter((p) => (p.stock || 0) <= 3).slice(0, 8);
  $("#dash-stock").innerHTML = bajos.length
    ? `<div class="mini-list">${bajos.map((p) => `
        <div class="mini-row">
          <span>${esc(p.nombre)} <span class="muted">· ${esc(p.casa)}</span></span>
          <span class="stock-pill ${(p.stock || 0) === 0 ? "out" : "low"}">${p.stock || 0}</span>
        </div>`).join("")}</div>`
    : `<p class="muted">Todo el inventario tiene stock suficiente.</p>`;
}

function stat(label, value, color, hint) {
  return `<div class="stat-card">
    <p class="stat-label">${label}</p>
    <p class="stat-value ${color}">${value}</p>
    ${hint ? `<p class="stat-hint">${hint}</p>` : ""}
  </div>`;
}

// ═════════════════════ PRODUCTOS ═════════════════════════════
function renderProductos() {
  const q = normalizar(S.prodBusqueda);
  const lista = S.productos.filter(
    (p) => !q || normalizar(p.nombre).includes(q) || normalizar(p.casa).includes(q)
  );

  $("#prod-empty").hidden = S.productos.length > 0;
  $("#prod-table").hidden = S.productos.length === 0;

  $("#prod-table tbody").innerHTML = lista
    .map((p) => {
      const stock = p.stock ?? 0;
      const pill = stock === 0 ? "out" : stock <= 3 ? "low" : "";
      return `<tr data-id="${p.id}">
        <td class="td-casa">${esc(p.casa)}</td>
        <td class="td-nombre">
          <span class="td-producto">
            ${p.imagen
              ? `<img class="td-foto" src="${esc(p.imagen)}" alt="" loading="lazy" />`
              : `<span class="td-foto td-foto-vacia">${icon("gota")}</span>`}
            <span>${esc(p.nombre)}
              ${p.destacado ? '<span class="badge destacado">Destacado</span>' : ""}
              ${p.precioOferta ? '<span class="badge oferta">Oferta</span>' : ""}
            </span>
          </span>
        </td>
        <td class="num muted">${fmt(p.costo)}</td>
        <td class="num">${fmt(p.precioMayor)}</td>
        <td class="num">${fmt(p.precioDetal)}</td>
        <td class="num">${p.precioOferta ? fmt(p.precioOferta) : '<span class="muted">—</span>'}</td>
        <td class="num"><span class="stock-pill ${pill}">${stock}</span></td>
        <td class="acciones">
          <button class="btn-icon" data-accion="stock" title="Carga / descarga de stock">${icon("stock")}</button>
          <button class="btn-icon" data-accion="editar" title="Editar">${icon("editar")}</button>
          <button class="btn-icon danger" data-accion="eliminar" title="Eliminar">${icon("basura")}</button>
        </td>
      </tr>`;
    })
    .join("");

  $("#prod-movimientos").innerHTML = S.movimientos.length
    ? `<div class="mini-list">${S.movimientos.slice(0, 12).map((m) => `
        <div class="mini-row">
          <span>${m.tipo === "entrada" ? icon("arriba", "mov") : icon("abajo", "mov")} ${esc(m.nombre)}
            <span class="muted">· ${esc(m.motivo || m.tipo)} · ${fmtFecha(m.fecha)}</span></span>
          <strong>${m.tipo === "entrada" ? "+" : "−"}${m.cantidad}</strong>
        </div>`).join("")}</div>`
    : `<p class="muted">Sin movimientos registrados.</p>`;
}

function modalProducto(p = null) {
  const provOpts = S.proveedores
    .map((pr) => `<option value="${pr.id}" ${p?.proveedorId === pr.id ? "selected" : ""}>${esc(pr.nombre)}</option>`)
    .join("");

  abrirModal(`
    <h3>${p ? "Editar producto" : "Nuevo producto"}</h3>
    <form id="form-producto">
      <div class="form-grid">
        <label class="field"><span>Casa / Marca</span>
          <input name="casa" required list="casas-list" value="${esc(p?.casa || "")}" /></label>
        <label class="field"><span>Nombre</span>
          <input name="nombre" required value="${esc(p?.nombre || "")}" /></label>
        <label class="field"><span>Mi costo (USD)</span>
          <input name="costo" type="number" step="0.01" min="0" value="${p?.costo ?? 0}" /></label>
        <label class="field"><span>Precio al mayor</span>
          <input name="precioMayor" type="number" step="0.01" min="0" required value="${p?.precioMayor ?? ""}" /></label>
        <label class="field"><span>Precio al detal</span>
          <input name="precioDetal" type="number" step="0.01" min="0" required value="${p?.precioDetal ?? ""}" /></label>
        <label class="field"><span>Precio de oferta <span class="hint">(vacío = sin oferta)</span></span>
          <input name="precioOferta" type="number" step="0.01" min="0" value="${p?.precioOferta ?? ""}" /></label>
        <label class="field"><span>Stock</span>
          <input name="stock" type="number" step="1" min="0" value="${p?.stock ?? 0}" /></label>
        <label class="field"><span>Proveedor</span>
          <select name="proveedorId"><option value="">— Ninguno —</option>${provOpts}</select></label>
        <label class="field full check-field">
          <input type="checkbox" name="destacado" ${p?.destacado ? "checked" : ""} />
          <span>Producto destacado <span class="hint">(aparece resaltado en la tienda)</span></span>
        </label>
        <label class="field full"><span>Foto del perfume</span>
          <div class="img-upload">
            <div class="img-preview-box">
              <img id="img-preview" src="${esc(p?.imagen || "")}" alt="" ${p?.imagen ? "" : "hidden"} />
              <span id="img-placeholder" class="img-placeholder" ${p?.imagen ? "hidden" : ""}>Sin foto</span>
            </div>
            <div class="img-upload-controls">
              <input type="file" id="img-file" accept="image/*" hidden />
              <button type="button" class="btn btn-ghost" id="img-subir">${icon("camara")} ${p?.imagen ? "Cambiar foto" : "Subir foto"}</button>
              <button type="button" class="btn btn-danger" id="img-quitar" ${p?.imagen ? "" : "hidden"}>Quitar</button>
              <p class="hint" id="img-status">Sube una foto (JPG/PNG) o pega un enlace de imagen</p>
            </div>
          </div>
          <div class="img-link-row">
            <input type="url" name="imagen" id="img-url" placeholder="https://… enlace de la imagen"
              value="${esc(p?.imagen || "")}" />
          </div>
        </label>
      </div>
      <datalist id="casas-list">
        ${[...new Set(S.productos.map((x) => x.casa))].map((c) => `<option value="${esc(c)}">`).join("")}
      </datalist>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-cerrar>Cancelar</button>
        <button type="submit" class="btn btn-primary">${p ? "Guardar cambios" : "Crear producto"}</button>
      </div>
    </form>
  `);

  // ── Subida de foto a Cloudinary ──
  const $file = $("#img-file");
  const $subir = $("#img-subir");
  const $quitar = $("#img-quitar");
  const $status = $("#img-status");
  const $preview = $("#img-preview");
  const $placeholder = $("#img-placeholder");
  const $urlInput = $("#img-url");
  const $guardar = $('#form-producto button[type="submit"]');

  function mostrarFoto(url) {
    $urlInput.value = url || "";
    actualizarPreview(url);
    $subir.innerHTML = icon("camara") + (url ? " Cambiar foto" : " Subir foto");
  }

  function actualizarPreview(url) {
    $preview.src = url || "";
    $preview.hidden = !url;
    $placeholder.hidden = !!url;
    $quitar.hidden = !url;
  }

  $subir.addEventListener("click", () => $file.click());
  $quitar.addEventListener("click", () => {
    mostrarFoto("");
    $status.textContent = "Foto quitada. Guarda para aplicar el cambio.";
  });

  // Pegar/escribir un enlace de imagen actualiza la vista previa
  $urlInput.addEventListener("input", () => {
    const url = $urlInput.value.trim();
    actualizarPreview(url);
    $subir.innerHTML = icon("camara") + (url ? " Cambiar foto" : " Subir foto");
  });

  $file.addEventListener("change", async () => {
    const archivo = $file.files[0];
    if (!archivo) return;
    if (archivo.size > 10 * 1024 * 1024) {
      $status.textContent = "La imagen supera 10 MB. Usa una más liviana.";
      return;
    }
    $subir.disabled = true;
    $guardar.disabled = true;
    $status.textContent = "Subiendo foto…";
    try {
      const url = await subirACloudinary(archivo);
      mostrarFoto(url);
      $status.textContent = "Foto subida ✓ Guarda el producto para aplicarla.";
    } catch (err) {
      $status.textContent = "Error al subir: " + err.message;
    } finally {
      $subir.disabled = false;
      $guardar.disabled = false;
      $file.value = "";
    }
  });

  $("#form-producto").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const { fs, db } = S.fb;
    const id = p?.id || fs.doc(fs.collection(db, "perfumes")).id;

    const publico = {
      casa: f.get("casa").trim(),
      nombre: f.get("nombre").trim(),
      precioMayor: Number(f.get("precioMayor")),
      precioDetal: Number(f.get("precioDetal")),
      precioOferta: f.get("precioOferta") ? Number(f.get("precioOferta")) : null,
      stock: Number(f.get("stock")) || 0,
      imagen: f.get("imagen").trim() || null,
      destacado: f.get("destacado") === "on",
    };
    const privado = {
      costo: Number(f.get("costo")) || 0,
      proveedorId: f.get("proveedorId") || "",
    };

    try {
      await fs.setDoc(fs.doc(db, "perfumes", id), publico);
      await fs.setDoc(fs.doc(db, "costos", id), privado);
      const idx = S.productos.findIndex((x) => x.id === id);
      const nuevo = { id, ...publico, ...privado };
      if (idx >= 0) S.productos[idx] = nuevo;
      else S.productos.push(nuevo);
      S.productos.sort((a, b) => a.casa.localeCompare(b.casa, "es") || a.nombre.localeCompare(b.nombre, "es"));
      cerrarModal();
      renderTodo();
      toast(p ? "Producto actualizado ✓" : "Producto creado ✓", "success");
    } catch (err) {
      toast("Error al guardar: " + err.message, "error");
    }
  });
}

function modalStock(p) {
  abrirModal(`
    <h3>Carga / descarga de stock</h3>
    <p style="margin-bottom:1rem">${esc(p.nombre)} <span class="muted">· ${esc(p.casa)} · stock actual: <strong>${p.stock ?? 0}</strong></span></p>
    <form id="form-stock">
      <div class="form-grid">
        <label class="field"><span>Tipo</span>
          <select name="tipo">
            <option value="entrada">Entrada (carga)</option>
            <option value="salida">Salida (descarga)</option>
          </select></label>
        <label class="field"><span>Cantidad</span>
          <input name="cantidad" type="number" min="1" step="1" value="1" required /></label>
        <label class="field full"><span>Motivo <span class="hint">(compra, ajuste, daño…)</span></span>
          <input name="motivo" placeholder="Compra a proveedor" /></label>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-cerrar>Cancelar</button>
        <button type="submit" class="btn btn-primary">Registrar movimiento</button>
      </div>
    </form>
  `);

  $("#form-stock").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const tipo = f.get("tipo");
    const cantidad = Number(f.get("cantidad"));
    const delta = tipo === "entrada" ? cantidad : -cantidad;
    const nuevoStock = (p.stock || 0) + delta;
    if (nuevoStock < 0) {
      toast("La salida supera el stock disponible.", "error");
      return;
    }
    try {
      await ajustarStock(p, delta, f.get("motivo").trim() || tipo);
      cerrarModal();
      renderTodo();
      toast(`Stock de "${p.nombre}": ${nuevoStock} ✓`, "success");
    } catch (err) {
      toast("Error: " + err.message, "error");
    }
  });
}

/** Actualiza stock del producto y registra el movimiento. */
async function ajustarStock(p, delta, motivo) {
  const { fs, db } = S.fb;
  const nuevoStock = Math.max(0, (p.stock || 0) + delta);
  await fs.updateDoc(fs.doc(db, "perfumes", p.id), { stock: nuevoStock });
  const mov = {
    fecha: hoyISO(),
    productId: p.id,
    nombre: p.nombre,
    casa: p.casa,
    tipo: delta >= 0 ? "entrada" : "salida",
    cantidad: Math.abs(delta),
    motivo,
  };
  await fs.addDoc(fs.collection(db, "movimientos"), mov);
  p.stock = nuevoStock;
  S.movimientos.unshift(mov);
}

async function eliminarProducto(p) {
  if (!confirm(`¿Eliminar "${p.nombre}" de ${p.casa}? Esta acción no se puede deshacer.`)) return;
  const { fs, db } = S.fb;
  try {
    await fs.deleteDoc(fs.doc(db, "perfumes", p.id));
    await fs.deleteDoc(fs.doc(db, "costos", p.id));
    S.productos = S.productos.filter((x) => x.id !== p.id);
    renderTodo();
    toast("Producto eliminado ✓", "success");
  } catch (err) {
    toast("Error al eliminar: " + err.message, "error");
  }
}

async function importarCatalogo() {
  const btn = $("#prod-seed");
  btn.disabled = true;
  btn.textContent = "Importando…";
  const { fs, db } = S.fb;
  try {
    const LOTE = 400;
    for (let i = 0; i < PERFUMES.length; i += LOTE) {
      const batch = fs.writeBatch(db);
      PERFUMES.slice(i, i + LOTE).forEach((p) => {
        batch.set(fs.doc(db, "perfumes", p.id), {
          casa: p.casa,
          nombre: p.nombre,
          precioMayor: p.precioMayor,
          precioDetal: p.precioDetal,
          precioOferta: null,
          stock: 0,
          imagen: null,
        });
      });
      await batch.commit();
    }
    await cargarTodo();
    renderTodo();
    toast(`${PERFUMES.length} perfumes importados ✓ Ahora asigna costos y stock.`, "success");
  } catch (err) {
    toast("Error al importar: " + err.message, "error");
    btn.disabled = false;
    btn.innerHTML = icon("subir") + " Importar catálogo local (260 perfumes)";
  }
}

// ═════════════════════ PEDIDOS WEB ═══════════════════════════
function renderPedidos() {
  const n = S.pedidos.length;
  const $badge = $("#nav-pedidos");
  $badge.textContent = n;
  $badge.hidden = n === 0;

  $("#pedidos-empty").hidden = n > 0;
  $("#pedidos-lista").innerHTML = S.pedidos
    .map((pe) => {
      const unidades = (pe.items || []).reduce((s, it) => s + it.cantidad, 0);
      const tel = telefonoWa(pe.telefono);
      return `<div class="pedido-card" data-id="${pe.id}">
        <button type="button" class="pedido-head" data-toggle aria-expanded="false">
          <div class="pedido-head-info">
            <span class="pedido-cliente">${esc(pe.cliente || "Cliente web")}</span>
            ${pe.telefono ? `<span class="pedido-tel">${esc(pe.telefono)}</span>` : '<span class="pedido-tel muted">Sin teléfono</span>'}
          </div>
          <div class="pedido-head-right">
            <span class="badge ${pe.tipoPrecio === "mayor" ? "oferta" : "pendiente"}">${pe.tipoPrecio === "mayor" ? "Al mayor" : "Al detal"}</span>
            <span class="pedido-resumen">${unidades} und · <strong>${fmt(pe.total)}</strong></span>
            <svg class="pedido-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
        </button>
        <div class="pedido-body" hidden>
          <div class="pedido-items">
            <p class="pedido-items-meta muted">${fmtFecha(pe.fecha)} · ${(pe.items || []).length} ${(pe.items || []).length === 1 ? "producto" : "productos"}</p>
            ${(pe.items || [])
              .map(
                (it) => `<div class="mini-row">
                  <span>${it.cantidad}× ${esc(it.nombre)} <span class="muted">· ${esc(it.casa)}</span></span>
                  <strong>${fmt((it.precioUnit || 0) * it.cantidad)}</strong>
                </div>`
              )
              .join("")}
          </div>
          <div class="pedido-foot">
            <span class="pedido-total">Total: <strong>${fmt(pe.total)}</strong></span>
            <div class="pedido-acciones">
              ${tel ? `<a class="btn-wa-mini" href="https://wa.me/${tel}" target="_blank" title="Escribir al cliente">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.5 14.4c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.62.71.23 1.36.19 1.87.12.57-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.13-.27-.2-.57-.35zM12 2a10 10 0 0 0-8.6 15.06L2 22l5.05-1.32A10 10 0 1 0 12 2z"/></svg>
              </a>` : ""}
              <button class="btn btn-ghost" data-rechazar="${pe.id}">Rechazar</button>
              <button class="btn btn-primary" data-confirmar="${pe.id}">Confirmar venta</button>
            </div>
          </div>
        </div>
      </div>`;
    })
    .join("");
}

/** Confirma un pedido web: lo convierte en venta. */
async function confirmarPedido(pe) {
  if (!confirm(`¿Confirmar el pedido de ${pe.cliente} por ${fmt(pe.total)}? Se registrará como venta pagada.`)) return;

  const { fs, db } = S.fb;
  try {
    const venta = {
      fecha: hoyISO(),
      cliente: pe.cliente || "Cliente web",
      telefono: pe.telefono || "",
      credito: false,
      items: (pe.items || []).map((it) => ({
        productId: it.productId,
        nombre: it.nombre,
        casa: it.casa,
        cantidad: it.cantidad,
        precioUnit: it.precioUnit || 0,
        costoUnit: S.productos.find((x) => x.id === it.productId)?.costo || 0,
        tipo: pe.tipoPrecio || "detal",
      })),
      total: pe.total || 0,
      pagado: pe.total || 0,
      abonos: [{ fecha: hoyISO(), monto: pe.total || 0 }],
      notas: "Pedido web confirmado",
    };
    const ref = await fs.addDoc(fs.collection(db, "ventas"), venta);
    for (const it of venta.items) {
      const p = S.productos.find((x) => x.id === it.productId);
      if (p) await ajustarStock(p, -it.cantidad, `pedido web de ${venta.cliente}`);
    }
    await registrarCliente(pe.cliente, pe.telefono);
    // Marca el pedido como confirmado
    await fs.updateDoc(fs.doc(db, "pedidos", pe.id), { estado: "confirmado", ventaId: ref.id });
    S.ventas.unshift({ id: ref.id, ...venta });
    S.pedidos = S.pedidos.filter((x) => x.id !== pe.id);
    renderTodo();
    toast(`Pedido confirmado y registrado como venta ✓`, "success");
  } catch (err) {
    toast("Error al confirmar: " + err.message, "error");
  }
}

async function rechazarPedido(pe) {
  if (!confirm(`¿Rechazar el pedido de ${pe.cliente}? No se registrará ninguna venta.`)) return;
  const { fs, db } = S.fb;
  try {
    await fs.updateDoc(fs.doc(db, "pedidos", pe.id), { estado: "rechazado" });
    S.pedidos = S.pedidos.filter((x) => x.id !== pe.id);
    renderTodo();
    toast("Pedido rechazado.", "success");
  } catch (err) {
    toast("Error: " + err.message, "error");
  }
}

// ═════════════════════ VENTAS ════════════════════════════════
function renderVentas() {
  const mes = new Date().toISOString().slice(0, 7);
  const ventasMes = S.ventas.filter((v) => (v.fecha || "").startsWith(mes));
  const totalMes = ventasMes.reduce((s, v) => s + (v.total || 0), 0);
  const totalHist = S.ventas.reduce((s, v) => s + (v.total || 0), 0);
  const porCobrar = S.ventas.reduce((s, v) => s + saldoVenta(v), 0);

  $("#ventas-stats").innerHTML = `
    ${stat("Ventas registradas", S.ventas.length, "", "histórico")}
    ${stat("Total histórico", fmt(totalHist), "", "")}
    ${stat("Este mes", fmt(totalMes), "vino", `${ventasMes.length} ventas`)}
    ${stat("Por cobrar", fmt(porCobrar), porCobrar > 0 ? "red" : "green", "")}
  `;

  $("#ventas-empty").hidden = S.ventas.length > 0;
  $("#ventas-table").hidden = S.ventas.length === 0;

  $("#ventas-table tbody").innerHTML = S.ventas
    .map((v) => {
      const saldo = saldoVenta(v);
      const resumen = (v.items || [])
        .map((it) => `${it.cantidad}× ${it.nombre}`)
        .join(", ");
      const estado = v.credito
        ? saldo > 0 ? '<span class="badge pendiente">Crédito</span>' : '<span class="badge pagada">Crédito · Pagada</span>'
        : `<span class="badge ${saldo > 0 ? "pendiente" : "pagada"}">${saldo > 0 ? "Pendiente" : "Pagada"}</span>`;
      return `<tr data-id="${v.id}">
        <td class="muted" style="white-space:nowrap">${fmtFecha(v.fecha)}</td>
        <td class="td-nombre">${esc(v.cliente || "Cliente")}
          ${v.telefono ? `<span class="td-sub">${esc(v.telefono)}</span>` : ""}</td>
        <td>${esc(resumen)}<span class="td-sub">${(v.items || []).reduce((s, it) => s + it.cantidad, 0)} unidades</span></td>
        <td class="num">${fmt(v.total)}</td>
        <td class="num">${fmt(v.pagado)}</td>
        <td class="num ${saldo > 0 ? "" : "muted"}">${fmt(saldo)}</td>
        <td>${estado}</td>
        <td class="acciones">
          ${saldo > 0 ? `<button class="btn-icon" data-accion="abonar" title="Registrar abono">${icon("dolar")}</button>` : ""}
          <button class="btn-icon danger" data-accion="eliminar" title="Eliminar venta">${icon("basura")}</button>
        </td>
      </tr>`;
    })
    .join("");
}

function modalVenta() {
  S.carrito = [];
  abrirModal(`
    <h3>Registrar venta</h3>
    <form id="form-venta">
      <div class="form-grid">
        <label class="field"><span>Cliente</span>
          <input name="cliente" id="venta-cliente" required placeholder="Nombre del cliente" list="clientes-list" autocomplete="off" /></label>
        <label class="field"><span>Teléfono</span>
          <input name="telefono" id="venta-telefono" type="tel" placeholder="Ej. 0414 6039842" autocomplete="off" /></label>
        <label class="field"><span>Tipo de precio</span>
          <select name="tipoPrecio" id="venta-tipo">
            <option value="detal">Al detal</option>
            <option value="mayor">Al mayor</option>
          </select></label>
        <label class="field"><span>Tipo de pago</span>
          <select name="tipoPago" id="venta-pago">
            <option value="contado">Contado (pagado)</option>
            <option value="credito">Crédito (a deber)</option>
          </select></label>
        <label class="field full"><span>Producto</span>
          <input id="venta-buscar" placeholder="Escribe para buscar… (Enter agrega)" autocomplete="off" list="venta-productos" /></label>
      </div>
      <datalist id="venta-productos"></datalist>
      <datalist id="clientes-list">
        ${S.clientes.map((c) => `<option value="${esc(c.nombre)}">`).join("")}
      </datalist>

      <div class="cart-list" id="venta-carrito"><p class="muted">Agrega productos con el buscador.</p></div>
      <div class="cart-total"><span>Total</span><strong id="venta-total">$0</strong></div>

      <div class="form-grid" style="margin-top:0.6rem">
        <label class="field" id="abono-field" hidden><span>Abono inicial <span class="hint">(cuánto paga ahora)</span></span>
          <input name="pagado" type="number" step="0.01" min="0" value="0" id="venta-pagado" /></label>
        <label class="field full"><span>Notas (opcional)</span>
          <input name="notas" placeholder="Método de pago, referencia…" /></label>
      </div>
      <p class="hint" id="venta-hint">Venta de contado: se marca como pagada por el total.</p>

      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-cerrar>Cancelar</button>
        <button type="submit" class="btn btn-primary">Guardar venta</button>
      </div>
    </form>
  `);

  const $buscar = $("#venta-buscar");
  const $datalist = $("#venta-productos");

  const opciones = () =>
    S.productos
      .filter((p) => (p.stock || 0) > 0)
      .map((p) => `<option value="${esc(`${p.nombre} — ${p.casa}`)}">`)
      .join("");
  $datalist.innerHTML = opciones();

  function precioSegunTipo(p) {
    const tipo = $("#venta-tipo").value;
    if (tipo === "mayor") return p.precioMayor;
    return p.precioOferta || p.precioDetal;
  }

  function renderCarrito() {
    const $c = $("#venta-carrito");
    if (!S.carrito.length) {
      $c.innerHTML = '<p class="muted">Agrega productos con el buscador.</p>';
    } else {
      $c.innerHTML = S.carrito
        .map(
          (it, i) => `<div class="cart-row">
            <span>${esc(it.nombre)} <span class="muted">· ${esc(it.casa)}</span></span>
            <span style="display:flex;align-items:center;gap:0.5rem">
              <input type="number" min="1" max="${it.stockMax}" value="${it.cantidad}" data-i="${i}" class="input cart-cant" style="width:64px;padding:0.25rem 0.5rem" />
              × <input type="number" min="0" step="0.01" value="${it.precioUnit}" data-i="${i}" class="input cart-precio" style="width:80px;padding:0.25rem 0.5rem" />
              <strong>${fmt(it.cantidad * it.precioUnit)}</strong>
              <button type="button" class="btn-icon danger" data-quitar="${i}">✕</button>
            </span>
          </div>`
        )
        .join("");
    }
    $("#venta-total").textContent = fmt(totalCarrito());
  }

  const totalCarrito = () => S.carrito.reduce((s, it) => s + it.cantidad * it.precioUnit, 0);

  function agregarProducto(texto) {
    const p = S.productos.find((x) => `${x.nombre} — ${x.casa}` === texto);
    if (!p) return;
    if ((p.stock || 0) < 1) { toast("Sin stock disponible.", "error"); return; }
    const existente = S.carrito.find((it) => it.productId === p.id);
    if (existente) {
      if (existente.cantidad < existente.stockMax) existente.cantidad += 1;
    } else {
      S.carrito.push({
        productId: p.id,
        nombre: p.nombre,
        casa: p.casa,
        cantidad: 1,
        precioUnit: precioSegunTipo(p),
        costoUnit: p.costo || 0,
        tipo: $("#venta-tipo").value,
        stockMax: p.stock || 0,
      });
    }
    $buscar.value = "";
    renderCarrito();
  }

  $buscar.addEventListener("change", () => agregarProducto($buscar.value));
  $buscar.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); agregarProducto($buscar.value); }
  });

  $("#venta-tipo").addEventListener("change", () => {
    // Reajusta precios del carrito al nuevo tipo
    S.carrito.forEach((it) => {
      const p = S.productos.find((x) => x.id === it.productId);
      if (p) { it.precioUnit = precioSegunTipo(p); it.tipo = $("#venta-tipo").value; }
    });
    renderCarrito();
  });

  // Contado / Crédito: muestra u oculta el abono inicial
  $("#venta-pago").addEventListener("change", () => {
    const credito = $("#venta-pago").value === "credito";
    $("#abono-field").hidden = !credito;
    $("#venta-hint").textContent = credito
      ? "Venta a crédito: el saldo pendiente pasa al panel de Deudores."
      : "Venta de contado: se marca como pagada por el total.";
  });

  // Autocompleta el teléfono cuando se elige un cliente ya registrado
  $("#venta-cliente").addEventListener("input", () => {
    const nombre = $("#venta-cliente").value.trim().toLowerCase();
    const cli = S.clientes.find((c) => c.nombre.toLowerCase() === nombre);
    if (cli && cli.telefono) $("#venta-telefono").value = cli.telefono;
  });

  $("#venta-carrito").addEventListener("input", (e) => {
    const i = Number(e.target.dataset.i);
    if (Number.isNaN(i) || !S.carrito[i]) return;
    if (e.target.classList.contains("cart-cant")) {
      S.carrito[i].cantidad = Math.max(1, Math.min(Number(e.target.value) || 1, S.carrito[i].stockMax));
    } else if (e.target.classList.contains("cart-precio")) {
      S.carrito[i].precioUnit = Math.max(0, Number(e.target.value) || 0);
    }
    $("#venta-total").textContent = fmt(totalCarrito());
  });

  $("#venta-carrito").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-quitar]");
    if (!btn) return;
    S.carrito.splice(Number(btn.dataset.quitar), 1);
    renderCarrito();
  });

  $("#form-venta").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!S.carrito.length) { toast("Agrega al menos un producto.", "error"); return; }
    const f = new FormData(e.target);
    const total = totalCarrito();
    const credito = f.get("tipoPago") === "credito";
    const cliente = f.get("cliente").trim();
    const telefono = f.get("telefono").trim();

    // Contado: pagado = total. Crédito: pagado = abono inicial (puede ser 0).
    const pagado = credito
      ? Math.min(Number(f.get("pagado")) || 0, total)
      : total;

    if (credito && !telefono &&
        !confirm("Venta a crédito sin teléfono del cliente. ¿Continuar de todas formas?")) {
      return;
    }

    const venta = {
      fecha: hoyISO(),
      cliente,
      telefono,
      credito,
      items: S.carrito.map(({ stockMax, ...it }) => it),
      total,
      pagado,
      abonos: pagado > 0 ? [{ fecha: hoyISO(), monto: pagado }] : [],
      notas: f.get("notas").trim(),
    };

    const { fs, db } = S.fb;
    try {
      const ref = await fs.addDoc(fs.collection(db, "ventas"), venta);
      // Descuenta stock y registra movimientos
      for (const it of venta.items) {
        const p = S.productos.find((x) => x.id === it.productId);
        if (p) await ajustarStock(p, -it.cantidad, `venta a ${venta.cliente}`);
      }
      await registrarCliente(cliente, telefono);
      S.ventas.unshift({ id: ref.id, ...venta });
      cerrarModal();
      renderTodo();
      toast(
        credito
          ? `Venta a crédito registrada · saldo ${fmt(total - pagado)} en Deudores`
          : `Venta de ${fmt(total)} registrada ✓`,
        "success"
      );
    } catch (err) {
      toast("Error al guardar la venta: " + err.message, "error");
    }
  });
}

/**
 * Registra o actualiza un cliente en la colección "clientes"
 * (identificado por su nombre normalizado). Guarda el teléfono más reciente.
 */
async function registrarCliente(nombre, telefono) {
  if (!nombre) return;
  const { fs, db } = S.fb;
  const id = "c_" + normalizar(nombre).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const datos = { nombre, telefono: telefono || "", actualizado: hoyISO() };
  await fs.setDoc(fs.doc(db, "clientes", id), datos, { merge: true });
  const existente = S.clientes.find((c) => c.id === id);
  if (existente) Object.assign(existente, datos);
  else S.clientes.push({ id, ...datos });
}

function modalAbono(v) {
  const saldo = saldoVenta(v);
  abrirModal(`
    <h3>Registrar abono</h3>
    <p style="margin-bottom:1rem">${esc(v.cliente)} <span class="muted">· venta del ${fmtFecha(v.fecha)} · saldo: <strong>${fmt(saldo)}</strong></span></p>
    <form id="form-abono">
      <label class="field"><span>Monto del abono (USD)</span>
        <input name="monto" type="number" step="0.01" min="0.01" max="${saldo}" value="${saldo}" required /></label>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-cerrar>Cancelar</button>
        <button type="submit" class="btn btn-primary">Registrar abono</button>
      </div>
    </form>
  `);

  $("#form-abono").addEventListener("submit", async (e) => {
    e.preventDefault();
    const monto = Math.min(Number(new FormData(e.target).get("monto")) || 0, saldo);
    if (monto <= 0) return;
    const { fs, db } = S.fb;
    try {
      const nuevoPagado = (v.pagado || 0) + monto;
      const nuevosAbonos = [...(v.abonos || []), { fecha: hoyISO(), monto }];
      await fs.updateDoc(fs.doc(db, "ventas", v.id), { pagado: nuevoPagado, abonos: nuevosAbonos });
      v.pagado = nuevoPagado;
      v.abonos = nuevosAbonos;
      cerrarModal();
      renderTodo();
      toast(`Abono de ${fmt(monto)} registrado ✓`, "success");
    } catch (err) {
      toast("Error: " + err.message, "error");
    }
  });
}

async function eliminarVenta(v) {
  if (!confirm(`¿Eliminar la venta de ${v.cliente} por ${fmt(v.total)}? El stock de los productos será restaurado.`)) return;
  const { fs, db } = S.fb;
  try {
    await fs.deleteDoc(fs.doc(db, "ventas", v.id));
    for (const it of v.items || []) {
      const p = S.productos.find((x) => x.id === it.productId);
      if (p) await ajustarStock(p, it.cantidad, "venta eliminada");
    }
    S.ventas = S.ventas.filter((x) => x.id !== v.id);
    renderTodo();
    toast("Venta eliminada y stock restaurado ✓", "success");
  } catch (err) {
    toast("Error: " + err.message, "error");
  }
}

// ═════════════════════ DEUDORES ══════════════════════════════
function telefonoCliente(nombre) {
  const cli = S.clientes.find(
    (c) => normalizar(c.nombre) === normalizar(nombre || "")
  );
  return cli?.telefono || "";
}

function clientesDeudores() {
  const mapa = {};
  S.ventas.forEach((v) => {
    const saldo = saldoVenta(v);
    if (saldo <= 0) return;
    const clave = v.cliente || "Cliente";
    (mapa[clave] ??= { cliente: clave, telefono: "", total: 0, ventas: [] });
    mapa[clave].total += saldo;
    if (v.telefono) mapa[clave].telefono = v.telefono;
    mapa[clave].ventas.push(v);
  });
  // Completa el teléfono desde el registro de clientes si falta
  Object.values(mapa).forEach((d) => {
    if (!d.telefono) d.telefono = telefonoCliente(d.cliente);
  });
  return Object.values(mapa).sort((a, b) => b.total - a.total);
}

/** Convierte un teléfono venezolano a formato internacional para wa.me */
function telefonoWa(tel) {
  let n = (tel || "").replace(/\D/g, "");
  if (!n) return "";
  if (n.startsWith("58")) return n;
  if (n.startsWith("0")) n = n.slice(1);
  return "58" + n;
}

function renderDeudores() {
  const deudores = clientesDeudores();
  const total = deudores.reduce((s, d) => s + d.total, 0);

  $("#deuda-stats").innerHTML = `
    ${stat("Deudores", deudores.length, deudores.length ? "red" : "green", "clientes con saldo")}
    ${stat("Total por cobrar", fmt(total), total > 0 ? "red" : "green", "")}
  `;

  $("#deuda-empty").hidden = deudores.length > 0;
  $("#deuda-lista").innerHTML = deudores
    .map(
      (d) => `<div class="deudor-card">
        <div class="deudor-head">
          <div>
            <span class="deudor-nombre">${esc(d.cliente)}</span>
            ${d.telefono ? `<span class="deudor-tel">${esc(d.telefono)}</span>` : '<span class="deudor-tel muted">Sin teléfono</span>'}
          </div>
          <div class="deudor-head-right">
            ${d.telefono ? `<a class="btn-wa-mini" href="https://wa.me/${telefonoWa(d.telefono)}?text=${encodeURIComponent(`Hola ${d.cliente}, le recordamos su saldo pendiente de ${fmt(d.total)} con Almaria Perfumes.`)}" target="_blank" title="Recordar por WhatsApp">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.5 14.4c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.62.71.23 1.36.19 1.87.12.57-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.13-.27-.2-.57-.35zM12 2a10 10 0 0 0-8.6 15.06L2 22l5.05-1.32A10 10 0 1 0 12 2z"/></svg>
            </a>` : ""}
            <span class="deudor-total">Debe ${fmt(d.total)}</span>
          </div>
        </div>
        <div class="deudor-ventas mini-list">
          ${d.ventas
            .map(
              (v) => `<div class="mini-row">
                <span>${fmtFecha(v.fecha)} <span class="muted">· ${(v.items || []).map((it) => `${it.cantidad}× ${esc(it.nombre)}`).join(", ")}</span></span>
                <span style="display:flex;gap:0.6rem;align-items:center">
                  <strong>${fmt(saldoVenta(v))}</strong>
                  <button class="btn btn-ghost" data-abonar="${v.id}" style="padding:0.25rem 0.8rem">Abonar</button>
                </span>
              </div>`
            )
            .join("")}
        </div>
      </div>`
    )
    .join("");
}

// ═════════════════════ PROVEEDORES ═══════════════════════════
function renderProveedores() {
  $("#prov-empty").hidden = S.proveedores.length > 0;
  $("#prov-table").hidden = S.proveedores.length === 0;

  $("#prov-table tbody").innerHTML = S.proveedores
    .map((pr) => {
      const nProductos = S.productos.filter((p) => p.proveedorId === pr.id).length;
      return `<tr data-id="${pr.id}">
        <td class="td-nombre">${esc(pr.nombre)}
          ${nProductos ? `<span class="td-sub">${nProductos} producto${nProductos === 1 ? "" : "s"} asociado${nProductos === 1 ? "" : "s"}</span>` : ""}
        </td>
        <td>${esc(pr.telefono || "—")}</td>
        <td>${esc(pr.correo || "—")}</td>
        <td class="muted">${esc(pr.notas || "")}</td>
        <td class="acciones">
          <button class="btn-icon" data-accion="editar" title="Editar">${icon("editar")}</button>
          <button class="btn-icon danger" data-accion="eliminar" title="Eliminar">${icon("basura")}</button>
        </td>
      </tr>`;
    })
    .join("");
}

function modalProveedor(pr = null) {
  abrirModal(`
    <h3>${pr ? "Editar proveedor" : "Nuevo proveedor"}</h3>
    <form id="form-prov">
      <div class="form-grid">
        <label class="field full"><span>Nombre</span>
          <input name="nombre" required value="${esc(pr?.nombre || "")}" /></label>
        <label class="field"><span>Teléfono</span>
          <input name="telefono" value="${esc(pr?.telefono || "")}" /></label>
        <label class="field"><span>Correo</span>
          <input name="correo" type="email" value="${esc(pr?.correo || "")}" /></label>
        <label class="field full"><span>Notas</span>
          <textarea name="notas" rows="2">${esc(pr?.notas || "")}</textarea></label>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-cerrar>Cancelar</button>
        <button type="submit" class="btn btn-primary">${pr ? "Guardar" : "Crear"}</button>
      </div>
    </form>
  `);

  $("#form-prov").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const datos = {
      nombre: f.get("nombre").trim(),
      telefono: f.get("telefono").trim(),
      correo: f.get("correo").trim(),
      notas: f.get("notas").trim(),
    };
    const { fs, db } = S.fb;
    try {
      if (pr) {
        await fs.updateDoc(fs.doc(db, "proveedores", pr.id), datos);
        Object.assign(pr, datos);
      } else {
        const ref = await fs.addDoc(fs.collection(db, "proveedores"), datos);
        S.proveedores.push({ id: ref.id, ...datos });
      }
      S.proveedores.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
      cerrarModal();
      renderTodo();
      toast(pr ? "Proveedor actualizado ✓" : "Proveedor creado ✓", "success");
    } catch (err) {
      toast("Error: " + err.message, "error");
    }
  });
}

async function eliminarProveedor(pr) {
  if (!confirm(`¿Eliminar al proveedor "${pr.nombre}"?`)) return;
  const { fs, db } = S.fb;
  try {
    await fs.deleteDoc(fs.doc(db, "proveedores", pr.id));
    S.proveedores = S.proveedores.filter((x) => x.id !== pr.id);
    renderTodo();
    toast("Proveedor eliminado ✓", "success");
  } catch (err) {
    toast("Error: " + err.message, "error");
  }
}

// ═════════════════════ MONEDA / Bs ═══════════════════════════
const fmtBs = (n) =>
  new Intl.NumberFormat("es-VE", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(
    Number(n) || 0
  );

function renderMoneda() {
  const { tasaPropia, tasaBcv, actualizado } = S.moneda;
  if (document.activeElement?.id !== "moneda-propia") $("#moneda-propia").value = tasaPropia || "";
  if (document.activeElement?.id !== "moneda-bcv") $("#moneda-bcv").value = tasaBcv || "";

  $("#moneda-actualizado").textContent = actualizado
    ? `Última actualización: ${fmtFecha(actualizado)}`
    : "Aún no has guardado las tasas.";

  // Vista previa con un ejemplo de $20
  const ejemplo = 20;
  const bs = tasaPropia ? ejemplo * tasaPropia : 0;
  const base = tasaBcv ? bs / tasaBcv : 0;
  $("#moneda-preview").innerHTML =
    tasaPropia && tasaBcv
      ? `
      <div class="moneda-ej">
        <div class="moneda-ej-row"><span>Precio promo en divisas</span><strong>${fmt(ejemplo)}</strong></div>
        <div class="moneda-ej-row"><span>Precio en bolívares (× ${fmtBs(tasaPropia)})</span><strong>Bs ${fmtBs(bs)}</strong></div>
        <div class="moneda-ej-row destacado"><span>Costo base (÷ BCV ${fmtBs(tasaBcv)})</span><strong>${fmt(base)}</strong></div>
      </div>`
      : `<p class="muted">Ingresa ambas tasas para ver el ejemplo.</p>`;
}

async function guardarMoneda(e) {
  e.preventDefault();
  const f = new FormData(e.target);
  const tasaPropia = Number(f.get("tasaPropia")) || 0;
  const tasaBcv = Number(f.get("tasaBcv")) || 0;
  if (tasaPropia <= 0 || tasaBcv <= 0) {
    toast("Ingresa tu tasa y asegúrate de tener la tasa BCV cargada.", "error");
    return;
  }
  const datos = { tasaPropia, tasaBcv, actualizado: hoyISO() };
  const { fs, db } = S.fb;
  try {
    await fs.setDoc(fs.doc(db, "config", "moneda"), datos);
    S.moneda = datos;
    renderMoneda();
    toast("Tasas guardadas ✓ Ya se reflejan en la tienda.", "success");
  } catch (err) {
    toast("Error al guardar: " + err.message, "error");
  }
}

/** Trae la tasa BCV automáticamente desde DolarAPI y la coloca en el formulario. */
async function refrescarBcv(forzar = false) {
  const $estado = $("#moneda-bcv-estado");
  const $bcv = $("#moneda-bcv");
  if (typeof obtenerBcv24h !== "function") return;
  $estado.textContent = "Consultando BCV…";
  try {
    // forzar = ignora la caché de 24h
    let tasa;
    if (forzar && typeof fetchBcvOficial === "function") {
      const r = await fetchBcvOficial();
      tasa = r.tasa;
      try {
        localStorage.setItem(
          "almaria_bcv",
          JSON.stringify({ tasa, fecha: r.fecha, ts: Date.now() })
        );
      } catch {}
    } else {
      tasa = await obtenerBcv24h();
    }
    if (tasa) {
      $bcv.value = tasa;
      S.moneda.tasaBcv = tasa;
      $estado.textContent = `BCV: Bs ${fmtBs(tasa)} por $`;
      renderMoneda();
    } else {
      $estado.textContent = "No se pudo obtener la tasa. Ingrésala manualmente.";
    }
  } catch (err) {
    $estado.textContent = "No se pudo obtener la tasa (¿sin internet?). Ingrésala manualmente.";
  }
}

// ═════════════════════ NAVEGACIÓN Y EVENTOS ══════════════════
function configurarEventos() {
  // Navegación entre secciones
  $("#nav").addEventListener("click", (e) => {
    const btn = e.target.closest(".nav-item[data-sec]");
    if (!btn) return;
    $$(".nav-item[data-sec]").forEach((b) => b.classList.toggle("is-active", b === btn));
    $$(".section").forEach((s) => (s.hidden = s.id !== `sec-${btn.dataset.sec}`));
    // Al abrir Moneda, actualiza el BCV automáticamente (caché 24h)
    if (btn.dataset.sec === "moneda") refrescarBcv(false);
  });

  // Cerrar modal con botones [data-cerrar]
  $("#modal").addEventListener("click", (e) => {
    if (e.target.closest("[data-cerrar]")) cerrarModal();
  });

  // Productos
  $("#prod-search").addEventListener("input", (e) => {
    S.prodBusqueda = e.target.value;
    renderProductos();
  });
  $("#prod-nuevo").addEventListener("click", () => modalProducto());
  $("#prod-seed").addEventListener("click", importarCatalogo);
  $("#prod-table").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-accion]");
    if (!btn) return;
    const p = S.productos.find((x) => x.id === btn.closest("tr").dataset.id);
    if (!p) return;
    if (btn.dataset.accion === "editar") modalProducto(p);
    else if (btn.dataset.accion === "stock") modalStock(p);
    else if (btn.dataset.accion === "eliminar") eliminarProducto(p);
  });

  // Ventas
  // Pedidos web
  $("#pedidos-lista").addEventListener("click", (e) => {
    const toggle = e.target.closest("[data-toggle]");
    const conf = e.target.closest("[data-confirmar]");
    const rech = e.target.closest("[data-rechazar]");
    if (toggle) {
      const card = toggle.closest(".pedido-card");
      const body = card.querySelector(".pedido-body");
      const abierto = body.hidden;
      body.hidden = !abierto;
      toggle.setAttribute("aria-expanded", String(abierto));
      card.classList.toggle("is-open", abierto);
    } else if (conf) {
      const pe = S.pedidos.find((x) => x.id === conf.dataset.confirmar);
      if (pe) confirmarPedido(pe);
    } else if (rech) {
      const pe = S.pedidos.find((x) => x.id === rech.dataset.rechazar);
      if (pe) rechazarPedido(pe);
    }
  });

  $("#venta-nueva").addEventListener("click", modalVenta);
  $("#ventas-table").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-accion]");
    if (!btn) return;
    const v = S.ventas.find((x) => x.id === btn.closest("tr").dataset.id);
    if (!v) return;
    if (btn.dataset.accion === "abonar") modalAbono(v);
    else if (btn.dataset.accion === "eliminar") eliminarVenta(v);
  });

  // Deudores
  $("#deuda-lista").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-abonar]");
    if (!btn) return;
    const v = S.ventas.find((x) => x.id === btn.dataset.abonar);
    if (v) modalAbono(v);
  });

  // Proveedores
  $("#prov-nuevo").addEventListener("click", () => modalProveedor());
  $("#prov-table").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-accion]");
    if (!btn) return;
    const pr = S.proveedores.find((x) => x.id === btn.closest("tr").dataset.id);
    if (!pr) return;
    if (btn.dataset.accion === "editar") modalProveedor(pr);
    else if (btn.dataset.accion === "eliminar") eliminarProveedor(pr);
  });

  // Moneda / Bs
  $("#form-moneda").addEventListener("submit", guardarMoneda);
  $("#moneda-refrescar").addEventListener("click", () => refrescarBcv(true));
  ["moneda-propia", "moneda-bcv"].forEach((id) =>
    $("#" + id).addEventListener("input", () => {
      S.moneda.tasaPropia = Number($("#moneda-propia").value) || 0;
      S.moneda.tasaBcv = Number($("#moneda-bcv").value) || 0;
      renderMoneda();
    })
  );
}

// ═════════════════════ ARRANQUE ══════════════════════════════
async function main() {
  let fb;
  try {
    fb = await initFirebase();
  } catch (err) {
    $("#login-error").textContent =
      "No se pudo conectar con Firebase: " + err.message;
    $("#login-error").hidden = false;
    return;
  }

  S.fb = { db: fb.db, fs: fb.fs, auth: fb.authInst };
  const { onAuthStateChanged, signInWithEmailAndPassword, signOut } = fb.auth;

  onAuthStateChanged(fb.authInst, async (user) => {
    if (user) {
      $("#login-screen").hidden = true;
      $("#admin-app").hidden = false;
      $("#user-email").textContent = (user.email || "").replace("@almariaperfumes.com", "");
      try {
        await cargarTodo();
        renderTodo();
        refrescarBcv(false); // trae el BCV automático (caché 24h)
      } catch (err) {
        toast("Error al cargar datos: " + err.message + " — Revisa las reglas de Firestore.", "error");
      }
    } else {
      $("#login-screen").hidden = false;
      $("#admin-app").hidden = true;
    }
  });

  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#login-btn");
    btn.disabled = true;
    $("#login-error").hidden = true;
    // El usuario básico se convierte internamente en el correo de Firebase Auth
    const usuario = $("#login-email").value.trim();
    const email = usuario.includes("@") ? usuario : `${usuario}@almariaperfumes.com`;
    try {
      await signInWithEmailAndPassword(fb.authInst, email, $("#login-password").value);
    } catch (err) {
      const msgs = {
        "auth/invalid-credential": "Correo o contraseña incorrectos.",
        "auth/user-not-found": "No existe una cuenta con ese correo.",
        "auth/wrong-password": "Contraseña incorrecta.",
        "auth/too-many-requests": "Demasiados intentos. Espera unos minutos.",
      };
      $("#login-error").textContent = msgs[err.code] || "Error: " + err.message;
      $("#login-error").hidden = false;
    } finally {
      btn.disabled = false;
    }
  });

  $("#logout-btn").addEventListener("click", () => signOut(fb.authInst));

  configurarEventos();
}

main();
