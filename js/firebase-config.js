/**
 * Configuración de Firebase / Firestore.
 *
 * El catálogo se carga desde la colección "perfumes" de Firestore
 * (documentos con campos: casa, nombre, precioMayor, precioDetal e
 * imagen opcional). Si la conexión falla o la colección está vacía,
 * el sitio usa los datos locales de js/data.js como respaldo.
 *
 * Para subir el catálogo local a Firestore por primera vez, abre la
 * consola del navegador con el sitio cargado y ejecuta: seedFirestore()
 */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCIQT8C_TvQuG__DHfjaEUbkBPRl3UPh7k",
  authDomain: "almariaperfumes.firebaseapp.com",
  projectId: "almariaperfumes",
  storageBucket: "almariaperfumes.firebasestorage.app",
  messagingSenderId: "225324274403",
  appId: "1:225324274403:web:107b9d18087f97d91debd6",
};

const FIRESTORE_COLLECTION = "perfumes";

/**
 * Configuración de Cloudinary para subir fotos de productos desde el admin.
 * - cloudName: nombre del cloud (Dashboard de Cloudinary)
 * - uploadPreset: preset de subida SIN FIRMA (Settings → Upload → Upload
 *   presets → Add upload preset → Signing Mode: "Unsigned")
 * Si los valores están intercambiados, corrígelos aquí.
 */
const CLOUDINARY_CONFIG = {
  cloudName: "do4fpfwlb",
  uploadPreset: "almaria",
};

/**
 * Número de WhatsApp (formato internacional, solo dígitos) al que se
 * envían los pedidos que arma el cliente desde el carrito de la tienda.
 */
const WHATSAPP_NUMERO = "584146039842";
