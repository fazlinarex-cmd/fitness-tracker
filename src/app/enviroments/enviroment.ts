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
  }
};