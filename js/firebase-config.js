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
