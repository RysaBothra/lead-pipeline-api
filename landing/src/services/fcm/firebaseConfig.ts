import { initializeApp, getApp, getApps } from 'firebase/app';
import { Messaging } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: "AIzaSyCIceebpj5ZhGs8GSnYsyAssbHmjGnntVs",
  authDomain: "vocallabs-372c8.firebaseapp.com",
  projectId: "vocallabs-372c8",
  storageBucket: "vocallabs-372c8.firebasestorage.app",
  messagingSenderId: "1070688134051",
  appId: "1:1070688134051:web:fe301c171ed7a753553016",
  measurementId: "G-8DD05D581B"
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export { app };
export type { Messaging };