# Almaria Perfumes

Sitio web de comercio electrónico para venta de perfumes, con catálogo de 260 fragancias de 46 casas.

## Tecnología

- **HTML5 + CSS3 + JavaScript** puro (sin frameworks ni build).
- Diseño minimalista y elegante, totalmente responsive.
- **Firestore** como base de datos (opcional, con fallback a datos locales).

## Funcionalidades

- 🔍 **Búsqueda en tiempo real** por nombre de perfume o casa (ignora acentos).
- 🏷️ **Filtro por casa/marca** mediante selector y chips de casas destacadas.
- 💰 **Precios al mayor y al detal** con selector en el encabezado; la tarjeta muestra el precio activo y el alterno.
- ↕️ **Ordenamiento** por casa, nombre o precio.
- 🃏 Tarjetas de producto con casa, nombre y precio en cuadrícula adaptable.

## Cómo ejecutarlo

Es un sitio estático: basta con servir la carpeta.

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

## Conectar Firestore

1. Crea un proyecto en [Firebase Console](https://console.firebase.google.com) y habilita **Cloud Firestore**.
2. Copia la configuración web del proyecto en `js/firebase-config.js`, reemplazando `const FIREBASE_CONFIG = null;`.
3. Recarga el sitio y ejecuta `seedFirestore()` en la consola del navegador para subir el catálogo local a la colección `perfumes` (solo la primera vez).
4. A partir de ahí el catálogo se carga desde Firestore. Cada documento admite los campos:
   - `casa` (string), `nombre` (string)
   - `precioMayor` (number), `precioDetal` (number, opcional — por defecto `precioMayor + 5`)
   - `imagen` (string URL, opcional — sustituye el monograma de la tarjeta)

## Precios al detal

Los precios al detal se calculan por defecto como **precio al mayor + $5** (constante `DETAL_MARKUP` en `js/data.js`). Puedes ajustar el margen ahí, o definir un `precioDetal` propio por producto en Firestore.

## Estructura

```
index.html            Página principal
css/styles.css        Estilos (diseño responsive)
js/data.js            Catálogo local (fallback)
js/firebase-config.js Configuración de Firebase (placeholder)
js/app.js             Lógica: búsqueda, filtros, render, Firestore
```
