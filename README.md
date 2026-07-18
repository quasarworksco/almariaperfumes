# Almaria Perfumes

Sitio web de comercio electrónico para venta de perfumes, con catálogo de 260 fragancias de 46 casas.

## Tecnología

- **HTML5 + CSS3 + JavaScript** puro (sin frameworks ni build).
- Diseño minimalista y elegante, totalmente responsive.
- **Firestore** como base de datos (opcional, con fallback a datos locales).

## Funcionalidades

- **Búsqueda en tiempo real** por nombre de perfume o casa (ignora acentos).
- **Filtro por casa/marca** mediante selector y chips de casas destacadas.
- **Precios al mayor y al detal** con selector en el encabezado; la tarjeta muestra el precio activo y el alterno.
- **Ordenamiento** por casa, nombre o precio.
- Tarjetas de producto con casa, nombre y precio en cuadrícula adaptable.
- **Sección de destacados** (carrusel) con los productos marcados como destacados en el admin.
- **Carrito de pedido**: el cliente agrega perfumes, ajusta cantidades y luego puede **copiar la lista** o **enviar el pedido por WhatsApp** al número configurado en `WHATSAPP_NUMERO` (`js/firebase-config.js`). El carrito se guarda en el navegador (localStorage).

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

### Acceso al panel

El ingreso es con **usuario y contraseña** (usuario `almariaperfumes`). Internamente el usuario se convierte en el correo `almariaperfumes@almariaperfumes.com` de Firebase Authentication.

### Configuración inicial (una sola vez)

1. **Habilitar el acceso**: en [Firebase Console → Authentication](https://console.firebase.google.com/project/almariaperfumes/authentication/providers), habilita el proveedor **Correo electrónico/contraseña** y en la pestaña *Users* crea el usuario:
   - Correo: `almariaperfumes@almariaperfumes.com`
   - Contraseña: la que usarás para entrar al panel

   Luego, en **Authentication → Settings → User actions**, desactiva **“Enable create (sign-up)”** para que nadie más pueda crearse una cuenta.

2. **Publicar reglas de Firestore** en [Firestore → Reglas](https://console.firebase.google.com/project/almariaperfumes/firestore/rules):

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       function esAdmin() {
         return request.auth != null;
       }
       match /perfumes/{id} {
         allow read: if true;        // catálogo público
         allow write: if esAdmin();
       }
       // Pedidos web: el cliente (sin login) puede crear; solo el admin gestiona
       match /pedidos/{id} {
         allow create: if true;
         allow read, update, delete: if esAdmin();
       }
       match /costos/{id}      { allow read, write: if esAdmin(); }
       match /ventas/{id}      { allow read, write: if esAdmin(); }
       match /proveedores/{id} { allow read, write: if esAdmin(); }
       match /clientes/{id}    { allow read, write: if esAdmin(); }
       match /movimientos/{id} { allow read, write: if esAdmin(); }
     }
   }
   ```

   Cualquier visitante puede leer el catálogo, pero solo un usuario autenticado puede escribir. Costos, ventas, deudores y proveedores son completamente privados — **los costos nunca se guardan en la colección pública**. Por eso es importante desactivar el registro de cuentas (paso 1).

3. **Importar el catálogo**: entra a `admin.html`, inicia sesión y pulsa **“Importar catálogo local (260 perfumes)”** en la sección Productos. Después asigna costos y stock.

### Fotos de productos (Cloudinary)

Las fotos se suben desde el modal de producto del admin (botón **“Subir foto”**) a Cloudinary y la URL optimizada (`f_auto,q_auto,w_800`) se guarda en Firestore; la tienda la muestra en la tarjeta del perfume.

Configuración en `js/firebase-config.js` (`CLOUDINARY_CONFIG`): `cloudName` y `uploadPreset`. El preset debe existir en Cloudinary como **Unsigned** (Settings → Upload → Upload presets → Add upload preset → Signing Mode: *Unsigned*). Las fotos quedan en la carpeta `perfumes` del Media Library.

### Colecciones en Firestore

| Colección | Contenido | Acceso |
|---|---|---|
| `perfumes` | casa, nombre, precioMayor, precioDetal, precioOferta, stock, imagen | lectura pública |
| `costos` | costo (mi costo), proveedorId — por producto | solo admin |
| `pedidos` | pedidos enviados desde la tienda (estado: pendiente/confirmado/rechazado) | crear: público · gestionar: solo admin |
| `ventas` | fecha, cliente, telefono, credito, items, total, pagado, abonos, notas | solo admin |
| `proveedores` | nombre, teléfono, correo, notas | solo admin |
| `clientes` | nombre, telefono (registro automático al vender) | solo admin |
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
