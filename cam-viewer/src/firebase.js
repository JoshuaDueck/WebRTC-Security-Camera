// Firebase
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    // Put your settings here
};

const app = initializeApp(firebaseConfig);
export const firestore = getFirestore(app);
