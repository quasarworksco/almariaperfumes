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
  proveedores: [],
  movimientos: [],
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
  const [perfumesSnap, costosSnap, ventasSnap, provSnap, movSnap] = await Promise.all([
    fs.getDocs(fs.collection(db, "perfumes")),
    fs.getDocs(fs.collection(db, "costos")),
    fs.getDocs(fs.collection(db, "ventas")),
    fs.getDocs(fs.collection(db, "proveedores")),
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

  S.proveedores = provSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es"));

  S.movimientos = movSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function renderTodo() {
  renderDashboard();
  renderProductos();
  renderVentas();
  renderDeudores();
  renderProveedores();
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
    ${stat("Productos", S.productos.length, "", "en catálogo")}
    ${stat("Unidades en stock", unidades, "", `inversión: ${fmt(valorInv)}`)}
    ${stat("Ventas del mes", fmt(totalMes), "gold", `${ventasMes.length} ventas`)}
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
        <td class="td-nombre">${esc(p.nombre)}
          ${p.precioOferta ? '<span class="badge oferta">Oferta</span>' : ""}
        </td>
        <td class="num muted">${fmt(p.costo)}</td>
        <td class="num">${fmt(p.precioMayor)}</td>
        <td class="num">${fmt(p.precioDetal)}</td>
        <td class="num">${p.precioOferta ? fmt(p.precioOferta) : '<span class="muted">—</span>'}</td>
        <td class="num"><span class="stock-pill ${pill}">${stock}</span></td>
        <td class="acciones">
          <button class="btn-icon" data-accion="stock" title="Carga / descarga de stock">⇅</button>
          <button class="btn-icon" data-accion="editar" title="Editar">✎</button>
          <button class="btn-icon danger" data-accion="eliminar" title="Eliminar">🗑</button>
        </td>
      </tr>`;
    })
    .join("");

  $("#prod-movimientos").innerHTML = S.movimientos.length
    ? `<div class="mini-list">${S.movimientos.slice(0, 12).map((m) => `
        <div class="mini-row">
          <span>${m.tipo === "entrada" ? "⬆" : "⬇"} ${esc(m.nombre)}
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
        <label class="field full"><span>Imagen (URL, opcional)</span>
          <input name="imagen" type="url" value="${esc(p?.imagen || "")}" /></label>
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
            <option value="entrada">⬆ Entrada (carga)</option>
            <option value="salida">⬇ Salida (descarga)</option>
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
    btn.textContent = "⬆ Importar catálogo local (260 perfumes)";
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
    ${stat("Este mes", fmt(totalMes), "gold", `${ventasMes.length} ventas`)}
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
      return `<tr data-id="${v.id}">
        <td class="muted" style="white-space:nowrap">${fmtFecha(v.fecha)}</td>
        <td class="td-nombre">${esc(v.cliente || "Cliente")}</td>
        <td>${esc(resumen)}<span class="td-sub">${(v.items || []).reduce((s, it) => s + it.cantidad, 0)} unidades</span></td>
        <td class="num">${fmt(v.total)}</td>
        <td class="num">${fmt(v.pagado)}</td>
        <td class="num ${saldo > 0 ? "" : "muted"}">${fmt(saldo)}</td>
        <td><span class="badge ${saldo > 0 ? "pendiente" : "pagada"}">${saldo > 0 ? "Pendiente" : "Pagada"}</span></td>
        <td class="acciones">
          ${saldo > 0 ? '<button class="btn-icon" data-accion="abonar" title="Registrar abono">＋$</button>' : ""}
          <button class="btn-icon danger" data-accion="eliminar" title="Eliminar venta">🗑</button>
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
          <input name="cliente" required placeholder="Nombre del cliente" list="clientes-list" /></label>
        <label class="field"><span>Tipo de precio</span>
          <select name="tipoPrecio" id="venta-tipo">
            <option value="detal">Al detal</option>
            <option value="mayor">Al mayor</option>
          </select></label>
        <label class="field full"><span>Producto</span>
          <input id="venta-buscar" placeholder="Escribe para buscar… (Enter agrega)" autocomplete="off" list="venta-productos" /></label>
      </div>
      <datalist id="venta-productos"></datalist>
      <datalist id="clientes-list">
        ${[...new Set(S.ventas.map((v) => v.cliente).filter(Boolean))].map((c) => `<option value="${esc(c)}">`).join("")}
      </datalist>

      <div class="cart-list" id="venta-carrito"><p class="muted">Agrega productos con el buscador.</p></div>
      <div class="cart-total"><span>Total</span><strong id="venta-total">$0</strong></div>

      <div class="form-grid" style="margin-top:0.6rem">
        <label class="field"><span>Monto pagado ahora</span>
          <input name="pagado" type="number" step="0.01" min="0" value="0" id="venta-pagado" /></label>
        <label class="field"><span>Notas (opcional)</span>
          <input name="notas" placeholder="Método de pago, referencia…" /></label>
      </div>
      <p class="hint">Si el monto pagado es menor al total, la diferencia queda registrada como deuda del cliente.</p>

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
    const pagado = Math.min(Number(f.get("pagado")) || 0, total);

    const venta = {
      fecha: hoyISO(),
      cliente: f.get("cliente").trim(),
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
      S.ventas.unshift({ id: ref.id, ...venta });
      cerrarModal();
      renderTodo();
      toast(`Venta de ${fmt(total)} registrada ✓`, "success");
    } catch (err) {
      toast("Error al guardar la venta: " + err.message, "error");
    }
  });
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
function clientesDeudores() {
  const mapa = {};
  S.ventas.forEach((v) => {
    const saldo = saldoVenta(v);
    if (saldo <= 0) return;
    const clave = v.cliente || "Cliente";
    (mapa[clave] ??= { cliente: clave, total: 0, ventas: [] });
    mapa[clave].total += saldo;
    mapa[clave].ventas.push(v);
  });
  return Object.values(mapa).sort((a, b) => b.total - a.total);
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
          <span class="deudor-nombre">${esc(d.cliente)}</span>
          <span class="deudor-total">Debe ${fmt(d.total)}</span>
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
          <button class="btn-icon" data-accion="editar" title="Editar">✎</button>
          <button class="btn-icon danger" data-accion="eliminar" title="Eliminar">🗑</button>
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

// ═════════════════════ NAVEGACIÓN Y EVENTOS ══════════════════
function configurarEventos() {
  // Navegación entre secciones
  $("#nav").addEventListener("click", (e) => {
    const btn = e.target.closest(".nav-item[data-sec]");
    if (!btn) return;
    $$(".nav-item[data-sec]").forEach((b) => b.classList.toggle("is-active", b === btn));
    $$(".section").forEach((s) => (s.hidden = s.id !== `sec-${btn.dataset.sec}`));
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
      $("#user-email").textContent = user.email;
      try {
        await cargarTodo();
        renderTodo();
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
    try {
      await signInWithEmailAndPassword(
        fb.authInst,
        $("#login-email").value.trim(),
        $("#login-password").value
      );
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
