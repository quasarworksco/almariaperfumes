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
  };

  // Casas con acceso rápido vía chips (las de mayor inventario)
  const CHIP_COUNT = 10;

  // Paleta de degradados para el visual de cada tarjeta
  const GRADIENTS = [
    ["#b08d46", "#e2c98f"],
    ["#5d6b5a", "#a8b5a0"],
    ["#7a5c6e", "#c9a6bb"],
    ["#4a5d7a", "#9db3cc"],
    ["#8a6a4f", "#d4b89a"],
    ["#5f5a72", "#aaa4c4"],
    ["#6e7a5c", "#bcc9a2"],
    ["#7a4f4f", "#cc9d9d"],
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
  function renderProductos() {
    const lista = productosFiltrados();
    const esMayor = state.modoPrecio === "mayor";

    $count.innerHTML = `<strong>${lista.length}</strong> ${
      lista.length === 1 ? "perfume" : "perfumes"
    }`;
    $empty.hidden = lista.length > 0;

    $grid.innerHTML = lista
      .map((p, i) => {
        const imagen = p.imagen
          ? `<img src="${escapeHTML(p.imagen)}" alt="${escapeHTML(p.nombre)}" loading="lazy" />`
          : `<span class="card-monogram">${escapeHTML(p.nombre.charAt(0))}</span>`;

        const oferta = enOferta(p);
        const sinStock = agotado(p);

        return `
        <article class="product-card ${sinStock ? "is-agotado" : ""}" style="animation-delay:${Math.min(i * 25, 400)}ms">
          <div class="card-visual" style="background:${gradientePara(p.casa)}">
            ${imagen}
            <span class="card-badge">${esMayor ? "Mayor" : "Detal"}</span>
            ${oferta ? '<span class="card-badge badge-oferta">Oferta</span>' : ""}
            ${sinStock ? '<span class="agotado-overlay">Agotado</span>' : ""}
          </div>
          <div class="card-body">
            <p class="card-brand">${escapeHTML(p.casa)}</p>
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
          </div>
        </article>`;
      })
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
    renderProductos();
  }

  // ─── Eventos ───────────────────────────────────────────────
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
    });
  });

  document.getElementById("year").textContent = new Date().getFullYear();

  // ─── Firestore ─────────────────────────────────────────────
  let firestoreDB = null;

  async function cargarDesdeFirestore() {
    if (typeof FIREBASE_CONFIG === "undefined" || !FIREBASE_CONFIG) return;

    try {
      const { initializeApp } = await import(
        "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"
      );
      const { getFirestore, collection, getDocs } = await import(
        "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"
      );

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
