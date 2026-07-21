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
    modoPrecio: "mayor", // "detal" | "mayor" — se destaca el mayor
    pagina: 1,
    moneda: { tasaPropia: 0, tasaBcv: 0 }, // tasas para mostrar Bs y base BCV
    carrito: cargarCarrito(), // [{ id, cantidad }]
  };

  const POR_PAGINA = 24; // productos por página en el catálogo general
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
  const $pagination = document.getElementById("pagination");
  const $catalog = document.querySelector(".catalog");

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

  // Stock ignorado en la tienda: todos los perfumes se muestran disponibles
  const agotado = () => false;

  // Formato de bolívares (es-VE: 17.000)
  const fmtBs = (n) =>
    new Intl.NumberFormat("es-VE", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(
      Number(n) || 0
    );

  // Convierte un precio en $ a Bs (con mi tasa) y al costo base en $ (÷ BCV)
  function conversion(usd) {
    const { tasaPropia, tasaBcv } = state.moneda;
    if (!tasaPropia || !tasaBcv) return null;
    const bs = usd * tasaPropia;
    return { bs, base: bs / tasaBcv };
  }

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

  // Bloque de conversión a Bs y costo base (BCV) para la tarjeta
  function conversionHTML(usd) {
    const c = conversion(usd);
    if (!c) return "";
    return `
      <div class="card-bs">
        <div class="bs-row">
          <span class="bs-label">En bolívares</span>
          <span class="bs-value">Bs ${fmtBs(c.bs)}</span>
        </div>
        <div class="bs-row bs-base">
          <span class="bs-label">Costo base (BCV)</span>
          <span class="bs-value"><s>${formatearPrecio(c.base)}</s></span>
        </div>
      </div>`;
  }

  // ─── Renderizado ───────────────────────────────────────────
  function tarjetaHTML(p, i, opts = {}) {
    const esMayor = state.modoPrecio === "mayor";
    const imagen = p.imagen
      ? `<img src="${escapeHTML(p.imagen)}" alt="${escapeHTML(p.nombre)}" loading="lazy" />`
      : `<span class="card-monogram">${escapeHTML(p.nombre.charAt(0))}</span>`;

    const oferta = enOferta(p);
    const enItem = state.carrito.find((it) => it.id === p.id);
    const enCarrito = !!enItem;

    return `
      <article class="product-card ${opts.featured ? "is-featured" : ""}"
        style="animation-delay:${Math.min(i * 25, 400)}ms">
        <div class="card-visual" style="background:${gradientePara(p.casa)}">
          ${imagen}
          ${p.destacado && !opts.featured ? '<span class="card-badge badge-destacado">Destacado</span>' : ""}
          ${oferta ? '<span class="card-badge badge-oferta">Oferta</span>' : ""}
        </div>
        <div class="card-body">
          <div class="card-brand-row">
            <p class="card-brand">${escapeHTML(p.casa)}</p>
          </div>
          <h3 class="card-name">${escapeHTML(p.nombre)}</h3>
          <div class="card-footer">
            <div>
              <span class="card-price-label">Promo en divisas · ${esMayor ? "mayor" : "detal"}</span>
              <span class="card-price">${formatearPrecio(precioActivo(p))}
                ${oferta ? `<s class="price-tachado">${formatearPrecio(p.precioDetal)}</s>` : ""}
              </span>
            </div>
            <span class="card-price-alt">${esMayor ? "Detal" : "Mayor"}: ${formatearPrecio(precioAlterno(p))}</span>
          </div>
          ${conversionHTML(precioActivo(p))}
          <button type="button" class="card-add ${enCarrito ? "is-added" : ""}" data-add="${p.id}">
            ${enCarrito ? `Agregado ✓ (${enItem.cantidad})` : "Agregar al pedido"}
          </button>
        </div>
      </article>`;
  }

  function renderProductos() {
    const lista = productosFiltrados();
    const totalPaginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
    if (state.pagina > totalPaginas) state.pagina = totalPaginas;

    $count.innerHTML = `<strong>${lista.length}</strong> ${
      lista.length === 1 ? "perfume" : "perfumes"
    }`;
    $empty.hidden = lista.length > 0;

    const inicio = (state.pagina - 1) * POR_PAGINA;
    const pagina = lista.slice(inicio, inicio + POR_PAGINA);
    $grid.innerHTML = pagina.map((p, i) => tarjetaHTML(p, i)).join("");

    renderPaginacion(totalPaginas);
  }

  function renderPaginacion(totalPaginas) {
    if (totalPaginas <= 1) {
      $pagination.innerHTML = "";
      $pagination.hidden = true;
      return;
    }
    $pagination.hidden = false;
    const actual = state.pagina;

    // Genera la lista de páginas a mostrar (con "…" cuando hay muchas)
    const paginas = [];
    const rango = 1; // páginas a cada lado de la actual
    for (let p = 1; p <= totalPaginas; p++) {
      if (p === 1 || p === totalPaginas || (p >= actual - rango && p <= actual + rango)) {
        paginas.push(p);
      } else if (paginas[paginas.length - 1] !== "…") {
        paginas.push("…");
      }
    }

    const btn = (p) =>
      p === "…"
        ? `<span class="page-ellipsis">…</span>`
        : `<button type="button" class="page-num ${p === actual ? "is-active" : ""}" data-page="${p}">${p}</button>`;

    $pagination.innerHTML = `
      <button type="button" class="page-arrow" data-page="${actual - 1}" ${actual === 1 ? "disabled" : ""} aria-label="Anterior">‹</button>
      ${paginas.map(btn).join("")}
      <button type="button" class="page-arrow" data-page="${actual + 1}" ${actual === totalPaginas ? "disabled" : ""} aria-label="Siguiente">›</button>
    `;
  }

  function irAPagina(p) {
    state.pagina = p;
    renderProductos();
    // Sube al inicio del catálogo
    const y = $catalog.getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo({ top: y, behavior: "smooth" });
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

  function agregarAlCarrito(id) {
    const existente = state.carrito.find((it) => it.id === id);
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
    it.cantidad += delta;
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
        return `
        <div class="cart-item">
          <div class="cart-item-info">
            <p class="cart-item-name">${escapeHTML(p.nombre)}</p>
            <p class="cart-item-brand">${escapeHTML(p.casa)} · ${formatearPrecio(precioActivo(p))} c/u</p>
          </div>
          <div class="cart-item-qty">
            <button type="button" data-dec="${p.id}" aria-label="Menos">−</button>
            <span>${it.cantidad}</span>
            <button type="button" data-inc="${p.id}" aria-label="Más">+</button>
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
    state.pagina = 1;
    $searchClear.hidden = !$search.value;
    renderProductos();
  });

  $searchClear.addEventListener("click", () => {
    $search.value = "";
    state.busqueda = "";
    state.pagina = 1;
    $searchClear.hidden = true;
    $search.focus();
    renderProductos();
  });

  $brandSelect.addEventListener("change", () => {
    state.casa = $brandSelect.value;
    state.pagina = 1;
    render();
  });

  $sortSelect.addEventListener("change", () => {
    state.orden = $sortSelect.value;
    state.pagina = 1;
    renderProductos();
  });

  $chips.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    state.casa = chip.dataset.casa;
    state.pagina = 1;
    render();
  });

  $reset.addEventListener("click", () => {
    state.busqueda = "";
    state.casa = "";
    state.pagina = 1;
    $search.value = "";
    $searchClear.hidden = true;
    render();
  });

  // Paginación del catálogo
  $pagination.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-page]");
    if (!btn || btn.disabled) return;
    const p = Number(btn.dataset.page);
    if (p && p !== state.pagina) irAPagina(p);
  });

  $toggleBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.mode === state.modoPrecio) return;
      state.modoPrecio = btn.dataset.mode;
      state.pagina = 1;
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
      const { getFirestore, collection, getDocs, doc, getDoc } = fsMod;

      const app = initializeApp(FIREBASE_CONFIG);
      firestoreDB = getFirestore(app);

      // Tasas de moneda (config/moneda) — aplican tanto a datos de Firestore como locales
      try {
        const monedaDoc = await getDoc(doc(firestoreDB, "config", "moneda"));
        if (monedaDoc.exists()) {
          const m = monedaDoc.data();
          state.moneda = {
            tasaPropia: Number(m.tasaPropia) || 0,
            tasaBcv: Number(m.tasaBcv) || 0,
          };
          render();
        }
      } catch (e) {
        /* sin config aún: no se muestran conversiones */
      }

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
