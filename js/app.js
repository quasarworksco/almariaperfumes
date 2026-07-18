/**
 * Almaria Perfumes — Lógica del catálogo
 * Búsqueda en tiempo real, filtro por casa, orden, precios mayor/detal
 * y carga desde Firestore (con fallback a los datos locales de data.js).
 */
(function () {
  "use strict";

  // ─── Estado ────────────────────────────────────────────────
  const state = {
    productos: PERFUMES,
    busqueda: "",
    casa: "",
    orden: "casa",
    modoPrecio: "detal", // "detal" | "mayor"
    carrito: cargarCarrito(), // [{ id, cantidad }]
  };

  const CART_KEY = "almaria_carrito";

  function cargarCarrito() {
    try {
      return JSON.parse(localStorage.getItem("almaria_carrito")) || [];
    } catch {
      return [];
    }
  }

  function guardarCarrito() {
    localStorage.setItem(CART_KEY, JSON.stringify(state.carrito));
  }

  // Casas con acceso rápido vía chips (las de mayor inventario)
  const CHIP_COUNT = 10;

  // Paleta de degradados en tonos vino para el visual de cada tarjeta
  const GRADIENTS = [
    ["#722f37", "#a4626c"],
    ["#46161e", "#8c4a55"],
    ["#8a3a45", "#c9909a"],
    ["#5a2630", "#9c6b78"],
    ["#93404b", "#d0a0a8"],
    ["#3c1a21", "#7a4a52"],
    ["#6b3540", "#b07884"],
    ["#7e2d3a", "#bd8890"],
  ];

  // ─── Referencias al DOM ────────────────────────────────────
  const $grid = document.getElementById("product-grid");
  const $search = document.getElementById("search-input");
  const $searchClear = document.getElementById("search-clear");
  const $brandSelect = document.getElementById("brand-select");
  const $sortSelect = document.getElementById("sort-select");
  const $chips = document.getElementById("brand-chips");
  const $count = document.getElementById("results-count");
  const $empty = document.getElementById("empty-state");
  const $reset = document.getElementById("reset-filters");
  const $toggleBtns = document.querySelectorAll(".price-toggle-btn");

  // Destacados y carrito
  const $featuredSection = document.getElementById("featured-section");
  const $featuredTrack = document.getElementById("featured-track");
  const $cartFab = document.getElementById("cart-fab");
  const $cartCount = document.getElementById("cart-count");
  const $cartOverlay = document.getElementById("cart-overlay");
  const $cartDrawer = document.getElementById("cart-drawer");
  const $cartClose = document.getElementById("cart-close");
  const $cartItems = document.getElementById("cart-items");
  const $cartEmpty = document.getElementById("cart-empty");
  const $cartFoot = document.getElementById("cart-foot");
  const $cartTotal = document.getElementById("cart-total");

  // ─── Utilidades ────────────────────────────────────────────
  const normalizar = (texto) =>
    texto
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const formatearPrecio = (valor) =>
    `$${Number(valor) % 1 === 0 ? valor : Number(valor).toFixed(2)}`;

  // En modo detal, el precio de oferta (si existe) sustituye al detal
  const enOferta = (p) =>
    state.modoPrecio === "detal" && p.precioOferta > 0 && p.precioOferta < p.precioDetal;

  const precioActivo = (p) =>
    state.modoPrecio === "mayor"
      ? p.precioMayor
      : enOferta(p) ? p.precioOferta : p.precioDetal;

  const precioAlterno = (p) =>
    state.modoPrecio === "mayor" ? p.precioDetal : p.precioMayor;

  const agotado = (p) => typeof p.stock === "number" && p.stock <= 0;

  // Degradado estable por casa (misma casa → mismo color)
  function gradientePara(casa) {
    let hash = 0;
    for (let i = 0; i < casa.length; i++) {
      hash = (hash * 31 + casa.charCodeAt(i)) >>> 0;
    }
    const [a, b] = GRADIENTS[hash % GRADIENTS.length];
    return `linear-gradient(135deg, ${a}, ${b})`;
  }

  function escapeHTML(texto) {
    const div = document.createElement("div");
    div.textContent = texto;
    return div.innerHTML;
  }

  // ─── Filtrado y orden ──────────────────────────────────────
  function productosFiltrados() {
    const q = normalizar(state.busqueda.trim());

    let lista = state.productos.filter((p) => {
      const coincideBusqueda =
        !q ||
        normalizar(p.nombre).includes(q) ||
        normalizar(p.casa).includes(q);
      const coincideCasa = !state.casa || p.casa === state.casa;
      return coincideBusqueda && coincideCasa;
    });

    const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, "es");
    switch (state.orden) {
      case "nombre":
        lista.sort(porNombre);
        break;
      case "precio-asc":
        lista.sort((a, b) => precioActivo(a) - precioActivo(b) || porNombre(a, b));
        break;
      case "precio-desc":
        lista.sort((a, b) => precioActivo(b) - precioActivo(a) || porNombre(a, b));
        break;
      default:
        lista.sort((a, b) => a.casa.localeCompare(b.casa, "es") || porNombre(a, b));
    }
    return lista;
  }

  // ─── Renderizado ───────────────────────────────────────────
  function tarjetaHTML(p, i, opts = {}) {
    const esMayor = state.modoPrecio === "mayor";
    const imagen = p.imagen
      ? `<img src="${escapeHTML(p.imagen)}" alt="${escapeHTML(p.nombre)}" loading="lazy" />`
      : `<span class="card-monogram">${escapeHTML(p.nombre.charAt(0))}</span>`;

    const oferta = enOferta(p);
    const sinStock = agotado(p);
    const enItem = state.carrito.find((it) => it.id === p.id);
    const enCarrito = !!enItem;
    const hayStock = typeof p.stock === "number";
    const disponibles = hayStock ? p.stock : Infinity;
    const enLimite = enCarrito && enItem.cantidad >= disponibles;
    const etiquetaStock = !hayStock || sinStock
      ? ""
      : `<span class="card-stock ${p.stock <= 3 ? "bajo" : ""}">${p.stock} ${p.stock === 1 ? "disponible" : "disponibles"}</span>`;

    return `
      <article class="product-card ${sinStock ? "is-agotado" : ""} ${opts.featured ? "is-featured" : ""}"
        style="animation-delay:${Math.min(i * 25, 400)}ms">
        <div class="card-visual" style="background:${gradientePara(p.casa)}">
          ${imagen}
          ${p.destacado && !opts.featured ? '<span class="card-badge badge-destacado">Destacado</span>' : ""}
          ${oferta ? '<span class="card-badge badge-oferta">Oferta</span>' : ""}
          ${sinStock ? '<span class="agotado-overlay">Agotado</span>' : ""}
        </div>
        <div class="card-body">
          <div class="card-brand-row">
            <p class="card-brand">${escapeHTML(p.casa)}</p>
            ${etiquetaStock}
          </div>
          <h3 class="card-name">${escapeHTML(p.nombre)}</h3>
          <div class="card-footer">
            <div>
              <span class="card-price-label">Precio ${esMayor ? "al mayor" : "al detal"}</span>
              <span class="card-price">${formatearPrecio(precioActivo(p))}
                ${oferta ? `<s class="price-tachado">${formatearPrecio(p.precioDetal)}</s>` : ""}
              </span>
            </div>
            <span class="card-price-alt">${esMayor ? "Detal" : "Mayor"}: ${formatearPrecio(precioAlterno(p))}</span>
          </div>
          <button type="button" class="card-add ${enCarrito ? "is-added" : ""}" data-add="${p.id}" ${sinStock || enLimite ? "disabled" : ""}>
            ${sinStock ? "Agotado" : enLimite ? "Máximo disponible" : enCarrito ? `Agregado ✓ (${enItem.cantidad})` : "Agregar al pedido"}
          </button>
        </div>
      </article>`;
  }

  function renderProductos() {
    const lista = productosFiltrados();

    $count.innerHTML = `<strong>${lista.length}</strong> ${
      lista.length === 1 ? "perfume" : "perfumes"
    }`;
    $empty.hidden = lista.length > 0;

    $grid.innerHTML = lista.map((p, i) => tarjetaHTML(p, i)).join("");
  }

  function renderDestacados() {
    const destacados = state.productos.filter((p) => p.destacado && !agotado(p));
    $featuredSection.hidden = destacados.length === 0;
    $featuredTrack.innerHTML = destacados
      .map((p, i) => tarjetaHTML(p, i, { featured: true }))
      .join("");
  }

  function renderFiltros() {
    const casas = [...new Set(state.productos.map((p) => p.casa))].sort((a, b) =>
      a.localeCompare(b, "es")
    );

    $brandSelect.innerHTML =
      '<option value="">Todas las casas</option>' +
      casas
        .map((c) => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`)
        .join("");
    $brandSelect.value = state.casa;

    // Chips: las casas con más productos
    const conteo = {};
    state.productos.forEach((p) => (conteo[p.casa] = (conteo[p.casa] || 0) + 1));
    const destacadas = casas
      .slice()
      .sort((a, b) => conteo[b] - conteo[a])
      .slice(0, CHIP_COUNT);

    $chips.innerHTML =
      `<button type="button" class="chip ${!state.casa ? "is-active" : ""}" data-casa="">Todas</button>` +
      destacadas
        .map(
          (c) =>
            `<button type="button" class="chip ${state.casa === c ? "is-active" : ""}" data-casa="${escapeHTML(c)}">${escapeHTML(c)}</button>`
        )
        .join("");
  }

  function render() {
    renderFiltros();
    renderDestacados();
    renderProductos();
    renderCarrito();
  }

  // ─── Carrito ───────────────────────────────────────────────
  const buscarProducto = (id) => state.productos.find((p) => p.id === id);

  function totalCarrito() {
    return state.carrito.reduce((s, it) => {
      const p = buscarProducto(it.id);
      return p ? s + precioActivo(p) * it.cantidad : s;
    }, 0);
  }

  function unidadesCarrito() {
    return state.carrito.reduce((s, it) => s + it.cantidad, 0);
  }

  // Máximo que se puede pedir de un producto (su stock, o sin límite si no está definido)
  function stockMax(id) {
    const p = buscarProducto(id);
    return p && typeof p.stock === "number" ? p.stock : Infinity;
  }

  function agregarAlCarrito(id) {
    const max = stockMax(id);
    const existente = state.carrito.find((it) => it.id === id);
    const actual = existente ? existente.cantidad : 0;
    if (actual >= max) return false; // ya alcanzó el stock disponible
    if (existente) existente.cantidad += 1;
    else state.carrito.push({ id, cantidad: 1 });
    guardarCarrito();
    renderProductos();
    renderDestacados();
    renderCarrito();
    return true;
  }

  function cambiarCantidad(id, delta) {
    const it = state.carrito.find((x) => x.id === id);
    if (!it) return;
    const nueva = it.cantidad + delta;
    if (delta > 0 && nueva > stockMax(id)) return; // no supera el stock
    it.cantidad = nueva;
    if (it.cantidad <= 0) state.carrito = state.carrito.filter((x) => x.id !== id);
    guardarCarrito();
    renderProductos();
    renderDestacados();
    renderCarrito();
  }

  function vaciarCarrito() {
    state.carrito = [];
    guardarCarrito();
    renderProductos();
    renderDestacados();
    renderCarrito();
  }

  function renderCarrito() {
    const unidades = unidadesCarrito();
    $cartCount.textContent = unidades;
    $cartCount.hidden = unidades === 0;

    const vacio = state.carrito.length === 0;
    $cartEmpty.hidden = !vacio;
    $cartFoot.hidden = vacio;

    $cartItems.innerHTML = state.carrito
      .map((it) => {
        const p = buscarProducto(it.id);
        if (!p) return "";
        const hayStock = typeof p.stock === "number";
        const enLimite = hayStock && it.cantidad >= p.stock;
        return `
        <div class="cart-item">
          <div class="cart-item-info">
            <p class="cart-item-name">${escapeHTML(p.nombre)}</p>
            <p class="cart-item-brand">${escapeHTML(p.casa)} · ${formatearPrecio(precioActivo(p))} c/u${
              hayStock ? ` · <span class="cart-item-stock">${p.stock} disp.</span>` : ""
            }</p>
          </div>
          <div class="cart-item-qty">
            <button type="button" data-dec="${p.id}" aria-label="Menos">−</button>
            <span>${it.cantidad}</span>
            <button type="button" data-inc="${p.id}" aria-label="Más" ${enLimite ? "disabled" : ""}>+</button>
          </div>
          <span class="cart-item-sub">${formatearPrecio(precioActivo(p) * it.cantidad)}</span>
        </div>`;
      })
      .join("");

    $cartTotal.textContent = formatearPrecio(totalCarrito());
  }

  function textoPedido() {
    const modo = state.modoPrecio === "mayor" ? "AL MAYOR" : "AL DETAL";
    const lineas = state.carrito.map((it) => {
      const p = buscarProducto(it.id);
      if (!p) return "";
      return `• ${it.cantidad}x ${p.nombre} (${p.casa}) — ${formatearPrecio(precioActivo(p) * it.cantidad)}`;
    });
    return (
      `*Pedido — Almaria Perfumes*\n(Precios ${modo})\n\n` +
      lineas.join("\n") +
      `\n\n*Total: ${formatearPrecio(totalCarrito())}*`
    );
  }

  function abrirCarrito() {
    $cartDrawer.hidden = false;
    $cartOverlay.hidden = false;
    requestAnimationFrame(() => {
      $cartDrawer.classList.add("is-open");
      $cartOverlay.classList.add("is-open");
    });
  }

  function cerrarCarrito() {
    $cartDrawer.classList.remove("is-open");
    $cartOverlay.classList.remove("is-open");
    setTimeout(() => {
      $cartDrawer.hidden = true;
      $cartOverlay.hidden = true;
    }, 280);
  }

  // ─── Eventos ───────────────────────────────────────────────
  $grid.addEventListener("click", onAddClick);
  $featuredTrack.addEventListener("click", onAddClick);

  function onAddClick(e) {
    const btn = e.target.closest("[data-add]");
    if (!btn || btn.disabled) return;
    agregarAlCarrito(btn.dataset.add);
    // feedback breve
    btn.classList.add("just-added");
    setTimeout(() => btn.classList.remove("just-added"), 600);
  }

  $cartFab.addEventListener("click", abrirCarrito);
  $cartClose.addEventListener("click", cerrarCarrito);
  $cartOverlay.addEventListener("click", cerrarCarrito);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$cartDrawer.hidden) cerrarCarrito();
  });

  $cartItems.addEventListener("click", (e) => {
    const inc = e.target.closest("[data-inc]");
    const dec = e.target.closest("[data-dec]");
    if (inc) cambiarCantidad(inc.dataset.inc, 1);
    else if (dec) cambiarCantidad(dec.dataset.dec, -1);
  });

  document.getElementById("cart-clear").addEventListener("click", () => {
    if (state.carrito.length && confirm("¿Vaciar todo el pedido?")) vaciarCarrito();
  });

  // Limpia el resaltado de error al escribir en los datos del cliente
  ["cart-nombre", "cart-telefono"].forEach((id) => {
    document.getElementById(id).addEventListener("input", (e) => {
      e.target.classList.remove("input-error");
      const $err = document.getElementById("cart-datos-error");
      if (
        document.getElementById("cart-nombre").value.trim() &&
        document.getElementById("cart-telefono").value.trim()
      ) {
        $err.hidden = true;
      }
    });
  });

  // Valida que el cliente ingrese nombre y teléfono; devuelve true si están OK
  function validarDatosCliente() {
    const $nombre = document.getElementById("cart-nombre");
    const $telefono = document.getElementById("cart-telefono");
    const $error = document.getElementById("cart-datos-error");
    const nombreOk = $nombre.value.trim().length >= 2;
    // teléfono: al menos 7 dígitos
    const telOk = $telefono.value.replace(/\D/g, "").length >= 7;

    $nombre.classList.toggle("input-error", !nombreOk);
    $telefono.classList.toggle("input-error", !telOk);
    $error.hidden = nombreOk && telOk;

    if (!nombreOk) $nombre.focus();
    else if (!telOk) $telefono.focus();
    return nombreOk && telOk;
  }

  document.getElementById("cart-whatsapp").addEventListener("click", async (e) => {
    if (!state.carrito.length) return;
    if (!validarDatosCliente()) return; // nombre y teléfono son obligatorios
    const btn = e.currentTarget;
    const original = btn.innerHTML;
    // Abre WhatsApp de inmediato (evita bloqueo de pop-ups) …
    const url = `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(textoPedido())}`;
    window.open(url, "_blank");
    // … y en paralelo registra el pedido en el panel del admin
    btn.disabled = true;
    const ok = await guardarPedido();
    btn.disabled = false;
    if (ok) {
      btn.innerHTML = "Pedido enviado ✓";
      setTimeout(() => { btn.innerHTML = original; }, 2200);
    }
  });

  /**
   * Guarda el pedido del cliente en la colección "pedidos" de Firestore
   * (estado "pendiente") para que aparezca en el panel del admin.
   */
  async function guardarPedido() {
    if (!firestoreDB || !fsMod) return false; // sin conexión: solo va por WhatsApp
    try {
      const nombre = document.getElementById("cart-nombre").value.trim();
      const telefono = document.getElementById("cart-telefono").value.trim();
      const items = state.carrito
        .map((it) => {
          const p = buscarProducto(it.id);
          if (!p) return null;
          return {
            productId: it.id,
            nombre: p.nombre,
            casa: p.casa,
            cantidad: it.cantidad,
            precioUnit: precioActivo(p),
          };
        })
        .filter(Boolean);

      await fsMod.addDoc(fsMod.collection(firestoreDB, "pedidos"), {
        fecha: new Date().toISOString(),
        cliente: nombre || "Cliente web",
        telefono,
        tipoPrecio: state.modoPrecio,
        items,
        total: totalCarrito(),
        estado: "pendiente",
      });
      return true;
    } catch (err) {
      console.error("No se pudo registrar el pedido:", err);
      return false;
    }
  }

  document.getElementById("cart-copy").addEventListener("click", async (e) => {
    if (!state.carrito.length) return;
    const btn = e.currentTarget;
    const original = btn.innerHTML;
    try {
      await navigator.clipboard.writeText(textoPedido());
    } catch {
      // Respaldo para navegadores sin permiso de portapapeles
      const ta = document.createElement("textarea");
      ta.value = textoPedido();
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    btn.innerHTML = "Lista copiada ✓";
    btn.classList.add("copied");
    setTimeout(() => {
      btn.innerHTML = original;
      btn.classList.remove("copied");
    }, 1800);
  });


  $search.addEventListener("input", () => {
    state.busqueda = $search.value;
    $searchClear.hidden = !$search.value;
    renderProductos();
  });

  $searchClear.addEventListener("click", () => {
    $search.value = "";
    state.busqueda = "";
    $searchClear.hidden = true;
    $search.focus();
    renderProductos();
  });

  $brandSelect.addEventListener("change", () => {
    state.casa = $brandSelect.value;
    render();
  });

  $sortSelect.addEventListener("change", () => {
    state.orden = $sortSelect.value;
    renderProductos();
  });

  $chips.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    state.casa = chip.dataset.casa;
    render();
  });

  $reset.addEventListener("click", () => {
    state.busqueda = "";
    state.casa = "";
    $search.value = "";
    $searchClear.hidden = true;
    render();
  });

  $toggleBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.mode === state.modoPrecio) return;
      state.modoPrecio = btn.dataset.mode;
      $toggleBtns.forEach((b) => {
        const activo = b === btn;
        b.classList.toggle("is-active", activo);
        b.setAttribute("aria-checked", String(activo));
      });
      renderProductos();
      renderDestacados();
      renderCarrito();
    });
  });

  document.getElementById("year").textContent = new Date().getFullYear();

  // ─── Firestore ─────────────────────────────────────────────
  let firestoreDB = null;
  let fsMod = null; // módulo firestore (collection, addDoc, doc…)

  async function cargarDesdeFirestore() {
    if (typeof FIREBASE_CONFIG === "undefined" || !FIREBASE_CONFIG) return;

    try {
      const { initializeApp } = await import(
        "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"
      );
      fsMod = await import(
        "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"
      );
      const { getFirestore, collection, getDocs } = fsMod;

      const app = initializeApp(FIREBASE_CONFIG);
      firestoreDB = getFirestore(app);

      const snapshot = await getDocs(collection(firestoreDB, FIRESTORE_COLLECTION));
      if (snapshot.empty) {
        console.warn(
          `Firestore conectado pero la colección "${FIRESTORE_COLLECTION}" está vacía. ` +
            "Ejecuta seedFirestore() en la consola para subir el catálogo local."
        );
        return;
      }

      state.productos = snapshot.docs.map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          casa: d.casa,
          nombre: d.nombre,
          precioMayor: Number(d.precioMayor),
          precioDetal: Number(d.precioDetal ?? Number(d.precioMayor) + DETAL_MARKUP),
          precioOferta: d.precioOferta ? Number(d.precioOferta) : null,
          stock: typeof d.stock === "number" ? d.stock : undefined,
          imagen: d.imagen || null,
          destacado: !!d.destacado,
        };
      });
      render();
      console.info(`Catálogo cargado desde Firestore: ${state.productos.length} perfumes.`);
    } catch (err) {
      console.error("No se pudo cargar Firestore, usando datos locales:", err);
    }
  }

  /**
   * Sube el catálogo local (js/data.js) a Firestore.
   * Uso: configura FIREBASE_CONFIG, recarga la página y ejecuta
   * seedFirestore() en la consola del navegador.
   */
  window.seedFirestore = async function () {
    if (!firestoreDB) {
      console.error("Firestore no está inicializado. Configura FIREBASE_CONFIG primero.");
      return;
    }
    const { collection, doc, writeBatch } = await import(
      "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"
    );

    // writeBatch admite máx. 500 operaciones por lote
    const LOTE = 450;
    for (let i = 0; i < PERFUMES.length; i += LOTE) {
      const batch = writeBatch(firestoreDB);
      PERFUMES.slice(i, i + LOTE).forEach((p) => {
        batch.set(doc(collection(firestoreDB, FIRESTORE_COLLECTION), p.id), {
          casa: p.casa,
          nombre: p.nombre,
          precioMayor: p.precioMayor,
          precioDetal: p.precioDetal,
        });
      });
      await batch.commit();
    }
    console.info(`✔ ${PERFUMES.length} perfumes subidos a la colección "${FIRESTORE_COLLECTION}".`);
  };

  // ─── Inicio ────────────────────────────────────────────────
  render();
  cargarDesdeFirestore();
})();
