// // Import the functions you need from the SDKs you need
// import { initializeApp } from "firebase/app";
// import { getAnalytics } from "firebase/analytics";
// // TODO: Add SDKs for Firebase products that you want to use
// // https://firebase.google.com/docs/web/setup#available-libraries

// // Your web app's Firebase configuration
// // For Firebase JS SDK v7.20.0 and later, measurementId is optional
// const firebaseConfig = {
//   apiKey: "AIzaSyCBIfwwgBkJwkyoQKsZS7Vu-3-qA_RJoYA",
//   authDomain: "homebased-ladies.firebaseapp.com",
//   projectId: "homebased-ladies",
//   storageBucket: "homebased-ladies.firebasestorage.app",
//   messagingSenderId: "61604655847",
//   appId: "1:61604655847:web:f2db8f83b82616050c2842",
//   measurementId: "G-618Z3GM89F"
// };

// // Initialize Firebase
// const app = initializeApp(firebaseConfig);
// const analytics = getAnalytics(app);


export const environment = {
  production: false,
  firebase: {
  apiKey: "AIzaSyCBIfwwgBkJwkyoQKsZS7Vu-3-qA_RJoYA",
  authDomain: "homebased-ladies.firebaseapp.com",
  projectId: "homebased-ladies",
  storageBucket: "homebased-ladies.firebasestorage.app",
  messagingSenderId: "61604655847",
  appId: "1:61604655847:web:f2db8f83b82616050c2842"
  },
  // Maximum number of users allowed to register. Change this number to allow more/fewer users.
  maxUsers: 12
};

// NOTE: Placing a secret in a client-side environment file is insecure.
// This is provided as a quick development convenience only. For production,
// implement admin provisioning server-side (Cloud Function) and remove this value.
// Development-only admin secret. Set to a value you'll enter in the UI when
// checking "Register as admin". DO NOT keep this in source for production.
export const ADMIN_SECRET = 'admin1234';

// Development-only admin email. Signing in with this email (and the correct
// password) will present the admin UI. Do not rely on client-side checks in
// production; use server-side admin provisioning.
export const ADMIN_EMAIL = 'fazlinarex@gmail.com';

// Development-only toggle to show dev admin convenience button in the UI.
// Set to false for production builds.
export const SHOW_DEV_ADMIN = true;