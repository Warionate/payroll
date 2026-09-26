import { notificationsApi } from '../api/notifications';

export const urlBase64ToUint8Array = (base64String: string) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

export const subscribeUser = async () => {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('このブラウザはプッシュ通知に対応していません');
  }

  const registration = await navigator.serviceWorker.ready;

  // Get VAPID key from server
  const { publicKey } = await notificationsApi.getVapidPublicKey();
  if (typeof publicKey !== 'string' || publicKey.trim().length === 0) {
    throw new Error('プッシュ通知の公開鍵が未設定です。管理者に連絡してください。');
  }
  const convertedVapidKey = urlBase64ToUint8Array(publicKey);

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: convertedVapidKey,
  });

  // Send subscription to server
  await notificationsApi.subscribe(subscription.toJSON());
  return subscription;
};

export const unsubscribeUser = async () => {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return;
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();

  if (subscription) {
    // Keep server/client state aligned: remove server registration first.
    await notificationsApi.unsubscribe(subscription.endpoint);

    const unsubscribed = await subscription.unsubscribe();
    if (!unsubscribed) {
      try {
        await notificationsApi.subscribe(subscription.toJSON());
      } catch {
        // Best effort rollback to avoid drifting state between browser and server.
      }
      throw new Error('ブラウザ側の通知解除に失敗しました。時間をおいて再試行してください。');
    }
  }
};

export const checkSubscription = async () => {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false;
  }
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  return !!subscription;
};
