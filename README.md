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

La configuración del proyecto `almariaperfumes` ya está en `js/firebase-config.js`. Para que el sitio pueda leer el catálogo:

1. En [Firebase Console](https://console.firebase.google.com/project/almariaperfumes/firestore/rules) → **Firestore Database → Reglas**, publica:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /perfumes/{doc} {
         allow read: if true;
         allow write: if false;
       }
     }
   }
   ```

   Esto permite que cualquier visitante lea el catálogo pero nadie pueda modificarlo.

2. **Carga inicial del catálogo** (solo una vez): cambia temporalmente `allow write: if false;` por `allow write: if true;`, abre el sitio, ejecuta `seedFirestore()` en la consola del navegador (F12) y espera el mensaje de confirmación (260 perfumes). Luego vuelve a poner `allow write: if false;` y publica.

3. A partir de ahí el catálogo se administra desde Firestore. Cada documento de la colección `perfumes` admite:
   - `casa` (string), `nombre` (string)
   - `precioMayor` (number), `precioDetal` (number, opcional — por defecto `precioMayor + 5`)
   - `imagen` (string URL, opcional — sustituye el monograma de la tarjeta)

Si Firestore no responde o la colección está vacía, el sitio usa automáticamente los datos locales de `js/data.js`.

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
