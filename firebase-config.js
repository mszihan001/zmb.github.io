// Firebase Realtime Database connection for this website.
const firebaseConfig = {
  apiKey: "AIzaSyCsl57LVW1zBUvqL2OikigQnZ4ippnn9vM",
  authDomain: "hachari.firebaseapp.com",
  databaseURL: "https://hachari-default-rtdb.firebaseio.com",
  projectId: "hachari",
  storageBucket: "hachari.firebasestorage.app",
  messagingSenderId: "604230051416",
  appId: "1:604230051416:web:6ef3e7a62563f6a0cd0c2d",
  measurementId: "G-DCMHCLBQNK"
};

try {
  firebase.initializeApp(firebaseConfig);
  window.firebaseDatabase = firebase.database();
} catch (error) {
  console.error('Firebase initialization failed:', error);
}
