// This service worker is required by the Firebase Web SDK to obtain an FCM
// token and to show notifications while the tab isn't focused. It reads the
// web app config from its own query string (set in app/get-token/page.tsx)
// instead of a hardcoded config, so this file doesn't need editing.

importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

const params = new URLSearchParams(self.location.search);
const firebaseConfig = {
  apiKey: params.get("apiKey"),
  authDomain: params.get("authDomain"),
  projectId: params.get("projectId"),
  storageBucket: params.get("storageBucket"),
  messagingSenderId: params.get("messagingSenderId"),
  appId: params.get("appId"),
};

if (firebaseConfig.apiKey) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title ?? "New message";
    const body = payload.notification?.body ?? "";
    self.registration.showNotification(title, { body });
  });
}
