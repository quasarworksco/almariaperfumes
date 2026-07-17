/**
 * Configuración de Firebase / Firestore.
 *
 * Cuando tengas las credenciales de tu proyecto Firebase, reemplaza `null`
 * por el objeto de configuración que te da la consola de Firebase, ej.:
 *
 * const FIREBASE_CONFIG = {
 *   apiKey: "AIza...",
 *   authDomain: "almariaperfumes.firebaseapp.com",
 *   projectId: "almariaperfumes",
 *   storageBucket: "almariaperfumes.appspot.com",
 *   messagingSenderId: "...",
 *   appId: "..."
 * };
 *
 * Mientras FIREBASE_CONFIG sea null, el sitio funciona con los datos
 * locales de js/data.js. Al configurarlo, el catálogo se carga desde la
 * colección "perfumes" de Firestore (documentos con campos: casa, nombre,
 * precioMayor, precioDetal).
 *
 * Para subir el catálogo local a Firestore por primera vez, abre la
 * consola del navegador con el sitio cargado y ejecuta: seedFirestore()
 */
const FIREBASE_CONFIG = null;

const FIRESTORE_COLLECTION = "perfumes";
