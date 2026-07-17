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

## Panel de administración (`admin.html`)

Panel protegido con Firebase Authentication desde el que se gestiona todo el negocio:

- **Resumen**: productos, unidades y valor del inventario (a costo), ventas y ganancia estimada del mes, total por cobrar, últimas ventas y alertas de stock bajo.
- **Productos**: crear, editar y eliminar; por producto se maneja **mi costo** (privado), **precio al mayor**, **precio al detal**, **precio de oferta** (opcional, se muestra en la tienda), **stock**, proveedor e imagen. Incluye **carga/descarga de inventario** (entradas y salidas con motivo) y bitácora de movimientos. Botón para importar el catálogo local completo (260 perfumes) la primera vez.
- **Ventas**: registro con carrito (varios productos, cantidad y precio editables, tipo mayor/detal), monto pagado y notas. Descuenta stock automáticamente; eliminar una venta lo restaura.
- **Deudores**: si el pago es menor al total, la diferencia queda como deuda; vista agrupada por cliente con registro de abonos.
- **Proveedores**: registro, edición y eliminación, asociables a productos.

### Configuración inicial (una sola vez)

1. **Habilitar el acceso**: en [Firebase Console → Authentication](https://console.firebase.google.com/project/almariaperfumes/authentication/providers), habilita el proveedor **Correo electrónico/contraseña** y en la pestaña *Users* crea tu usuario administrador.

2. **Publicar reglas de Firestore** en [Firestore → Reglas](https://console.firebase.google.com/project/almariaperfumes/firestore/rules) (cambia el correo por el de tu usuario admin):

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       function esAdmin() {
         return request.auth != null
           && request.auth.token.email == "kevinbermudez1412@gmail.com";
       }
       match /perfumes/{id} {
         allow read: if true;        // catálogo público
         allow write: if esAdmin();
       }
       match /costos/{id}      { allow read, write: if esAdmin(); }
       match /ventas/{id}      { allow read, write: if esAdmin(); }
       match /proveedores/{id} { allow read, write: if esAdmin(); }
       match /movimientos/{id} { allow read, write: if esAdmin(); }
     }
   }
   ```

   Cualquier visitante puede leer el catálogo, pero solo tu usuario puede escribir. Costos, ventas, deudores y proveedores son completamente privados — **los costos nunca se guardan en la colección pública**.

3. **Importar el catálogo**: entra a `admin.html`, inicia sesión y pulsa **“Importar catálogo local (260 perfumes)”** en la sección Productos. Después asigna costos y stock.

### Colecciones en Firestore

| Colección | Contenido | Acceso |
|---|---|---|
| `perfumes` | casa, nombre, precioMayor, precioDetal, precioOferta, stock, imagen | lectura pública |
| `costos` | costo (mi costo), proveedorId — por producto | solo admin |
| `ventas` | fecha, cliente, items, total, pagado, abonos, notas | solo admin |
| `proveedores` | nombre, teléfono, correo, notas | solo admin |
| `movimientos` | bitácora de entradas/salidas de inventario | solo admin |

Si Firestore no responde o la colección está vacía, la tienda pública usa automáticamente los datos locales de `js/data.js`.

## Precios al detal

Los precios al detal se calculan por defecto como **precio al mayor + $5** (constante `DETAL_MARKUP` en `js/data.js`). Puedes ajustar el margen ahí, o definir un `precioDetal` propio por producto en Firestore.

## Estructura

```
index.html            Tienda pública
admin.html            Panel de administración (requiere login)
css/styles.css        Estilos de la tienda
css/admin.css         Estilos del panel admin
js/data.js            Catálogo local (fallback)
js/firebase-config.js Configuración de Firebase
js/app.js             Tienda: búsqueda, filtros, render, Firestore
js/admin.js           Admin: auth, productos, ventas, deudores, proveedores
```
